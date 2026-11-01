/**
 * The comparisons decisions.md marks "Measuring", each against the plan as
 * built, across seeds and both lifter model variants (R17: the runner's
 * three). A measurement, not a gate: `TROPOS_SIM_MEASURE=20 npx vitest run
 * src/features/program/__tests__/sim/measuring.sim.test.ts` runs 20 seeds
 * of each and writes a markdown report to `test-results/sim/`
 * (uncommitted); `-t R17` runs one comparison.
 * Without the variable it skips, so the PR gate doesn't pay for it.
 *
 * The models are hypotheses (simulator.md, "What the simulator can and
 * can't say"): a difference between two options is the size of the effect
 * the models assume, and the report says which model term carries it.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {}, auth: { currentUser: null } }));

import { loadsTheLegs } from "@/features/program/easierToday";
import { toExperience } from "@/features/program/experienceModel";
import {
  weeklyVolumeByJudgementMuscle,
  type VolumeDay,
} from "@/features/program/volumeModel";
import {
  HARD_RUN_TYPES,
  type ProgramExercise,
  type ProgramState,
  type ScheduledRunDay,
} from "@/features/program/programTypes";
import { setWarmupPricing } from "@/features/program/sessionFit";
import { pickAccessory } from "@/features/program/variationBank";
import {
  getPhaseForWeek,
  lastRampWeekOf,
  TAPER_WEEKS_BY_DISTANCE,
} from "@/features/program/runPlanTiming";
import {
  generateRacePlanV2,
  LONG_RUN_MAX_MINUTES,
  maxSchedulableLongKm,
  runTuningFromProfile,
} from "@/features/program/runScheduler";
import {
  newRunnerTemplate,
  profileNewRunnerUntil,
} from "@/features/program/newRunner";
import {
  fitRunToTimeLimit,
  plannedRunMinutes as appRunMinutes,
} from "@/features/program/runTimeLimits";
import {
  addLocalDays,
  generateScheduledRunId,
  localDateString,
  localWeekKey,
  parseLocalDate,
} from "@/lib/dateHelpers";
import { planningEasyPaceSPerKm, vdotFromRace } from "@/lib/runPaces";
import { getWeeklyRunTarget } from "@/lib/scheduleUtils";
import { RUN_TEMPLATES, type RunTemplate } from "@/lib/workoutTemplates";
import {
  simulateLiftSeason,
  type LiftPersona,
  type PlanVariant,
  type RunWeekPlan,
  type Season,
  type SeasonOptions,
} from "@/test/sim/liftSeason";
import { BASE_VARIANT, HARSH_VARIANT } from "@/test/sim/lifter";
import { LIFT_PERSONAS } from "@/test/sim/liftPersonas";
import { BASE_RUNNER, HARSH_RUNNER, INTENSITY_RUNNER } from "@/test/sim/runner";
import { raceTimeS, runTypeOf, type RunRecord } from "@/test/sim/runSeason";
import { RUN_PERSONAS } from "@/test/sim/runPersonas";
import { clock } from "@/test/sim/runTrace";
import {
  dropScaledByLevel,
  e1rmTrendLoads,
  SCALED_DROP_SHARE,
  TREND,
  weeklyStep,
  WEEKLY_STEP_DAYS,
  type CountedVariant,
} from "@/test/sim/sawtooth";
import {
  BLOCK_SESSIONS,
  LONGEST_BLOCK_SESSIONS,
  projectedPricing,
  refitWhenRampsGrow,
} from "@/test/sim/timeFit";

type RaceDistance = keyof typeof TAPER_WEEKS_BY_DISTANCE;

const SEEDS = Number(process.env.TROPOS_SIM_MEASURE ?? 0);
/** Two model variants, two options, a season a fraction of a second to a
 *  second: generous, so a slow runner doesn't fail a measurement. */
const TIMEOUT = Math.max(120_000, SEEDS * 20_000);

const VARIANTS = [BASE_VARIANT, HARSH_VARIANT] as const;

const report: string[] = [
  "# Measuring: decisions.md's open comparisons",
  "",
  `${String(SEEDS)} seeds of each lifter model variant (base, harsh) per persona and option, unless a section says otherwise.`,
];

const quantile = (values: number[], q: number) => {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return NaN;
  const i = (sorted.length - 1) * q;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
};
const median = (values: number[]) => quantile(values, 0.5);
const fmt = (n: number, digits = 1) =>
  Number.isFinite(n) ? n.toFixed(digits) : "-";
const range = (values: number[], digits = 1) =>
  `${fmt(median(values), digits)} [${fmt(quantile(values, 0.1), digits)}–${fmt(quantile(values, 0.9), digits)}]`;

/** Every seed of both model variants, with `options` on top. */
function seasons(
  persona: LiftPersona,
  weeks: number,
  options: Omit<SeasonOptions, "weeks" | "seed" | "variant"> = {}
): Season[] {
  return VARIANTS.flatMap((variant) =>
    Array.from({ length: SEEDS }, (_, i) =>
      simulateLiftSeason(persona, {
        ...options,
        weeks,
        seed: i + 1,
        variant,
      })
    )
  );
}

/** The people who lift and run: the hybrids and the year-out marathoner. */
const HYBRIDS = RUN_PERSONAS.filter(
  ({ persona }) => persona.answers.trainingActivity === "both"
).map(({ persona }) => persona);

const weeksOf = (persona: LiftPersona) =>
  RUN_PERSONAS.find((p) => p.persona.name === persona.name)?.weeks ?? 26;

/** Percent gain in a lift's true 1RM from its first session to the
 *  season's end, or null where it was never trained. */
function gain(season: Season, id: string): number | null {
  const first = season.sessions
    .flatMap((s) => s.lifts)
    .find((l) => l.exerciseId === id && l.trueMax !== null);
  const end = season.weeks.at(-1)?.trueMax[id];
  if (!first?.trueMax || !end) return null;
  return ((end - first.trueMax) / first.trueMax) * 100;
}

const legLifts = (season: Season) =>
  season.sessions.flatMap((s) =>
    s.lifts
      .filter((l) =>
        loadsTheLegs({
          movementCategory: l.movementCategory,
        } as Parameters<typeof loadsTheLegs>[0])
      )
      .map((l) => ({ ...l, afterHardRun: s.afterHardRun === true }))
  );

describe.skipIf(!SEEDS)(
  "L18: a leg miss after a hard run counts half (A9)",
  () => {
    it(
      "how often a leg session follows a hard run, and what halving its miss changes",
      () => {
        report.push(
          "",
          "## L18: a leg miss after a hard run counts half (A9)",
          "",
          "Per season, median [10th–90th]. As built a leg miss within a day after a long or hard run counts half (`sessionCompletion.ts`); the other option counts it in full. Lowered: a leg lift taken down after its misses. Gain: the leg main lifts' true 1RM over the season, %.",
          "",
          "| persona | leg lifts after a hard run | of them missed | lowered, as built | lowered, counted in full | squat gain, as built | squat gain, in full |",
          "| --- | --- | --- | --- | --- | --- | --- |"
        );
        for (const persona of HYBRIDS) {
          const weeks = weeksOf(persona);
          const built = seasons(persona, weeks);
          const full = seasons(persona, weeks, { hardRunMissCountsFull: true });
          const after = built.map(
            (s) => legLifts(s).filter((l) => l.afterHardRun).length
          );
          const missedAfter = built.map(
            (s) =>
              legLifts(s).filter(
                (l) =>
                  l.afterHardRun &&
                  (l.outcome === "miss" || l.outcome === "lowered")
              ).length
          );
          const lowered = (list: Season[]) =>
            list.map(
              (s) => legLifts(s).filter((l) => l.outcome === "lowered").length
            );
          const squat = (list: Season[]) =>
            list
              .map((s) => gain(s, "squat"))
              .filter((g): g is number => g !== null);
          report.push(
            `| ${persona.name} | ${range(after, 0)} | ${range(missedAfter, 0)} | ${range(lowered(built), 0)} | ${range(lowered(full), 0)} | ${range(squat(built))} | ${range(squat(full))} |`
          );
          expect(built.length).toBe(2 * SEEDS);
        }
      },
      TIMEOUT
    );
  }
);

describe.skipIf(!SEEDS)("L12: lighter weeks near a race", () => {
  it(
    "the lighter lift weeks in a race block's last six weeks, and why each is lighter",
    () => {
      report.push(
        "",
        "## L12: lighter weeks near a race",
        "",
        "Per season, median [10th–90th], over the six weeks up to and including race week: lighter lift weeks in all; of them, the race's own (Lift4 (10): the two before the race and race week, `raceWeek` on the plan); of them, on a run step-back week (Lift4 (9)); and step-back weeks the race's own weeks fall on. Plus whether the week after the race is lighter.",
        "",
        "| persona | lighter of the last 6 | the race's | on a run step-back | step-backs inside the race's weeks | week after lighter |",
        "| --- | --- | --- | --- | --- | --- |"
      );
      for (const persona of HYBRIDS.filter((p) => p.answers.raceDistance)) {
        const list = seasons(persona, weeksOf(persona));
        const counts = list.map((season) => {
          const raceAt = season.runWeeks.findIndex((w) =>
            w.planned.some(
              (entry) =>
                runTypeOf(entry.slice(entry.indexOf(":") + 1)) === "race"
            )
          );
          if (raceAt < 0) return null;
          const stretch = season.weeks.slice(
            Math.max(0, raceAt - 5),
            raceAt + 1
          );
          const stepBack = (i: number) => {
            const run = season.runWeeks[i];
            const before = season.runWeeks[i - 1];
            return (
              !!run &&
              !!before &&
              (run.phase === "base" || run.phase === "build") &&
              run.plannedMinutes < before.plannedMinutes
            );
          };
          const lighter = stretch.filter((w) => w.phase === "deload");
          const races = lighter.filter(
            (w) => w.raceWeek === "taper" || w.raceWeek === "race"
          );
          const onStepBack = lighter.filter((w) => stepBack(w.week - 1));
          const stepBackInRace = stretch.filter(
            (w) =>
              (w.raceWeek === "taper" || w.raceWeek === "race") &&
              stepBack(w.week - 1)
          );
          const after = season.weeks[raceAt + 1];
          return {
            lighter: lighter.length,
            races: races.length,
            onStepBack: onStepBack.length,
            stepBackInRace: stepBackInRace.length,
            afterLighter: after?.phase === "deload" ? 1 : 0,
          };
        });
        const got = counts.filter(
          (c): c is NonNullable<typeof c> => c !== null
        );
        const col = (key: keyof (typeof got)[number]) =>
          range(
            got.map((c) => c[key]),
            0
          );
        report.push(
          `| ${persona.name} | ${col("lighter")} | ${col("races")} | ${col("onStepBack")} | ${col("stepBackInRace")} | ${col("afterLighter")} |`
        );
        expect(got.length).toBeGreaterThan(0);
      }
    },
    TIMEOUT
  );
});

/** A run template by id. */
const templateById = (id: string) => RUN_TEMPLATES.find((t) => t.id === id);

/** The longest template of `type` at most `limit` (km for a long run,
 *  minutes for an easy one), the plan's own sizes. */
function tierAtMost(
  type: "long" | "easy",
  limit: number
): RunTemplate | undefined {
  const size = (t: RunTemplate) =>
    type === "long"
      ? (t.config.targetDistanceKm ?? 0)
      : (t.config.targetDurationMinutes ?? t.estimatedDuration);
  // Plain sizes only: no strides or run-walk in a taper's easy runs.
  const plain = type === "long" ? /^long_\d+k$/ : /^easy_\d+$/;
  return RUN_TEMPLATES.filter(
    (t) =>
      t.type === type && plain.test(t.id) && size(t) > 0 && size(t) <= limit
  ).sort((a, b) => size(b) - size(a))[0];
}

/**
 * R8's direction (decisions.md): a reduced long run in the taper's first
 * weeks and the cut in steps, run days and the taper's session kept. Three
 * weeks before race week the long run is 75% of the build's longest and
 * the easy runs 75% of the last build week's, two weeks before 60% and
 * 60%, and the week before race week stays as built. Tropos heuristics,
 * in the plan's own template sizes; the taper's session and race week are
 * as built.
 */
const STEPPED_TAPER: PlanVariant = {
  name: "stepped taper",
  start: () => {
    let longest: { km: number; dayIndex: number } | null = null;
    let easyByDay = new Map<number, number>();
    return (state) => {
      const plan = state.runPlan;
      const distance = plan?.raceGoal?.distance as RaceDistance | undefined;
      if (
        plan?.mode !== "race_prep" ||
        !distance ||
        !(distance in TAPER_WEEKS_BY_DISTANCE) ||
        plan.totalWeeks == null ||
        plan.currentWeek == null
      )
        return state;
      const phase = getPhaseForWeek(
        plan.currentWeek,
        plan.totalWeeks,
        distance
      );
      const runs = state.runDays ?? [];
      const weekKey = runs[0]?.weekKey;
      const thisWeek = runs.filter((r) => r.weekKey === weekKey);
      if (phase === "base" || phase === "build") {
        const easy = new Map<number, number>();
        for (const run of thisWeek) {
          const t = templateById(run.userOverride ?? run.templateId);
          if (!t) continue;
          const km = t.config.targetDistanceKm ?? 0;
          if (t.type === "long" && (!longest || km >= longest.km))
            longest = { km, dayIndex: run.dayIndex };
          if (t.type === "easy")
            easy.set(
              run.dayIndex,
              t.config.targetDurationMinutes ?? t.estimatedDuration
            );
        }
        if (easy.size > 0) easyByDay = easy;
        return state;
      }
      if (phase !== "taper" || !longest) return state;
      const taperWeeks = TAPER_WEEKS_BY_DISTANCE[distance];
      const weeksOut = plan.totalWeeks - 1 - plan.currentWeek; // race week is 0
      const share = weeksOut >= 3 ? 0.75 : weeksOut === 2 ? 0.6 : null;
      if (share === null || weeksOut > taperWeeks) return state;
      const long = tierAtMost("long", longest.km * share);
      const changed = runs.map((run) => {
        if (run.weekKey !== weekKey || (run.status && run.status !== "planned"))
          return run;
        const t = templateById(run.userOverride ?? run.templateId);
        if (t?.type !== "easy") return run;
        if (run.dayIndex === longest!.dayIndex && long)
          return run.templateId === long.id
            ? run
            : { ...run, templateId: long.id, type: "long" };
        const minutes = easyByDay.get(run.dayIndex);
        const easy = minutes ? tierAtMost("easy", minutes * share) : null;
        return easy &&
          easy.id !== run.templateId &&
          easy.estimatedDuration > t.estimatedDuration
          ? { ...run, templateId: easy.id }
          : run;
      });
      return changed.every((run, i) => run === runs[i])
        ? state
        : { ...state, runDays: changed };
    };
  },
};

/** What a season's race looked like from the plan's side. */
function raceShape(season: Season) {
  const race = season.runs.find((r) => r.type === "race");
  if (!race) return null;
  const longs = season.runs.filter(
    (r) => r.type === "long" && r.date < race.date
  );
  const lastLong = longs.at(-1);
  const taperAt = season.runWeeks.findIndex((w) => w.phase === "taper");
  const build = season.runWeeks[taperAt - 1];
  const taper = season.runWeeks[taperAt];
  const raceDistance = race.done.km;
  return {
    raceRatio: race.longestBefore > 0 ? raceDistance / race.longestBefore : NaN,
    daysSinceLong: lastLong
      ? Math.round(
          (parseLocalDate(race.date).getTime() -
            parseLocalDate(lastLong.date).getTime()) /
            86_400_000
        )
      : NaN,
    firstTaperShare:
      build && taper && build.plannedMinutes > 0
        ? taper.plannedMinutes / build.plannedMinutes
        : NaN,
    otherSpikes: season.runs.filter(
      (r) =>
        r.type !== "race" &&
        r.longestBefore > 0 &&
        r.done.km > 1.1 * r.longestBefore
    ).length,
    finishMin: race.raceTimeS ? race.raceTimeS / 60 : NaN,
  };
}

describe.skipIf(!SEEDS)("R8: the taper", () => {
  it(
    "a stepped taper with a reduced long run, against the taper as built",
    () => {
      report.push(
        "",
        "## R8: the taper",
        "",
        `As built: every taper run an easy 30 minutes, no long run. ${STEPPED_TAPER.name}: three weeks before race week the long run is 75% of the build's longest and the easy runs 75% of the last build week's, two weeks before 60% and 60%; the week before race week and race week as built. Per season, median [10th–90th]. Race ÷ month's longest: the race against the longest run of the 30 days before it (the single-run guard's yardstick, Frandsen 2025). Days since a long run: from the last long run to the race. First taper week: its planned minutes against the last build week's. The runner model prices a taper at +0.5% against the 2.6% the evidence expects, so finish times can't separate the two.`,
        "",
        "| persona | option | race ÷ month's longest | days since a long run | first taper week | other spikes | finish, min |",
        "| --- | --- | --- | --- | --- | --- | --- |"
      );
      for (const { persona, weeks } of RUN_PERSONAS.filter(
        ({ persona }) =>
          persona.answers.raceDistance === "marathon" ||
          persona.answers.raceDistance === "half"
      )) {
        for (const [option, list] of [
          ["as built", seasons(persona, weeks)],
          [
            STEPPED_TAPER.name,
            seasons(persona, weeks, { planVariant: STEPPED_TAPER }),
          ],
        ] as const) {
          const shapes = list
            .map(raceShape)
            .filter((s): s is NonNullable<typeof s> => s !== null);
          const col = (key: keyof (typeof shapes)[number], digits = 1) =>
            range(shapes.map((s) => s[key]).filter(Number.isFinite), digits);
          report.push(
            `| ${persona.name} | ${option} | ${col("raceRatio")} | ${col("daysSinceLong", 0)} | ${col("firstTaperShare", 2)} | ${col("otherSpikes", 0)} | ${col("finishMin", 0)} |`
          );
        }
      }
    },
    TIMEOUT
  );
});

/** The runner model's variants, as the running outcomes suite runs them. A
 *  running question turns on the runner's model, not the lifter's: the
 *  year-out marathoner lifts on the base lifter throughout. */
const RUNNER_VARIANTS = [BASE_RUNNER, HARSH_RUNNER, INTENSITY_RUNNER] as const;

/** Every seed of each runner model variant, in that order: the same index
 *  is the same runner, with the same draws, under every option. */
function runnerSeasons(
  persona: LiftPersona,
  weeks: number,
  options: Omit<SeasonOptions, "weeks" | "seed" | "runnerVariant"> = {}
): Season[] {
  return RUNNER_VARIANTS.flatMap((runnerVariant) =>
    Array.from({ length: SEEDS }, (_, i) =>
      simulateLiftSeason(persona, {
        ...options,
        weeks,
        seed: i + 1,
        runnerVariant,
      })
    )
  );
}

/** The generator's long-run day (`pickLongRunSlot`, written out: it isn't
 *  exported): a weekend day without lifting, else any day without, else a
 *  weekend day shared with lifting, else any run day. */
function longRunDay(
  weekSchedule: readonly { day: number; type: string }[]
): number | undefined {
  const slots = weekSchedule
    .filter((d) => d.type === "run" || d.type === "both")
    .map((d) => d.day);
  const runOnly = slots.filter((d) => weekSchedule[d]?.type === "run");
  const both = slots.filter((d) => weekSchedule[d]?.type === "both");
  const weekend = (d: number) => d === 0 || d === 6;
  return (
    runOnly.find(weekend) ??
    runOnly[0] ??
    both.find(weekend) ??
    both[0] ??
    slots[0]
  );
}

/** The plan's long-run sizes, shortest first: `long_6k` to `long_30k`. */
const LONG_TIERS = RUN_TEMPLATES.filter((t) => /^long_\d+k$/.test(t.id)).sort(
  (a, b) => (a.config.targetDistanceKm ?? 0) - (b.config.targetDistanceKm ?? 0)
);

/** What a peak rule is given: what the app knows when it plans. */
interface PeakContext {
  /** The planning easy pace (`planningEasyPaceSPerKm`), s/km: null without
   *  a confirmed benchmark, when a tier takes its nominal minutes. */
  pace: number | null;
  /** The peak week's planned minutes besides its long run, as the app
   *  plans them (`plannedRunMinutes`). */
  otherMinutes: number;
}

/** The pace the tiers' nominal minutes assume (`tierMinutesForRunner`'s
 *  "roughly 5:36/km"), for a week's kilometres without a benchmark. */
const NOMINAL_PACE_S_PER_KM = 336;

/**
 * Daniels: the long run 30% of the week under 64 km a week; from 64 km,
 * the lesser of 25% of the week and 150 minutes. The week includes the
 * long run, so 30% of it is 3/7 of the rest, and 25% a third. The longest
 * tier inside that, in the app's minutes for the runner, or the shortest
 * tier, which the plan always allows.
 */
function danielsPeakKm({ pace, otherMinutes }: PeakContext): number {
  let most = (0.3 / 0.7) * otherMinutes;
  const weekKm = ((otherMinutes + most) * 60) / (pace ?? NOMINAL_PACE_S_PER_KM);
  if (weekKm >= 64) most = Math.min(otherMinutes / 3, LONG_RUN_MAX_MINUTES);
  const fits = LONG_TIERS.filter((t) => appRunMinutes(t, pace) <= most);
  return (fits.at(-1) ?? LONG_TIERS[0]).config.targetDistanceKm ?? 0;
}

/** What a peak variant did across its seasons, for the report's check. */
interface PeakTally {
  /** The peaks it set, km. */
  caps: Set<number>;
  /** The peak week's other minutes it read, rounded. */
  otherMinutes: Set<number>;
  /** Weeks whose long run was, at its first look, the generator's as this
   *  replays it; of them, a returning runner's (Run15: a detrained
   *  runner's long run builds toward the base); and weeks it was neither,
   *  left as built. */
  matched: number;
  returning: number;
  unmatched: number;
}

const newTally = (): PeakTally => ({
  caps: new Set(),
  otherMinutes: new Set(),
  matched: 0,
  returning: 0,
  unmatched: 0,
});

/**
 * R17's options (decisions.md): the marathon long run's peak set by
 * `peakKm`, one of the plan's sizes, in place of Run17's ceiling, and
 * nothing else changed. Each week the generator (`generateRacePlanV2`)
 * builds the long run again with its 150-minute ceiling read at the pace
 * that admits exactly the sizes up to that peak, so its own ramp, step-back
 * weeks, peak hold and stepped taper (Run22) build to it; a new runner's
 * build and a run time limit then fit it at the runner's own pace, as the
 * generator does. The rest of the week is the app's. The week's long run is
 * replayed as the plan has it, for a runner coming back from a layoff too
 * (Run15), and one that is neither replay (a run moved or swapped) is left
 * as it is.
 */
function longRunPeak(
  name: string,
  peakKm: (context: PeakContext) => number,
  tally: PeakTally
): PlanVariant {
  return {
    name,
    start: () => {
      let cap: number | null = null;
      const byWeek = new Map<
        string,
        { from: ScheduledRunDay | null; to: ScheduledRunDay | null }
      >();
      return (state, _date, profile) => {
        const plan = state.runPlan;
        const goal = profile?.raceGoal;
        const runs = state.runDays ?? [];
        const weekKey = runs[0]?.weekKey;
        if (
          !profile ||
          !goal ||
          goal.distance !== "marathon" ||
          plan?.mode !== "race_prep" ||
          plan.phase === "recovery" ||
          plan.totalWeeks == null ||
          !weekKey ||
          // The running baseline fits the whole week, which this doesn't
          // replay.
          profile.runningBaseline
        )
          return state;
        const weekSchedule = profile.weekSchedule ?? [];
        const slot = longRunDay(weekSchedule);
        if (slot === undefined) return state;
        const pace = planningEasyPaceSPerKm(profile.runFitness);
        const until = profileNewRunnerUntil(profile);
        const limits = profile.runTimeLimits ?? null;
        // The week as the rollover regenerates it (`regenerateRacePlan`).
        const input = {
          raceGoal: { distance: goal.distance, targetDate: goal.targetDate },
          weekSchedule,
          weeklyRunDays: getWeeklyRunTarget(profile) || 3,
          currentDate: weekKey,
          weekStart: weekKey,
          tuning: runTuningFromProfile(profile),
          planTotalWeeks: plan.totalWeeks,
          runningBaseline: null,
        };
        if (cap === null) {
          // The peak week, the build's last, as the app plans it.
          const full = generateRacePlanV2({
            ...input,
            recentLayoff: "none",
            easyPaceSPerKm: pace,
            newRunnerUntil: until,
            runTimeLimits: limits,
          });
          const blockWeeks = Math.max(plan.totalWeeks, full.totalWeeks);
          const peakWeek =
            full.weeks[
              lastRampWeekOf(blockWeeks, TAPER_WEEKS_BY_DISTANCE.marathon) -
                (blockWeeks - full.totalWeeks)
            ];
          if (!peakWeek) return state;
          const otherMinutes = peakWeek
            .filter((rd) => rd.dayIndex !== slot)
            .reduce((n, rd) => {
              const t = templateById(rd.templateId);
              return n + (t ? appRunMinutes(t, pace) : 0);
            }, 0);
          cap = peakKm({ pace, otherMinutes });
          tally.caps.add(cap);
          tally.otherMinutes.add(Math.round(otherMinutes));
        }
        let week = byWeek.get(weekKey);
        if (!week) {
          const longRun = (
            easyPaceSPerKm: number | null,
            recentLayoff: "none" | "detrained"
          ) => {
            const raw =
              generateRacePlanV2({
                ...input,
                recentLayoff,
                easyPaceSPerKm,
                newRunnerUntil: null,
                runTimeLimits: null,
              }).weeks[0]?.find((rd) => rd.dayIndex === slot) ?? null;
            if (!raw || raw.type === "race") return raw;
            const walked = newRunnerTemplate(
              raw.templateId,
              weekKey,
              until,
              pace
            );
            return fitRunToTimeLimit(
              walked
                ? { ...raw, templateId: walked.id, type: walked.type }
                : raw,
              limits,
              pace
            );
          };
          const capPace = (LONG_RUN_MAX_MINUTES * 60) / cap;
          const held = runs.find(
            (rd) => rd.weekKey === weekKey && rd.dayIndex === slot
          );
          const replays = (layoff: "none" | "detrained") =>
            held &&
            !held.userOverride &&
            held.templateId === longRun(pace, layoff)?.templateId;
          if (replays("none")) {
            week = { from: held ?? null, to: longRun(capPace, "none") };
            tally.matched++;
          } else if (replays("detrained")) {
            week = { from: held ?? null, to: longRun(capPace, "detrained") };
            tally.matched++;
            tally.returning++;
          } else {
            week = { from: null, to: null };
            tally.unmatched++;
          }
          byWeek.set(weekKey, week);
        }
        const { from, to } = week;
        if (!from || !to || from.templateId === to.templateId) return state;
        let changed = false;
        const runDays = runs.map((rd) => {
          if (
            rd.weekKey !== weekKey ||
            rd.dayIndex !== slot ||
            rd.userOverride ||
            rd.completed ||
            (rd.status && rd.status !== "planned") ||
            rd.templateId !== from.templateId
          )
            return rd;
          changed = true;
          const { clashesWithLift: _clash, ...row } = rd;
          return {
            ...row,
            templateId: to.templateId,
            type: to.type,
            id: generateScheduledRunId(
              { dayIndex: rd.dayIndex, templateId: to.templateId },
              weekKey
            ),
            ...(HARD_RUN_TYPES.has(to.type) &&
            weekSchedule[slot]?.type === "both"
              ? { clashesWithLift: true }
              : {}),
          };
        });
        return changed ? { ...state, runDays } : state;
      };
    },
  };
}

/** A marathon season's long run and race, from the plan and the runs. */
function peakOutcome(season: Season, raceDate: string) {
  const raceWeek = localWeekKey(parseLocalDate(raceDate));
  const build = season.runWeeks.filter((w) => w.weekStart < raceWeek);
  // The plan's longest long run before race week, the last week it holds it.
  const peak = build.reduce<RunWeekPlan | null>(
    (top, w) => (w.longKm > 0 && (!top || w.longKm >= top.longKm) ? w : top),
    null
  );
  const longest = (phase: string) =>
    Math.max(0, ...build.filter((w) => w.phase === phase).map((w) => w.longKm));
  const rises = build
    .slice(1)
    .map((w, i) =>
      build[i].plannedMinutes > 0
        ? w.plannedMinutes / build[i].plannedMinutes
        : NaN
    )
    .filter(Number.isFinite);
  const before = season.runs.filter((r) => r.date < raceDate);
  // Against the longest run of the 30 days before (the single-run guard's
  // yardstick, Frandsen 2025).
  const ratio = (r: RunRecord) =>
    r.longestBefore > 0 ? r.done.km / r.longestBefore : NaN;
  const ratios = before.map(ratio).filter(Number.isFinite);
  // The chance the model's hazard gives the run an injury.
  const risk = (r: RunRecord) => 1 - Math.exp(-r.done.hazard);
  const race = season.runs.find((r) => r.type === "race");
  // An injury that only reduces running halves the race as well.
  const full = race !== undefined && race.done.km >= 42.19;
  // The weekly kilometres the race-day correction reads (`weeklyKm`).
  const from = localDateString(addLocalDays(parseLocalDate(raceDate), -56));
  const weeklyKm =
    season.runs
      .filter((r) => r.date >= from && r.date < raceDate)
      .reduce((n, r) => n + r.done.km, 0) / 8;
  return {
    peakKm: peak?.longKm ?? NaN,
    peakMinutes: peak?.longMinutes ?? NaN,
    peakShare:
      peak && peak.plannedMinutes > 0
        ? peak.longMinutes / peak.plannedMinutes
        : NaN,
    // The stepped taper's long runs are shares of the build's longest.
    taperOverBuild:
      longest("taper") > Math.max(longest("base"), longest("build")),
    rise: rises.length > 0 ? Math.max(...rises) : NaN,
    spike: ratios.length > 0 ? Math.max(...ratios) : NaN,
    spikes: ratios.filter((x) => x > 1.1).length,
    raceRatio: race ? ratio(race) : NaN,
    longOver150: before.filter(
      (r) => r.type === "long" && r.done.minutes >= 150
    ).length,
    injured: before.some((r) => r.done.injury !== null),
    expected: before.reduce((n, r) => n + risk(r), 0),
    raceRisk: race ? risk(race) : NaN,
    started: race !== undefined,
    full,
    finishS: full ? (race.raceTimeS ?? NaN) : NaN,
    vdot: full ? race.trueVdot : NaN,
    weeklyKm,
  };
}

/** R17's options, against Run17 as built (decisions.md). */
const PEAK_OPTIONS: readonly {
  name: string;
  peakKm: ((context: PeakContext) => number) | null;
}[] = [
  { name: "as built (Run17)", peakKm: null },
  { name: "Daniels", peakKm: danielsPeakKm },
  { name: "30 km", peakKm: () => 30 },
  { name: "Hansons, 25 km", peakKm: () => 25 },
];

const MARATHONS = RUN_PERSONAS.filter(
  ({ persona }) =>
    persona.answers.raceDistance === "marathon" &&
    persona.answers.runMode === "race_prep"
);

/** Four options, three runner variants, a year's season about two
 *  seconds: a persona's options at 20 seeds run some minutes. */
const PEAK_TIMEOUT = Math.max(300_000, SEEDS * 90_000);

const pct = (share: number) =>
  Number.isFinite(share) ? `${String(Math.round(share * 100))}%` : "-";
const signed = (n: number, digits = 1) =>
  Number.isFinite(n)
    ? `${n > 0 ? "+" : n < 0 ? "−" : "±"}${Math.abs(n).toFixed(digits)}`
    : "-";
const signedRange = (values: number[], digits = 1) =>
  values.length === 0
    ? "-"
    : `${signed(median(values), digits)} [${signed(quantile(values, 0.1), digits)} to ${signed(quantile(values, 0.9), digits)}]`;
const clockRange = (seconds: number[]) =>
  seconds.length === 0
    ? "-"
    : `${clock(median(seconds))} [${clock(quantile(seconds, 0.1))}–${clock(quantile(seconds, 0.9))}]`;

const r17 = {
  plan: [] as string[],
  outcomes: [] as string[],
  terms: [] as string[],
  checks: [] as string[],
};

describe.skipIf(!SEEDS)("R17: the marathon long run's peak", () => {
  afterAll(() => {
    report.push(
      "",
      "## R17: the marathon long run's peak",
      "",
      `${String(SEEDS)} seeds of each runner model variant (base, harsh, intensity): ${String(3 * SEEDS)} seasons per persona and option, the same seed and variant being the same runner under each option. The year-out marathoner lifts on the base lifter.`,
      "",
      "As built (Run17), the long run climbs the plan's sizes (6, 8, 10, 12, 15, 20, 25 and 30 km) to the longest one inside 150 minutes at the runner's confirmed easy pace, or inside the sizes' nominal minutes without a benchmark (25 km). Each option sets that peak and changes nothing else: the generator builds each week's long run again to it, with its own ramp, step-back weeks, peak hold and stepped taper (Run22: 75% and 60% of the ladder's peak), and a new runner's build and any run time limit then fit it at the pace the app plans with, as they do as built. Daniels: the long run 30% of the week under 64 km a week, the lesser of 25% and 150 minutes from 64 km, read once from the peak week (the build's last) as the app plans it, the week including the long run (3/7 of the week's other planned minutes), the longest size inside that, at the pace the app plans with, or the 6 km floor; reading the week with the long run as built in it gives the same sizes here. 30 km: the middle of the novice plans' 29–32 km, the plan's top size, whatever the pace. Hansons: 25 km, the plan's size nearest Hansons' 16 miles (25.7 km), whatever the pace.",
      "",
      "### The plan",
      "",
      "Per season, median [10th–90th]. Peak allowed: the longest size the option lets this runner's plan reach. Peak long run: the plan's longest before race week; its minutes at the runner's own easy pace that week, and its share of that week's planned minutes. Taper over build: the share of seasons whose taper plans a longer long run than the base and build did (Run22 means the taper's long runs to be 75% and 60% of the build's longest). Biggest weekly rise: the largest rise in planned minutes from one week to the next before race week. Single runs: the longest before the race against the longest of the 30 days before it (the single-run guard's yardstick, Frandsen 2025), the runs over 1.1 times it, and the race's.",
      "",
      "| persona | option | peak allowed | peak long run, km | its minutes | its share of the week | taper over build | biggest weekly rise | biggest run ÷ month's longest | runs past 1.1× | race ÷ month's longest |",
      "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
      ...r17.plan,
      "",
      "### The runner",
      "",
      "Long runs of 2½ hours or more: run before race day, per season. Injured: the share of seasons with an injury before race day. Expected injuries: the model's injury hazard summed over the runs before race day (each run's chance, 1 − e^−hazard), median [10th–90th]; the race's own: its chance in the race. The three runner variants share each seed's draws, so a seed's injuries tend to come in all three. Reached the start: the share of seasons that raced; the finish is over full races (a reduced-running injury halves the race too). VDOT on race morning and the weekly kilometres of the eight weeks before it are the two inputs to the model's race time.",
      "",
      "| persona | option | long runs of 2½ h+ | injured | expected injuries | the race's own | reached the start | finish | VDOT on race morning | km a week, last 8 weeks |",
      "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
      ...r17.outcomes,
      "",
      "### What carries the finish",
      "",
      "Each option's finish against the same runner's as built (both full races), minutes, median [10th–90th]; then the median of each model term's part of it: VDOT on race morning (fitness from minutes run, and any injury's lost weeks), the weekly kilometres the race-day correction reads (Vickers & Vertosick), and the day (freshness or fatigue, and the day's noise), each the model's race time with that input changed alone.",
      "",
      "| persona | option | pairs | finish vs as built | VDOT | weekly km | the day |",
      "| --- | --- | --- | --- | --- | --- | --- |",
      ...r17.terms,
      "",
      `Check: each week the variant first replays the generator's long run for the week as the plan holds it, a returning runner's (Run15) included, and changes only a long run it replays. ${r17.checks.join("; ")}.`
    );
  });

  it.each(MARATHONS.map((p) => [p.persona.name, p] as const))(
    "%s: each peak against Run17 as built",
    (_name, { persona, weeks }) => {
      const raceDate = persona.answers.raceTargetDate ?? "";
      const benchmark = persona.running?.benchmark;
      const appPace = benchmark
        ? planningEasyPaceSPerKm({
            benchmark,
            vdot:
              Math.round(
                vdotFromRace(benchmark.distanceM, benchmark.timeS) * 10
              ) / 10,
          })
        : null;
      const runs = PEAK_OPTIONS.map((option) => {
        const tally = newTally();
        const list = option.peakKm
          ? runnerSeasons(persona, weeks, {
              planVariant: longRunPeak(option.name, option.peakKm, tally),
            })
          : runnerSeasons(persona, weeks);
        return {
          option,
          tally,
          out: list.map((season) => peakOutcome(season, raceDate)),
        };
      });
      const asBuilt = runs[0].out;
      for (const { option, tally, out } of runs) {
        const col = (pick: (o: (typeof out)[number]) => number, digits = 1) =>
          range(out.map(pick).filter(Number.isFinite), digits);
        const share = (pick: (o: (typeof out)[number]) => boolean) =>
          pct(out.filter(pick).length / out.length);
        const allowed = option.peakKm
          ? [...tally.caps].map((km) => `${String(km)} km`).join(", ")
          : `${String(maxSchedulableLongKm(appPace))} km (${appPace ? `150 min at ${clock(appPace)} /km` : "nominal minutes"})`;
        r17.plan.push(
          `| ${persona.name} | ${option.name} | ${allowed} | ${col((o) => o.peakKm, 0)} | ${col((o) => o.peakMinutes, 0)} | ${pct(median(out.map((o) => o.peakShare).filter(Number.isFinite)))} | ${share((o) => o.taperOverBuild)} | ${col((o) => o.rise, 2)} | ${col((o) => o.spike, 2)} | ${col((o) => o.spikes, 0)} | ${col((o) => o.raceRatio, 2)} |`
        );
        const finishes = out.map((o) => o.finishS).filter(Number.isFinite);
        // The faster runner's goal (§6.5 C), as the running outcomes say it.
        const goal = persona.running?.goalTimeS;
        const underGoal = goal
          ? ` · under ${clock(goal + 1)} in ${pct(finishes.filter((t) => t <= goal).length / Math.max(1, finishes.length))}`
          : "";
        r17.outcomes.push(
          `| ${persona.name} | ${option.name} | ${col((o) => o.longOver150, 0)} | ${share((o) => o.injured)} | ${col((o) => o.expected, 2)} | ${col((o) => o.raceRisk, 3)} | ${share((o) => o.started)} | ${clockRange(finishes)}${underGoal} | ${col((o) => o.vdot)} | ${col((o) => o.weeklyKm)} |`
        );
        if (option.peakKm) {
          // The same runner as built, both races run in full.
          const pairs = out
            .map((o, i) => [asBuilt[i], o] as const)
            .filter(([b, o]) => b.full && o.full);
          const at = (vdot: number, km: number) =>
            raceTimeS(vdot, 42195, km) / 60;
          const gap = pairs.map(([b, o]) => (o.finishS - b.finishS) / 60);
          const vdotPart = pairs.map(
            ([b, o]) => at(o.vdot, b.weeklyKm) - at(b.vdot, b.weeklyKm)
          );
          const kmPart = pairs.map(
            ([b, o]) => at(o.vdot, o.weeklyKm) - at(o.vdot, b.weeklyKm)
          );
          const dayPart = gap.map((g, i) => g - vdotPart[i] - kmPart[i]);
          r17.terms.push(
            `| ${persona.name} | ${option.name} | ${String(pairs.length)} | ${signedRange(gap)} | ${signed(median(vdotPart))} | ${signed(median(kmPart))} | ${signed(median(dayPart))} |`
          );
          r17.checks.push(
            `${persona.name}, ${option.name}: ${String(tally.matched)} of ${String(tally.matched + tally.unmatched)} weeks replayed, ${String(tally.returning)} of them a returning runner's${tally.otherMinutes.size > 0 && option.peakKm === danielsPeakKm ? ` (the peak week's other runs ${[...tally.otherMinutes].join(", ")} min)` : ""}`
          );
        }
        expect(out.length).toBe(3 * SEEDS);
      }
    },
    PEAK_TIMEOUT
  );
});

/**
 * L7 (decisions.md): the deadlift a main once a week, its other slots the
 * hinge accessory the variation bank gives a beginner, at an accessory's
 * reps and rule (the generator's `makeAccessory`), starting at 60% of the
 * deadlift's weight. The person's first session sets the real weight
 * (Lift4 (1)).
 */
const DEADLIFT_ONCE: PlanVariant = {
  name: "deadlift once",
  start: () => (state) => {
    let kept = false;
    let changed = false;
    const hinge = pickAccessory("hip_dominant", "deadlift", "beginner");
    const workouts = state.workouts.map((day) => ({
      ...day,
      exercises: day.exercises.map((ex) => {
        if (ex.exerciseId !== "deadlift") return ex;
        if (!kept) {
          kept = true;
          return ex;
        }
        changed = true;
        const weight = Math.max(20, Math.round((ex.weight * 0.6) / 2.5) * 2.5);
        return {
          ...ex,
          name: hinge.name,
          exerciseId: hinge.id,
          instanceId: `${ex.instanceId ?? "slot"}-hinge`,
          reps: 10,
          baseReps: 10,
          repRangeMax: 12,
          weight,
          progressionType: "double" as const,
          lastSuccessfulWeight: weight,
          lastAttemptedWeight: weight,
          consecutiveFailures: 0,
          plateauCount: 0,
          performanceHistory: [],
          lastPerformance: null,
          isAccessory: true,
        };
      }),
    }));
    return changed ? { ...state, workouts } : state;
  },
};

/** A muscle's sets a week, as the app's volume model counts them
 *  (`weeklyVolumeByJudgementMuscle`, the trace's "sets/days"), over the
 *  sessions done in each plan week. */
function muscleSetsPerWeek(season: Season, muscle: string): number[] {
  const byWeek = new Map<number, Season["sessions"]>();
  for (const session of season.sessions)
    byWeek.set(session.weekNumber, [
      ...(byWeek.get(session.weekNumber) ?? []),
      session,
    ]);
  return [...byWeek.values()].map((sessions) => {
    const days: VolumeDay[] = sessions.map((s) => ({
      exercises: s.lifts.map((l) => ({
        exerciseId: l.exerciseId,
        movementCategory:
          l.movementCategory as VolumeDay["exercises"][number]["movementCategory"],
        sets: l.setsDone,
      })),
    }));
    return (
      weeklyVolumeByJudgementMuscle(days).find((m) => m.muscle === muscle)
        ?.sets ?? 0
    );
  });
}

describe.skipIf(!SEEDS)("L7: the beginner's deadlift", () => {
  it(
    "the deadlift a main once a week with a hinge accessory, against twice",
    () => {
      report.push(
        "",
        "## L7: the beginner's deadlift",
        "",
        `As built the beginner's full body plans the deadlift as a main twice a week. ${DEADLIFT_ONCE.name}: a main once, the other slot the hinge accessory a beginner is given. Per season, median [10th–90th]: the deadlift's true 1RM gain, %; its missed or lowered sessions per 100; hamstring sets in a full week (the 90th percentile of the season's weeks, as the app's volume model counts them; the beginner ceiling is 13); and the app's rule failures in the season (a check the variant didn't break the plan).`,
        "",
        "| persona | option | deadlift gain | misses /100 | hamstring sets, a full week | rule failures |",
        "| --- | --- | --- | --- | --- | --- |"
      );
      for (const persona of LIFT_PERSONAS.filter(
        (p) => p.answers.experience === "beginner"
      )) {
        for (const [option, list] of [
          ["as built", seasons(persona, 26)],
          [
            DEADLIFT_ONCE.name,
            seasons(persona, 26, { planVariant: DEADLIFT_ONCE }),
          ],
        ] as const) {
          const gains = list
            .map((s) => gain(s, "deadlift"))
            .filter((g): g is number => g !== null);
          const misses = list.map((s) => {
            const lifts = s.sessions.flatMap((x) =>
              x.lifts.filter((l) => l.exerciseId === "deadlift")
            );
            const missed = lifts.filter(
              (l) => l.outcome === "miss" || l.outcome === "lowered"
            ).length;
            return lifts.length ? (missed / lifts.length) * 100 : NaN;
          });
          const hamstrings = list.map((s) =>
            quantile(muscleSetsPerWeek(s, "Hamstrings"), 0.9)
          );
          report.push(
            `| ${persona.name} | ${option} | ${range(gains)} | ${range(misses.filter(Number.isFinite), 0)} | ${range(hamstrings, 0)} | ${range(
              list.map((s) => s.failures.length),
              0
            )} |`
          );
        }
      }
    },
    TIMEOUT
  );
});

/**
 * L2 (decisions.md), option (b): on the upper/lower plan, bench leads both
 * upper days and squat both lower days, with the deadlift once. Upper B's
 * overhead press and its dumbbell bench change places (the press keeps the
 * accessory's numbers, the bench takes Upper A's main, in a slot of its
 * own); Lower B's deadlift becomes a squat main in its own slot, and its
 * hack squat goes. Applied once, when the plan is the four days the
 * builder makes (`buildUpperLower`).
 */
const BENCH_SQUAT_TWICE: PlanVariant = {
  name: "bench and squat twice",
  start: () => (state) => {
    const days = state.workouts.map((d) => d.dayName);
    const upperA = days.indexOf("Upper — Chest & Back");
    const lowerA = days.indexOf("Lower — Squat Focus");
    const upperB = days.indexOf("Upper — Shoulders & Arms");
    const lowerB = days.indexOf("Lower — Deadlift Focus");
    if ([upperA, lowerA, upperB, lowerB].includes(-1)) return state;
    const bench = state.workouts[upperA].exercises[0];
    const squat = state.workouts[lowerA].exercises[0];
    const b = state.workouts[upperB].exercises;
    const l = state.workouts[lowerB].exercises;
    // Already changed: the variant leaves its own plan as it is.
    if (b[0]?.exerciseId === bench.exerciseId) return state;
    if (
      bench.movementCategory !== "horizontal_push" ||
      squat.movementCategory !== "knee_dominant" ||
      b[0]?.movementCategory !== "vertical_push" ||
      l[0]?.movementCategory !== "hip_dominant"
    )
      return state;
    const pressAt = b.findIndex(
      (ex, i) => i > 0 && ex.movementCategory === "horizontal_push"
    );
    const fresh = (ex: ProgramExercise, slot: string): ProgramExercise => ({
      ...ex,
      instanceId: `${ex.instanceId ?? "slot"}-${slot}`,
      performanceHistory: [],
      lastPerformance: null,
    });
    const upper = b.map((ex, i) => {
      if (i === 0) return fresh(bench, "upper-b");
      if (i === pressAt)
        return {
          ...ex,
          name: b[0].name,
          exerciseId: b[0].exerciseId,
          movementCategory: b[0].movementCategory,
          weight: b[0].weight,
          lastSuccessfulWeight: b[0].weight,
          lastAttemptedWeight: b[0].weight,
          performanceHistory: [],
          lastPerformance: null,
        };
      return ex;
    });
    const lower = l
      .map((ex, i) => (i === 0 ? fresh(squat, "lower-b") : ex))
      .filter((ex, i) => !(i > 0 && ex.movementCategory === "knee_dominant"));
    const workouts = state.workouts.map((d, i) =>
      i === upperB
        ? { ...d, exercises: upper }
        : i === lowerB
          ? { ...d, exercises: lower }
          : d
    );
    return { ...state, workouts };
  },
};

describe.skipIf(!SEEDS)("L2: Get stronger's main lifts once a week", () => {
  it(
    "bench and squat leading both of their days, against as built",
    () => {
      report.push(
        "",
        "## L2: Get stronger's main lifts once a week",
        "",
        `As built, the 4-day upper/lower plan makes squat and bench mains once a week and the deadlift twice; Upper B leads with the overhead press and its horizontal push is a dumbbell accessory. ${BENCH_SQUAT_TWICE.name}: option (b). 26 weeks; per season, median [10th–90th]: each main lift's true 1RM gain, %, and misses or lowerings per 100 of its sessions. The lifter model counts strength by movement family, so a hack squat or a dumbbell bench already counts as the family's second session that week: what the option changes there is the load zone and the sets, not the family's frequency. The option isn't re-fitted to the session's length as the generator would fit it, so its Upper B runs over (the rule failures are over-time ones), and its gains are a slight overestimate.`,
        "",
        "| persona | option | squat | bench | deadlift | overhead press | misses /100 (sq/bp/dl/ohp) | rule failures |",
        "| --- | --- | --- | --- | --- | --- | --- | --- |"
      );
      for (const persona of LIFT_PERSONAS.filter(
        (p) =>
          p.answers.primaryGoal === "strength" && p.answers.daysPerWeek === 4
      )) {
        for (const [option, list] of [
          ["as built", seasons(persona, 26)],
          [
            BENCH_SQUAT_TWICE.name,
            seasons(persona, 26, { planVariant: BENCH_SQUAT_TWICE }),
          ],
        ] as const) {
          const lifts = ["squat", "bench-press", "deadlift", "overhead-press"];
          const gains = lifts.map((id) =>
            range(
              list
                .map((s) => gain(s, id))
                .filter((g): g is number => g !== null)
            )
          );
          const misses = lifts.map((id) => {
            const done = list.flatMap((s) =>
              s.sessions.flatMap((x) =>
                x.lifts.filter((l) => l.exerciseId === id)
              )
            );
            const missed = done.filter(
              (l) => l.outcome === "miss" || l.outcome === "lowered"
            ).length;
            return done.length ? fmt((missed / done.length) * 100, 0) : "-";
          });
          report.push(
            `| ${persona.name} | ${option} | ${gains.join(" | ")} | ${misses.join("/")} | ${range(
              list.map((s) => s.failures.length),
              0
            )} |`
          );
        }
      }
    },
    TIMEOUT
  );
});

/**
 * L10 (decisions.md), option (b): a compound lift the plan puts in two
 * slots keeps its first; each later slot takes the variation the bank gives a beginner
 * for that pattern (`pickAccessory`, the lift itself excluded), at the
 * slot's own sets, reps and rule, from 80% of its weight. The person's
 * first session sets the real weight (Lift4 (1)).
 */
const COMPOUND = new Set<string>([
  "horizontal_push",
  "vertical_push",
  "horizontal_pull",
  "vertical_pull",
  "knee_dominant",
  "hip_dominant",
]);

const SECOND_SLOT_VARIATION: PlanVariant = {
  name: "second slot a variation",
  start: () => (state) => {
    const seen = new Set<string>();
    let changed = false;
    const workouts = state.workouts.map((day) => ({
      ...day,
      exercises: day.exercises.map((ex) => {
        if (!COMPOUND.has(ex.movementCategory)) return ex;
        if (!seen.has(ex.exerciseId)) {
          seen.add(ex.exerciseId);
          return ex;
        }
        const other = pickAccessory(
          ex.movementCategory,
          ex.exerciseId,
          "beginner"
        );
        if (other.id === ex.exerciseId) return ex;
        changed = true;
        seen.add(other.id);
        const weight = Math.max(2.5, Math.round((ex.weight * 0.8) / 2.5) * 2.5);
        return {
          ...ex,
          name: other.name,
          exerciseId: other.id,
          instanceId: `${ex.instanceId ?? "slot"}-variation`,
          weight,
          lastSuccessfulWeight: weight,
          lastAttemptedWeight: weight,
          consecutiveFailures: 0,
          plateauCount: 0,
          performanceHistory: [],
          lastPerformance: null,
        };
      }),
    }));
    return changed ? { ...state, workouts } : state;
  },
};

/** Effective sets a week for a movement family: working sets ended within
 *  four reps of failure (the lifter model's own effort cut-off). */
function effectiveSetsPerWeek(season: Season, family: string): number {
  const byWeek = new Map<number, number>();
  for (const session of season.sessions)
    for (const lift of session.lifts)
      if (lift.movementCategory === family)
        byWeek.set(
          session.weekNumber,
          (byWeek.get(session.weekNumber) ?? 0) +
            lift.rir.filter((r) => r <= 4).length
        );
  return median([...byWeek.values()]);
}

describe.skipIf(!SEEDS)("L10: the same lift in two slots", () => {
  it(
    "the second slot a variation, against the same lift twice",
    () => {
      report.push(
        "",
        "## L10: the same lift in two slots",
        "",
        `As built a beginner's plan can hold a lift in two slots (the 3-day bench as a main and as a second compound), each with its own numbers. ${SECOND_SLOT_VARIATION.name}: option (b). 26 weeks; per season, median [10th–90th]: the main lifts' true 1RM gain, %, and effective sets a week (sets within four reps of failure) for the push and squat patterns. Option (c), one rule and weight shared by both slots, changes the engine and isn't run.`,
        "",
        "| persona | option | bench gain | squat gain | deadlift gain | push sets | squat sets | rule failures |",
        "| --- | --- | --- | --- | --- | --- | --- | --- |"
      );
      for (const persona of LIFT_PERSONAS.filter(
        (p) => p.answers.experience === "beginner"
      )) {
        for (const [option, list] of [
          ["as built", seasons(persona, 26)],
          [
            SECOND_SLOT_VARIATION.name,
            seasons(persona, 26, { planVariant: SECOND_SLOT_VARIATION }),
          ],
        ] as const) {
          const g = (id: string) =>
            range(
              list
                .map((s) => gain(s, id))
                .filter((x): x is number => x !== null)
            );
          report.push(
            `| ${persona.name} | ${option} | ${g("bench-press")} | ${g("squat")} | ${g("deadlift")} | ${range(
              list.map((s) => effectiveSetsPerWeek(s, "horizontal_push")),
              0
            )} | ${range(
              list.map((s) => effectiveSetsPerWeek(s, "knee_dominant")),
              0
            )} | ${range(
              list.map((s) => s.failures.length),
              0
            )} |`
          );
        }
      }
    },
    TIMEOUT
  );
});

/** The sections below run several options of every lifting persona: a
 *  season is a fifth of a second to a second, and the machine may be
 *  shared. */
const LONG_TIMEOUT = Math.max(600_000, SEEDS * 150_000);

/** A plan variant, or none, that also keeps the last plan each season
 *  showed it: the plan the season ended on. */
function recording(variant?: PlanVariant): {
  variant: PlanVariant;
  plans: ProgramState[];
} {
  const plans: ProgramState[] = [];
  return {
    plans,
    variant: {
      name: variant?.name ?? "as built",
      start: () => {
        const inner = variant?.start();
        const at = plans.length;
        return (state, date) => {
          const out = inner ? inner(state, date) : state;
          plans[at] = out;
          return out;
        };
      },
    },
  };
}

/** Each persona's seasons as built, and the plans they ended on: run once
 *  for the sections that compare with them. Watching the plan changes
 *  nothing in it. */
const built = new Map<string, { list: Season[]; plans: ProgramState[] }>();
function builtSeasons(persona: LiftPersona) {
  let got = built.get(persona.name);
  if (!got) {
    const rec = recording();
    got = {
      list: seasons(persona, 26, { planVariant: rec.variant }),
      plans: rec.plans,
    };
    built.set(persona.name, got);
  }
  return got;
}

const mean = (values: number[]) =>
  values.reduce((a, b) => a + b, 0) / values.length;

/** The rules a season broke, by name. */
const rulesOf = (list: Season[]) =>
  new Set(list.flatMap((s) => s.failures.map((f) => f.rule)));

/** What the sawtooth did to a season's tracked lifts. */
interface Sawtooth {
  /** The tracked lifts' true 1RM gain, %, averaged over the lifts. */
  gain: number | null;
  /** Each per 100 of the tracked lifts' sessions. */
  misses: number;
  drops: number;
  below: number;
}

/**
 * Per 100 of the tracked lifts' sessions: misses (a session the plan
 * judged short at its weight, `miss` or `lowered`), drops (`lowered`: the
 * plan took the lift down after it), and sessions below best (planned under
 * the slot's heaviest plan weight at any of its sessions before).
 */
function sawtoothOf(season: Season, tracked: readonly string[]): Sawtooth {
  const gains = tracked
    .map((id) => gain(season, id))
    .filter((g): g is number => g !== null);
  const lifts = season.sessions
    .flatMap((s) => s.lifts)
    .filter((l) => tracked.includes(l.exerciseId));
  const best = new Map<string, number>();
  let below = 0;
  for (const l of lifts) {
    const top = best.get(l.slot);
    if (top !== undefined && l.planned < top - 1e-6) below++;
    best.set(l.slot, Math.max(top ?? 0, l.planned));
  }
  const per100 = (n: number) => (lifts.length ? (n / lifts.length) * 100 : NaN);
  return {
    gain: gains.length ? mean(gains) : null,
    misses: per100(
      lifts.filter((l) => l.outcome === "miss" || l.outcome === "lowered")
        .length
    ),
    drops: per100(lifts.filter((l) => l.outcome === "lowered").length),
    below: per100(below),
  };
}

describe.skipIf(!SEEDS)("L4: the session-to-session sawtooth", () => {
  it(
    "a weekly step, a drop scaled by level and loads from an e1RM trend, against Lift4 as built",
    () => {
      report.push(
        "",
        "## L4: the session-to-session sawtooth",
        "",
        `Lift4 as built: a step whenever every set hits its target (Lift4 (6)); two misses in a row, 10% lighter, then a step a session back (Lift4 (7), owner call (1)). Each option is laid over it at Finish (\`ProgressionVariant\`, \`sawtooth.ts\`), from where the app's own rules left each lift. **Weekly step, per slot** (as briefed): an intermediate's or advanced lifter's slot steps at most once in ${String(WEEKLY_STEP_DAYS)} days; a step the app takes sooner is held back, weight and reps as before it (every step, a lowered lift's way back included). **Weekly step, per lift** (an addition, since the per-slot rule never bites; see below the table): the same, with a step in any of the lift's slots starting the ${String(WEEKLY_STEP_DAYS)} days for all of them. **Drop scaled by level:** an intermediate's or advanced lifter's two-miss drop is ${String(SCALED_DROP_SHARE * 100)}% on its grid (at least a step), climbing back as built. A beginner keeps Lift4 (6) and the 10% under these three, so they are left out of their rows. **e1RM trend:** after a miss, a main lift's load is the trend's: the app's own record of each of the lift's last ${String(TREND.exposures)} sessions (any slot, at most ${String(TREND.maxReps)} reps), through its Epley (\`epley1RMExact\`), a least-squares line read at the latest, and the load for the target by the app's own rep-to-load scaling, Epley's 1 / (1 + reps / 30); on the grid, no lighter than the bar. The step stays as built: the person stops each set at its target, so an e1RM read off it gives back the weight it was lifted at, and only a step raises a load. Accessories as built. Oreb's waves aren't run (the reading says why).`,
        "",
        `26 weeks; ${String(SEEDS)} seeds of each lifter model variant; per season, median [10th–90th]. Over the persona's tracked lifts (squat, bench, deadlift, press; the dumbbell beginner's four): **gain**, true 1RM, %, averaged over the lifts; **Δ gain**, the option's gain less as built's for the same seed and model variant, percentage points; per 100 of their sessions, **misses** (a session the plan judged short at its weight), **drops** (the plan took the lift down after it) and **below best** (planned under the slot's heaviest plan weight at its sessions before). **Changed**: what the option did in the season, on every loaded lift for the weekly step and the drop: steps held back, drops made ${String(SCALED_DROP_SHARE * 100)}%, and for the trend, loads taken down / second misses kept at their weight. **New rules**: rules of the app's code the option's seasons break that as built's don't.`,
        "",
        "| persona | option | gain % | Δ gain, pp | misses /100 | drops /100 | below best /100 | changed | new rules |",
        "| --- | --- | --- | --- | --- | --- | --- | --- | --- |"
      );
      /** A season, and as built's for the same seed and model variant. */
      type Pair = { tooth: Sawtooth; was: Sawtooth };
      const pooled = new Map<string, Pair[]>();
      /** A metric's value in each season, or its paired difference from
       *  as built's; `metric` gives their median [10th–90th]. */
      const valuesOf = (
        pairs: Pair[],
        pick: (t: Sawtooth) => number | null,
        paired = false
      ) =>
        pairs
          .map(({ tooth, was }) => {
            const now = pick(tooth);
            if (!paired || now === null) return now;
            const then = pick(was);
            return then === null ? null : now - then;
          })
          .filter((v): v is number => v !== null && Number.isFinite(v));
      const metric = (
        pairs: Pair[],
        pick: (t: Sawtooth) => number | null,
        digits = 1,
        paired = false
      ) => range(valuesOf(pairs, pick, paired), digits);
      for (const persona of LIFT_PERSONAS) {
        const level = toExperience(persona.answers.experience);
        const group =
          level === "beginner"
            ? "beginners (6)"
            : "intermediate and advanced (9)";
        const base = builtSeasons(persona).list;
        const options: [string, Season[], CountedVariant | null][] = [
          ["as built", base, null],
        ];
        for (const variant of [
          weeklyStep(level, "slot"),
          weeklyStep(level, "lift"),
          dropScaledByLevel(level),
          e1rmTrendLoads(),
        ])
          if (variant)
            options.push([
              variant.name,
              seasons(persona, 26, { progressionVariant: variant }),
              variant,
            ]);
        const baseTeeth = base.map((s) => sawtoothOf(s, persona.tracked));
        const baseRules = rulesOf(base);
        for (const [option, list, variant] of options) {
          const pairs: Pair[] = list.map((s, i) => ({
            tooth: sawtoothOf(s, persona.tracked),
            was: baseTeeth[i],
          }));
          const key = `${group}|${option}`;
          pooled.set(key, [...(pooled.get(key) ?? []), ...pairs]);
          const changed = variant
            ? variant.name === "e1RM trend"
              ? `${range(
                  variant.counts.map((c) => c.changed),
                  0
                )} / ${range(
                  variant.counts.map((c) => c.kept),
                  0
                )}`
              : range(
                  variant.counts.map((c) => c.changed),
                  0
                )
            : "-";
          const fresh = [...rulesOf(list)].filter((r) => !baseRules.has(r));
          report.push(
            `| ${persona.name} | ${option} | ${metric(pairs, (t) => t.gain)} | ${variant ? metric(pairs, (t) => t.gain, 1, true) : "-"} | ${metric(pairs, (t) => t.misses, 0)} | ${metric(pairs, (t) => t.drops, 0)} | ${metric(pairs, (t) => t.below, 0)} | ${changed} | ${fresh.join(", ") || "none"} |`
          );
          expect(list.length).toBe(2 * SEEDS);
        }
      }
      // Why the per-slot weekly step never bites: a slot's sessions as
      // built, days apart.
      const gaps = LIFT_PERSONAS.flatMap((persona) =>
        builtSeasons(persona).list.flatMap((season) => {
          const last = new Map<string, string>();
          const out: number[] = [];
          for (const session of season.sessions)
            for (const l of session.lifts) {
              const before = last.get(l.slot);
              if (before)
                out.push(
                  Math.round(
                    (parseLocalDate(session.date).getTime() -
                      parseLocalDate(before).getTime()) /
                      86_400_000
                  )
                );
              last.set(l.slot, session.date);
            }
          return out;
        })
      );
      report.push(
        "",
        `As built, a slot's sessions come ${String(gaps.reduce((a, b) => Math.min(a, b), Infinity))} days apart at the least (median ${fmt(median(gaps), 0)}, 90th percentile ${fmt(quantile(gaps, 0.9), 0)}; ${String(gaps.length)} gaps, every persona and season): each slot is one day's lift, and the week's order carries over, so a slot comes round a week later or more, never sooner. Lift4 (6)'s step after every session is already at most one a week in each slot, so the weekly step per slot holds nothing back; a lift steps more often than weekly only through its other slots.`,
        "",
        "Pooled, every season of the group's personas, median [10th–90th]; each Δ is the option's value less as built's for the same persona, seed and model variant, median [10th–90th] and mean:",
        "",
        "| group | option | gain % | Δ gain, pp | misses /100 | Δ misses | drops /100 | Δ drops | below best /100 | Δ below best |",
        "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |"
      );
      for (const [key, pairs] of pooled) {
        const [group, option] = key.split("|");
        const isBuilt = option === "as built";
        /** The paired difference, median [10th–90th], and its mean: a
         *  season's misses and drops are small counts, so the median of
         *  their difference is often 0 either way. */
        const delta = (pick: (t: Sawtooth) => number | null, digits = 1) => {
          if (isBuilt) return "-";
          const values = valuesOf(pairs, pick, true);
          return `${range(values, digits)}, mean ${fmt(mean(values), digits + 1)}`;
        };
        report.push(
          `| ${group} | ${option} | ${metric(pairs, (t) => t.gain)} | ${delta((t) => t.gain)} | ${metric(pairs, (t) => t.misses, 0)} | ${delta((t) => t.misses, 0)} | ${metric(pairs, (t) => t.drops, 0)} | ${delta((t) => t.drops, 0)} | ${metric(pairs, (t) => t.below, 0)} | ${delta((t) => t.below, 0)} |`
        );
      }
    },
    LONG_TIMEOUT
  );
});

/** A plan's weekly sets for each muscle, as the app's volume model counts
 *  them, at the plan's own sets (`baseSets`): its full week. */
function planSetsByMuscle(plan: ProgramState): Map<string, number> {
  return new Map(
    weeklyVolumeByJudgementMuscle(
      plan.workouts.map((d) => ({
        exercises: d.exercises.map((ex) => ({
          exerciseId: ex.exerciseId,
          movementCategory: ex.movementCategory,
          sets: ex.baseSets ?? ex.sets,
        })),
      }))
    ).map((m) => [m.muscle, m.sets])
  );
}

/** The working sets of a plan's full week. */
const planSets = (plan: ProgramState) =>
  plan.workouts
    .flatMap((d) => d.exercises)
    .reduce((n, ex) => n + (ex.baseSets ?? ex.sets), 0);

/** Each lift's own sets in a plan's full week, by day and exercise. */
const setsByLift = (plan: ProgramState) =>
  new Map(
    plan.workouts.flatMap((d) =>
      d.exercises.map(
        (ex) =>
          [`${d.dayName}: ${ex.exerciseId}`, ex.baseSets ?? ex.sets] as const
      )
    )
  );

/** Each key's mean over seasons (a key a season lacks counts 0). */
function meanByKey(maps: Map<string, number>[]): Map<string, number> {
  const keys = new Set(maps.flatMap((m) => [...m.keys()]));
  return new Map(
    [...keys].map((k) => [k, mean(maps.map((m) => m.get(k) ?? 0))])
  );
}

/** The keys whose mean differs from `against`'s, as "key a → b". */
function differences(
  against: Map<string, number>,
  got: Map<string, number>
): string {
  return (
    [...new Set([...against.keys(), ...got.keys()])]
      .filter((k) => Math.abs((got.get(k) ?? 0) - (against.get(k) ?? 0)) > 1e-6)
      .map(
        (k) =>
          `${k} ${fmt(against.get(k) ?? 0, 1)} → ${fmt(got.get(k) ?? 0, 1)}`
      )
      .join(", ") || "none"
  );
}

/** Each lift whose sets differ from (a)'s in the same seed and model
 *  variant, as "day: lift a → b in N% of seasons" (a lift gone counts 0). */
function liftChanges(against: ProgramState[], plans: ProgramState[]): string {
  const seen = new Map<string, number>();
  for (const [i, plan] of plans.entries()) {
    const base = setsByLift(against[i]);
    const mine = setsByLift(plan);
    for (const key of new Set([...base.keys(), ...mine.keys()])) {
      const was = base.get(key) ?? 0;
      const now = mine.get(key) ?? 0;
      if (now === was) continue;
      const label = `${key} ${String(was)} → ${String(now)}`;
      seen.set(label, (seen.get(label) ?? 0) + 1);
    }
  }
  return (
    [...seen]
      .map(([label, n]) => `${label} in ${fmt((n / plans.length) * 100, 0)}%`)
      .join(", ") || "none"
  );
}

describe.skipIf(!SEEDS)("L5 (F8): the time fit's warm-ups", () => {
  it(
    "warm-ups priced at a block's weight (b), and a re-fit when a ramp grows (c), against the fit as built (a)",
    () => {
      report.push(
        "",
        "## L5 (F8): the time fit's warm-ups",
        "",
        `(a) as built: the fit prices each loaded lift's warm-up at the heavier of its weight and an established lifter's starting weight (\`sessionFit.ts\`). (b): each barbell lift's warm-up is priced at the heavier of that and its weight after a block, the weight the plan's own rule (\`applyProgression\`) takes it to in ${String(BLOCK_SESSIONS)} sessions of every set at its target, from its starting weight: the shortest block the app offers, a slot coming round once a week; the row for the longest block, ${String(LONGEST_BLOCK_SESSIONS)} weeks, checks that choice. Through the fit's pricing seam (\`setWarmupPricing\`), so the plan is built and balanced as the app would build it so priced. (c): at a week's first rollover, a day the app's own check says no longer fits (\`sessionFits\`) is re-fitted as the app re-fits a plan to a new length (\`refitSessionsToTime\`, then \`balanceWeekVolume\`), keeping only the re-fit's cuts on that day; a lighter week or the first week back waits for the next ordinary one (\`timeFit.ts\`).`,
        "",
        `26 weeks; ${String(SEEDS)} seeds of each lifter model variant; per season, median [10th–90th]. **Over-time**: sessions the app estimates past the chosen length (the \`over-time\` rule, on the estimate rounded to the minute), and the share of seasons with any. **Sets**: the plan's working sets in a full week at the season's end (its own sets, \`baseSets\`). **Lifts**: each lift whose sets in that week differ from (a)'s, by day, and in what share of seasons. **Muscles**: each muscle's sets in that week as the app's volume model counts them (\`weeklyVolumeByJudgementMuscle\`), the mean over seasons, where it differs from (a)'s. **Re-fits**: days (c) re-fitted in the season. The fit's own check is on the unrounded estimate, so (c) also re-fits a day that runs over by under half a minute, which the rule doesn't count.`,
        "",
        "| persona | option | over-time sessions | seasons with any | sets | lifts, (a) → option | muscles, (a) → option | re-fits |",
        "| --- | --- | --- | --- | --- | --- | --- | --- |"
      );
      for (const persona of LIFT_PERSONAS) {
        const goal = persona.answers.primaryGoal;
        const level = toExperience(persona.answers.experience);
        const a = builtSeasons(persona);
        /** The seasons with the fit's warm-ups priced at the weight a
         *  block of `sessions` takes each barbell lift to. */
        const priced = (sessions: number) => {
          const restore = setWarmupPricing(
            projectedPricing(goal, level, sessions)
          );
          try {
            const rec = recording();
            return {
              list: seasons(persona, 26, { planVariant: rec.variant }),
              plans: rec.plans,
            };
          } finally {
            restore();
          }
        };
        const b = priced(BLOCK_SESSIONS);
        const b12 = priced(LONGEST_BLOCK_SESSIONS);
        const refit = refitWhenRampsGrow(goal, level);
        const recC = recording(refit);
        const c = {
          list: seasons(persona, 26, { planVariant: recC.variant }),
          plans: recC.plans,
        };
        const aMuscles = meanByKey(a.plans.map(planSetsByMuscle));
        for (const [option, got, refits] of [
          ["(a) as built", a, null],
          ["(b) priced at a block's weight", b, null],
          [`(b), a ${String(LONGEST_BLOCK_SESSIONS)}-week block`, b12, null],
          ["(c) re-fit at the rollover", c, refit.refits],
        ] as const) {
          const over = got.list.map(
            (s) => s.failures.filter((f) => f.rule === "over-time").length
          );
          const any = over.filter((n) => n > 0).length / over.length;
          const lifts = got === a ? "-" : liftChanges(a.plans, got.plans);
          const muscles =
            got === a
              ? "-"
              : differences(
                  aMuscles,
                  meanByKey(got.plans.map(planSetsByMuscle))
                );
          report.push(
            `| ${persona.name} | ${option} | ${range(over, 0)} | ${fmt(any * 100, 0)}% | ${range(got.plans.map(planSets), 0)} | ${lifts} | ${muscles} | ${refits ? range(refits, 0) : "-"} |`
          );
          expect(got.list.length).toBe(2 * SEEDS);
          expect(got.plans.length).toBe(2 * SEEDS);
        }
      }
    },
    LONG_TIMEOUT
  );
});

/** R5: what a season's plan did against the runner's own running. */
function startOutcome(season: Season, persona: LiftPersona) {
  const runner = persona.running!.runner;
  const raceAt = season.runs.findIndex((r) => r.type === "race");
  const race = raceAt >= 0 ? season.runs[raceAt] : undefined;
  const before = season.runs.filter(
    (r) => r.type !== "race" && (!race || r.date < race.date)
  );
  const ratios = before
    .filter((r) => r.longestBefore > 0)
    .map((r) => r.done.km / r.longestBefore);
  // Weeks 2–5 of the season, the first full plan weeks.
  const early = season.runWeeks.slice(1, 5);
  const build = season.runWeeks.filter(
    (w) => w.phase === "base" || w.phase === "build"
  );
  return {
    dose:
      early.reduce((n, w) => n + w.plannedMinutes, 0) /
      early.length /
      runner.weeklyMinutes,
    ranDose:
      early.reduce(
        (n, w) =>
          n +
          season.runs
            .filter(
              (r) =>
                r.date >= w.weekStart &&
                r.date <=
                  localDateString(addLocalDays(parseLocalDate(w.weekStart), 6))
            )
            .reduce((m, r) => m + r.done.minutes, 0),
        0
      ) /
      early.length /
      runner.weeklyMinutes,
    spikes: ratios.filter((x) => x > 1.1).length,
    biggest: Math.max(0, ...ratios),
    buildLongestKm: Math.max(0, ...build.map((w) => w.longKm)),
    injured: season.runs.some((r) => r.done.injury) ? 1 : 0,
    vdotChange: (race?.trueVdot ?? runner.vdot) - runner.vdot,
    finishMin: race?.raceTimeS ? race.raceTimeS / 60 : NaN,
  };
}

describe.skipIf(!SEEDS)(
  "R5: the plan starts from the runner's own running",
  () => {
    it(
      "from the running setup is given, against no starting point",
      () => {
        report.push(
          "",
          "## R5: the plan starts from the runner's own running",
          "",
          "No starting point: the race plan as it builds for anyone, which is every plan made before R5 and one whose questions were left blank (the lead-in, D, is in both). From their own running: setup given the runner's own minutes a week and longest run (`runnerStartingPoint`; a new runner gives none and starts with run-walk). Per season, median [10th–90th], over the runner model's three variants. Dose: the planned minutes of weeks 2–5 against the minutes a week the runner arrived with; ran: what they did. Spikes: runs before the race over 1.1 times the month's longest (the single-run guard, Frandsen 2025), and the biggest such ratio. Build's longest: the longest long run planned before the taper, km.",
          "",
          "| persona | option | dose wk 2–5 | ran wk 2–5 | spikes | biggest ÷ month's longest | build's longest, km | injured | VDOT change | finish |",
          "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |"
        );
        for (const { persona, weeks } of RUN_PERSONAS.filter(
          ({ persona }) => persona.answers.runMode === "race_prep"
        )) {
          for (const [option, start] of [
            ["no starting point", null],
            ["from their own running", undefined],
          ] as const) {
            const list = runnerSeasons(persona, weeks, { runningStart: start });
            const out = list.map((s) => startOutcome(s, persona));
            const col = (
              key: keyof ReturnType<typeof startOutcome>,
              digits = 1
            ) => range(out.map((o) => o[key]).filter(Number.isFinite), digits);
            const injured = out.filter((o) => o.injured).length / out.length;
            const finishes = out
              .map((o) => o.finishMin)
              .filter(Number.isFinite);
            report.push(
              `| ${persona.name} | ${option} | ${col("dose", 2)} | ${col("ranDose", 2)} | ${col("spikes", 0)} | ${col("biggest", 2)} | ${col("buildLongestKm", 0)} | ${fmt(injured * 100, 0)}% | ${col("vdotChange", 1)} | ${finishes.length ? clock(median(finishes) * 60) : "-"} |`
            );
          }
        }
      },
      TIMEOUT * 3
    );
  }
);

afterAll(() => {
  if (!SEEDS) return;
  mkdirSync("test-results/sim", { recursive: true });
  writeFileSync("test-results/sim/measuring.md", report.join("\n") + "\n");
});
