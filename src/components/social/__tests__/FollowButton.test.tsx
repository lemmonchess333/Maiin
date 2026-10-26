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
  state: {
    following: false as boolean | null,
    requested: false,
    settled: true,
    busy: false,
  },
  toggle: vi.fn(async (_next: boolean): Promise<string | null> => "following"),
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
  H.state = { following: false, requested: false, settled: true, busy: false };
  H.toggle.mockReset().mockResolvedValue("following");
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

describe("FollowButton — follow requests (Polish2)", () => {
  it("says Requested while a request waits, and a tap cancels it", async () => {
    H.state = { following: false, requested: true, settled: true, busy: false };
    H.toggle.mockResolvedValue("not-following");
    const changed = vi.fn();
    render(<FollowButton targetUid="maya" onFollowChange={changed} />);
    const button = screen.getByRole("button", {
      name: "Cancel follow request",
    });
    expect(button).toHaveTextContent("Requested");
    await tap();
    expect(H.toggle).toHaveBeenCalledWith(false);
    expect(changed).toHaveBeenCalledWith("not-following", "requested");
  });

  it("tells its parent a follow became a request, so a count does not move", async () => {
    H.toggle.mockResolvedValue("requested");
    const changed = vi.fn();
    render(<FollowButton targetUid="maya" onFollowChange={changed} />);
    await tap();
    expect(H.toggle).toHaveBeenCalledWith(true);
    expect(changed).toHaveBeenCalledWith("requested", "not-following");
  });

  it("tells its parent nothing when the write failed", async () => {
    H.toggle.mockResolvedValue(null);
    const changed = vi.fn();
    render(<FollowButton targetUid="maya" onFollowChange={changed} />);
    await tap();
    expect(changed).not.toHaveBeenCalled();
  });
});

/* A failed write put the button back with a buzz and no word, while the
   post's Follow link (InlineFollow) said "Couldn't follow". Both say so
   now, in the words of what failed. */
describe("FollowButton — a write that fails", () => {
  it.each([
    [
      "a follow",
      { following: false, requested: false },
      "Couldn't follow. Try again.",
    ],
    [
      "an unfollow",
      { following: true, requested: false },
      "Couldn't unfollow. Try again.",
    ],
    [
      "a cancelled request",
      { following: false, requested: true },
      "Couldn't cancel the request. Try again.",
    ],
  ])("says so for %s", async (_label, state, message) => {
    H.state = { ...H.state, ...state };
    H.toggle.mockResolvedValue(null);
    const changed = vi.fn();
    render(<FollowButton targetUid="maya" onFollowChange={changed} />);
    await tap();
    expect(H.toastError).toHaveBeenCalledWith(message);
    expect(changed).not.toHaveBeenCalled();
  });

  it("says nothing when the write lands", async () => {
    render(<FollowButton targetUid="maya" />);
    await tap();
    expect(H.toastError).not.toHaveBeenCalled();
  });
});
