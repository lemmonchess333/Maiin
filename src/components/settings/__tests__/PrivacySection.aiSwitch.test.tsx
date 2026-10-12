/**
 * Settings → Social & privacy → "AI food analysis".
 *
 * The switch shows the stored answer (src/lib/aiConsent.ts): on only for
 * `true`. Not asked yet is OFF here, because nothing has been agreed to —
 * it used to show on for a field nobody had set, which read as consent the
 * person never gave. Turning it on is the same yes the consent sheet asks
 * for, so the line under it says what is sent and to whom; turning it off
 * stores `false`.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import PrivacySection from "../PrivacySection";

vi.mock("@/lib/socialApi", () => ({
  getBlockedUsers: vi.fn().mockResolvedValue([]),
  unblockUser: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/hooks/useBlockedUsers", () => ({
  useBlockedUsers: () => ({
    blocked: new Set<string>(),
    ready: true,
    addBlocked: vi.fn(),
    removeBlocked: vi.fn(),
  }),
}));
vi.mock("@/lib/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));

afterEach(cleanup);

function renderWith(aiAnalysisEnabled: boolean | undefined) {
  const updateProfile = vi.fn().mockResolvedValue({ ok: true });
  render(
    <PrivacySection
      inline
      user={null}
      profile={{ aiAnalysisEnabled, hideSharedRouteEnds: false }}
      updateProfile={updateProfile}
      updateShareDefaults={vi.fn().mockResolvedValue({ ok: true })}
      privacyZones={[]}
      addZone={vi.fn().mockResolvedValue(undefined)}
      removeZone={vi.fn().mockResolvedValue(undefined)}
      newZoneName=""
      setNewZoneName={vi.fn()}
      newZoneRadius={200}
      setNewZoneRadius={vi.fn()}
    />
  );
  return {
    updateProfile,
    toggle: screen.getByRole("switch", { name: "Toggle AI food analysis" }),
  };
}

describe("PrivacySection — the AI food analysis switch", () => {
  it.each([
    { label: "not asked yet", stored: undefined, checked: "false" },
    { label: "allowed", stored: true, checked: "true" },
    { label: "off", stored: false, checked: "false" },
  ])("an account $label shows aria-checked $checked", ({ stored, checked }) => {
    const { toggle } = renderWith(stored);
    expect(toggle).toHaveAttribute("aria-checked", checked);
  });

  it("says what is sent and to whom, since turning it on is the yes", () => {
    renderWith(undefined);
    expect(
      screen.getByText(
        /Sends the meal photos you take and the meals you type to Google's Gemini AI/
      )
    ).toBeTruthy();
  });

  it.each([
    { label: "not asked yet", stored: undefined, next: true },
    { label: "off", stored: false, next: true },
    { label: "allowed", stored: true, next: false },
  ])("turning it over from $label stores $next", async ({ stored, next }) => {
    const { toggle, updateProfile } = renderWith(stored);
    fireEvent.click(toggle);
    await vi.waitFor(() =>
      expect(updateProfile).toHaveBeenCalledWith({ aiAnalysisEnabled: next })
    );
  });
});
