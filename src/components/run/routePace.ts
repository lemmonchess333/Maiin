/**
 * The colours a run's route is drawn in on the post-run maps (the finish
 * screen and a saved run), and the key under the map that names them.
 *
 * Each stretch of the route is coloured by how its pace compares with the
 * run's OWN average pace: the ratio is the stretch's seconds per km over
 * the average's. There is no target in it, so the key names none ("On
 * pace" would claim one).
 *
 * One table, read by both `RunMap` (to colour) and `PaceLegend` (to draw
 * the key), so the key cannot describe a different set of colours from
 * the one on the route: a step added here appears in both.
 */
import { THEME } from "@/lib/theme";

export interface RoutePaceStep {
  /** The step covers stretches whose pace ratio is below this. */
  below: number;
  color: string;
}

/** Fastest first: the order the key reads, "Faster" to "Slower". */
export const ROUTE_PACE_STEPS: readonly RoutePaceStep[] = [
  // More than 8% quicker than the run's average.
  { below: 0.92, color: THEME.paceFast },
  // Within a few percent of the average.
  { below: 1.03, color: THEME.paceOnTarget },
  // Up to 10% slower.
  { below: 1.1, color: THEME.warning },
  // Slower than that.
  { below: Infinity, color: THEME.paceSlow },
];

/** The colour of a stretch whose pace is `ratio` times the average. A
 *  ratio that is not a number reads as the slowest step, as it did before
 *  the steps were a table. */
export function routePaceColor(ratio: number): string {
  for (const step of ROUTE_PACE_STEPS) {
    if (ratio < step.below) return step.color;
  }
  return ROUTE_PACE_STEPS[ROUTE_PACE_STEPS.length - 1].color;
}
