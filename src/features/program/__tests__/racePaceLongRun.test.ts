/**
 * Run24 (5), deep dive D5: a marathon's or a half's later build weeks hold
 * a session of their own at race pace, a long run with blocks at it, every
 * other week in place of the plain long run, the same distance and minutes.
 */
import { describe, expect, it } from "vitest";
import { generateRacePlanV2, type RacePlanV2Input } from "../runScheduler";
import {
  getPhaseForWeek,
  isRunStepBackWeek,
  lastRampWeekOf,
  TAPER_WEEKS_BY_DISTANCE,
} from "../runPlanTiming";
import { newRunnerUntil } from "../newRunner";
import { fitRunToTimeLimit } from "../runTimeLimits";
import { shorteningRank, stepDownOneRung } from "@/lib/planDeloadWeek";
import { generateSchedule } from "@/lib/scheduleUtils";
import {
  RACE_PACE_LONG_LADDERS,
  racePaceLongTemplateId,
  RUN_TEMPLATES,
} from "@/lib/workoutTemplates";
import {
  addLocalDays,
  localDateString,
  parseLocalDate,
} from "@/lib/dateHelpers";

const START = "2026-03-09";
type Distance = RacePlanV2Input["raceGoal"]["distance"];

function plan(
  distance: Distance,
  weeks: number,
  runDays = 4,
  more: Partial<RacePlanV2Input> = {}
) {
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
    easyPaceSPerKm: 360,
    ...more,
  });
}

const template = (id: string) => RUN_TEMPLATES.find((t) => t.id === id)!;
const longOf = (week: { templateId: string; type: string }[]) =>
  week.find((run) => run.type === "long")?.templateId ?? null;
const isTwin = (id: string | null) =>
  !!id && !!template(id).config.racePaceBlocks;
/** The weeks of a plan whose long run has race-pace blocks. */
const twinWeeks = (out: ReturnType<typeof plan>) =>
  out.weeks.flatMap((week, w) => (isTwin(longOf(week)) ? [w] : []));

describe("the long run with race-pace blocks (Run24 (5))", () => {
  it("is each rung's twin: the same distance and minutes, its blocks inside it", () => {
    for (const race of ["marathon", "half"] as const)
      for (const id of RACE_PACE_LONG_LADDERS[race]) {
        const twin = template(id);
        const km = twin.config.targetDistanceKm!;
        const plain = RUN_TEMPLATES.find(
          (t) => t.id === `long_${km}k` && t.type === "long" && t !== twin
        )!;
        expect(racePaceLongTemplateId(plain.id, race)).toBe(id);
        expect(twin.estimatedDuration).toBe(plain.estimatedDuration);
        const b = twin.config.racePaceBlocks!;
        expect(b.race).toBe(race);
        // 2 or 3 blocks of 3 km, about 15 to 20 minutes each at race pace,
        // and 6 km or more of easy running before them.
        expect(b.blockKm).toBe(3);
        expect(b.reps).toBe(race === "marathon" && km >= 22 ? 3 : 2);
        const work = b.reps * b.blockKm + (b.reps - 1) * b.floatKm;
        expect(km - work - b.finishKm).toBeGreaterThanOrEqual(6);
      }
    // A rung with no twin, a short race's long run, or a twin itself: none.
    expect(racePaceLongTemplateId("long_12k", "marathon")).toBeNull();
    expect(racePaceLongTemplateId("long_26k", "half")).toBeNull();
    expect(racePaceLongTemplateId("long_24k_mp", "marathon")).toBeNull();
    expect(racePaceLongTemplateId("long_25k", "marathon")).toBeNull();
  });

  it("comes every other week from the build's second half, never a step-back, the peak or a trial's week", () => {
    for (const [distance, weeks, runDays] of [
      ["marathon", 20, 4],
      ["marathon", 16, 5],
      ["half", 14, 3],
      ["half", 18, 4],
    ] as const) {
      const out = plan(distance, weeks, runDays);
      const phase = (w: number) =>
        getPhaseForWeek(w, weeks, distance, out.shortBase);
      const build = out.weeks
        .map((_, w) => w)
        .filter((w) => phase(w) === "build");
      const from = build[0] + Math.floor(build.length / 2);
      const lastRamp = lastRampWeekOf(weeks, TAPER_WEEKS_BY_DISTANCE[distance]);
      const held = twinWeeks(out);
      const label = `${distance} in ${weeks} weeks on ${runDays} days`;
      expect(held.length, label).toBeGreaterThan(0);
      // Every eligible week in turn: the first holds one, the next not.
      const eligible = build.filter(
        (w) =>
          w >= from &&
          !isRunStepBackWeek(w, weeks, distance) &&
          w !== lastRamp &&
          !out.weeks[w].some((run) => run.templateId.startsWith("time_trial"))
      );
      expect(held, label).toEqual(eligible.filter((_, i) => i % 2 === 0));
      // Its own race's twin, never the other race's.
      for (const w of held)
        expect(
          template(longOf(out.weeks[w])!).config.racePaceBlocks!.race
        ).toBe(distance);
    }
  });

  it("keeps the long run's distance: the block's long runs are the plain plan's", () => {
    // No pace: the nominal table, which climbs to 32 km.
    const out = plan("marathon", 20, 4, { easyPaceSPerKm: null });
    const km = out.weeks.map((week) => {
      const id = longOf(week);
      return id ? template(id).config.targetDistanceKm : 0;
    });
    // The nominal 20-week marathon (racePlanSafetySweep), the twins read
    // at their own distance.
    expect(km.filter((k) => k! > 0)).toEqual([
      14, 14, 16, 14, 18, 20, 20, 16, 22, 24, 26, 20, 28, 28, 30, 32, 24, 18,
    ]);
    expect(twinWeeks(out).map((w) => longOf(out.weeks[w]))).toEqual([
      "long_28k_mp",
      "long_30k_mp",
    ]);
  });

  it("is not for a 5K or a 10K, a gentler or a beginner's block, nor a detrained runner", () => {
    expect(twinWeeks(plan("5k", 14))).toEqual([]);
    expect(twinWeeks(plan("10k", 16))).toEqual([]);
    expect(
      twinWeeks(
        plan("marathon", 20, 4, {
          tuning: { difficulty: "gentler", volume: "standard" },
        })
      )
    ).toEqual([]);
    expect(
      twinWeeks(
        plan("marathon", 24, 4, {
          newRunnerUntil: newRunnerUntil("new", START),
          recentRuns: [],
        })
      )
    ).toEqual([]);
    expect(
      twinWeeks(plan("marathon", 20, 4, { recentLayoff: "detrained" }))
    ).toEqual([]);
  });

  it("stays plain where the starting point's climb holds the long run short", () => {
    const out = plan("marathon", 20, 4, {
      runningBaseline: {
        version: 1,
        experience: "occasional",
        weeklyMinutes: 90,
        longestRunMinutes: 40,
        confirmedAt: "2026-03-01",
        source: "self_reported",
      },
    });
    for (const week of out.weeks)
      for (const run of week)
        if (isTwin(run.templateId)) expect(run.trainingBasis).toBeUndefined();
  });
});

describe("a fit or a lighter week and the race-pace long run (Run24 (5))", () => {
  it("never turns a plain long run into one with blocks, and keeps a twin its race's", () => {
    const plain = template("long_24k");
    const twin = template("long_24k_mp");
    expect(shorteningRank(plain, template("long_20k_mp"))).toBeNull();
    expect(shorteningRank(plain, template("long_20k"))).toBe(0);
    expect(shorteningRank(twin, template("long_20k_mp"))).toBe(1);
    expect(shorteningRank(twin, template("long_20k"))).toBe(0);
    expect(shorteningRank(twin, template("long_20k_hmp"))).toBeNull();
    // A time limit shortens a twin to a shorter twin of its race first.
    const fitted = fitRunToTimeLimit(
      {
        dayIndex: 0,
        templateId: "long_24k_mp",
        type: "long",
        weekKey: "2026-03-09",
      },
      { sessionMinutes: null, longRunMinutes: 115 }
    );
    expect(fitted.templateId).toBe("long_20k_mp");
    // A lighter week steps it down 4 km, still with its blocks.
    expect(stepDownOneRung("long_24k_mp")).toBe("long_20k_mp");
    expect(stepDownOneRung("long_16k_mp")).toBeNull();
  });
});
