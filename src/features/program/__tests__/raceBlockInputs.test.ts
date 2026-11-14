/**
 * Run24 (1), (2) and (8), reviewed: what sizes a race block is worked out
 * when the block is made and kept on its plan (`RaceBlockInputs`), so a week
 * rebuilt on any rollover is the week the plan already had. Read again from
 * each rollover's runs, the plan changed under the runner: a few seconds'
 * drift in the month's pace or a failed read moved the long run a rung, a
 * race in the month lifted a marathon's ceiling until it left the window,
 * and a failed read took a beginner's quality out of their weeks. A plan
 * made once is the plan it was.
 */
import { describe, expect, it } from "vitest";
import {
  generateRacePlanV2,
  raceBlockStartingPoint,
  type RacePlanV2Input,
} from "../runScheduler";
import type { RunningBaseline } from "../runningBaseline";
import type { DatedRun } from "../layoffDetection";
import { newRunnerUntil } from "../newRunner";
import type { RaceBlockInputs, ScheduledRunDay } from "../programTypes";
import { generateSchedule } from "@/lib/scheduleUtils";
import { RUN_TEMPLATES } from "@/lib/workoutTemplates";
import {
  addLocalDays,
  localDateString,
  parseLocalDate,
} from "@/lib/dateHelpers";

/** Monday 9 March 2026, the day the plan is made. */
const START = "2026-03-09";
const day = (from: string, days: number) =>
  localDateString(addLocalDays(parseLocalDate(from), days));
const week = (n: number) => day(START, n * 7);

const start = (
  weeklyMinutes: number,
  longestRunMinutes: number
): RunningBaseline => ({
  version: 1,
  experience: "regular",
  weeklyMinutes,
  longestRunMinutes,
  confirmedAt: START,
  source: "self_reported",
});
/** The reviewer's runner: 330 minutes a week, a 100-minute longest run. */
const REGULAR = start(330, 100);

/** Their usual week, at `paceSPerKm`, in each of the `weeks` weeks before
 *  `before`: 50, 60, 60 and 60 minutes, and the long run on Sunday. */
function usualRuns(
  before: string,
  paceSPerKm: number,
  longestMinutes = 100,
  weeks = 4
): DatedRun[] {
  return Array.from({ length: weeks }, (_, w) =>
    [
      [0, 50],
      [1, 60],
      [3, 60],
      [4, 60],
      [6, longestMinutes],
    ].map(([offset, minutes]) => ({
      date: day(before, -7 * (w + 1) + offset),
      duration: minutes * 60,
      distance: ((minutes * 60) / paceSPerKm) * 1000,
    }))
  ).flat();
}

function plan(
  distance: RacePlanV2Input["raceGoal"]["distance"],
  weeks: number,
  more: Partial<RacePlanV2Input> = {}
) {
  return generateRacePlanV2({
    recentLayoff: "none",
    weekSchedule: generateSchedule(0, 5),
    weeklyRunDays: 5,
    raceGoal: { distance, targetDate: day(START, weeks * 7 - 1) },
    currentDate: START,
    weekStart: START,
    runningBaseline: REGULAR,
    ...more,
  });
}

/** Week `n` of a plan made with `made`, rebuilt on its rollover from the
 *  plan's record, with `runs` read that day. */
function rebuilt(
  made: ReturnType<typeof plan>,
  distance: RacePlanV2Input["raceGoal"]["distance"],
  weeks: number,
  n: number,
  runs: DatedRun[] | null,
  more: Partial<RacePlanV2Input> = {}
) {
  return plan(distance, weeks, {
    currentDate: week(n),
    weekStart: week(n),
    planTotalWeeks: made.totalWeeks,
    blockInputs: made.blockInputs,
    // Run24 (2): the block's shorter base, carried beside them.
    shortBase: made.shortBase,
    recentRuns: runs,
    ...more,
  });
}

const template = (id: string) => RUN_TEMPLATES.find((t) => t.id === id)!;
const longKm = (runs: readonly ScheduledRunDay[]) =>
  Math.max(
    0,
    ...runs
      .filter((run) => run.type === "long")
      .map((run) => template(run.templateId).config.targetDistanceKm ?? 0)
  );
const peakKm = (weeks: readonly ScheduledRunDay[][]) =>
  Math.max(...weeks.map(longKm));
const hard = (run: ScheduledRunDay) =>
  run.type === "tempo" || run.type === "intervals";

describe("a block set up with no benchmark and no runs read", () => {
  // Setup reads no runs (Onboarding's `planBuilder` call passes none).
  const made = plan("half", 16);
  /** The plan as the first rollover leaves it, reading the runs at 6:30. */
  const first = rebuilt(made, "half", 16, 1, usualRuns(week(1), 390));

  it("is sized at the template minutes, and keeps no pace", () => {
    // The template minutes read a 100-minute longest run as the 18 km rung.
    expect(longKm(made.weeks[0])).toBe(18);
    expect(made.blockInputs).toEqual({
      startingPoint: raceBlockStartingPoint(REGULAR),
      runsPaceSPerKm: null,
      heldLongKm: 18,
    });
  });

  it("takes the first pace a rebuild reads, once", () => {
    // Run24 (1): a runner with no benchmark is sized at their own pace.
    // 100 minutes at 6:30 /km are the 14 km rung.
    expect(first.blockInputs?.runsPaceSPerKm).toBeCloseTo(390, 0);
    expect(longKm(first.weeks[0])).toBe(14);
    // A failed first read keeps the template minutes, and reads again.
    const failed = rebuilt(made, "half", 16, 1, null);
    expect(failed.weeks[0]).toEqual(made.weeks[1]);
    expect(failed.blockInputs?.runsPaceSPerKm).toBeNull();
  });

  it("then rebuilds the same weeks whatever runs each rollover reads", () => {
    for (let n = 2; n <= 5; n++) {
      const again = (runs: DatedRun[] | null) =>
        rebuilt(first, "half", 16, n, runs, { planTotalWeeks: 16 });
      const atPace = again(usualRuns(week(n), 390));
      const drifted = again(usualRuns(week(n), 410));
      const failed = again(null);
      expect(atPace.weeks[0], `week ${n}`).toEqual(first.weeks[n - 1]);
      expect(drifted.weeks, `week ${n}`).toEqual(atPace.weeks);
      expect(failed.weeks, `week ${n}`).toEqual(atPace.weeks);
      expect(failed.blockInputs?.runsPaceSPerKm).toBeCloseTo(390, 0);
    }
  });
});

describe("a block made with the runs read", () => {
  const runs = usualRuns(START, 390);
  const made = plan("half", 16, { recentRuns: runs });

  it("is sized at their pace, and keeps it", () => {
    // 100 minutes at 6:30 /km: the 14 km rung, 91 minutes.
    expect(longKm(made.weeks[0])).toBe(14);
    expect(made.blockInputs?.runsPaceSPerKm).toBeCloseTo(390, 0);
    for (let n = 1; n <= 4; n++) {
      // Six seconds slower a km, or no read at all, moves nothing.
      expect(
        rebuilt(made, "half", 16, n, usualRuns(week(n), 396)).weeks
      ).toEqual(rebuilt(made, "half", 16, n, null).weeks);
      expect(
        rebuilt(made, "half", 16, n, usualRuns(week(n), 396)).weeks[0]
      ).toEqual(made.weeks[n]);
    }
  });

  it("reads the pace again for a new starting point, keeping the last one if the read fails", () => {
    const moved = start(360, 120);
    const at = (runs: DatedRun[] | null) =>
      rebuilt(made, "half", 16, 2, runs, { runningBaseline: moved })
        .blockInputs;
    expect(at(usualRuns(week(2), 360, 120))).toMatchObject({
      startingPoint: raceBlockStartingPoint(moved),
    });
    expect(at(usualRuns(week(2), 360, 120))?.runsPaceSPerKm).toBeCloseTo(
      360,
      0
    );
    expect(at(null)?.runsPaceSPerKm).toBe(made.blockInputs?.runsPaceSPerKm);
  });
});

describe("the marathon's ceiling and its floor (Run24 (1))", () => {
  // A regular runner at 8:00 /km with no benchmark: three hours are 22 km.
  const SLOW = start(300, 120);
  const usual = usualRuns(START, 480, 120);
  const race: DatedRun = {
    date: day(START, -9),
    duration: 42.2 * 480,
    distance: 42200,
  };

  it("isn't lifted by a race in the month", () => {
    const without = plan("marathon", 20, {
      runningBaseline: SLOW,
      recentRuns: usual,
    });
    const withRace = plan("marathon", 20, {
      runningBaseline: SLOW,
      recentRuns: [...usual, race],
    });
    expect(peakKm(without.weeks)).toBe(22);
    expect(peakKm(withRace.weeks)).toBe(22);
    // Nor on a rollover that reads it.
    expect(
      peakKm(
        rebuilt(without, "marathon", 20, 1, [
          ...usualRuns(week(1), 480, 120),
          race,
        ]).weeks
      )
    ).toBe(22);
  });

  it("holds the longest long run the block has held when a benchmark lowers it", () => {
    // Made at 6:00 /km from the runs, 30 km fits its three hours.
    const made = plan("marathon", 20, {
      runningBaseline: SLOW,
      recentRuns: usualRuns(START, 360, 120),
    });
    expect(peakKm(made.weeks)).toBe(30);
    // Ten weeks in it has held 26 km; then a benchmark is confirmed whose
    // easy pace is 7:30 /km, where three hours are 24 km.
    const kept: RaceBlockInputs = { ...made.blockInputs!, heldLongKm: 26 };
    const after = (inputs: RaceBlockInputs) =>
      plan("marathon", 20, {
        runningBaseline: SLOW,
        currentDate: week(10),
        weekStart: week(10),
        planTotalWeeks: made.totalWeeks,
        blockInputs: inputs,
        easyPaceSPerKm: 450,
      });
    expect(peakKm(after(kept).weeks)).toBe(26);
    expect(peakKm(after({ ...kept, heldLongKm: 0 }).weeks)).toBe(24);
  });

  it("keeps the longest long run each rebuilt week holds", () => {
    let inputs = plan("marathon", 20, {
      runningBaseline: SLOW,
      recentRuns: usual,
    }).blockInputs;
    let longest = 0;
    for (let n = 1; n < 16; n++) {
      const next = plan("marathon", 20, {
        runningBaseline: SLOW,
        currentDate: week(n),
        weekStart: week(n),
        planTotalWeeks: 20,
        blockInputs: inputs,
        recentRuns: null,
      });
      longest = Math.max(longest, longKm(next.weeks[0]));
      expect(next.blockInputs?.heldLongKm, `week ${n}`).toBeGreaterThanOrEqual(
        longest
      );
      inputs = next.blockInputs;
    }
    expect(inputs?.heldLongKm).toBe(22);
  });
});

describe("a beginner's first quality week (Run24 (8))", () => {
  const until = newRunnerUntil("new", START);
  const beginner = (more: Partial<RacePlanV2Input>) =>
    plan("10k", 16, {
      runningBaseline: null,
      weekSchedule: generateSchedule(0, 4),
      weeklyRunDays: 4,
      newRunnerUntil: until,
      planTotalWeeks: 16,
      ...more,
    });
  // The 40-minute run on the Saturday of week 8, read on the Monday after.
  const ran = day(week(8), 5);
  const read = beginner({
    currentDate: week(9),
    weekStart: week(9),
    recentRuns: [{ date: ran, duration: 42 * 60, distance: 7000 }],
  });

  it("is kept once the runs have shown it", () => {
    expect(read.blockInputs?.qualityFrom).toBe(week(9));
    expect(read.weeks.flat().some(hard)).toBe(true);
  });

  it("holds when a later read fails, or the run leaves the month", () => {
    for (const runs of [null, []]) {
      const later = beginner({
        currentDate: week(10),
        weekStart: week(10),
        blockInputs: read.blockInputs,
        recentRuns: runs,
      });
      expect(later.weeks.flat().some(hard)).toBe(true);
      expect(later.blockInputs?.qualityFrom).toBe(week(9));
    }
  });
});

describe("a plan kept from before the inputs were", () => {
  // Carried (`planTotalWeeks`) with no `blockInputs`.
  const carried = (runs: DatedRun[] | null) =>
    plan("half", 16, { planTotalWeeks: 16, recentRuns: runs });

  it("reads as it did: the runs' pace, the template minutes with none", () => {
    expect(longKm(carried(null).weeks[0])).toBe(18);
    expect(carried(null).blockInputs).toBeUndefined();
    expect(longKm(carried(usualRuns(START, 390)).weeks[0])).toBe(14);
  });

  it("counts the farthest run of the month as held, as its rebuilds read it", () => {
    // A marathoner at 8:00 /km with no benchmark, whose three hours are
    // 22 km, ran 26 km last week: the floor the old rebuilds read.
    const ran: DatedRun = {
      date: day(START, -2),
      duration: 26 * 480,
      distance: 26000,
    };
    const legacy = plan("marathon", 20, {
      runningBaseline: start(300, 120),
      planTotalWeeks: 20,
      recentRuns: [...usualRuns(START, 480, 120), ran],
    });
    expect(legacy.blockInputs?.heldLongKm).toBe(26);
    expect(peakKm(legacy.weeks)).toBe(26);
    // A fresh block has held nothing yet.
    expect(
      plan("marathon", 20, {
        runningBaseline: start(300, 120),
        recentRuns: [...usualRuns(START, 480, 120), ran],
      }).blockInputs?.heldLongKm
    ).toBeLessThan(26);
  });

  it("keeps its inputs from the first rebuild that reads runs", () => {
    expect(
      carried(usualRuns(START, 390)).blockInputs?.runsPaceSPerKm
    ).toBeCloseTo(390, 0);
  });
});
