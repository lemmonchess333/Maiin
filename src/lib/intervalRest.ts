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
  resolveSessionPaces,
  type RunFitnessInput,
} from "./runPaces";

/**
 * The rest as a share of the repeat's time. Interval work is commonly given
 * 50 to 90% of the repeat as an easy jog; 70% is its middle. A Tropos
 * heuristic in the RUN-EV-06 register, not a source rule.
 */
export const REST_SHARE_OF_REP = 0.7;

/** Rests are given in half minutes, so they read and count down cleanly. */
const REST_STEP_SECONDS = 30;
/** No rest under a minute. */
const MIN_REST_SECONDS = 60;

type Intervals = NonNullable<RunTemplate["config"]["intervals"]>;

/** A repeat's rest, in seconds, at `workPaceSPerKm`; the template's own
 *  without a pace or a repeat it can time. */
export function intervalRestSeconds(
  intervals: Pick<Intervals, "workDistance" | "workDuration" | "restDuration">,
  workPaceSPerKm: number | null | undefined
): number {
  const repSeconds =
    intervals.workDuration ??
    (intervals.workDistance && workPaceSPerKm && workPaceSPerKm > 0
      ? (intervals.workDistance / 1000) * workPaceSPerKm
      : null);
  if (!repSeconds || !workPaceSPerKm) return intervals.restDuration;
  return Math.max(
    MIN_REST_SECONDS,
    Math.round((repSeconds * REST_SHARE_OF_REP) / REST_STEP_SECONDS) *
      REST_STEP_SECONDS
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

/** A planned session with its rest for this runner: every surface that
 *  names the session reads it from here, so the words and the run agree. */
export function withPlannedRest<T extends Pick<RunTemplate, "config">>(
  template: T,
  workPaceSPerKm: number | null | undefined
): T {
  const intervals = template.config.intervals;
  if (!intervals) return template;
  const restDuration = intervalRestSeconds(intervals, workPaceSPerKm);
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
