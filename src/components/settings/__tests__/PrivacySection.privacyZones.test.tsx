/**
 * PrivacySection — Privacy Zone deletion now requires confirmation.
 *
 * Deleting a home/location privacy boundary is consequential and irreversible;
 * it was previously an unlabeled ~26px trash button that fired immediately.
 * It's now a named 44px IconButton that opens a ConfirmDialog describing the
 * route-privacy consequence, and only the confirm actually removes the zone.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import PrivacySection from "../PrivacySection";
import type { PrivacyZone } from "@/lib/privacyZones";

vi.mock("@/lib/socialApi", () => ({
  getBlockedUsers: vi.fn().mockResolvedValue([]),
  unblockUser: vi.fn().mockResolvedValue(undefined),
}));
const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock("@/lib/toast", () => ({
  toast: {
    success: (...a: unknown[]) => toastSuccess(...a),
    error: (...a: unknown[]) => toastError(...a),
  },
}));

const ZONE: PrivacyZone = {
  id: "zone-1",
  name: "Home",
  lat: 51.5,
  lon: -0.1,
  radiusMeters: 200,
};

function renderSection(removeZone: (id: string) => Promise<void>) {
  return render(
    <PrivacySection
      inline
      user={null}
      profile={{ aiAnalysisEnabled: false, hideSharedRouteEnds: false }}
      updateProfile={vi.fn().mockResolvedValue({ ok: true })}
      defaultVisibility="private"
      setDefaultVisibility={vi.fn()}
      autoPostRuns={false}
      setAutoPostRuns={vi.fn()}
      autoPostWorkouts={false}
      setAutoPostWorkouts={vi.fn()}
      privacyZones={[ZONE]}
      addZone={vi.fn().mockResolvedValue(undefined)}
      removeZone={removeZone}
      newZoneName=""
      setNewZoneName={vi.fn()}
      newZoneRadius={200}
      setNewZoneRadius={vi.fn()}
      defaultCrews={[]}
      currentCrew={null}
      joinCrew={vi.fn().mockResolvedValue(undefined)}
      leaveCrew={vi.fn().mockResolvedValue(undefined)}
    />
  );
}

beforeEach(() => {
  toastSuccess.mockClear();
  toastError.mockClear();
});
afterEach(cleanup);

describe("PrivacySection — privacy zone deletion", () => {
  it("the trash action is named for the zone and is a 44px target", () => {
    renderSection(vi.fn().mockResolvedValue(undefined));
    const btn = screen.getByRole("button", {
      name: "Remove privacy zone Home",
    });
    // IconButton default size is the 44px floor (size-11).
    expect(btn.className).toContain("size-11");
  });

  it("first click does NOT remove the zone — it opens a confirm dialog", () => {
    const removeZone = vi.fn().mockResolvedValue(undefined);
    renderSection(removeZone);
    fireEvent.click(
      screen.getByRole("button", { name: "Remove privacy zone Home" })
    );
    expect(removeZone).not.toHaveBeenCalled();
    expect(screen.getByText("Remove privacy zone?")).toBeInTheDocument();
    expect(
      screen.getByText(/will stop hiding route starts and ends/i)
    ).toBeInTheDocument();
  });

  it("cancel performs no write", () => {
    const removeZone = vi.fn().mockResolvedValue(undefined);
    renderSection(removeZone);
    fireEvent.click(
      screen.getByRole("button", { name: "Remove privacy zone Home" })
    );
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(removeZone).not.toHaveBeenCalled();
  });

  it("confirm removes the exact zone once and toasts success", async () => {
    const removeZone = vi.fn().mockResolvedValue(undefined);
    renderSection(removeZone);
    fireEvent.click(
      screen.getByRole("button", { name: "Remove privacy zone Home" })
    );
    fireEvent.click(screen.getByRole("button", { name: /remove zone/i }));
    await waitFor(() => expect(removeZone).toHaveBeenCalledTimes(1));
    expect(removeZone).toHaveBeenCalledWith("zone-1");
    await waitFor(() => expect(toastSuccess).toHaveBeenCalled());
  });

  it("a failed removal surfaces an error toast and does not fake success", async () => {
    const removeZone = vi.fn().mockRejectedValue(new Error("network"));
    renderSection(removeZone);
    fireEvent.click(
      screen.getByRole("button", { name: "Remove privacy zone Home" })
    );
    fireEvent.click(screen.getByRole("button", { name: /remove zone/i }));
    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(toastSuccess).not.toHaveBeenCalled();
  });
});
