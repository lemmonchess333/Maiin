/**
 * HeartRateZonesSection — the max-HR capture, now that something renders it.
 *
 * This component shipped built, tested by nothing, and reached by nothing
 * (#1921). That mattered more than a usual orphan: it is the ONLY writer of
 * `profile.maxHeartRate`, and three surfaces read that field —
 * `DayActionSheet`, `ProgrammeRunSection` and `useHeartRate`. Unrendered, the
 * field could never be set, so all three fell back to the Tanaka age estimate
 * for every user, permanently, with nothing anywhere reporting a problem.
 *
 * So the assertions here are about the WRITE actually happening and being
 * correct, not about markup: an override that silently failed to persist
 * would restore the original bug exactly, and would look identical on screen.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const mockHeartRate = {
  maxHr: 190,
  maxHrSource: "estimated" as "estimated" | "measured",
  zones: [] as unknown[],
  liveAvailable: false,
};
vi.mock("@/hooks/useHeartRate", () => ({
  useHeartRate: () => mockHeartRate,
}));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));

import HeartRateZonesSection from "../HeartRateZonesSection";

function renderSection(updateProfile = vi.fn().mockResolvedValue(undefined)) {
  render(<HeartRateZonesSection updateProfile={updateProfile} />);
  return updateProfile;
}

/**
 * Open the inline editor and type a value.
 *
 * `getByRole("textbox")`, not `spinbutton`: the field is `type="text"` with
 * `inputMode="numeric"` — the iOS-friendly shape that gets the numeric keypad
 * without the desktop spinner arrows or `type="number"`'s scroll-to-change
 * hazard. Worth stating, because the obvious query is the wrong one here.
 */
function typeMaxHr(v: string) {
  fireEvent.click(screen.getByRole("button", { name: /set|edit|override/i }));
  const input = screen.getByRole("textbox");
  fireEvent.change(input, { target: { value: v } });
  return input;
}

beforeEach(() => {
  mockHeartRate.maxHr = 190;
  mockHeartRate.maxHrSource = "estimated";
});

describe("HeartRateZonesSection", () => {
  it("renders, and says the max is an estimate until one is measured", () => {
    // The estimated/measured distinction is the whole reason the override
    // exists — a user with no way to tell which they are looking at has no
    // reason to set it.
    renderSection();
    expect(screen.getByText(/190/)).toBeInTheDocument();
    expect(screen.getByText(/estimated from your age/i)).toBeInTheDocument();
  });

  it("labels a measured max as measured", () => {
    mockHeartRate.maxHrSource = "measured";
    mockHeartRate.maxHr = 186;
    renderSection();
    expect(screen.getByText(/your measured max/i)).toBeInTheDocument();
    expect(screen.queryByText(/estimated from your age/i)).toBeNull();
  });

  it("PERSISTS the override — the write nothing could reach before", async () => {
    const updateProfile = renderSection();
    typeMaxHr("186");
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() =>
      expect(updateProfile).toHaveBeenCalledWith(
        { maxHeartRate: 186 },
        expect.objectContaining({ throwOnError: true })
      )
    );
  });

  it("refuses a physiologically impossible value without writing", async () => {
    // 100–240 bpm. A bad value reaching the profile would poison every zone
    // calculation downstream, and the three readers have no validation of
    // their own.
    const updateProfile = renderSection();
    typeMaxHr("42");
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    expect(await screen.findByText(/between 100 and 240/i)).toBeInTheDocument();
    expect(updateProfile).not.toHaveBeenCalled();
  });

  it("surfaces a failed save instead of pretending it worked", async () => {
    // `throwOnError: true` is passed precisely so this branch exists; a
    // silent failure here is the original bug wearing a different hat.
    const updateProfile = vi.fn().mockRejectedValue(new Error("offline"));
    renderSection(updateProfile);
    typeMaxHr("186");
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    expect(await screen.findByText(/couldn't save/i)).toBeInTheDocument();
  });
});
