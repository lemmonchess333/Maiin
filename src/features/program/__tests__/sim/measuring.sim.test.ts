/**
 * The comparisons decisions.md marks "Measuring", each against the plan as
 * built, across seeds and both lifter model variants. A measurement, not a
 * gate: `TROPOS_SIM_MEASURE=20 npx vitest run
 * src/features/program/__tests__/sim/measuring.sim.test.ts` runs 20 seeds
 * of each and writes a markdown report to `test-results/sim/`
 * (uncommitted).
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
import type {
  ProgramExercise,
  ProgramState,
} from "@/features/program/programTypes";
import { setWarmupPricing } from "@/features/program/sessionFit";
import { pickAccessory } from "@/features/program/variationBank";
import {
  getPhaseForWeek,
  TAPER_WEEKS_BY_DISTANCE,
} from "@/features/program/runPlanTiming";
import { parseLocalDate } from "@/lib/dateHelpers";
import { RUN_TEMPLATES, type RunTemplate } from "@/lib/workoutTemplates";
import {
  simulateLiftSeason,
  type LiftPersona,
  type PlanVariant,
  type Season,
  type SeasonOptions,
} from "@/test/sim/liftSeason";
import { BASE_VARIANT, HARSH_VARIANT } from "@/test/sim/lifter";
import { LIFT_PERSONAS } from "@/test/sim/liftPersonas";
import { runTypeOf } from "@/test/sim/runSeason";
import { RUN_PERSONAS } from "@/test/sim/runPersonas";
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
  `${String(SEEDS)} seeds of each lifter model variant (base, harsh) per persona and option.`,
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

afterAll(() => {
  if (!SEEDS) return;
  mkdirSync("test-results/sim", { recursive: true });
  writeFileSync("test-results/sim/measuring.md", report.join("\n") + "\n");
});
