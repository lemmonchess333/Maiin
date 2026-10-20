/**
 * RevenueCat follows the signed-in account, and a log-in that failed is
 * tried again rather than left for the session.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { restoreRealTimers } from "@/test/fakeTimers";

const h = vi.hoisted(() => ({
  uid: "a" as string | null,
  logIn: vi.fn(async (_uid: string) => true),
  logOut: vi.fn(async () => {}),
}));
vi.mock("@/lib/auth", () => ({ useUid: () => h.uid }));
vi.mock("@/lib/revenuecat", () => ({
  rcLogIn: (uid: string) => h.logIn(uid),
  rcLogOut: () => h.logOut(),
}));

import { useRevenueCatIdentity } from "../useRevenueCatIdentity";

const advance = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

beforeEach(() => {
  vi.useFakeTimers();
  h.uid = "a";
  h.logIn.mockReset().mockResolvedValue(true);
  h.logOut.mockReset();
});
afterEach(() => restoreRealTimers());

describe("useRevenueCatIdentity", () => {
  it("tries a failed log-in again, and stops once it works", async () => {
    h.logIn.mockResolvedValueOnce(false).mockResolvedValueOnce(false);
    renderHook(() => useRevenueCatIdentity());
    await advance(0);
    // Before: one try, and none after it for the rest of the session.
    expect(h.logIn).toHaveBeenCalledTimes(1);
    await advance(15_000);
    expect(h.logIn).toHaveBeenCalledTimes(2);
    await advance(60_000);
    expect(h.logIn).toHaveBeenCalledTimes(3);
    await advance(600_000);
    expect(h.logIn).toHaveBeenCalledTimes(3);
  });

  it("gives up after three more tries", async () => {
    h.logIn.mockResolvedValue(false);
    renderHook(() => useRevenueCatIdentity());
    await advance(20 * 60_000);
    expect(h.logIn).toHaveBeenCalledTimes(4);
  });

  it("drops a retry for an account that has signed out", async () => {
    h.logIn.mockResolvedValueOnce(false);
    const { rerender } = renderHook(() => useRevenueCatIdentity());
    await advance(0);
    h.uid = null;
    rerender();
    await advance(60_000);
    expect(h.logOut).toHaveBeenCalledOnce();
    expect(h.logIn).toHaveBeenCalledTimes(1);
  });
});
