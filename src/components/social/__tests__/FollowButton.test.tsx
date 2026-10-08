/**
 * FollowButton for a restricted account (S4e): every Follow control goes
 * through it, the profile page's included, so it is where a restricted
 * account is refused a follow. Unfollowing still works.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";

const H = vi.hoisted(() => ({
  state: { following: false as boolean | null, settled: true, busy: false },
  toggle: vi.fn(async (_next: boolean) => true),
  toastError: vi.fn(),
  restriction: { isRestricted: false, loading: false },
}));
vi.mock("@/lib/auth", () => ({ useUid: () => "me" }));
vi.mock("@/hooks/useFollowState", () => ({
  useFollowState: () => ({ ...H.state, toggle: H.toggle }),
}));
vi.mock("@/hooks/useRestrictedStatus", () => ({
  useRestrictedStatus: () => H.restriction,
}));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
vi.mock("@/lib/toast", () => ({ toast: { error: H.toastError } }));

import FollowButton from "../FollowButton";
import { RESTRICTED_TOAST } from "@/lib/accountRestriction";

beforeEach(() => {
  H.state = { following: false, settled: true, busy: false };
  H.toggle.mockClear();
  H.toastError.mockClear();
  H.restriction.isRestricted = false;
});
afterEach(cleanup);

const tap = async () => {
  await act(async () => {
    fireEvent.click(screen.getByRole("button"));
  });
};

describe("FollowButton", () => {
  it("follows for an account that is not restricted", async () => {
    render(<FollowButton targetUid="maya" />);
    await tap();
    expect(H.toggle).toHaveBeenCalledWith(true);
  });

  it("refuses a follow for a restricted account, and says why", async () => {
    H.restriction.isRestricted = true;
    render(<FollowButton targetUid="maya" />);
    const button = screen.getByRole("button", { name: "Follow user" });
    // Tappable, so the tap can explain itself, but marked unavailable.
    expect(button).not.toBeDisabled();
    expect(button).toHaveAttribute("aria-disabled", "true");
    await tap();
    expect(H.toggle).not.toHaveBeenCalled();
    expect(H.toastError).toHaveBeenCalledWith(
      RESTRICTED_TOAST,
      expect.objectContaining({
        action: expect.objectContaining({ label: "Contact support" }),
      })
    );
  });

  it("still unfollows for a restricted account", async () => {
    H.restriction.isRestricted = true;
    H.state.following = true;
    render(<FollowButton targetUid="maya" />);
    expect(screen.getByRole("button")).not.toHaveAttribute("aria-disabled");
    await tap();
    expect(H.toggle).toHaveBeenCalledWith(false);
    expect(H.toastError).not.toHaveBeenCalled();
  });
});
