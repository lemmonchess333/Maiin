import { describe, expect, it } from "vitest";
import {
  historyRange,
  liftFigures,
  liftingPageFigures,
  nutritionFigures,
  periodSummaryFigures,
  runRecordRows,
  type RunRecordRow,
} from "../historyFigures";
import { addLocalDays, localDateString, parseLocalDate } from "../dateHelpers";
import { getExerciseById } from "../exercises";
import type { Workout, WorkoutExercise } from "../savedWorkouts";
import { formatDayMonth } from "@/utils/formatters";

/**
 * Analytics' figures, called with sessions, a range and a join day. Every
 * case reads its window from `historyRange` at a fixed moment, so nothing
 * here depends on the clock the suite runs under.
 */

/* A Wednesday afternoon, so a window that leaned on the weekday or on the
   time of day would show. */
const NOW = new Date(2026, 8, 16, 14, 30, 0);
const key = (daysAgo: number) => localDateString(addLocalDays(NOW, -daysAgo));
const range30 = (createdAt?: unknown) =>
  historyRange(30, { createdAt, now: NOW });
/** A profile's `createdAt` as Firestore returns it. */
const createdDaysAgo = (daysAgo: number) => ({
  toMillis: () => addLocalDays(NOW, -daysAgo).getTime() + 9 * 3_600_000,
});

function exercise(
  name: string,
  sets: [weightKg: number, reps: number, type?: string][],
  extra: Partial<WorkoutExercise> = {}
): WorkoutExercise {
  return {
    exerciseId: "",
    exerciseName: name,
    category: "",
    caloriesBurned: 0,
    sets: sets.map(([weightKg, reps, type], i) => ({
      setNumber: i + 1,
      weightKg,
      reps,
      ...(type ? { type } : {}),
    })),
    ...extra,
  };
}

const bench = (weightKg: number, reps = 5) =>
  exercise("Bench Press", [[weightKg, reps]], { exerciseId: "bench-press" });

function workout(
  daysAgo: number,
  exercises: WorkoutExercise[] = [bench(100)]
): Pick<Workout, "date" | "exercises"> {
  return { date: key(daysAgo), exercises };
}

function run(
  id: string,
  {
    daysAgo,
    km,
    pace,
    at = [7, 0],
    type = "easy",
    ...extra
  }: {
    daysAgo: number;
    km: number;
    /** Seconds per kilometre. */
    pace: number;
    /** Finish time on the run's day, or the day after with `nextDay`. */
    at?: [number, number];
    type?: string;
    nextDay?: boolean;
    savedAnyway?: boolean;
  }
) {
  const day = addLocalDays(NOW, -daysAgo);
  const finished = extra.nextDay ? addLocalDays(day, 1) : day;
  return {
    id,
    date: localDateString(day),
    completedAt: new Date(
      finished.getFullYear(),
      finished.getMonth(),
      finished.getDate(),
      at[0],
      at[1]
    ),
    distance: km * 1000,
    duration: km * pace,
    avgPace: pace,
    activityType: type,
    ...(extra.savedAnyway ? { savedAnyway: true } : {}),
  };
}

describe("historyRange", () => {
  it("is the range's dates, ending today, and the same span before it", () => {
    const range = range30();
    expect(range.sinceKey).toBe(key(29));
    expect(range.prevSinceKey).toBe(key(59));
    expect(range.todayKey).toBe(key(0));
  });

  it("gives Last 30 days and New the same days for every record", () => {
    const range = range30();
    expect(range.recentSinceKey).toBe(key(29));
    expect(range.newSinceKey).toBe(key(7));
  });

  it("is the whole range while the account's age is unknown", () => {
    // `createdAt` is a pending server stamp until the first round-trip.
    const range = range30({});
    expect(range.startKey).toBeNull();
    expect(range.joinedInRange).toBe(false);
    expect(range.accountDays).toBe(30);
  });

  it("is the days an account younger than the range has had", () => {
    const range = range30(createdDaysAgo(9));
    expect(range.startKey).toBe(key(9));
    expect(range.joinedInRange).toBe(true);
    expect(range.accountDays).toBe(10);
  });

  it("is the whole range for an account exactly as old as it", () => {
    const range = range30(createdDaysAgo(29));
    expect(range.joinedInRange).toBe(false);
    expect(range.accountDays).toBe(30);
  });

  it("counts an account stamped ahead of this device's clock as one day old", () => {
    const range = range30(createdDaysAgo(-2));
    expect(range.joinedInRange).toBe(true);
    expect(range.accountDays).toBe(1);
  });
});

describe("a range admits exactly its dates", () => {
  it.each([7, 30, 90, 180, 365])(
    "%i days, for lifts and food alike",
    (days) => {
      const range = historyRange(days, { now: NOW });
      const dates = Array.from({ length: days + 3 }, (_, i) => i);
      expect(
        liftFigures(
          dates.map((d) => workout(d)),
          range
        ).liftCount
      ).toBe(days);
      expect(
        nutritionFigures(
          dates.map((d) => ({ date: key(d), totalCalories: 2000 })),
          range
        ).daysLogged
      ).toBe(days);
    }
  );
});

describe("liftFigures", () => {
  it("counts the range's sessions and kilograms, and the range before's", () => {
    const figures = liftFigures(
      [
        workout(0, [bench(100)]),
        workout(29, [bench(80)]),
        workout(30, [bench(60)]),
        workout(59, [bench(60)]),
        workout(60, [bench(60)]),
      ],
      range30()
    );
    expect(figures.liftCount).toBe(2);
    expect(figures.liftVolume).toBe(100 * 5 + 80 * 5);
    expect(figures.prevLiftCount).toBe(2);
    expect(figures.prevLiftVolume).toBe(60 * 5 * 2);
  });

  it("tallies a muscle's working sets, not its warm-ups", () => {
    const figures = liftFigures(
      [
        workout(1, [
          exercise(
            "Bench Press",
            [
              [40, 10, "warmup"],
              [100, 5],
              [100, 5],
              [100, 0],
            ],
            { exerciseId: "bench-press" }
          ),
        ]),
      ],
      range30()
    );
    expect(figures.muscleData).toEqual({
      [getExerciseById("bench-press")!.category]: 2,
    });
  });

  it("finds an exercise's muscle by its id before its name", () => {
    // A name the catalogue does not know, saved under a wrong category.
    const figures = liftFigures(
      [
        workout(1, [
          exercise("Flat bench (gym)", [[100, 5]], {
            exerciseId: "bench-press",
            category: "Legs",
          }),
        ]),
      ],
      range30()
    );
    expect(figures.muscleData).toEqual({
      [getExerciseById("bench-press")!.category]: 1,
    });
  });

  it("falls back to the saved category for an exercise the catalogue lacks", () => {
    const figures = liftFigures(
      [
        workout(1, [
          exercise("Sled push", [[60, 1]], { category: "Conditioning" }),
          exercise("Mystery lift", [[20, 8]]),
          exercise("Nothing done", []),
        ]),
      ],
      range30()
    );
    expect(figures.muscleData).toEqual({ Conditioning: 1, Other: 1 });
  });

  it("takes Last 30 days' records from the range's 30 dates", () => {
    const figures = liftFigures(
      [workout(30, [bench(120)]), workout(29, [bench(100)])],
      range30()
    );
    expect(figures.recentLiftPRs.map((r) => [r.weight, r.date])).toEqual([
      [100, key(29)],
    ]);
    expect(figures.lifetimePRs.map((r) => r.weight)).toEqual([120]);
  });

  it("says New for a best set in the last week, and only an all-time one", () => {
    const thisWeek = liftFigures([workout(7, [bench(100)])], range30());
    expect(thisWeek.lifetimePRs[0].isNew).toBe(true);
    expect(thisWeek.recentLiftPRs[0].isNew).toBe(true);

    const lastWeek = liftFigures([workout(8, [bench(100)])], range30());
    expect(lastWeek.lifetimePRs[0].isNew).toBe(false);

    // The best of the last 30 days, under an older, heavier set.
    const underOlder = liftFigures(
      [workout(40, [bench(110)]), workout(2, [bench(100)])],
      range30()
    );
    expect(underOlder.recentLiftPRs[0]).toMatchObject({
      weight: 100,
      isNew: false,
    });
  });
});

describe("liftingPageFigures", () => {
  it("counts the range's working sets by the tally's rule", () => {
    const range = range30();
    const workouts = [
      workout(1, [
        exercise(
          "Bench Press",
          [
            [40, 10, "warmup"],
            [100, 5],
            [100, 0],
          ],
          { exerciseId: "bench-press" }
        ),
      ]),
      workout(40, [bench(100)]),
    ];
    const page = liftingPageFigures(workouts, range, { bins: [] });
    const tally = liftFigures(workouts, range).muscleData;
    expect(page.sets).toBe(1);
    expect(Object.values(tally).reduce((a, b) => a + b, 0)).toBe(page.sets);
  });
});

describe("nutritionFigures", () => {
  const meals = (daysAgo: number[]) =>
    daysAgo.map((d) => ({
      date: key(d),
      totalCalories: 2000,
      totalProtein: 150,
    }));

  it("counts a young account's days out of the days it has had", () => {
    const figures = nutritionFigures(
      meals([0, 1, 2, 3, 5, 6, 8, 9]),
      range30(createdDaysAgo(9))
    );
    expect(figures.daysLogged).toBe(8);
    expect(figures.days).toBe(10);
    expect(figures.adherence).toBe(80);
  });

  it("counts an older account's days out of the range", () => {
    const figures = nutritionFigures(
      meals([0, 1, 2, 3, 5, 6, 8, 9]),
      range30()
    );
    expect(figures.days).toBe(30);
    expect(figures.adherence).toBe(Math.round((8 / 30) * 100));
  });

  it("counts a day logged before sign-up as one of the days", () => {
    // Joined yesterday, and logged a day from three days before that too.
    const figures = nutritionFigures(
      meals([0, 1, 4]),
      range30(createdDaysAgo(1))
    );
    expect(figures.daysLogged).toBe(3);
    expect(figures.days).toBe(5);
    expect(figures.daysLogged).toBeLessThanOrEqual(figures.days);
  });

  it("averages the days logged, not the days in the range", () => {
    const figures = nutritionFigures(
      [
        { date: key(0), totalCalories: 1000 },
        { date: key(0), totalCalories: 1000 },
        { date: key(3), totalCalories: 1800 },
        { date: key(31), totalCalories: 3000 },
      ],
      range30()
    );
    expect(figures.avgCalories).toBe(1900);
    expect(figures.prevAvgCalories).toBe(3000);
    expect(figures.caloriesSparkline).toEqual([1800, 2000]);
  });

  it("compares with the range before only when both are well logged", () => {
    const both = meals([
      ...Array.from({ length: 20 }, (_, i) => i),
      ...Array.from({ length: 20 }, (_, i) => 30 + i),
    ]);
    expect(nutritionFigures(both, range30()).showDelta).toBe(true);
    const thinBefore = meals([
      ...Array.from({ length: 20 }, (_, i) => i),
      ...Array.from({ length: 10 }, (_, i) => 30 + i),
    ]);
    expect(nutritionFigures(thinBefore, range30()).showDelta).toBe(false);
  });
});

describe("runRecordRows", () => {
  const rows = (runs: ReturnType<typeof run>[]) =>
    runRecordRows(runs, range30(), "km");
  const row = (list: RunRecordRow[], label: string) =>
    list.find((r) => r.label === label);

  it("takes Last 30 days by the day each run belongs to", () => {
    // Finished on the evening before the range: inside the last 30 × 24
    // hours, and not on one of the range's 30 dates.
    const records = rows([
      run("before", { daysAgo: 30, km: 12, pace: 330, at: [20, 0] }),
      run("inside", { daysAgo: 29, km: 6, pace: 340 }),
    ]);
    expect(row(records.recent30d, "Longest run")?.runId).toBe("inside");
    expect(row(records.lifetime, "Longest run")?.runId).toBe("before");
  });

  it("says New for the last week by day, as a lift does", () => {
    const records = rows([
      run("week", { daysAgo: 7, km: 6, pace: 300, at: [9, 0] }),
      run("older", { daysAgo: 8, km: 8, pace: 330, at: [23, 0] }),
    ]);
    expect(row(records.lifetime, "Best pace")).toMatchObject({
      runId: "week",
      isNew: true,
    });
    // Started the day before the week, finished just inside it.
    const overMidnight = rows([
      run("midnight", {
        daysAgo: 8,
        km: 3,
        pace: 280,
        at: [0, 20],
        nextDay: true,
      }),
    ]);
    expect(row(overMidnight.lifetime, "Best pace")?.isNew).toBe(false);
    expect(row(records.lifetime, "Longest run")).toMatchObject({
      runId: "older",
      isNew: false,
    });
  });

  it("says New on a recent row only when it is the all-time record", () => {
    const records = rows([
      run("fast", { daysAgo: 40, km: 5, pace: 290 }),
      run("recent", { daysAgo: 2, km: 15, pace: 320 }),
    ]);
    expect(row(records.recent30d, "Best pace")).toMatchObject({
      runId: "recent",
      isNew: false,
    });
    // The longest run ever, set this week.
    expect(row(records.recent30d, "Longest run")).toMatchObject({
      runId: "recent",
      isNew: true,
    });
  });

  it("dates a record by the run's day, not the day it finished", () => {
    const records = rows([
      run("late", { daysAgo: 6, km: 5, pace: 300, at: [0, 20], nextDay: true }),
    ]);
    expect(row(records.lifetime, "Best pace")?.date).toBe(
      formatDayMonth(parseLocalDate(key(6)))
    );
  });

  it("keeps typed distances apart from measured ones", () => {
    const records = rows([
      run("road", { daysAgo: 3, km: 5, pace: 320 }),
      run("belt", { daysAgo: 4, km: 3, pace: 280, type: "treadmill" }),
    ]);
    expect(row(records.lifetime, "Best pace")?.runId).toBe("road");
    expect(row(records.indoor, "Best pace")?.runId).toBe("belt");
    expect(records.hasAnyIndoor).toBe(true);
  });

  it("sets no indoor record from a run saved anyway", () => {
    const records = rows([
      run("flagged", {
        daysAgo: 3,
        km: 5,
        pace: 200,
        type: "manual",
        savedAnyway: true,
      }),
      run("belt", { daysAgo: 4, km: 3, pace: 300, type: "treadmill" }),
    ]);
    expect(row(records.indoor, "Best pace")?.runId).toBe("belt");
  });

  it("has no indoor card for indoor runs that hold no record", () => {
    // Under a kilometre, a whole-run pace is not a record.
    const records = rows([
      run("warm-up", { daysAgo: 3, km: 0.8, pace: 330, type: "treadmill" }),
    ]);
    expect(records.hasAnyIndoor).toBe(false);
  });

  it("knows when no outdoor run falls in the last 30 days", () => {
    const records = rows([run("old", { daysAgo: 45, km: 5, pace: 300 })]);
    expect(records.hasAnyRecent).toBe(false);
    expect(row(records.lifetime, "Best pace")?.runId).toBe("old");
  });
});

describe("periodSummaryFigures", () => {
  /* 30 days back from Wednesday 16 Sep is Tuesday 18 Aug; the first bar is
     the week of Monday 17 Aug. */
  const range = range30();
  const firstBarDay = 30;

  it("gives the first bar the whole week it names", () => {
    const early = run("early", { daysAgo: firstBarDay, km: 5, pace: 300 });
    const figures = periodSummaryFigures({
      range,
      workouts: [workout(firstBarDay, [bench(100)])],
      windowRuns: [],
      allRuns: [early],
      allRunsKnown: true,
    });
    expect(figures.granularity).toBe("weekly");
    expect(figures.bins[0]).toMatchObject({
      key: key(firstBarDay),
      lifts: 1,
      runs: 1,
      volumeKg: 500,
      distanceM: 5000,
    });
  });

  it("counts the window's run read inside the window", () => {
    // The figures above the bars come from the window's read; the bars
    // agree with them.
    const figures = periodSummaryFigures({
      range,
      workouts: [],
      windowRuns: [run("window", { daysAgo: 1, km: 5, pace: 300 })],
      allRuns: [run("every", { daysAgo: 1, km: 9, pace: 300 })],
      allRunsKnown: true,
    });
    const current = figures.bins.find((b) => b.current);
    expect(current?.distanceM).toBe(5000);
  });

  it("counts the range before's runs by the day they belong to", () => {
    const figures = periodSummaryFigures({
      range,
      workouts: [],
      windowRuns: [],
      allRuns: [
        run("first", { daysAgo: 59, km: 5, pace: 300 }),
        // Started on the range before's last day, finished on the range's
        // first.
        run("late", {
          daysAgo: 30,
          km: 4,
          pace: 300,
          at: [0, 15],
          nextDay: true,
        }),
        run("earlier", { daysAgo: 60, km: 7, pace: 300 }),
        run("flagged", { daysAgo: 40, km: 3, pace: 300, savedAnyway: true }),
      ],
      allRunsKnown: true,
    });
    expect(figures.prevRunCount).toBe(2);
    expect(figures.prevRunM).toBe(9000);
  });

  it("does not claim the range before had no runs while it is unknown", () => {
    const figures = periodSummaryFigures({
      range,
      workouts: [],
      windowRuns: [],
      allRuns: [],
      allRunsKnown: false,
    });
    expect(figures.prevRunCount).toBeNull();
    expect(figures.prevRunM).toBeNull();
  });
});
