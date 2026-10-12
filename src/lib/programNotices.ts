/**
 * Train's advice notices, one at a time (DS3).
 *
 * The Lift tab could stack its advice above and around the day: a deload
 * recommendation, the experience level-up suggestion and "Go easier
 * today", and a device screenshot once showed two saying the same thing.
 *
 * Priority, highest first:
 *   deload    a recommendation for the whole week
 *   easier    a lighter version of today's session only
 *
 * Only advice waits its turn. An active lighter week is the week's state,
 * not advice, and always says so. The experience suggestion is rare and
 * about something else (moving up a level), so it only gives way to the
 * week-level notice, never to "Go easier today".
 */

/** The dismissal keys, one per week, shared by the banners and by Train so
 *  both read the same stored answer. */
export function deloadDismissKey(weekKey: string): string {
  return `tropos-pgm-deload-dismissed:${weekKey}`;
}

export type LiftAdvice = "deload" | "easier" | null;

/** The one piece of advice to show, from the ones that could show. */
export function pickLiftAdvice(eligible: {
  deload: boolean;
  easier: boolean;
}): LiftAdvice {
  if (eligible.deload) return "deload";
  if (eligible.easier) return "easier";
  return null;
}
