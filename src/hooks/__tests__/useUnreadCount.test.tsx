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
  useUid: () =>
    ({ user: authUid.current ? { uid: authUid.current } : null }).user?.uid ??
    null,
}));

const blockedSet = vi.hoisted(() => ({ current: new Set<string>() }));
const hiddenSet = vi.hoisted(() => ({ current: new Set<string>() }));
vi.mock("../useBlockedUsers", () => ({
  useBlockedUsers: () => ({ blocked: blockedSet.current }),
}));
vi.mock("../useHiddenActivities", () => ({
  useHiddenActivities: () => ({ hidden: hiddenSet.current }),
}));

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {} }));

import { useUnreadCount } from "../useUnreadCount";
import { socialPreferenceKey } from "@/lib/socialPreferenceKeys";
import {
  seedFirestore,
  resetFirestore,
  failNextFirestore,
  readsAt,
} from "@/test/firestoreHarness";
import { Timestamp } from "firebase/firestore";

/* Subscriptions established against the feed. The harness logs every read it
   serves, including each `onSnapshot` attach, so a listener that tears down
   and re-attaches shows up as extra entries here. (An earlier draft counted
   `onSnapshot.mock.calls` — the harness exports plain functions rather than
   `vi.fn()`s deliberately, so that counter was always 0 and the guard proved
   nothing. It now asserts it is non-zero before comparing.) */
function feedReads(): number {
  return readsAt(FEED).length;
}

const FEED = "feeds/me/items";
const NOW = new Date("2026-07-15T12:00:00Z");
const SEEN_KEY = socialPreferenceKey("me", "unread-last-seen");

/** Hours before NOW, as a stored feed item. */
function item(hoursAgo: number, authorId: string, activityId = "act") {
  return {
    authorId,
    activityId,
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
  blockedSet.current = new Set();
  hiddenSet.current = new Set();
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
  it("a MID-SUBSCRIPTION error keeps the last known count", async () => {
    // Zeroing on a transient failure reads as "all caught up", which is
    // a lie the user acts on — so the retained count is the assertion
    // that matters, not merely the error flag.
    //
    // The failure is armed AFTER the first delivery: seeding re-fires
    // listeners, so the second fire throws and lands in onError while
    // the first one's count stands. Arming before render would fail the
    // initial fire instead, leaving nothing to retain and quietly
    // reducing this to "error was flagged".
    seedItems({ a: item(1, "a"), b: item(1, "b"), c: item(1, "c") });
    const { result } = renderHook(() => useUnreadCount());
    await waitFor(() => expect(result.current.count).toBe(3));

    failNextFirestore("onSnapshot", { path: FEED });
    seedItems({ d: item(1, "d") }); // triggers the next fire → throws

    await waitFor(() => expect(result.current.error).toBe(true));
    expect(result.current.count).toBe(3);
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

/**
 * The badge's job is to count what the FEED will render. `useSocialFeed`
 * drops blocked authors and user-hidden activities before rendering; the
 * badge counted them, so a user who blocked someone still got badged by
 * their posts, opened Social, and found nothing new.
 */
describe("useUnreadCount — counts what the feed will actually show", () => {
  it("ignores items from a blocked author", () => {
    seedItems({
      a: item(1, "friend"),
      b: item(1, "blocked-one"),
      c: item(1, "blocked-one"),
    });
    blockedSet.current = new Set(["blocked-one"]);
    const { result } = renderHook(() => useUnreadCount());
    return waitFor(() => expect(result.current.count).toBe(1));
  });

  it("ignores an activity the user hid from their feed", () => {
    /* Keyed by activityId, not feed-item id — fan-out can produce several
       feed items for one activity, and hiding it hides all of them. */
    seedItems({
      a: item(1, "friend", "act-visible"),
      b: item(1, "friend", "act-hidden"),
      c: item(1, "other", "act-hidden"),
    });
    hiddenSet.current = new Set(["act-hidden"]);
    const { result } = renderHook(() => useUnreadCount());
    return waitFor(() => expect(result.current.count).toBe(1));
  });

  it("still excludes the user's own activity", () => {
    // The pre-existing rule must survive the new filtering.
    seedItems({ a: item(1, "me"), b: item(1, "friend") });
    const { result } = renderHook(() => useUnreadCount());
    return waitFor(() => expect(result.current.count).toBe(1));
  });

  it("counts everything when nothing is suppressed", () => {
    /* Guards the guard: filters that dropped everything would satisfy the
       assertions above and leave the badge permanently at zero. */
    seedItems({
      a: item(1, "friend", "act-1"),
      b: item(1, "other", "act-2"),
      c: item(2, "third", "act-3"),
    });
    const { result } = renderHook(() => useUnreadCount());
    return waitFor(() => expect(result.current.count).toBe(3));
  });
});

/**
 * The regression this file did not previously have any defence against.
 *
 * `useBlockedUsers` returns `cache.get(uid) ?? new Set()` — so until the block
 * list has settled (cold start, and every test) it hands back a NEW Set on
 * every render. Putting that Set in the subscription effect's dependency array
 * makes the hook tear down and re-establish its Firestore listener forever.
 *
 * It is not a subtle performance smell: it is an unbounded onSnapshot churn
 * loop against the user's feed, and the first version of the blocked/hidden
 * filtering shipped with exactly that. Nothing here failed — the counts were
 * all still correct — so it took a hung test run to notice.
 *
 * The fix keeps the listener keyed on `uid` alone and applies suppression in a
 * memo. These assert that arrangement directly.
 */
describe("useUnreadCount — the listener does not depend on the suppression sets", () => {
  it("subscribes once for a stable uid, however often it re-renders", () => {
    seedItems({ a: item(1, "friend") });
    const { result, rerender } = renderHook(() => useUnreadCount());
    const before = feedReads();
    expect(before).toBeGreaterThan(0); // the counter must actually count
    for (let i = 0; i < 12; i++) rerender();
    expect(feedReads()).toBe(before);
    expect(result.current.count).toBe(1);
  });

  it("still reacts when the block list changes, without resubscribing", () => {
    /* The memo must recompute even though the listener does not restart —
       otherwise the loop is fixed by making the feature stop working. */
    seedItems({ a: item(1, "friend"), b: item(1, "later-blocked") });
    const { result, rerender } = renderHook(() => useUnreadCount());
    const before = feedReads();
    expect(before).toBeGreaterThan(0);

    blockedSet.current = new Set(["later-blocked"]);
    rerender();

    expect(result.current.count).toBe(1);
    expect(feedReads()).toBe(before);
  });
});
