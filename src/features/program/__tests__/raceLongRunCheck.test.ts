import { describe, expect, it } from "vitest";
import {
  peakPlannedLongRunKm,
  plannedLongRunKm,
  raceLongRunCheck,
} from "../raceLongRunCheck";
import type { ProgramState, ScheduledRunDay } from "../programTypes";
import type { DatedRun } from "../layoffDetection";
import {
  addLocalDays,
  localDateString,
  parseLocalDate,
} from "@/lib/dateHelpers";

/* Run24 (11), deep dive D14: the repo's owner-marathon trace missed its
   long runs for four weeks while doing most of its other runs; the weekly
   fell-behind check counts runs, so nothing said the marathon had gone out
   of reach. This check reads it from the runs. */
const TODAY = "2026-11-16"; // a Monday
const day = (offset: number) =>
  localDateString(addLocalDays(parseLocalDate(TODAY), offset));
const marathon = (weeksOut: number) => ({
  runMode: "race_prep" as const,
  raceGoal: {
    distance: "marathon" as const,
    targetDate: day(weeksOut * 7 + 6),
  },
});
/** This week's long run on Sunday, as the plan put it there. */
const longRun = (
  templateId: string,
  extra: Partial<ScheduledRunDay> = {}
): ScheduledRunDay => ({
  date: day(6),
  weekKey: TODAY,
  dayIndex: 0,
  templateId,
  type: "long",
  status: "planned",
  ...extra,
});
/** A plan in `currentWeek`, whose week holds `week` and which builds to a
 *  long run of `peakKm` (32 km, a full marathon block's, unless said; null
 *  for a record stored before the plan carried it). */
const plan = (
  currentWeek: number,
  week: ScheduledRunDay[] = [longRun("long_20k")],
  peakKm: number | null = 32
) =>
  ({
    runPlan: {
      mode: "race_prep",
      totalWeeks: 20,
      currentWeek,
      ...(peakKm === null ? {} : { peakLongRunKm: peakKm }),
    },
    runDays: week,
  }) as unknown as ProgramState;
const run = (offset: number, km: number): DatedRun => ({
  date: day(offset),
  distance: km * 1000,
  duration: km * 400,
});
/** Four 30-minute runs a week for four weeks, and no long run. */
const noLongRuns = Array.from({ length: 16 }, (_, i) => run(-2 - i * 1.5, 4));

describe("the weekly race check from the long runs done", () => {
  it("says so when the reach is under half the race", () => {
    // Seven weeks out: four build weeks before the marathon's three-week
    // taper, so 4 km builds to 12, under the marathon's 21.
    const check = raceLongRunCheck({
      profile: marathon(7),
      programState: plan(12),
      recentRuns: noLongRuns,
      today: TODAY,
    });
    expect(check).toEqual({
      longestKm: 4,
      reachKm: 12,
      raceKm: 42.2,
      weekKey: TODAY,
    });
  });

  it("reads the long run the plan put in the week, before it was fitted to the running done", () => {
    // The owner's trace in its last build week: the plan's 20 km on Sunday,
    // fitted to 40 easy minutes because no long run was done in a month.
    const fitted = longRun("easy_40", {
      type: "easy",
      trainingBasis: {
        originalTemplateId: "long_20k",
        confirmedAt: TODAY,
        reason: "longest",
      },
    });
    expect(plannedLongRunKm(fitted)).toBe(20);
    expect(
      raceLongRunCheck({
        profile: marathon(4),
        programState: plan(15, [fitted], 20),
        recentRuns: noLongRuns,
        today: TODAY,
      })
    ).toMatchObject({ longestKm: 4, reachKm: 6, raceKm: 42.2 });
    // A swap the runner made is theirs: the plan's long run still counts.
    expect(
      plannedLongRunKm(longRun("long_20k", { userOverride: "easy_30" }))
    ).toBe(20);
  });

  it("is quiet while the long runs keep up", () => {
    const withLong = [...noLongRuns, run(-6, 16)];
    expect(
      raceLongRunCheck({
        profile: marathon(7),
        programState: plan(12),
        recentRuns: withLong,
        today: TODAY,
      })
    ).toBeNull();
  });

  it("is quiet with the weeks left to build", () => {
    expect(
      raceLongRunCheck({
        profile: marathon(12),
        programState: plan(6),
        recentRuns: noLongRuns,
        today: TODAY,
      })
    ).toBeNull();
  });

  /* The reviewer's case: 180 minutes at easy pace slower than about
     8:11 /km is under 22 km, so this runner's marathon plan peaks at 20 km,
     under half the race, and no later date builds it further. Before, the
     check read reach against half the race alone: from the taper on reach
     was the longest run (20 < 21.1), and the sheet opened every week. */
  describe("a plan whose long run peaks under half the race (the 180-minute ceiling)", () => {
    const ceiling = (weeksOut: number, longestKm: number, week = "long_20k") =>
      raceLongRunCheck({
        profile: marathon(weeksOut),
        programState: plan(20 - 1 - weeksOut, [longRun(week)], 20),
        recentRuns: [...noLongRuns, run(-1, longestKm)],
        today: TODAY,
      });

    it("is quiet for a runner who did every long run", () => {
      // The last build week, its long run 20 km and 20 done.
      expect(ceiling(4, 20)).toBeNull();
      // Two build weeks left, 18 done: 22 by the taper, past the plan's 20.
      expect(ceiling(5, 18)).toBeNull();
      // A GPS a little short of the 20 km is still the long run done.
      expect(ceiling(4, 19.4)).toBeNull();
    });

    it("is quiet in its taper and race week, the 20 km done", () => {
      for (const weeksOut of [3, 2, 1, 0])
        expect(ceiling(weeksOut, 20, "long_14k")).toBeNull();
    });

    it("holds a runner behind it to the plan's 20 km, not to half the race", () => {
      // 16.5 km, under the rung before this week's 20, with two build
      // weeks left: 20.5 by the taper, the plan's peak though under 21.1.
      expect(ceiling(5, 16.5)).toBeNull();
      // 12 km in the month: 16, under the plan's 20.
      expect(ceiling(5, 12)).toMatchObject({ longestKm: 12, reachKm: 16 });
    });
  });

  it("is quiet in the taper and race week, whatever was run", () => {
    // Three taper weeks and race week: no week is left to build in, and
    // "before the taper" is behind the runner.
    for (const weeksOut of [3, 2, 1, 0])
      expect(
        raceLongRunCheck({
          profile: marathon(weeksOut),
          programState: plan(19 - weeksOut, [longRun("long_14k")], 20),
          recentRuns: noLongRuns,
          today: TODAY,
        })
      ).toBeNull();
  });

  it("holds a compressed plan's runner to the plan's own peak", () => {
    // A seven-week marathon peaking at 14 km, in week 2 with two build
    // weeks left: 12 km done builds to 16, past the plan's 14 though under
    // half the race. Before, it opened the sheet.
    const short = (longestKm: number) =>
      raceLongRunCheck({
        profile: marathon(5),
        programState: plan(2, [longRun("long_14k")], 14),
        recentRuns: [...noLongRuns, run(-1, longestKm)],
        today: TODAY,
      });
    expect(short(12)).toBeNull();
    expect(short(8)).toMatchObject({ longestKm: 8, reachKm: 12 });
  });

  it("asks nothing of a week whose plan holds no long run, or a plan stored before it carried its peak", () => {
    const easyWeek = [longRun("easy_40", { type: "easy" })];
    expect(
      raceLongRunCheck({
        profile: marathon(7),
        programState: plan(12, easyWeek),
        recentRuns: noLongRuns,
        today: TODAY,
      })
    ).toBeNull();
    // The week's rebuild writes the peak; until then the check waits.
    expect(
      raceLongRunCheck({
        profile: marathon(7),
        programState: plan(12, undefined, null),
        recentRuns: noLongRuns,
        today: TODAY,
      })
    ).toBeNull();
    // A long run from another week isn't this week's.
    expect(
      raceLongRunCheck({
        profile: marathon(7),
        programState: plan(12, [
          longRun("long_20k", { date: day(-1), weekKey: day(-7) }),
        ]),
        recentRuns: noLongRuns,
        today: TODAY,
      })
    ).toBeNull();
  });

  it("leaves a plan's first two weeks to setup's words", () => {
    expect(
      raceLongRunCheck({
        profile: marathon(7),
        programState: plan(1),
        recentRuns: noLongRuns,
        today: TODAY,
      })
    ).toBeNull();
  });

  it("leaves a runner with no run in four weeks to the run return", () => {
    expect(
      raceLongRunCheck({
        profile: marathon(7),
        programState: plan(12),
        recentRuns: [run(-35, 20)],
        today: TODAY,
      })
    ).toBeNull();
  });

  it("says nothing without a race plan, or before the runs are read", () => {
    expect(
      raceLongRunCheck({
        profile: { runMode: "freeform", raceGoal: null },
        programState: plan(12),
        recentRuns: noLongRuns,
        today: TODAY,
      })
    ).toBeNull();
    expect(
      raceLongRunCheck({
        profile: marathon(7),
        programState: plan(12),
        recentRuns: null,
        today: TODAY,
      })
    ).toBeNull();
  });

  it("asks a 5K's reach of half of 5 km", () => {
    // Its build week left adds 2 km: a run of 400 m reaches 2.4 km, under
    // the 2.5, and one of 600 m reaches it. In its one taper week, race
    // week next, it asks nothing.
    const fiveK = (km: number, daysToRace = 20) =>
      raceLongRunCheck({
        profile: {
          runMode: "race_prep",
          raceGoal: { distance: "5k", targetDate: day(daysToRace) },
        },
        programState: plan(6, [longRun("long_6k")], 8),
        recentRuns: [run(-3, km)],
        today: TODAY,
      });
    expect(fiveK(0.6)).toBeNull();
    expect(fiveK(0.4)).toMatchObject({ longestKm: 0.4, raceKm: 5 });
    expect(fiveK(0.4, 13)).toBeNull();
  });
});

describe("what the plan builds to", () => {
  it("is the longest long run the plan put in its weeks", () => {
    const week = (...ids: string[]) =>
      ids.map((templateId) => longRun(templateId));
    expect(
      peakPlannedLongRunKm([
        week("easy_30", "long_16k"),
        week("long_18k"),
        [
          longRun("easy_40", {
            trainingBasis: {
              originalTemplateId: "long_20k",
              confirmedAt: TODAY,
              reason: "longest",
            },
          }),
        ],
        week("long_14k"),
        week("marathon_race"),
      ])
    ).toBe(20);
    expect(peakPlannedLongRunKm([week("easy_30")])).toBe(0);
  });
});
