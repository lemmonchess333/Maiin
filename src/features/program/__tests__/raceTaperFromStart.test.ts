/**
 * A race too close for a build (deep dive D8). A plan made four weeks before
 * a marathon opens in its taper, so there was no build for the taper to take
 * its shares of, and every week was easy 30s: a runner with a 20 km long run
 * behind them ran nothing over 30 minutes for a month and then a marathon.
 * With a running starting point the taper now takes its shares of that:
 * 75% of their own longest run three weeks out, 60% two weeks out, and their
 * other runs the same shares of the rest of their week. A compressed block
 * whose short build stays under the starting point takes them from the
 * larger of the two. Nothing changes without a starting point, for a full
 * block, a new runner's or a detrained one.
 */
import { describe, expect, it } from "vitest";
import { generateRacePlanV2 } from "../runScheduler";
import type { ScheduledRunDay } from "../programTypes";
import type { RunningBaseline } from "../runningBaseline";
import { generateSchedule } from "@/lib/scheduleUtils";
import {
  addLocalDays,
  localDateString,
  parseLocalDate,
} from "@/lib/dateHelpers";

/** Monday 9 March 2026, the day the plan is made. */
const START = "2026-03-09";
/** The Sunday `weeks` weeks on: the race, in the last week of the block. */
const raceIn = (weeks: number) =>
  localDateString(addLocalDays(parseLocalDate(START), weeks * 7 - 1));

/** 330 minutes a week, the longest 150 minutes: at 6:20 /km a 22 km rung
 *  (Run24 (6)). */
const TRAINED: RunningBaseline = {
  version: 1,
  experience: "regular",
  weeklyMinutes: 330,
  longestRunMinutes: 150,
  confirmedAt: START,
  source: "self_reported",
};
const PACE = 380;

function plan(
  distance: "5k" | "10k" | "half" | "marathon",
  weeks: number,
  extra: Partial<Parameters<typeof generateRacePlanV2>[0]> = {}
) {
  return generateRacePlanV2({
    recentLayoff: "none",
    weekSchedule: generateSchedule(0, 4),
    raceGoal: { distance, targetDate: raceIn(weeks) },
    weeklyRunDays: 4,
    currentDate: START,
    weekStart: START,
    runningBaseline: TRAINED,
    easyPaceSPerKm: PACE,
    ...extra,
  });
}
const longOf = (week: ScheduledRunDay[]) =>
  week.find((run) => run.type === "long")?.templateId ?? null;
const easiesOf = (week: ScheduledRunDay[]) =>
  week.filter((run) => run.type === "easy").map((run) => run.templateId);

describe("a marathon four weeks out, with a 22 km long run behind them", () => {
  const weeks = plan("marathon", 4).weeks;

  it("keeps a long run three and two weeks out, at 75% and 60% of theirs", () => {
    expect(weeks.map(longOf)).toEqual(["long_16k", "long_12k", null, null]);
  });

  it("holds the rest of their running at the same shares", () => {
    // 190 minutes besides the 22 km run over three runs: about 64 each, so
    // 48 and 38 minutes, in the plan's sizes 40 and 30.
    expect(easiesOf(weeks[0])).toEqual(["easy_40", "easy_40", "easy_40"]);
    expect(easiesOf(weeks[1])).toEqual(["easy_30", "easy_30", "easy_30"]);
    expect(easiesOf(weeks[2]).every((id) => id === "easy_30")).toBe(true);
  });

  it("holds no tempo and no intervals", () => {
    expect(
      weeks
        .flat()
        .some((run) => run.type === "tempo" || run.type === "intervals")
    ).toBe(false);
  });

  it("is the easy 30s it was without a starting point", () => {
    const bare = plan("marathon", 4, {
      runningBaseline: null,
      easyPaceSPerKm: null,
    }).weeks;
    expect(
      bare
        .slice(0, -1)
        .flat()
        .every((run) => run.templateId === "easy_30")
    ).toBe(true);
    // Race week's shake-outs are 20 minutes (Run24 (10)).
    expect(
      bare
        .at(-1)!
        .filter((run) => run.type !== "race")
        .every((run) => run.templateId === "easy_20")
    ).toBe(true);
  });
});

describe("a marathon three weeks out, under the taper floor", () => {
  const result = plan("marathon", 3);

  it("is still the mostly-easy plan, with a long run at 60% two weeks out", () => {
    expect(result.belowFloor).toBe(true);
    expect(result.weeks.map(longOf)).toEqual(["long_12k", null, null]);
    expect(
      result.weeks
        .flat()
        .every((run) => ["easy", "long", "race"].includes(run.type))
    ).toBe(true);
  });
});

describe("a compressed block whose short build stays under them", () => {
  it("tapers from their own long run, not the build's", () => {
    const weeks = plan("marathon", 5).weeks;
    // The one build week starts from the starting point's 22 km (Run24
    // (2)); three and two weeks out take their shares of it.
    expect(weeks.map(longOf)).toEqual([
      "long_22k",
      "long_16k",
      "long_12k",
      null,
      null,
    ]);
  });
});

describe("what it leaves as it was", () => {
  it("a full block's taper, which takes its shares of the build", () => {
    // Run24 (2): a full block starts from the starting point, so its taper
    // steps down from the longer build that gives it, never a run past it.
    const withStart = plan("half", 12);
    const without = plan("half", 12, { runningBaseline: null });
    expect(withStart.compressed).toBe(false);
    const taperLong = (weeks: ScheduledRunDay[][]) =>
      weeks.slice(-3).map(longOf);
    expect(taperLong(withStart.weeks)).toEqual(["long_12k", null, null]);
    expect(taperLong(without.weeks)).toEqual(["long_10k", null, null]);
    expect(withStart.weeks.at(-1)!.map((run) => run.templateId)).toEqual(
      without.weeks.at(-1)!.map((run) => run.templateId)
    );
  });

  it("a detrained runner's", () => {
    const weeks = plan("marathon", 4, { recentLayoff: "detrained" }).weeks;
    expect(weeks.map(longOf)).toEqual([null, null, null, null]);
  });

  it("a new runner's", () => {
    const weeks = plan("marathon", 4, {
      newRunnerUntil: localDateString(addLocalDays(parseLocalDate(START), 42)),
    }).weeks;
    expect(weeks.flat().some((run) => run.type === "long")).toBe(false);
  });
});
