/**
 * The one definition of a long or hard run, for the lifting side.
 *
 * This module was the cross-discipline "today" narrative — a Home card
 * connecting yesterday's training to today's fuel. That card was removed on
 * 2026-08-10 (operator call: "remove today section it's bad"), and with it
 * `resolveHybridGuidance`, `fuelLineFor`, and the guidance types. What
 * survived is `isHardRun`, which decides whether a saved session carries a
 * long or hard run in the 24 hours before it (Lift4 (14), so a leg miss
 * counts half, Lift4 (7)) and the hard-run reason in "Easier today".
 *
 * The run plan's definition wins (Pgm7 A5). A run carrying a planned type
 * is judged by that type alone, against the same `HARD_RUN_TYPES` the run
 * scheduler, spacing, rescheduling and day intensity read: an easy run is
 * never hard, and a race always is. A run with no planned type (a free run,
 * treadmill, manual, guided, or one logged without the plan) counts as long
 * from 75 minutes. Distance never counts on its own: 8 km takes 40 minutes
 * for one runner and 70 for another.
 *
 * Pure + deterministic.
 */
import {
  HARD_RUN_TYPES,
  type RunPlannedType,
} from "@/features/program/programTypes";

const PLANNED_RUN_TYPES: ReadonlySet<string> = new Set<RunPlannedType>([
  "easy",
  "tempo",
  "intervals",
  "long",
  "race",
]);

/** An untyped run counts as long from here: a CONVENTION (Pgm7 A5). */
export const UNTYPED_LONG_RUN_SECONDS = 75 * 60;

export function isHardRun(run: {
  duration: number;
  activityType?: string;
}): boolean {
  const type = run.activityType;
  if (type !== undefined && PLANNED_RUN_TYPES.has(type)) {
    return HARD_RUN_TYPES.has(type);
  }
  return run.duration >= UNTYPED_LONG_RUN_SECONDS;
}
