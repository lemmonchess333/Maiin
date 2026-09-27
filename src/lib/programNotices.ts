/**
 * Train's advice notices, one at a time (DS3).
 *
 * The Lift tab could stack four pieces of advice above and around the day:
 * the recovery reduction the rollover applied, a deload recommendation, the
 * experience level-up suggestion and "Go easier today". The last two of
 * these often said the same thing, because "Go easier today" is offered on
 * the same high-load signal that recommends the deload, and a device
 * screenshot showed both on one screen.
 *
 * Priority, highest first:
 *   recovery  something the plan already DID to this week, with its undo
 *   deload    a recommendation for the whole week
 *   easier    a lighter version of today's session only
 *
 * Only advice waits its turn. An active deload week is the week's state,
 * not advice, and always says so. The experience suggestion is rare and
 * about something else (moving up a level), so it only gives way to the
 * two week-level notices, never to "Go easier today".
 */

/** The dismissal keys, one per week, shared by the banners and by Train so
 *  both read the same stored answer. */
export function deloadDismissKey(weekKey: string): string {
  return `tropos-pgm-deload-dismissed:${weekKey}`;
}

export function recoveryDismissKey(weekKey: string): string {
  return `tropos-pgm-recovery-dismissed:${weekKey}`;
}

export type LiftAdvice = "recovery" | "deload" | "easier" | null;

/** The one piece of advice to show, from the ones that could show. */
export function pickLiftAdvice(eligible: {
  recovery: boolean;
  deload: boolean;
  easier: boolean;
}): LiftAdvice {
  if (eligible.recovery) return "recovery";
  if (eligible.deload) return "deload";
  if (eligible.easier) return "easier";
  return null;
}
