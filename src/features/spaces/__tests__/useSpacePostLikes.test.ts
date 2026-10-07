/**
 * Space post likes for a restricted account (S4e): a like reaches the
 * post's author, so a restricted account cannot give one; taking one back
 * still works. A restriction that lands after the page loaded is first
 * heard of in the server's refusal, which says the same thing.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";

const H = vi.hoisted(() => ({
  toggle: vi.fn(),
  toastError: vi.fn(),
  restriction: { isRestricted: false, loading: false },
}));
vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: { uid: "me" }, profile: { displayName: "Me" } }),
}));
vi.mock("@/lib/socialApi", () => ({
  toggleSpacePostLike: (...args: unknown[]) => H.toggle(...args),
}));
vi.mock("@/hooks/useRestrictedStatus", () => ({
  useRestrictedStatus: () => H.restriction,
}));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
vi.mock("@/lib/toast", () => ({ toast: { error: H.toastError } }));

import { useSpacePostLikes } from "../useSpacePostLikes";
import { resetFirestore, seedFirestore } from "@/test/firestoreHarness";
import { RESTRICTED_TOAST } from "@/lib/accountRestriction";

const POSTS = ["p1"];

beforeEach(() => {
  resetFirestore();
  H.toggle.mockReset();
  H.toastError.mockReset();
  H.restriction.isRestricted = false;
});
afterEach(cleanup);

describe("useSpacePostLikes — a restricted account (S4e)", () => {
  it("cannot like a post, and is told why", async () => {
    H.restriction.isRestricted = true;
    const { result } = renderHook(() => useSpacePostLikes("runners", POSTS));
    await act(async () => {
      await result.current.toggle("p1");
    });
    expect(H.toggle).not.toHaveBeenCalled();
    expect(result.current.liked.has("p1")).toBe(false);
    expect(H.toastError).toHaveBeenCalledWith(
      RESTRICTED_TOAST,
      expect.anything()
    );
  });

  it("can take a like back", async () => {
    H.restriction.isRestricted = true;
    seedFirestore({ "spaces/runners/posts/p1/likes/me": { createdAt: 1 } });
    H.toggle.mockResolvedValue(false);
    const { result } = renderHook(() => useSpacePostLikes("runners", POSTS));
    await waitFor(() => expect(result.current.liked.has("p1")).toBe(true));
    await act(async () => {
      await result.current.toggle("p1");
    });
    expect(H.toggle).toHaveBeenCalledWith("runners", "p1", {
      fromName: "Me",
    });
    expect(result.current.liked.has("p1")).toBe(false);
    expect(H.toastError).not.toHaveBeenCalled();
  });

  it("puts a like back and says why when the server refuses it", async () => {
    H.toggle.mockRejectedValue(
      Object.assign(new Error("restricted"), {
        code: "functions/permission-denied",
        details: { reason: "account-restricted" },
      })
    );
    const { result } = renderHook(() => useSpacePostLikes("runners", POSTS));
    await act(async () => {
      await result.current.toggle("p1");
    });
    expect(result.current.liked.has("p1")).toBe(false);
    expect(H.toastError).toHaveBeenCalledWith(
      RESTRICTED_TOAST,
      expect.anything()
    );
  });
});
