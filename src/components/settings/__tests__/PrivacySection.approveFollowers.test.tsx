/**
 * Settings → Social & privacy → "Approve followers" (Polish2 call 4).
 *
 * On unless turned off: an account that never chose approves each follower,
 * as the rules read it (`approvesFollowers` in firestore.rules), because a
 * follow opens followers-only posts, the default share. Off writes `false`,
 * and anyone can follow.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  act,
  render,
  screen,
  cleanup,
  fireEvent,
} from "@testing-library/react";
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

function renderWith(approveFollowers: boolean | undefined) {
  const updateProfile = vi.fn().mockResolvedValue({ ok: true });
  render(
    <PrivacySection
      inline
      user={null}
      profile={{ approveFollowers, hideSharedRouteEnds: false }}
      updateProfile={updateProfile}
      updateShareDefaults={vi.fn().mockResolvedValue({ ok: true })}
      refreshProfile={vi.fn().mockResolvedValue(undefined)}
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
    toggle: screen.getByRole("switch", { name: "Toggle approving followers" }),
  };
}

describe("PrivacySection — the Approve followers switch", () => {
  it.each([
    { label: "that never chose", stored: undefined, checked: "true" },
    { label: "that approves", stored: true, checked: "true" },
    { label: "open to anyone", stored: false, checked: "false" },
  ])("an account $label shows aria-checked $checked", ({ stored, checked }) => {
    const { toggle } = renderWith(stored);
    expect(toggle).toHaveAttribute("aria-checked", checked);
  });

  it("says what it does either way", () => {
    renderWith(undefined);
    expect(
      screen.getByText("You choose who follows you. Off, anyone can.")
    ).toBeInTheDocument();
  });

  it.each([
    { label: "that never chose", stored: undefined, next: false },
    { label: "that approves", stored: true, next: false },
    { label: "open to anyone", stored: false, next: true },
  ])("a tap for an account $label writes $next", async ({ stored, next }) => {
    const { toggle, updateProfile } = renderWith(stored);
    await act(async () => {
      fireEvent.click(toggle);
    });
    expect(updateProfile).toHaveBeenCalledWith({ approveFollowers: next });
  });
});
