/**
 * The streaks provider drops an account's streams in the SAME render that
 * sees the uid change — pinned here against the one Firestore fake
 * (ADR-0009).
 *
 * Why it matters: the provider holds four streams (streaks/data, workouts,
 * runs, meals) plus four loaded flags, all read for one account. The reset
 * used to live in the subscription effect, so it ran one commit late: the
 * commit that first carried the new uid still rendered the previous
 * account's streak and badges, and with the old loaded flags still true the
 * badge and persist effects ran against the old account's rows under the
 * new uid. (A direct A → B switch, with no signed-out render between, was
 * never reset at all until the new account's snapshots overwrote it.)
 *
 * Every render the CONSUMER sees is recorded, not just the final one: a
 * reset that lands in an effect passes a final-state assertion and fails
 * this one. The app remounts the whole signed-in tree per uid
 * (AuthSessionBoundary), so this is the hook's own guarantee, held without
 * that help.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { seedFirestore, resetFirestore } from "@/test/firestoreHarness";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {} }));

const h = vi.hoisted(() => ({ uid: "acct-a" as string | null }));
vi.mock("@/lib/auth", () => ({ useUid: () => h.uid }));
vi.mock("@/hooks/useNutritionBadgeData", () => ({
  useNutritionBadgeData: () => ({
    macroTargetsByDay: new Map(),
    waterByDay: new Map(),
    loaded: true,
  }),
}));

import { StreaksProvider, useStreaks } from "../useStreaks";

const EARNED_AT = "2026-01-01T00:00:00.000Z";

/* Account A: a long best streak and an earned badge — the two things a
   leak would show. currentStreak 0 matches what an empty activity window
   derives, so mounting as A writes nothing back. */
const ACCOUNT_A = {
  currentStreak: 0,
  longestStreak: 12,
  lastActiveDate: "",
  totalActiveDays: 0,
  badges: [{ id: "plate_club", earnedAt: EARNED_AT }],
};
const ACCOUNT_B = {
  currentStreak: 0,
  longestStreak: 3,
  lastActiveDate: "",
  totalActiveDays: 0,
  badges: [],
};

type Seen = {
  uid: string | null;
  longest: number;
  plateClub: boolean;
  loading: boolean;
};

function mount() {
  const seen: Seen[] = [];
  const view = renderHook(
    () => {
      const v = useStreaks();
      seen.push({
        uid: h.uid,
        longest: v.longestStreak,
        plateClub: v.earnedBadges.some((b) => b.id === "plate_club"),
        loading: v.loading,
      });
      return v;
    },
    { wrapper: StreaksProvider }
  );
  return { ...view, seen };
}

beforeEach(() => {
  resetFirestore();
  localStorage.clear();
  h.uid = "acct-a";
  seedFirestore({
    "users/acct-a/streaks/data": ACCOUNT_A,
    "users/acct-b/streaks/data": ACCOUNT_B,
  });
});
afterEach(() => cleanup());

describe("useStreaks — account switch", () => {
  it("signing out drops the account's streak in the same render", async () => {
    const view = mount();
    // POSITIVE anchor: account A's data is showing before the switch, so
    // the assertions below can't pass against an empty initial state.
    await waitFor(() => expect(view.result.current.longestStreak).toBe(12));
    expect(view.result.current.earnedBadges.map((b) => b.id)).toContain(
      "plate_club"
    );

    const from = view.seen.length;
    h.uid = null;
    view.rerender();

    const afterSwitch = view.seen.slice(from);
    expect(afterSwitch.length).toBeGreaterThan(0);
    for (const render of afterSwitch) {
      expect(render).toEqual({
        uid: null,
        longest: 0,
        plateClub: false,
        loading: true,
      });
    }
  });

  it("a direct A → B switch never renders A's streak under B", async () => {
    const view = mount();
    await waitFor(() => expect(view.result.current.longestStreak).toBe(12));

    const from = view.seen.length;
    h.uid = "acct-b";
    view.rerender();

    // B's own document arrives (the fake delivers onSnapshot on subscribe)…
    await waitFor(() => expect(view.result.current.longestStreak).toBe(3));
    expect(view.result.current.loading).toBe(false);

    // …and no render in between carried A's best streak or A's badge.
    const underB = view.seen.slice(from);
    expect(underB.every((r) => r.uid === "acct-b")).toBe(true);
    expect(underB.filter((r) => r.longest === 12)).toEqual([]);
    expect(underB.filter((r) => r.plateClub)).toEqual([]);
  });
});
