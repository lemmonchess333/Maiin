import { describe, it, expect } from "vitest";
import { performedWeeklyVolume, volumeWeekKeys } from "../performedVolume";
import {
  addLocalDays,
  localDateString,
  localWeekKey,
  rollingWindowStart,
  startOfLocalWeek,
} from "../dateHelpers";
import { judgementLandmark } from "@/features/program/volumeModel";

/* "today" is handed in, never read from the clock, so these hold on any
   calendar day; every date below is derived from it. */
const TODAY = new Date(2026, 8, 28);
const THIS_WEEK = startOfLocalWeek(TODAY);
const weekStart = (weeksAgo: number) => addLocalDays(THIS_WEEK, -7 * weeksAgo);
const weekKey = (weeksAgo: number) => localWeekKey(weekStart(weeksAgo));
/** A day inside the week `weeksAgo` back: its Wednesday. */
const midweek = (weeksAgo: number) =>
  localDateString(addLocalDays(weekStart(weeksAgo), 2));

describe("volumeWeekKeys", () => {
  const month = { since: rollingWindowStart(30, TODAY), today: TODAY };
  const longAgo = localDateString(addLocalDays(TODAY, -400));

  it("takes the weeks the range covers whole, before the current one", () => {
    const keys = volumeWeekKeys({ ...month, firstSessionKey: longAgo });
    expect(keys.length).toBeGreaterThanOrEqual(3);
    expect(keys).not.toContain(localWeekKey(TODAY));
    expect(keys[keys.length - 1]).toBe(weekKey(1));
    // Each one starts inside the range: none is part-covered.
    for (const key of keys) {
      expect(key >= localDateString(month.since)).toBe(true);
    }
  });

  it("leaves out weeks that began before the user's first session", () => {
    const firstSessionKey = localDateString(addLocalDays(weekStart(2), 1));
    expect(volumeWeekKeys({ ...month, firstSessionKey })).toEqual([weekKey(1)]);
  });

  it("counts the week a user started in when they started on its first day", () => {
    const firstSessionKey = localDateString(weekStart(2));
    expect(volumeWeekKeys({ ...month, firstSessionKey })).toEqual([
      weekKey(2),
      weekKey(1),
    ]);
  });

  it("gives a seven-day range the last complete week", () => {
    const week = { since: rollingWindowStart(7, TODAY), today: TODAY };
    expect(volumeWeekKeys({ ...week, firstSessionKey: longAgo })).toEqual([
      weekKey(1),
    ]);
  });

  it("has nothing to average before a first full week, or any session", () => {
    const week = { since: rollingWindowStart(7, TODAY), today: TODAY };
    expect(volumeWeekKeys({ ...week, firstSessionKey: midweek(1) })).toEqual(
      []
    );
    expect(volumeWeekKeys({ ...month, firstSessionKey: null })).toEqual([]);
  });
});

type Sets = { reps: number; type?: string }[];
const sets = (n: number, reps = 8): Sets =>
  Array.from({ length: n }, () => ({ reps }));
const workout = (
  date: string,
  exercises: { exerciseId?: string; exerciseName: string; sets: Sets }[]
) => ({ date, exercises });
const bench = (n: number) => ({
  exerciseId: "bench-press",
  exerciseName: "Bench Press",
  sets: sets(n),
});

const chestOf = (rows: ReturnType<typeof performedWeeklyVolume>) =>
  rows.find((r) => r.muscle === "Chest");

describe("performedWeeklyVolume", () => {
  const goal = "hypertrophy";

  it("averages a muscle's sets over the weeks, a week off counting as none", () => {
    const rows = performedWeeklyVolume(
      [
        workout(midweek(2), [bench(4)]),
        workout(midweek(2), [bench(4)]),
        // Week 1: no lifting at all.
      ],
      { weekKeys: [weekKey(2), weekKey(1)], primaryGoal: goal }
    );
    expect(chestOf(rows)?.setsPerWeek).toBe(4);
  });

  it("judges each muscle against its band for the goal", () => {
    const rows = performedWeeklyVolume([workout(midweek(1), [bench(6)])], {
      weekKeys: [weekKey(1)],
      primaryGoal: goal,
    });
    const chest = chestOf(rows)!;
    expect(chest.landmark).toEqual(judgementLandmark(goal, "Chest"));
    expect(chest.setsPerWeek).toBeLessThan(chest.landmark.low);
    expect(chest.status).toBe("low");
  });

  it("counts working sets, not warm-ups or empty rows", () => {
    const rows = performedWeeklyVolume(
      [
        workout(midweek(1), [
          {
            exerciseId: "bench-press",
            exerciseName: "Bench Press",
            sets: [
              { reps: 10, type: "warmup" },
              { reps: 8 },
              { reps: 8 },
              { reps: 0 },
            ],
          },
        ]),
      ],
      { weekKeys: [weekKey(1)], primaryGoal: goal }
    );
    expect(chestOf(rows)?.setsPerWeek).toBe(2);
  });

  it("ignores sessions outside the weeks, the current one included", () => {
    const rows = performedWeeklyVolume(
      [
        workout(midweek(1), [bench(3)]),
        workout(localDateString(TODAY), [bench(10)]),
        workout(midweek(6), [bench(10)]),
      ],
      { weekKeys: [weekKey(1)], primaryGoal: goal }
    );
    expect(chestOf(rows)?.setsPerWeek).toBe(3);
  });

  it("shows a muscle with a floor and no sets, which is the finding", () => {
    const rows = performedWeeklyVolume([workout(midweek(1), [bench(10)])], {
      weekKeys: [weekKey(1)],
      primaryGoal: goal,
    });
    const calves = rows.find((r) => r.muscle === "Calves");
    expect(calves).toMatchObject({ setsPerWeek: 0, status: "low" });
    // Front delts have no floor (pressing covers them): a 0 row says nothing.
    const frontDelts = rows.find((r) => r.muscle === "FrontDelts");
    expect(frontDelts?.setsPerWeek ?? 0).toBeGreaterThan(0);
  });

  it("files a lift saved by name alone under its catalogue entry", () => {
    const rows = performedWeeklyVolume(
      [workout(midweek(1), [{ exerciseName: "Bench Press", sets: sets(5) }])],
      { weekKeys: [weekKey(1)], primaryGoal: goal }
    );
    expect(chestOf(rows)?.setsPerWeek).toBe(5);
  });

  it("does not book an exercise it cannot place as abs", () => {
    const rows = performedWeeklyVolume(
      [
        workout(midweek(1), [
          { exerciseName: "Gym-specific machine thing", sets: sets(6) },
        ]),
      ],
      { weekKeys: [weekKey(1)], primaryGoal: goal }
    );
    expect(rows).toEqual([]);
  });

  it("still books a custom exercise a rule recognises", () => {
    const rows = performedWeeklyVolume(
      [
        workout(midweek(1), [
          { exerciseName: "Weighted decline crunch", sets: sets(4) },
        ]),
      ],
      { weekKeys: [weekKey(1)], primaryGoal: goal }
    );
    expect(rows.find((r) => r.muscle === "Abs")?.setsPerWeek).toBe(4);
  });

  it("has nothing to say without weeks", () => {
    expect(
      performedWeeklyVolume([workout(midweek(1), [bench(4)])], {
        weekKeys: [],
        primaryGoal: goal,
      })
    ).toEqual([]);
  });
});
