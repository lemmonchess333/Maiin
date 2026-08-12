/* eslint-disable @typescript-eslint/no-explicit-any -- mock return types need any casts */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { Timestamp } from "firebase/firestore";
import { localDateString } from "@/lib/dateHelpers";
import {
  seedFirestore,
  resetFirestore,
  failNextFirestore,
  unfiredFailures,
} from "@/test/firestoreHarness";
import { useHomeData } from "../useHomeData";
import type { UserProfile } from "@/lib/auth";

/**
 * MIGRATED off the inline SDK factory 2026-07-26 (ADR-0009: one fake).
 *
 * The stub returned results by CALL INDEX (`callIndex % 3`), explicitly
 * to survive strict-mode double-invocation. That encoded an assumption
 * the hook is free to break: that it issues exactly meals, runs, weight
 * in that order. Reordering those three reads — or adding a fourth —
 * would have silently handed each query someone else's rows while every
 * assertion still passed.
 *
 * Seeding by PATH removes the ordering assumption entirely, and makes
 * re-reads idempotent, which is what the modulo was working around.
 */
vi.mock("firebase/firestore");

vi.mock("@/lib/firebase", () => ({ db: {} }));

vi.mock("date-fns", () => ({
  format: vi.fn((_d: unknown, _fmt: string) => "2026-04-01"),
}));

const MEALS = "users/u1/meals";
const RUNS = "users/u1/runs";
const WEIGHT = "users/u1/bodyweightLogs";

/**
 * The hook date-windows every read:
 *   meals   where("date", "==", localDateString())
 *   runs    where("completedAt", ">=", Timestamp.fromDate(startOfToday))
 * The old stub ignored constraints entirely and handed back whatever was
 * queued, so those filters were never exercised — a row with no `date`
 * counted toward today's totals. Rows are stamped here so they satisfy
 * the real query; anything unstamped is correctly dropped.
 */
const TODAY_KEY = localDateString();
const todayStart = new Date();
todayStart.setHours(0, 0, 0, 0);

/** Seed one collection's rows; ids are positional and irrelevant here. */
function seedRows(base: string, rows: Record<string, unknown>[]) {
  const tree: Record<string, Record<string, unknown>> = {};
  rows.forEach((r, i) => {
    tree[`${base}/d${i}`] = r;
  });
  if (Object.keys(tree).length > 0) seedFirestore(tree);
}

/** Seed all three collections the hook reads, by path rather than by
 *  call order. An empty array simply seeds nothing. */
function seedHome(
  meals: Record<string, unknown>[] = [],
  runs: Record<string, unknown>[] = [],
  weight: Record<string, unknown>[] = []
) {
  seedRows(
    MEALS,
    meals.map((m) => ({ date: TODAY_KEY, ...m }))
  );
  seedRows(
    RUNS,
    runs.map((r) => ({ completedAt: Timestamp.fromDate(todayStart), ...r }))
  );
  seedRows(WEIGHT, weight);
}

function makeProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    uid: "u1",
    displayName: "Test",
    email: "test@test.com",
    weightKg: 70,
    heightCm: 175,
    age: 30,
    sex: "male",
    activityLevel: "moderate",
    goal: "maintain",
    experienceLevel: "intermediate",
    onboardingComplete: true,
    targetCalories: 2500,
    targetProtein: 160,
    targetCarbs: 300,
    targetFat: 80,
    ...overrides,
  } as UserProfile;
}

describe("useHomeData", { timeout: 5000 }, () => {
  beforeEach(() => {
    resetFirestore();
    vi.clearAllMocks();
  });

  it("starts in loading state and resolves to not loading", async () => {
    seedHome([], [], []);

    const { result } = renderHook(() =>
      useHomeData({ uid: "u1" }, makeProfile(), [], "kg")
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
  });

  it("counts ONLY today's meals — a yesterday row is filtered out", async () => {
    // The `where("date", "==", todayKey)` filter was untestable before
    // the migration: the stub ignored constraints and returned whatever
    // was queued, so a stale row counted toward today's totals. That
    // filter is the fix for the Home/Food macro mismatch the hook's own
    // comment describes, and nothing was holding it.
    seedFirestore({
      [`${MEALS}/today`]: {
        date: TODAY_KEY,
        totalCalories: 500,
        totalProtein: 40,
      },
      [`${MEALS}/yesterday`]: {
        date: "1999-01-01",
        totalCalories: 9999,
        totalProtein: 999,
      },
    });

    const { result } = renderHook(() =>
      useHomeData({ uid: "u1" }, makeProfile(), [], "kg")
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.dailyCal).toBe(500);
    expect(result.current.dailyProt).toBe(40);
  });

  it("counts ONLY runs completed today — an older run is filtered out", async () => {
    // Same gap on the runs side: `where("completedAt", ">=", todayTs)`.
    const yesterday = new Date(todayStart);
    yesterday.setDate(yesterday.getDate() - 1);
    seedFirestore({
      [`${RUNS}/today`]: {
        completedAt: Timestamp.fromDate(todayStart),
        distance: 5000,
        duration: 1800,
      },
      [`${RUNS}/old`]: {
        completedAt: Timestamp.fromDate(yesterday),
        distance: 40000,
        duration: 14400,
      },
    });

    const profile = makeProfile({ weightKg: 70 });
    const { result } = renderHook(() =>
      useHomeData({ uid: "u1" }, profile, [], "kg")
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    // 70 * 5 * 1.036 = 362.6 -> 363. The 40km row would dwarf this.
    expect(result.current.todayRunCals).toBe(363);
  });

  it("returns zero defaults when no user", () => {
    const { result } = renderHook(() => useHomeData(null, null, [], "kg"));

    expect(result.current.dailyCal).toBe(0);
    expect(result.current.dailyProt).toBe(0);
    expect(result.current.loading).toBe(true);
  });

  it("computes meal totals from Firestore results", async () => {
    const mealsRows = [
      { totalCalories: 500, totalProtein: 40 },
      { calories: 300, protein: 20 },
    ];
    seedHome(mealsRows, [], []);

    const { result } = renderHook(() =>
      useHomeData({ uid: "u1" }, makeProfile(), [], "kg")
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.dailyCal).toBe(800);
    expect(result.current.dailyProt).toBe(60);
  });

  it("computes run calories using weight and distance", async () => {
    const runsRows = [{ distance: 5000, duration: 1800 }];
    seedHome([], runsRows, []);

    const profile = makeProfile({ weightKg: 80 });
    const { result } = renderHook(() =>
      useHomeData({ uid: "u1" }, profile, [], "kg")
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // 80 * 5 * 1.036 = 414.4 → 414
    expect(result.current.todayRunCals).toBe(414);
  });

  // P0.5 run-stat hygiene: a saved-anyway invalid run (the
  // misclick / fat-fingered-distance case from PR #480) must not
  // contribute phantom calories to today's energy aggregate.
  // Pre-fix this hook only read `distance` and the calorie estimate
  // pulled in ~414kcal for a 5km "too-fast" save the user never
  // ran.
  it("excludes isInvalid runs from todayRunCals", async () => {
    const runsRows = [{ distance: 5000, duration: 1800, isInvalid: true }];
    seedHome([], runsRows, []);

    const profile = makeProfile({ weightKg: 80 });
    const { result } = renderHook(() =>
      useHomeData({ uid: "u1" }, profile, [], "kg")
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.todayRunCals).toBe(0);
  });

  it("excludes savedAnyway runs from todayRunCals", async () => {
    const runsRows = [{ distance: 5000, duration: 1800, savedAnyway: true }];
    seedHome([], runsRows, []);

    const profile = makeProfile({ weightKg: 80 });
    const { result } = renderHook(() =>
      useHomeData({ uid: "u1" }, profile, [], "kg")
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.todayRunCals).toBe(0);
  });

  it("still counts legacy runs (no isInvalid / savedAnyway fields)", async () => {
    // Pre-PR-#480 docs have neither flag. The eligibility predicate
    // treats missing flags as not-flagged so historic runs stay in
    // the aggregate; the distance/duration floors (50m + 30s) still
    // gate them. Regression guard for the missing-field branch.
    const runsRows = [{ distance: 5000, duration: 1800 }];
    seedHome([], runsRows, []);

    const profile = makeProfile({ weightKg: 80 });
    const { result } = renderHook(() =>
      useHomeData({ uid: "u1" }, profile, [], "kg")
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.todayRunCals).toBe(414);
  });

  it("falls back to profile weight when bodyweightLogs is empty (kg)", async () => {
    seedHome([], [], []);

    const profile = makeProfile({ weightKg: 75 });
    const { result } = renderHook(() =>
      useHomeData({ uid: "u1" }, profile, [], "kg")
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.lastWeightInfo).toEqual({
      weight: "75.0",
      date: "From profile",
      rawDate: null,
    });
  });

  it("falls back to profile weight when bodyweightLogs is empty (lbs)", async () => {
    seedHome([], [], []);

    const profile = makeProfile({ weightKg: 75 });
    const { result } = renderHook(() =>
      useHomeData({ uid: "u1" }, profile, [], "lbs")
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.lastWeightInfo!.weight).toBe("165.3");
  });

  it("handles partial failures gracefully (Promise.allSettled)", async () => {
    // P0.5: `duration` is required for the run to pass
    // isCountableRun's 30s floor. Pre-fix this test only set
    // distance and still aggregated; after the eligibility filter
    // landed, missing duration drops the run from the aggregate.
    // The meals read fails; runs + weight still resolve.
    failNextFirestore("getDocs", { path: MEALS });
    seedHome([], [{ distance: 3000, duration: 1200 }], []);

    const profile = makeProfile({ weightKg: 70 });
    const { result } = renderHook(() =>
      useHomeData({ uid: "u1" }, profile, [], "kg")
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Prove the injected failure actually fired — with a path typo this
    // test would otherwise assert a clean load and still pass the
    // "runs still computed" half below.
    expect(unfiredFailures()).toEqual([]);
    expect(result.current.error).toContain("Failed to load meals");
    // Runs still computed: 70 * 3 * 1.036 = 217.56 → 218
    expect(result.current.todayRunCals).toBe(218);
  });

  it("converts weight to lbs when weightUnit is lbs", async () => {
    const weightRows = [{ date: "2026-03-30", weight: 80 }];
    seedHome([], [], weightRows);

    const { result } = renderHook(() =>
      useHomeData({ uid: "u1" }, makeProfile(), [], "lbs")
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // 80 * 2.20462 = 176.3696 → "176.4"
    expect(result.current.lastWeightInfo!.weight).toBe("176.4");
  });

  it("setLastWeightInfo updates weight optimistically", async () => {
    seedHome([], [], []);

    const { result } = renderHook(() =>
      useHomeData({ uid: "u1" }, makeProfile({ weightKg: 70 }), [], "kg")
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    const newWeight = { weight: "82.0", date: "Apr 1", rawDate: "2026-04-01" };
    result.current.setLastWeightInfo(newWeight);

    await waitFor(() => {
      expect(result.current.lastWeightInfo).toEqual(newWeight);
    });
  });

  describe("post-workout protein nudge — one target everywhere", () => {
    /* HOME-TARGET-01 did this for calories and missed protein. The nudge
       renders directly beneath the macro rings, which show
       `useEffectiveTargets().protein`, and it was quoting the STORED
       `profile.targetProtein` instead.
    
       Those two are split by different multipliers and only agree when the
       goal is "cut": the stored figure uses `proteinMultiplierForGoal`
       (goal only), the displayed one `dayProteinMultiplier` (lift PHASE
       first). A recomp user on a strength phase stores 160 g and is shown
       176 g; a lean-bulk user stores 144 g and is shown 160 g. */
    const workoutToday = [
      {
        id: "w-today",
        date: TODAY_KEY,
        exercises: [{ category: "push", exerciseId: "bench-press", sets: [] }],
      },
    ] as unknown as Parameters<typeof useHomeData>[2];

    it("quotes the DAY's protein target, not the stored baseline", async () => {
      seedFirestore({
        [`${MEALS}/today`]: {
          date: TODAY_KEY,
          totalCalories: 500,
          totalProtein: 40,
        },
      });

      const { result } = renderHook(() =>
        useHomeData(
          { uid: "u1" },
          makeProfile({ targetProtein: 160 }),
          workoutToday,
          "kg",
          176 // what the rings on the same screen show
        )
      );

      await waitFor(() =>
        expect(result.current.postWorkoutNudge).not.toBeNull()
      );
      // 176 - 40. Pre-fix this was 120 (160 - 40), so the nudge asked for
      // 16 g less than the rings beside it.
      expect(result.current.postWorkoutNudge?.proteinRemaining).toBe(136);
    });

    it("falls back to the stored target while the effective one resolves", async () => {
      // The paired control. `useEffectiveTargets` returns its defaults on the
      // first render, so the nudge must stay sensible rather than blank or
      // zero — and without this test a fix that simply ignored the stored
      // value would pass the one above.
      //
      // 190, deliberately NOT 160. The first version used 160, which is also
      // the hardcoded last-resort default, so "falls back to the stored
      // value" and "falls back to the constant" produced the same number and
      // the test could not tell them apart — a mutation dropping the stored
      // fallback entirely still passed.
      seedFirestore({
        [`${MEALS}/today`]: {
          date: TODAY_KEY,
          totalCalories: 500,
          totalProtein: 40,
        },
      });

      const { result } = renderHook(() =>
        useHomeData(
          { uid: "u1" },
          makeProfile({ targetProtein: 190 }),
          workoutToday,
          "kg",
          null
        )
      );

      await waitFor(() =>
        expect(result.current.postWorkoutNudge).not.toBeNull()
      );
      expect(result.current.postWorkoutNudge?.proteinRemaining).toBe(150);
    });
  });

});
