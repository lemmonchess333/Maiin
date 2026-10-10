/**
 * The comparisons decisions.md marks "Measuring", each against the plan as
 * built, across seeds and both lifter model variants. A measurement, not a
 * gate: `TROPOS_SIM_MEASURE=20 npx vitest run
 * src/features/program/__tests__/sim/measuring.sim.test.ts` runs 20 seeds
 * of each and writes `test-results/sim/measuring.md` (uncommitted).
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
import {
  weeklyVolumeByJudgementMuscle,
  type VolumeDay,
} from "@/features/program/volumeModel";
import type { ProgramExercise } from "@/features/program/programTypes";
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

afterAll(() => {
  if (!SEEDS) return;
  mkdirSync("test-results/sim", { recursive: true });
  writeFileSync("test-results/sim/measuring.md", report.join("\n") + "\n");
});
