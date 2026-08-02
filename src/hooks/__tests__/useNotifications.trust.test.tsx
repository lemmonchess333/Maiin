import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

// NOTIFICATION-TRUST-01: error!=empty, retry re-subscribes, last-seen is
// uid-scoped.
//
// MIGRATED off the inline SDK factory 2026-07-26 (ADR-0009: one fake).
// The old version replaced `onSnapshot` with a spy that captured the
// success/error callbacks and let each test invoke them directly, which
// meant the suite drove its own stub rather than the subscription the
// hook actually makes. Now the failure is injected at the fake
// (`failNextFirestore("onSnapshot", …)`) and the re-subscribe is counted
// off `readLog()`.
//
// Counting subscribes needed the fake to log them, which it did not do
// until this change — see the note on `addListener` in firestoreFake.ts.

const authUid = vi.hoisted(() => ({ current: "me" as string | undefined }));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: authUid.current ? { uid: authUid.current } : null }),
  useUid: () =>
    ({ user: authUid.current ? { uid: authUid.current } : null }).user?.uid ??
    null,
}));
vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {} }));

import { useNotifications } from "../useNotifications";
import {
  resetFirestore,
  failNextFirestore,
  unfiredFailures,
  readLog,
} from "@/test/firestoreHarness";

const NOTIFS = "notifications/me/items";
const subscribeCount = () =>
  readLog().filter((r) => r.op === "onSnapshot" && r.path === NOTIFS).length;

beforeEach(() => {
  resetFirestore();
  authUid.current = "me";
  window.localStorage.clear();
});
afterEach(() => {
  resetFirestore();
});

describe("useNotifications — NOTIFICATION-TRUST-01", () => {
  it("a read error is a distinct error state, not an empty tray", async () => {
    failNextFirestore("onSnapshot", { path: NOTIFS, code: "unavailable" });
    const { result } = renderHook(() => useNotifications());

    await waitFor(() => expect(result.current.loading).toBe(false));
    // Assert the injected failure actually fired. A typo'd path would
    // otherwise leave this test quietly exercising the happy path.
    expect(unfiredFailures()).toEqual([]);
    expect(result.current.error).toBe(true);
    expect(result.current.items).toEqual([]);
    // An unavailable read shows no unread badge.
    expect(result.current.unreadCount).toBe(0);
  });

  it("retry re-subscribes and a subsequent success clears the error", async () => {
    failNextFirestore("onSnapshot", { path: NOTIFS, code: "unavailable" });
    const { result } = renderHook(() => useNotifications());
    await waitFor(() => expect(result.current.error).toBe(true));
    const before = subscribeCount();

    // The armed failure is spent, so the retry's subscription succeeds.
    await act(async () => {
      result.current.retry();
    });
    await waitFor(() => expect(subscribeCount()).toBe(before + 1));
    await waitFor(() => expect(result.current.error).toBe(false));
    expect(result.current.loading).toBe(false);
  });

  it("markAllSeen writes a uid-SCOPED last-seen key", () => {
    const { result } = renderHook(() => useNotifications());
    act(() => result.current.markAllSeen());
    expect(
      window.localStorage.getItem("tropos-notif-last-seen:me")
    ).toBeTruthy();
    // The old unscoped key is never written.
    expect(window.localStorage.getItem("tropos-notif-last-seen")).toBeNull();
  });
});
