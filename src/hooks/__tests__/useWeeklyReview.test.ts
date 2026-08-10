/**
 * useWeeklyReview — second exemplar of the ADR-0009 Firestore seam, chosen
 * because it is the hook the seam most obviously unblocks: eight parallel
 * reads (six queries, three document gets), a conditional follow-up probe,
 * and a sessionStorage cache, all of which had to be simulated by hand
 * before. Under the fake the whole assembly is expressed as seeded data.
 *
 * Note there is no `vi.mock("@/lib/api")` here even though the hook calls
 * `fetchBodyweightLogs`. That helper reads Firestore through the same SDK,
 * so mocking the SDK once covers it — the seam composes through the app's
 * own layers rather than needing a mock per layer.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {}, functions: {} }));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), log: vi.fn(), info: vi.fn() },
}));

let mockProfile: Record<string, unknown> | null = null;
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: { uid: "u1" }, profile: mockProfile }),
  useUid: () =>
    ({ user: { uid: "u1" }, profile: mockProfile }).user?.uid ?? null,
}));

import {
  useWeeklyReview,
  useReviewEligibility,
  reviewedWeekKey,
} from "../useWeeklyReview";
import {
  seedFirestore,
  resetFirestore,
  failNextFirestore,
} from "@/test/firestoreHarness";

/** Wed 15 Jul 2026 → current week Sun 12th, reviewed week Sun 5th–Sat 11th. */
const NOW = new Date(2026, 6, 15, 9, 0, 0);
const WEEK = "2026-07-05";

function lift(date: string, weightKg: number, reps: number) {
  return {
    date,
    exercises: [{ exerciseName: "Bench Press", sets: [{ weightKg, reps }] }],
  };
}

beforeEach(() => {
  resetFirestore();
  // Only `Date` — faking setTimeout as well would freeze the clock that
  // `waitFor` polls on, and every await here would hang.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  sessionStorage.clear();
  mockProfile = {
    targetCalories: 2400,
    weekSchedule: [
      { type: "lift" },
      { type: "run" },
      { type: "lift" },
      { type: "rest" },
      { type: "lift" },
      { type: "run" },
      { type: "rest" },
    ],
  };
});

afterEach(() => {
  vi.useRealTimers();
});

describe("reviewedWeekKey", () => {
  it("names the last COMPLETED week, not the one in progress", () => {
    expect(reviewedWeekKey(NOW)).toBe(WEEK);
  });
});

describe("useWeeklyReview assembly", () => {
  it("assembles lifts, runs, meals and PI from the reviewed week only", async () => {
    seedFirestore({
      // In-week
      "users/u1/workouts/w1": lift("2026-07-06", 100, 5),
      "users/u1/workouts/w2": lift("2026-07-08", 105, 5),
      // Out of week — must not be counted
      "users/u1/workouts/w3": lift("2026-07-13", 200, 5),
      "users/u1/runs/r1": {
        date: "2026-07-07",
        distance: 5000,
        duration: 1500,
      },
      "users/u1/runs/r2": {
        date: "2026-07-11",
        distance: 10000,
        duration: 3000,
      },
      "users/u1/meals/m1": { date: "2026-07-06", totalCalories: 2200 },
      "users/u1/meals/m2": { date: "2026-07-07", totalCalories: 2600 },
      "users/u1/performance/2026-07-05": { performanceIndex: 68 },
      "users/u1/performance/2026-06-28": { performanceIndex: 60 },
    });

    const { result } = renderHook(() => useWeeklyReview());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const review = result.current.review!;
    expect(review.weekKey).toBe(WEEK);
    expect(review.range).toEqual({ start: WEEK, end: "2026-07-11" });
    expect(review.headline).toMatchObject({ pi: 68, delta: 8 });
    expect(review.training?.lifts).toMatchObject({ done: 2, planned: 3 });
    expect(review.training?.runs).toMatchObject({ count: 2, km: 15 });
    expect(review.nutrition).toMatchObject({
      daysLogged: 2,
      avgCalories: 2400,
      target: 2400,
    });
  });

  it("ignores soft-deleted meals", async () => {
    seedFirestore({
      "users/u1/workouts/w1": lift("2026-07-06", 100, 5),
      "users/u1/meals/m1": { date: "2026-07-06", totalCalories: 2200 },
      "users/u1/meals/m2": {
        date: "2026-07-07",
        totalCalories: 9999,
        deletedAt: "2026-07-07T10:00:00Z",
      },
    });

    const { result } = renderHook(() => useWeeklyReview());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.review?.nutrition).toMatchObject({
      daysLogged: 1,
      avgCalories: 2200,
    });
  });

  it("excludes ineligible runs from volume but still counts them", async () => {
    seedFirestore({
      "users/u1/workouts/w1": lift("2026-07-06", 100, 5),
      "users/u1/runs/good": {
        date: "2026-07-07",
        distance: 5000,
        duration: 1500,
      },
      "users/u1/runs/bad": {
        date: "2026-07-08",
        distance: 40000,
        duration: 60,
        isInvalid: true,
      },
    });

    const { result } = renderHook(() => useWeeklyReview());
    await waitFor(() => expect(result.current.loading).toBe(false));

    // The 40km GPS-glitch run must not inflate weekly volume.
    expect(result.current.review?.training?.runs?.km).toBe(5);
  });

  it("counts PRs against a pre-week baseline, not the week itself", async () => {
    seedFirestore({
      // Baseline: three prior sessions establish 100kg×5.
      "users/u1/workouts/b1": lift("2026-06-10", 100, 5),
      "users/u1/workouts/b2": lift("2026-06-17", 100, 5),
      "users/u1/workouts/b3": lift("2026-06-24", 100, 5),
      // In-week: one clears the baseline, one does not.
      "users/u1/workouts/w1": lift("2026-07-06", 110, 5),
      "users/u1/workouts/w2": lift("2026-07-08", 95, 5),
    });

    const { result } = renderHook(() => useWeeklyReview());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.review?.training?.prsHit).toBe(1);
  });

  it("renders the quiet variant for an established user with a blank week", async () => {
    seedFirestore({ "users/u1/workouts/old": lift("2026-05-01", 80, 5) });

    const { result } = renderHook(() => useWeeklyReview());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.review?.kind).toBe("quiet");
  });

  it("stops loading with a null review when the fetch fails", async () => {
    // A thrown read must not strand the page on a spinner forever.
    seedFirestore({ "users/u1/workouts/w1": lift("2026-07-06", 100, 5) });
    failNextFirestore("getDocs", { path: "users/u1/workouts" });

    const { result } = renderHook(() => useWeeklyReview());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.review).toBeNull();
  });
});

describe("useReviewEligibility", () => {
  it("is eligible when the reviewed week has any activity", async () => {
    seedFirestore({
      "users/u1/runs/r1": { date: "2026-07-07", distance: 5000 },
    });
    const { result } = renderHook(() => useReviewEligibility());
    await waitFor(() => expect(result.current.eligibility).toBe("eligible"));
  });

  it("is eligible (quiet) when the week is blank but history exists", async () => {
    seedFirestore({ "users/u1/meals/m0": { date: "2026-05-02" } });
    const { result } = renderHook(() => useReviewEligibility());
    await waitFor(() => expect(result.current.eligibility).toBe("eligible"));
  });

  it("is 'none' for a brand-new user with no history at all", async () => {
    const { result } = renderHook(() => useReviewEligibility());
    await waitFor(() => expect(result.current.eligibility).toBe("none"));
  });

  it("caches the verdict per (uid, week) so remounts don't re-probe", async () => {
    seedFirestore({
      "users/u1/runs/r1": { date: "2026-07-07", distance: 5000 },
    });
    const first = renderHook(() => useReviewEligibility());
    await waitFor(() =>
      expect(first.result.current.eligibility).toBe("eligible")
    );
    expect(sessionStorage.getItem(`tropos.review.elig:u1:${WEEK}`)).toBe(
      "eligible"
    );

    // Wipe the data: a remount that re-probed would now say "none".
    resetFirestore();
    const second = renderHook(() => useReviewEligibility());
    expect(second.result.current.eligibility).toBe("eligible");
  });

  it("fails closed to 'none' when the probe errors", async () => {
    // This row is a nicety; a permission blip must not surface an entry
    // point that then opens a broken page.
    failNextFirestore("getDocs", { times: 10 });
    const { result } = renderHook(() => useReviewEligibility());
    await waitFor(() => expect(result.current.eligibility).toBe("none"));
  });
});

describe("the load band is RESOLVED, not read raw", () => {
  /**
   * Weekly Review is the fourth surface to read this field, and it was
   * the last one still reading it raw. Home, the Analytics tab and the PI
   * chart all go through `resolveLoadBand`; this hook did
   * `typeof perfData.loadBand === "string" ? … : null` — beside a comment
   * that called the read canonical, because the DELOAD half next to it
   * had been moved to the resolver and the band had not.
   *
   * Both cases below are chosen so the verdict can ONLY come from the
   * resolver: the delta is deliberately inside the +-5 dead zone, so a
   * null or unmatched band falls through to "Steady week."
   */
  it("derives the band from PI when the doc never stored one", async () => {
    seedFirestore({
      "users/u1/workouts/w1": lift("2026-07-06", 100, 5),
      // No loadBand field at all — a pre-PI1a doc.
      "users/u1/performance/2026-07-05": { performanceIndex: 88 },
      "users/u1/performance/2026-06-28": { performanceIndex: 86 },
    });

    const { result } = renderHook(() => useWeeklyReview());
    await waitFor(() => expect(result.current.loading).toBe(false));

    // computeLoadBand(88) === "overreach" — the same pure function every
    // writer used to produce the stored value, so deriving reproduces it.
    expect(result.current.review!.headline!.verdict).toBe(
      "A big week. Keep an eye on recovery going into this one."
    );
  });

  it("tolerates a stored band whose case differs", async () => {
    seedFirestore({
      "users/u1/workouts/w1": lift("2026-07-06", 100, 5),
      "users/u1/performance/2026-07-05": {
        performanceIndex: 88,
        loadBand: "Overreach",
      },
      "users/u1/performance/2026-06-28": { performanceIndex: 86 },
    });

    const { result } = renderHook(() => useWeeklyReview());
    await waitFor(() => expect(result.current.loading).toBe(false));

    // The raw read passed "Overreach" straight through, where it matched
    // none of the lowercase comparisons and read as an unbanded week.
    expect(result.current.review!.headline!.verdict).toBe(
      "A big week. Keep an eye on recovery going into this one."
    );
  });

  it("a band-less week with a flat delta really does fall through", async () => {
    /* The control: proves the two assertions above are discriminating,
       not just restating the default. PI 60 derives to "moderate", which
       verdictFor has no copy for, so the delta path is correct here. */
    seedFirestore({
      "users/u1/workouts/w1": lift("2026-07-06", 100, 5),
      "users/u1/performance/2026-07-05": { performanceIndex: 60 },
      "users/u1/performance/2026-06-28": { performanceIndex: 58 },
    });

    const { result } = renderHook(() => useWeeklyReview());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.review!.headline!.verdict).toBe("Steady week.");
  });
});
