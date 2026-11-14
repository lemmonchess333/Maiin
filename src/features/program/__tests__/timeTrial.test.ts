/**
 * Run24 (4), deep dive D4: a time trial in the plan, so a runner's paces
 * come from what they can run now. Without a confirmed benchmark the block
 * holds a 3 km one in its second week; every block holds a 5 km one about
 * every five weeks after that. The run's work is read as a race, and the
 * run summary offers the new paces after it.
 */
import { describe, expect, it } from "vitest";
import { generateRacePlanV2 } from "../runScheduler";
import { newRunnerUntil } from "../newRunner";
import { generateSchedule } from "@/lib/scheduleUtils";
import { isTimeTrialTemplateId, RUN_TEMPLATES } from "@/lib/workoutTemplates";
import { segmentsFromTimeTrial } from "@/lib/runSegments";
import { computePlanMetadata } from "@/lib/runPlanMetadata";
import { benchmarkEffortOf } from "@/lib/benchmarkEfforts";
import { runSessionAbout } from "@/lib/runSessionAbout";
import {
  addLocalDays,
  localDateString,
  parseLocalDate,
} from "@/lib/dateHelpers";

const START = "2026-03-09";

function plan(
  distance: "5k" | "10k" | "half" | "marathon",
  weeks: number,
  more: Partial<Parameters<typeof generateRacePlanV2>[0]> = {}
) {
  return generateRacePlanV2({
    recentLayoff: "none",
    weekSchedule: generateSchedule(0, 4),
    weeklyRunDays: 4,
    raceGoal: {
      distance,
      targetDate: localDateString(
        addLocalDays(parseLocalDate(START), weeks * 7 - 1)
      ),
    },
    currentDate: START,
    weekStart: START,
    ...more,
  });
}
const trials = (weeks: { templateId: string }[][]) =>
  weeks.flatMap((week, i) =>
    week
      .filter((run) => isTimeTrialTemplateId(run.templateId))
      .map((run) => `${i + 1}:${run.templateId}`)
  );

describe("the plan's time trials", () => {
  it("open a block with no benchmark with 3 km in week 2, in place of its light session", () => {
    const out = plan("half", 16);
    expect(trials(out.weeks)[0]).toBe("2:time_trial_3k");
    // A base week holds a fartlek or short hills (Run24 (5)); the trial
    // takes it, and the week keeps its strides run.
    expect(
      out.weeks[1].some((run) => /^(fartlek|hills)_/.test(run.templateId))
    ).toBe(false);
    expect(
      out.weeks[1].some((run) => run.templateId.endsWith("_strides"))
    ).toBe(true);
  });

  it("come about every five weeks of the build after that, in place of its quality", () => {
    const out = plan("half", 16);
    expect(trials(out.weeks)).toEqual([
      "2:time_trial_3k",
      "7:time_trial_5k",
      // Week 12 steps back, so the trial comes the week before it.
      "11:time_trial_5k",
    ]);
    for (const [week] of [[7], [11]]) {
      const quality = out.weeks[week - 1].filter(
        (run) =>
          (run.type === "tempo" || run.type === "intervals") &&
          !isTimeTrialTemplateId(run.templateId)
      );
      expect(quality, `week ${week}`).toEqual([]);
    }
  });

  it("leave week 2 alone with a confirmed benchmark", () => {
    const out = plan("half", 16, { easyPaceSPerKm: 330 });
    expect(trials(out.weeks)).toEqual(["7:time_trial_5k", "11:time_trial_5k"]);
  });

  it("stay out of the taper, a new runner's block and a block below the floor", () => {
    const out = plan("marathon", 20);
    const taperFrom = out.totalWeeks - 1 - 3;
    for (const t of trials(out.weeks))
      expect(Number(t.split(":")[0]) - 1).toBeLessThan(taperFrom);
    expect(
      trials(
        plan("half", 16, { newRunnerUntil: newRunnerUntil("new", START) }).weeks
      )
    ).toEqual([]);
    expect(trials(plan("marathon", 3).weeks)).toEqual([]);
  });
});

describe("a time trial on the run screen", () => {
  it("is a warm-up, the distance with no pace on it, and a cool-down", () => {
    const segments = segmentsFromTimeTrial({
      distanceKm: 3,
      warmupSec: 900,
      cooldownSec: 600,
    });
    expect(segments.map((s) => s.type)).toEqual(["warmup", "hard", "cooldown"]);
    expect(segments[1].target).toEqual({ kind: "distance", meters: 3000 });
    expect(segments[1].paceTarget).toBeUndefined();
  });

  it("launches with its segments and no pace target, whatever the paces", () => {
    const { prefill } = computePlanMetadata({
      displayUnit: "km",
      profileRunMode: "race_prep",
      todayDayIndex: 1,
      runPlan: {
        mode: "race_prep",
        // Race day is counted from the clock: once it has passed, the plan
        // has ended and the run launches as a free run with no segments.
        raceGoal: {
          distance: "10k",
          targetDate: localDateString(addLocalDays(new Date(), 56)),
        },
        totalWeeks: 10,
        currentWeek: 2,
      },
      runDays: [
        { dayIndex: 1, templateId: "time_trial_5k", type: "intervals" },
      ],
      urlTemplateId: null,
      urlType: null,
    });
    expect(prefill.target).toBeUndefined();
    expect(prefill.intervals).toBeUndefined();
    expect(prefill.segments?.map((s) => s.type)).toEqual([
      "warmup",
      "hard",
      "cooldown",
    ]);
  });

  it("says what it is and how it should feel", () => {
    const about = runSessionAbout(
      RUN_TEMPLATES.find((t) => t.id === "time_trial_5k")!
    );
    expect(about.what).toMatch(/5 km as hard as you can hold evenly/);
    expect(about.what).toMatch(/parkrun/);
  });
});

describe("a time trial read as a benchmark", () => {
  const run = (workPortion: { seconds: number; meters: number }) => ({
    distance: workPortion.meters + 4000,
    duration: workPortion.seconds + 1500,
    avgPace: 330,
    activityType: "intervals",
    templateId: "time_trial_5k",
    workPortion,
  });

  it("is a race over its work, not over the warm-up and cool-down", () => {
    expect(benchmarkEffortOf(run({ seconds: 1350, meters: 5000 }))).toEqual({
      kind: "race",
      distanceM: 5000,
      timeS: 1350,
    });
  });

  it("is nothing when it was stopped short of 2 km", () => {
    expect(benchmarkEffortOf(run({ seconds: 400, meters: 1500 }))).toBeNull();
  });
});
