/**
 * Education lane — pure core (#995, tier 3).
 *
 * Tier-3 education surfaces are one-time teaching: the first-visit guide's
 * hints (anchored bubbles, FV1), Home's first-week card, and the "Still on
 * track?" check-in every few weeks (a ContextualTipBanner). The #995 rule is
 * "one dismissible education card visible at a time" — before it, a new user
 * saw the welcome card and two tips stacked. FV2 (2026-10-04) removed three
 * tips that no longer reached the people they were written for.
 *
 * Unlike the tier-4 coordinator there is NO per-open budget and NO drop: an
 * education card shows until the user dismisses it (its own dismiss-once
 * persistence flips `eligible` false), at which point the next-highest card
 * becomes the winner. This module is just the winner pick; the React wiring is
 * in EducationLaneProvider.
 */

export interface EducationRegistration {
  id: string;
  /** Higher wins. Guide hints 35 > first-week card 30 > check-in 12. */
  priority: number;
  /** Card wants to show (its condition holds and it isn't dismissed). */
  eligible: boolean;
}

/**
 * The single education card that should be visible: highest priority among the
 * eligible ones. Ties break by id for determinism. Null if none are eligible.
 */
export function pickEducationWinner(
  regs: EducationRegistration[]
): string | null {
  const eligible = regs
    .filter((r) => r.eligible)
    .sort((a, b) => b.priority - a.priority || (a.id < b.id ? -1 : 1));
  return eligible.length > 0 ? eligible[0].id : null;
}
