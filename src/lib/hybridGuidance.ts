/**
 * The shared "demanding run" predicate.
 *
 * This module was the cross-discipline "today" narrative — a Home card
 * connecting yesterday's training to today's fuel. That card was removed on
 * 2026-08-10 (operator call: "remove today section it's bad"), and with it
 * `resolveHybridGuidance`, `fuelLineFor`, and the guidance types.
 *
 * What survives is the one piece that was always shared rather than
 * narrative: `isHardRun`. Home's guidance and the Easier-today
 * recommendation (easierToday.ts) both needed the same answer to "was that
 * a demanding run?", and one definition is what stops them drifting. The
 * narrative went; the predicate has its own consumers and stays.
 *
 * Pure + deterministic.
 */

export const QUALITY_RUN_TYPES: ReadonlySet<string> = new Set([
  "tempo",
  "intervals",
  "long",
]);

export function isHardRun(run: {
  distance: number;
  duration: number;
  activityType?: string;
}): boolean {
  return (
    run.distance >= 8000 ||
    run.duration >= 2700 ||
    (run.activityType !== undefined && QUALITY_RUN_TYPES.has(run.activityType))
  );
}
