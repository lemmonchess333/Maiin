import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

// NOTIFICATION-TRUST-01: error!=empty, retry re-subscribes, last-seen is
// uid-scoped. Drive onSnapshot's success/error callbacks by hand.

const authUid = vi.hoisted(() => ({ current: "me" as string | undefined }));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: authUid.current ? { uid: authUid.current } : null }),
}));

const snapHandlers = vi.hoisted(
  () =>
    ({ next: null, err: null }) as {
      next: ((s: unknown) => void) | null;
      err: (() => void) | null;
    }
);
const onSnapshotMock = vi.hoisted(() =>
  vi.fn((_q: unknown, next: (s: unknown) => void, err: () => void) => {
    snapHandlers.next = next;
    snapHandlers.err = err;
    return vi.fn(); // unsub
  })
);
vi.mock("firebase/firestore", () => ({
  collection: vi.fn(() => ({})),
  query: vi.fn(() => ({})),
  orderBy: vi.fn(() => ({})),
  limit: vi.fn(() => ({})),
  onSnapshot: onSnapshotMock,
}));
vi.mock("@/lib/firebase", () => ({ db: {} }));

import { useNotifications } from "../useNotifications";

const emptySnap = { docs: [] as unknown[] };

describe("useNotifications — NOTIFICATION-TRUST-01", () => {
  beforeEach(() => {
    onSnapshotMock.mockClear();
    authUid.current = "me";
    window.localStorage.clear();
  });

  it("a read error is a distinct error state, not an empty tray", async () => {
    const { result } = renderHook(() => useNotifications());
    expect(result.current.loading).toBe(true);
    act(() => snapHandlers.err?.());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe(true);
    expect(result.current.items).toEqual([]);
    // An unavailable read shows no unread badge.
    expect(result.current.unreadCount).toBe(0);
  });

  it("retry re-subscribes and a subsequent success clears the error", async () => {
    const { result } = renderHook(() => useNotifications());
    act(() => snapHandlers.err?.());
    await waitFor(() => expect(result.current.error).toBe(true));
    const callsBefore = onSnapshotMock.mock.calls.length;

    act(() => result.current.retry());
    await waitFor(() =>
      expect(onSnapshotMock.mock.calls.length).toBe(callsBefore + 1)
    );

    act(() => snapHandlers.next?.(emptySnap));
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
