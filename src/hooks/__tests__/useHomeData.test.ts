import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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

const RUNS = "users/u1/runs";
const WEIGHT = "users/u1/bodyweightLogs";

/**
 * The hook windows its runs read to the day it is given, and the old stub
 * ignored constraints entirely, so the window was never exercised. Rows
 * are stamped here so they satisfy the real query. Today's food is not
 * read here: Home hands the hook today's protein from the diary it already
 * holds (`useMeals`).
 */
const TODAY_KEY = localDateString();
const todayStart = new Date();
todayStart.setHours(0, 0, 0, 0);

/**
 * The pinned "now": local noon of TODAY_KEY.
 *
 * Every run fixture here is built by subtracting from the current time, and
 * the hook windows runs to `[startOfToday, now]` — so on a real clock those
 * subtractions walk into YESTERDAY near midnight and the rows fall out of
 * the query. "A run finished more than two hours ago" is not even
 * REPRESENTABLE between 00:00 and 02:00: no instant is both today and >2h
 * old. Both halves were observed on 2026-08-22 — one failure at 00:12, and
 * three when the date rolled over between module load (which computes
 * TODAY_KEY) and the test body.
 *
 * Derived from TODAY_KEY rather than from `new Date()` so the pin and the
 * date the rows are stamped with cannot disagree, whenever this evaluates.
 */
const NOW = new Date(`${TODAY_KEY}T12:00:00`);

/** Seed one collection's rows; ids are positional and irrelevant here. */
function seedRows(base: string, rows: Record<string, unknown>[]) {
  const tree: Record<string, Record<string, unknown>> = {};
  rows.forEach((r, i) => {
    tree[`${base}/d${i}`] = r;
  });
  if (Object.keys(tree).length > 0) seedFirestore(tree);
}

/** Seed both collections the hook reads, by path rather than by call
 *  order. An empty array simply seeds nothing. */
function seedHome(
  runs: Record<string, unknown>[] = [],
  weight: Record<string, unknown>[] = []
) {
  seedRows(
    RUNS,
    runs.map((r) => ({ completedAt: Timestamp.fromDate(todayStart), ...r }))
  );
  seedRows(WEIGHT, weight);
}

/** Today as Home hands it over: the day key and the diary's protein. */
const TODAY = { key: TODAY_KEY, protein: 0 };

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
    // Only `Date` is faked — setTimeout/setInterval stay real so `waitFor`
    // and the Firestore fake's scheduling are untouched.
    vi.useFakeTimers({ toFake: ["Date"], now: NOW });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts in loading state and resolves to not loading", async () => {
    seedHome();

    const { result } = renderHook(() =>
      useHomeData({ uid: "u1" }, makeProfile(), [], "kg", null, TODAY)
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
  });

  /* "counts ONLY runs completed today" lived here. Its only observable
     was the run-calorie aggregate, which this hook no longer returns, and
     the `where("completedAt", ">=", todayTs)` clause it covered is now
     redundant with the nudge's own two-hour staleness gate for the single
     remaining consumer — an older run is rejected either way. The clause
     stays because it narrows the read; it no longer changes an answer, so
     there is nothing left to assert that could fail. */

  it("reads nothing and keeps loading when there is no user", () => {
    const { result } = renderHook(() =>
      useHomeData(null, null, [], "kg", null, TODAY)
    );

    expect(result.current.lastWeightInfo).toBeNull();
    expect(result.current.postWorkoutNudge).toBeNull();
    expect(result.current.loading).toBe(true);
  });

  /* The P0.5 run-hygiene trio (isInvalid / savedAnyway / legacy rows)
     asserted those flags against the run-calorie aggregate this hook no
     longer computes. The predicate itself is pinned in
     runStatsEligibility.test.ts and runEligibility.cross.test.ts, and it
     is still exercised through THIS hook by "an ineligible run does not
     prompt a refuel" below — the composition that remains live. */

  it("falls back to profile weight when bodyweightLogs is empty (kg)", async () => {
    seedHome();

    const profile = makeProfile({ weightKg: 75 });
    const { result } = renderHook(() =>
      useHomeData({ uid: "u1" }, profile, [], "kg", null, TODAY)
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.lastWeightInfo).toEqual({
      kg: 75,
      weight: "75.0",
      date: "From profile",
      rawDate: null,
    });
  });

  it("falls back to profile weight when bodyweightLogs is empty (lbs)", async () => {
    seedHome();

    const profile = makeProfile({ weightKg: 75 });
    const { result } = renderHook(() =>
      useHomeData({ uid: "u1" }, profile, [], "lbs", null, TODAY)
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.lastWeightInfo!.weight).toBe("165.3");
  });

  it("handles partial failures gracefully (Promise.allSettled)", async () => {
    // The runs read fails; the weight still resolves.
    failNextFirestore("getDocs", { path: RUNS });
    seedHome([{ distance: 3000, duration: 1200 }], []);

    const profile = makeProfile({ weightKg: 70 });
    const { result } = renderHook(() =>
      useHomeData({ uid: "u1" }, profile, [], "kg", null, TODAY)
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Prove the injected failure actually fired — with a path typo this
    // test would otherwise assert a clean load and still pass the
    // "runs still computed" half below.
    expect(unfiredFailures()).toEqual([]);
    expect(result.current.error).toContain("Failed to load runs");
    // The weight half still resolved; without a positive here the test
    // would pass on a hook that resolved nothing at all.
    expect(result.current.lastWeightInfo).not.toBeNull();
  });

  it("converts weight to lbs when weightUnit is lbs", async () => {
    const weightRows = [{ date: "2026-03-30", weight: 80 }];
    seedHome([], weightRows);

    const { result } = renderHook(() =>
      useHomeData({ uid: "u1" }, makeProfile(), [], "lbs", null, TODAY)
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // 80 * 2.20462 = 176.3696 → "176.4"
    expect(result.current.lastWeightInfo!.weight).toBe("176.4");
  });

  it("refreshes the weight after a saved entry or undo", async () => {
    seedHome();

    const { result } = renderHook(() =>
      useHomeData(
        { uid: "u1" },
        makeProfile({ weightKg: 70 }),
        [],
        "kg",
        null,
        TODAY
      )
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    seedFirestore({
      "users/u1/bodyweightLogs/2026-04-01": {
        date: "2026-04-01",
        weight: 82,
        source: "manual",
      },
    });
    window.dispatchEvent(new Event("tropos:weight-changed"));
    await waitFor(() => {
      expect(result.current.lastWeightInfo?.kg).toBe(82);
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
      const { result } = renderHook(() =>
        useHomeData(
          { uid: "u1" },
          makeProfile({ targetProtein: 160 }),
          workoutToday,
          "kg",
          176, // what the rings on the same screen show
          { key: TODAY_KEY, protein: 40 } // what the macro tiles show
        )
      );

      // Anchored on the VALUE, not on the nudge existing: 176 - 40. A
      // nudge quoting the stored 160, or ignoring the protein logged,
      // reads 120 or 176.
      await waitFor(() =>
        expect(result.current.postWorkoutNudge?.proteinRemaining).toBe(136)
      );
    });

    it("follows the protein the diary shows as it changes", async () => {
      // Home passes the diary's total for the day; a meal logged while Home
      // is open, offline ones included, moves the nudge with the tiles.
      const { result, rerender } = renderHook(
        ({ protein }) =>
          useHomeData({ uid: "u1" }, makeProfile(), workoutToday, "kg", 176, {
            key: TODAY_KEY,
            protein,
          }),
        { initialProps: { protein: 40 } }
      );
      await waitFor(() =>
        expect(result.current.postWorkoutNudge?.proteinRemaining).toBe(136)
      );
      rerender({ protein: 100 });
      await waitFor(() =>
        expect(result.current.postWorkoutNudge?.proteinRemaining).toBe(76)
      );
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
      const { result } = renderHook(() =>
        useHomeData(
          { uid: "u1" },
          makeProfile({ targetProtein: 190 }),
          workoutToday,
          "kg",
          null,
          { key: TODAY_KEY, protein: 40 }
        )
      );

      // Anchored on the VALUE, like its sibling above: 190 - 40.
      await waitFor(() =>
        expect(result.current.postWorkoutNudge?.proteinRemaining).toBe(150)
      );
    });
  });

  describe("post-session nudge — which discipline just finished", () => {
    /* The nudge used to classify from `exercise.category`, comparing it to
       the literal `"cardio"`. Nothing writes that value: the catalogue
       spells it `"Cardio"`, and the only writer of the persisted field
       (`useProgram.onCompleteDay`) stores a MovementCategory instead — and
       `exerciseMovementCategory.ts` maps cardio exercises to `core`. So
       `type` was permanently `"lift"`, TodayEnergy's "Post-run — refuel"
       copy could not render for anyone, and a run-only day produced no
       nudge at all (the effect returned early on "no workouts today").

       The old fixture passed `category: "push"` — a value from neither
       vocabulary — so it never exercised the comparison it was sitting on.

       These assert the CLASSIFICATION, which is what was broken. Each
       fails on the pre-fix hook: run-only returned null, and both-in-one-
       day returned "lift". */
    const RECENT = Timestamp.fromDate(new Date(NOW.getTime() - 10 * 60_000));

    /** A countable run: clears isVolumeEligible's 50 m / 30 s floors. */
    const countableRun = {
      completedAt: RECENT,
      distance: 5000,
      duration: 1800,
    };

    const liftToday = [
      {
        id: "w-today",
        date: TODAY_KEY,
        // The value production actually stores — a MovementCategory.
        exercises: [
          { category: "horizontal_push", exerciseId: "bench-press", sets: [] },
        ],
      },
    ] as unknown as Parameters<typeof useHomeData>[2];

    function renderWith(
      runs: Record<string, unknown>[],
      workouts: Parameters<typeof useHomeData>[2]
    ) {
      seedHome(runs, []);
      return renderHook(() =>
        useHomeData({ uid: "u1" }, makeProfile(), workouts, "kg", 176, {
          key: TODAY_KEY,
          protein: 40,
        })
      );
    }

    it("a run with no workout logged reads as a run", async () => {
      const { result } = renderWith([countableRun], []);
      await waitFor(() =>
        expect(result.current.postWorkoutNudge?.type).toBe("run")
      );
    });

    it("a workout with no run still reads as a lift", async () => {
      // The paired control: without it, a fix that always answered "run"
      // would pass the test above.
      const { result } = renderWith([], liftToday);
      await waitFor(() =>
        expect(result.current.postWorkoutNudge?.type).toBe("lift")
      );
    });

    it("both on the same day reads as both", async () => {
      const { result } = renderWith([countableRun], liftToday);
      await waitFor(() =>
        expect(result.current.postWorkoutNudge?.type).toBe("both")
      );
    });

    it("an ineligible run does not prompt a refuel", async () => {
      // A saved-anyway misclick must not trigger a refuel prompt.
      // Anchored on the reads having landed, so the null read is not just
      // the effect's initial value — `toBeNull` alone passes at t=0.
      const { result } = renderWith(
        [{ ...countableRun, savedAnyway: true }],
        []
      );
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.postWorkoutNudge).toBeNull();
    });

    it("stops prompting for a run finished before midnight once the day turns", async () => {
      /* The nudge counts runs finished today, and its reads follow the day
         Home gives it: when the day turns they run again, for the new one.
         Before they were made once, on mount, and a run finished at 23:30
         went on prompting a refuel into the next day. */
      const lateEvening = new Date(`${TODAY_KEY}T23:40:00`);
      vi.setSystemTime(lateEvening);
      seedHome(
        [
          {
            ...countableRun,
            completedAt: Timestamp.fromDate(
              new Date(lateEvening.getTime() - 10 * 60_000)
            ),
          },
        ],
        []
      );
      // One list for every render, as Home's is: the nudge reads it, and a
      // new one each render would run the nudge forever.
      const noWorkouts: Parameters<typeof useHomeData>[2] = [];
      const { result, rerender } = renderHook(
        ({ key }) =>
          useHomeData({ uid: "u1" }, makeProfile(), noWorkouts, "kg", 176, {
            key,
            protein: 40,
          }),
        { initialProps: { key: TODAY_KEY } }
      );
      await waitFor(() =>
        expect(result.current.postWorkoutNudge?.type).toBe("run")
      );

      const nextDay = new Date(lateEvening.getTime() + 30 * 60_000);
      vi.setSystemTime(nextDay);
      rerender({ key: localDateString(nextDay) });
      // Anchored on the new day's reads landing: the hook loads again.
      expect(result.current.loading).toBe(true);
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.postWorkoutNudge).toBeNull();
    });

    it("a run finished more than two hours ago has gone stale", async () => {
      const { result } = renderWith(
        [
          {
            ...countableRun,
            completedAt: Timestamp.fromDate(
              new Date(NOW.getTime() - 3 * 60 * 60_000)
            ),
          },
        ],
        []
      );
      // Anchored on the reads having landed — otherwise this passes while
      // the hook has resolved nothing at all.
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.postWorkoutNudge).toBeNull();
    });
  });
});
