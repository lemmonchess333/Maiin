/**
 * Run24 (3), deep dive D7 and D9: running plans with no race date, and the
 * rolling base before a race too far away for one block. Before, "Free
 * running" planned nothing, ever, and a marathon a year out was fifteen
 * weeks of easy running and a long run that did not move for six months.
 */
import { describe, expect, it } from "vitest";
import { generateRacePlanV2 } from "../runScheduler";
import {
  getPhaseForWeek,
  isRunStepBackWeek,
  RACE_BLOCK_MAX_WEEKS,
  raceBlockStart,
  ROLLING_CYCLE_WEEKS,
  STEP_BACK_EVERY,
} from "../runPlanTiming";
import type { RunningBaseline } from "../runningBaseline";
import type { ScheduledRunDay } from "../programTypes";
import { plannedRunMinutes } from "../runTimeLimits";
import { generateSchedule } from "@/lib/scheduleUtils";
import { BASE_LIGHT_TEMPLATE_IDS, RUN_TEMPLATES } from "@/lib/workoutTemplates";
import {
  addLocalDays,
  localDateString,
  parseLocalDate,
} from "@/lib/dateHelpers";

/** Monday 9 March 2026, the day each plan is made. */
const START = "2026-03-09";
const PACE = 6 * 60;

const template = (id: string) => RUN_TEMPLATES.find((t) => t.id === id)!;
const longKm = (week: ScheduledRunDay[]) =>
  Math.max(
    0,
    ...week
      .filter((run) => run.type === "long")
      .map((run) => template(run.templateId).config.targetDistanceKm ?? 0)
  );
const minutes = (week: ScheduledRunDay[]) =>
  week
    .filter((run) => run.type !== "race")
    .reduce(
      (sum, run) => sum + plannedRunMinutes(template(run.templateId), PACE),
      0
    );
const hard = (week: ScheduledRunDay[]) =>
  week.filter((run) => run.type === "tempo" || run.type === "intervals");
const isTrial = (run: ScheduledRunDay) =>
  run.templateId.startsWith("time_trial");

function racePlan(
  distance: "5k" | "10k" | "half" | "marathon",
  weeks: number,
  options: { runDays?: number; baseline?: RunningBaseline | null } = {}
) {
  const runDays = options.runDays ?? 4;
  return generateRacePlanV2({
    recentLayoff: "none",
    weekSchedule: generateSchedule(0, runDays),
    weeklyRunDays: runDays,
    raceGoal: {
      distance,
      targetDate: localDateString(
        addLocalDays(parseLocalDate(START), weeks * 7 - 1)
      ),
    },
    currentDate: START,
    weekStart: START,
    easyPaceSPerKm: PACE,
    runningBaseline: options.baseline ?? null,
  });
}

describe("the race block cap (Run24 (3), D9)", () => {
  it("caps each distance's block inside the lock's 16 to 20 weeks", () => {
    for (const weeks of Object.values(RACE_BLOCK_MAX_WEEKS)) {
      expect(weeks).toBeGreaterThanOrEqual(16);
      expect(weeks).toBeLessThanOrEqual(20);
    }
    expect(ROLLING_CYCLE_WEEKS).toBe(STEP_BACK_EVERY);
  });

  it("phases a marathon 40 weeks out as 20 weeks of base, then a 20-week block", () => {
    expect(raceBlockStart(40, "marathon")).toBe(20);
    const phases = Array.from({ length: 40 }, (_, w) =>
      getPhaseForWeek(w, 40, "marathon")
    );
    expect(phases.slice(0, 20).every((p) => p === "base")).toBe(true);
    // The block's weeks are a 20-week block's, phase for phase.
    expect(phases.slice(20)).toEqual(
      Array.from({ length: 20 }, (_, w) => getPhaseForWeek(w, 20, "marathon"))
    );
    expect(phases[39]).toBe("race");
  });

  it("leaves a plan inside its cap as it was", () => {
    expect(raceBlockStart(20, "marathon")).toBe(0);
    expect(raceBlockStart(16, "5k")).toBe(0);
    expect(getPhaseForWeek(5, 18, "half")).toBe(
      getPhaseForWeek(5 - raceBlockStart(18, "half"), 18, "half")
    );
  });

  it("steps back every fourth week across the base and into the block", () => {
    for (const total of [21, 22, 23, 24, 29, 40]) {
      const backs = Array.from({ length: total }, (_, w) => w).filter((w) =>
        isRunStepBackWeek(w, total, "marathon")
      );
      // Never in the first three weeks, then every four, the block's own
      // included, until the block stops stepping back before its peak.
      expect(backs[0]).toBeGreaterThanOrEqual(3);
      const inRamp = backs.filter((w) => w < total - 5);
      for (let i = 1; i < inRamp.length; i++)
        expect(inRamp[i] - inRamp[i - 1]).toBe(4);
    }
  });

  it("builds a year-out marathon's base with quality and a long run that climbs, then opens the block on it", () => {
    const plan = racePlan("marathon", 52);
    const before = raceBlockStart(52, "marathon");
    expect(before).toBe(32);
    const base = plan.weeks.slice(0, before);
    const block = plan.weeks.slice(before);
    // The base is not easy running only: it rotates a light tempo, a light
    // session, short reps and the time trials. Run24 (5): from the session
    // library, a marathon's tempos in turn under the base's 20-minute
    // ceiling (the 20-minute tempo and a progression run), a fartlek or
    // short hills where the week held strides alone, and 200s at
    // repetition pace in place of 8 x 400 m.
    expect(base.filter((week) => hard(week).length > 0).length).toBeGreaterThan(
      before / 2
    );
    expect(
      base
        .flatMap(hard)
        .every(
          (run) =>
            isTrial(run) ||
            [
              "tempo_20",
              "progression_40",
              "8x200",
              ...BASE_LIGHT_TEMPLATE_IDS,
            ].includes(run.templateId)
        )
    ).toBe(true);
    for (const id of ["tempo_20", "progression_40", "8x200", "fartlek_30"])
      expect(base.flat().map((run) => run.templateId)).toContain(id);
    // Its long run climbs from the block's opening, 14 km, to 18 and
    // holds there, and steps back every fourth week.
    const baseLongs = base.map(longKm);
    expect(baseLongs[0]).toBe(14);
    expect(Math.max(...baseLongs)).toBe(18);
    expect(baseLongs.slice(before - 8).filter((km) => km === 18).length).toBe(
      6
    );
    for (let w = 0; w < before; w++)
      if (isRunStepBackWeek(w, 52, "marathon"))
        expect(baseLongs[w]).toBeLessThan(18);
    // The block opens where the base got to, and climbs to the marathon's
    // long run as a 20-week block does.
    expect(longKm(block[0])).toBe(18);
    expect(Math.max(...block.map(longKm))).toBeGreaterThanOrEqual(26);
  });

  it("keeps the block's own base free of sessions: quality before the build is the rolling base's (the marathon journey's plan)", () => {
    // e2e/journeys/marathon-with-lifting: a marathon on the Sunday 52 weeks
    // on from a Monday, three lift days and four runs, no benchmark.
    const plan = generateRacePlanV2({
      recentLayoff: "none",
      weekSchedule: generateSchedule(3, 4),
      weeklyRunDays: 4,
      raceGoal: {
        distance: "marathon",
        targetDate: localDateString(
          addLocalDays(parseLocalDate(START), 52 * 7 + 6)
        ),
      },
      currentDate: START,
      weekStart: START,
    });
    const total = plan.totalWeeks;
    const before = raceBlockStart(total, "marathon");
    // A block's base holds a fartlek or short hills (Run24 (5)); neither is
    // the build's quality, as the journey reads it.
    const session = (week: ScheduledRunDay[]) =>
      hard(week).some(
        (run) =>
          !isTrial(run) &&
          !(BASE_LIGHT_TEMPLATE_IDS as readonly string[]).includes(
            run.templateId
          )
      );
    const phases = plan.weeks.map((_, w) =>
      getPhaseForWeek(w, total, "marathon")
    );
    const firstBuild = phases.indexOf("build");
    expect(firstBuild).toBeGreaterThan(before);
    // The rolling base rotates its light sessions (D9: never months of easy
    // running only)...
    expect(plan.weeks.slice(0, before).some(session)).toBe(true);
    // ...the block's own base holds none of the build's, only its light
    // sessions...
    expect(plan.weeks.slice(before, firstBuild).some(session)).toBe(false);
    // ...and its first build week holds one.
    expect(session(plan.weeks[firstBuild])).toBe(true);
  });

  it("holds the weeks across the base and into the block to 15% over the last week that was not a step-back", () => {
    for (const [distance, weeks] of [
      ["marathon", 34],
      ["half", 30],
      ["10k", 26],
      ["5k", 24],
    ] as const) {
      const plan = racePlan(distance, weeks);
      let last: number | null = null;
      plan.weeks.forEach((week, w) => {
        const phase = getPhaseForWeek(w, weeks, distance);
        const trial = week.some(isTrial);
        if (last !== null && !trial && (phase === "base" || phase === "build"))
          // The long run's own rung may take a week over the hold, as in a
          // block; the easy runs give way to the rest.
          expect(minutes(week)).toBeLessThanOrEqual(last * 1.15 + 25);
        if (!isRunStepBackWeek(w, weeks, distance) && !trial)
          last = minutes(week);
      });
    }
  });

  it("opens a short block from a short base without a jump", () => {
    // A 10K 18 weeks out: two weeks of base at its opening, then the block.
    const plan = racePlan("10k", 18);
    expect(raceBlockStart(18, "10k")).toBe(2);
    const longs = plan.weeks.map(longKm);
    for (let w = 1; w < 10; w++)
      expect(longs[w] - Math.max(...longs.slice(0, w))).toBeLessThanOrEqual(2);
  });
});
