import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

/**
 * SOCIAL-ATTENTION-01: the unread badge reads the user's OWN feed
 * (`feeds/{uid}/items`), scopes its last-seen key by uid, and treats a
 * read error as distinct from "all caught up" (keeps the last known
 * count instead of zeroing). Drive onSnapshot's callbacks by hand.
 */

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
const collectionMock = vi.hoisted(() => vi.fn(() => ({})));
vi.mock("firebase/firestore", () => ({
  collection: collectionMock,
  query: vi.fn(() => ({})),
  where: vi.fn(() => ({})),
  orderBy: vi.fn(() => ({})),
  limit: vi.fn(() => ({})),
  onSnapshot: onSnapshotMock,
  Timestamp: { fromDate: (d: Date) => ({ __ts: d.getTime() }) },
}));
vi.mock("@/lib/firebase", () => ({ db: {} }));

import { useUnreadCount } from "../useUnreadCount";
import { socialPreferenceKey } from "@/lib/socialPreferenceKeys";

/** Build a snapshot whose docs carry the given authorIds. */
function snap(authorIds: string[]) {
  return {
    docs: authorIds.map((authorId) => ({ data: () => ({ authorId }) })),
  };
}

describe("useUnreadCount — SOCIAL-ATTENTION-01", () => {
  beforeEach(() => {
    onSnapshotMock.mockClear();
    collectionMock.mockClear();
    authUid.current = "me";
    window.localStorage.clear();
  });

  it("reads the user's own feed subcollection, not the global activities collection", () => {
    renderHook(() => useUnreadCount());
    // collection(db, "feeds", uid, "items")
    expect(collectionMock).toHaveBeenCalledWith({}, "feeds", "me", "items");
    expect(collectionMock).not.toHaveBeenCalledWith({}, "activities");
  });

  it("counts others' feed items and excludes the user's own activity", async () => {
    const { result } = renderHook(() => useUnreadCount());
    act(() => snapHandlers.next?.(snap(["a", "me", "b", "me"])));
    await waitFor(() => expect(result.current.count).toBe(2));
    expect(result.current.error).toBe(false);
    expect(result.current.capped).toBe(false);
  });

  it("a read error keeps the last known count and flags error (never masquerades as 0)", async () => {
    const { result } = renderHook(() => useUnreadCount());
    act(() => snapHandlers.next?.(snap(["a", "b", "c"])));
    await waitFor(() => expect(result.current.count).toBe(3));

    act(() => snapHandlers.err?.());
    await waitFor(() => expect(result.current.error).toBe(true));
    // The badge is NOT silently zeroed on a transient read failure.
    expect(result.current.count).toBe(3);
  });

  it("caps the count at the display ceiling", async () => {
    const many = Array.from({ length: 60 }, (_, i) => `u${i}`);
    const { result } = renderHook(() => useUnreadCount());
    act(() => snapHandlers.next?.(snap(many)));
    await waitFor(() => expect(result.current.capped).toBe(true));
    expect(result.current.count).toBe(50);
  });

  it("markSeen writes a uid-scoped last-seen key and never the global one", () => {
    const { result } = renderHook(() => useUnreadCount());
    act(() => result.current.markSeen());
    expect(
      window.localStorage.getItem(socialPreferenceKey("me", "unread-last-seen"))
    ).toBeTruthy();
    expect(window.localStorage.getItem("tropos-social-last-seen")).toBeNull();
    expect(result.current.count).toBe(0);
  });

  it("purges the pre-scoping global last-seen key on subscribe (never migrated)", () => {
    window.localStorage.setItem(
      "tropos-social-last-seen",
      "2026-01-01T00:00:00.000Z"
    );
    renderHook(() => useUnreadCount());
    expect(window.localStorage.getItem("tropos-social-last-seen")).toBeNull();
  });
});
