/**
 * The rest between a planned interval session's repeats (deep dive D15).
 * Every runner rested the template's 90 seconds between 1 km repeats, so a
 * 3:56 repeat and a 6:37 one got the same rest: plenty for the first runner,
 * short for the second. Where the runner's interval pace is known (a
 * confirmed benchmark, RUN-EV-08), the rest is a share of the repeat's own
 * time; without one the template's rest stands.
 *
 * Only a planned session: a session someone sets up themselves keeps the
 * rest they chose.
 */
import type { RunTemplate } from "./workoutTemplates";
import {
  prescriptivePaceTableFromFitness,
  repeatPaceFromIntervalPace,
  resolveSessionPaces,
  type RepeatsAt,
  type RunFitnessInput,
} from "./runPaces";

/**
 * The rest as a share of the repeat's time. Interval work is commonly given
 * 50 to 90% of the repeat as an easy jog; 70% is its middle. A Tropos
 * heuristic in the RUN-EV-06 register, not a source rule.
 */
export const REST_SHARE_OF_REP = 0.7;

/**
 * Run24 (5): the rest's share for repeats not at the interval band.
 * Repetition pace takes a full recovery, about twice the repeat (Daniels
 * jogs the repeat's distance back, at well under half its speed); a race's
 * pace a short one, so the session stays at the race's rhythm. Repeats run
 * by feel keep the template's rest: a jog back down a hill takes what it
 * takes. Tropos heuristics, as `REST_SHARE_OF_REP` is.
 */
const REST_SHARE_BY_REPEATS: Record<Exclude<RepeatsAt, "feel">, number> = {
  repetition: 2,
  "5k": 0.3,
  "10k": 0.3,
};

/** Rests are given in half minutes, so they read and count down cleanly. */
const REST_STEP_SECONDS = 30;
/** No rest under a minute. */
const MIN_REST_SECONDS = 60;

type Intervals = NonNullable<RunTemplate["config"]["intervals"]>;

/** A repeat's rest, in seconds, at `workPaceSPerKm`, the repeat's own
 *  pace; the template's own without a pace or a repeat it can time, or for
 *  repeats run by feel. */
export function intervalRestSeconds(
  intervals: Pick<Intervals, "workDistance" | "workDuration" | "restDuration">,
  workPaceSPerKm: number | null | undefined,
  repeatsAt?: RepeatsAt
): number {
  if (repeatsAt === "feel") return intervals.restDuration;
  const repSeconds =
    intervals.workDuration ??
    (intervals.workDistance && workPaceSPerKm && workPaceSPerKm > 0
      ? (intervals.workDistance / 1000) * workPaceSPerKm
      : null);
  if (!repSeconds || !workPaceSPerKm) return intervals.restDuration;
  const share = repeatsAt
    ? REST_SHARE_BY_REPEATS[repeatsAt]
    : REST_SHARE_OF_REP;
  return Math.max(
    MIN_REST_SECONDS,
    Math.round((repSeconds * share) / REST_STEP_SECONDS) * REST_STEP_SECONDS
  );
}

/**
 * Run24 (5): the pace a planned session's repeats are run at, from the
 * runner's interval pace (`repeatPaceFromIntervalPace`): the interval pace
 * itself, repetition pace or a race's, or none for repeats run by feel.
 * The launch and every surface that names the session read it from here.
 */
export function plannedRepeatPace(
  template: Pick<RunTemplate, "config">,
  intervalPaceSPerKm: number | null | undefined
): number | null {
  return repeatPaceFromIntervalPace(
    intervalPaceSPerKm,
    template.config.repeatsAt
  );
}

/** The runner's interval pace from a confirmed benchmark, s/km; null
 *  without one. */
export function plannedIntervalPaceSPerKm(
  fitness: RunFitnessInput | null | undefined
): number | null {
  return (
    resolveSessionPaces("intervals", prescriptivePaceTableFromFitness(fitness))
      .workPace ?? null
  );
}

/** A planned session with its rest for this runner, from their interval
 *  pace (`plannedIntervalPaceSPerKm`): every surface that names the session
 *  reads it from here, so the words and the run agree. */
export function withPlannedRest<T extends Pick<RunTemplate, "config">>(
  template: T,
  intervalPaceSPerKm: number | null | undefined
): T {
  const intervals = template.config.intervals;
  if (!intervals) return template;
  const restDuration = intervalRestSeconds(
    intervals,
    plannedRepeatPace(template, intervalPaceSPerKm),
    template.config.repeatsAt
  );
  return restDuration === intervals.restDuration
    ? template
    : {
        ...template,
        config: {
          ...template.config,
          intervals: { ...intervals, restDuration },
        },
      };
}
