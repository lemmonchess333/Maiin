/**
 * useUnreadCount (SOCIAL-ATTENTION-01) — the feed badge.
 *
 * The badge reads the user's OWN feed (`feeds/{uid}/items`), counts only
 * items newer than their last-seen marker, excludes their own activity,
 * and treats a read error as distinct from "all caught up".
 *
 * The previous suite drove `onSnapshot`'s callbacks by hand, which meant
 * the QUERY was never evaluated — `where`, `orderBy` and `limit` were all
 * stubbed to `{}`. Two rules were therefore untestable, and both are the
 * badge's actual job:
 *
 *   - the since-last-seen filter. Handing a snapshot in directly asserts
 *     the COUNTING, never the SELECTING: a badge that counted the whole
 *     feed would have passed every test here.
 *   - the 24-hour default for a user who has never marked seen. Without
 *     it a first-time user's badge shows their entire feed history at
 *     once — the "47 unread" cold start every social app avoids.
 *
 * Seeding real `createdAt` timestamps makes both observable. The clock is
 * fixed because the default window is relative to it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

const authUid = vi.hoisted(() => ({ current: "me" as string | undefined }));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: authUid.current ? { uid: authUid.current } : null }),
}));

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {} }));

import { useUnreadCount } from "../useUnreadCount";
import { socialPreferenceKey } from "@/lib/socialPreferenceKeys";
import {
  seedFirestore,
  resetFirestore,
  failNextFirestore,
} from "@/test/firestoreHarness";
import { Timestamp } from "firebase/firestore";

const FEED = "feeds/me/items";
const NOW = new Date("2026-07-15T12:00:00Z");
const SEEN_KEY = socialPreferenceKey("me", "unread-last-seen");

/** Hours before NOW, as a stored feed item. */
function item(hoursAgo: number, authorId: string) {
  return {
    authorId,
    createdAt: Timestamp.fromDate(
      new Date(NOW.getTime() - hoursAgo * 3600_000)
    ),
  };
}

function seedItems(entries: Record<string, ReturnType<typeof item>>) {
  seedFirestore(
    Object.fromEntries(
      Object.entries(entries).map(([id, data]) => [`${FEED}/${id}`, data])
    )
  );
}

beforeEach(() => {
  resetFirestore();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  authUid.current = "me";
  window.localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useUnreadCount — what it counts", () => {
  it("counts others' items and excludes the user's own activity", async () => {
    // Fan-out writes to the author's own feed too, so the badge would
    // otherwise ping the user about themselves.
    seedItems({
      a: item(1, "a"),
      mine1: item(1, "me"),
      b: item(2, "b"),
      mine2: item(2, "me"),
    });
    const { result } = renderHook(() => useUnreadCount());
    await waitFor(() => expect(result.current.count).toBe(2));
    expect(result.current.error).toBe(false);
    expect(result.current.capped).toBe(false);
  });

  it("EXCLUDES items older than the last-seen marker", async () => {
    // The selecting half of the badge. Handing a snapshot in directly —
    // as the old suite did — could never have caught a badge that
    // counted the whole feed.
    window.localStorage.setItem(
      SEEN_KEY,
      new Date(NOW.getTime() - 3600_000).toISOString() // seen 1h ago
    );
    seedItems({
      fresh: item(0.5, "a"), // after last-seen  → counts
      stale: item(5, "b"), // before last-seen → must not
      ancient: item(50, "c"),
    });
    const { result } = renderHook(() => useUnreadCount());
    await waitFor(() => expect(result.current.count).toBe(1));
  });

  it("defaults to a 24-HOUR window for a user who has never marked seen", async () => {
    // Otherwise a first-time user opens the app to their entire feed
    // history as unread.
    seedItems({
      recent: item(2, "a"),
      alsoRecent: item(20, "b"),
      tooOld: item(30, "c"), // outside the 24h default
      wayOld: item(400, "d"),
    });
    const { result } = renderHook(() => useUnreadCount());
    await waitFor(() => expect(result.current.count).toBe(2));
  });

  it("caps the count at the display ceiling", async () => {
    seedItems(
      Object.fromEntries(
        Array.from({ length: 60 }, (_, i) => [`u${i}`, item(1, `u${i}`)])
      )
    );
    const { result } = renderHook(() => useUnreadCount());
    await waitFor(() => expect(result.current.capped).toBe(true));
    expect(result.current.count).toBe(50);
  });
});

describe("useUnreadCount — failure and scoping", () => {
  it("a read error flags error rather than reporting all-caught-up", async () => {
    // Zeroing on a transient failure reads as "all caught up", which is
    // a lie the user acts on.
    failNextFirestore("onSnapshot", { path: FEED });
    seedItems({ a: item(1, "a"), b: item(1, "b"), c: item(1, "c") });

    const { result } = renderHook(() => useUnreadCount());
    await waitFor(() => expect(result.current.error).toBe(true));
  });

  it("reads the user's OWN feed, not the global activities collection", async () => {
    // Seeded under `activities`, which must not be read at all.
    seedFirestore({
      "activities/a1": { authorId: "a", createdAt: Timestamp.fromDate(NOW) },
    });
    const { result } = renderHook(() => useUnreadCount());
    await waitFor(() => expect(result.current.count).toBe(0));
  });

  it("markSeen writes a uid-scoped key and never the global one", async () => {
    seedItems({ a: item(1, "a") });
    const { result } = renderHook(() => useUnreadCount());
    await waitFor(() => expect(result.current.count).toBe(1));

    act(() => result.current.markSeen());
    expect(window.localStorage.getItem(SEEN_KEY)).toBeTruthy();
    expect(window.localStorage.getItem("tropos-social-last-seen")).toBeNull();
    expect(result.current.count).toBe(0);
  });

  it("purges the pre-scoping global last-seen key on subscribe", () => {
    // Never migrated: a global marker can't be attributed to one account,
    // which IS the leak on a shared device.
    window.localStorage.setItem(
      "tropos-social-last-seen",
      "2026-01-01T00:00:00.000Z"
    );
    renderHook(() => useUnreadCount());
    expect(window.localStorage.getItem("tropos-social-last-seen")).toBeNull();
  });
});
