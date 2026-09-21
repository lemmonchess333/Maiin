/**
 * Does the "Recent bests" card tell the reader anything the all-time card
 * did not?
 *
 * The PRs tab renders two cards per sport: all-time, and the best of the
 * last 30 days. For anyone whose whole history fits inside that window —
 * which is every user for their first month, and the cold-start window is
 * one of the most-seen states in the app — the two sets are the SAME
 * records, so the tab prints each row twice under two headings. The rich
 * capture shows it plainly: Best pace 5:32 · 23 Aug and Longest run
 * 8.0 km · 8 Sept in both running cards, and the same three lifts twice.
 *
 * Identity here is by CONTENT, not by object: two sets match when they
 * name the same records in the same order with the same figures. A set
 * that has diverged by even one row is two genuinely different facts and
 * keeps both cards.
 *
 * Order matters deliberately. Both lists come out of the same builder
 * applied to a wider and a narrower pool, so they are already in the same
 * order whenever they hold the same records; an order difference means
 * the ranking itself moved, which is a real change worth showing.
 */

/** A record's identity — everything a reader would compare between the
 *  two cards. Two records with the same key are the same fact. */
export type PRKey = string;

/**
 * True when `recent` says exactly what `allTime` already said.
 *
 * An EMPTY recent set is not a match: it means the user has set no record
 * in the window at all, which the caller already handles by not rendering
 * the card. Returning false here keeps this helper's answer about
 * duplication only, so a caller that forgets that gate still gets the
 * correct card rather than a silently merged subtitle.
 */
export function samePRSet<T>(
  allTime: readonly T[],
  recent: readonly T[],
  key: (pr: T) => PRKey
): boolean {
  if (recent.length === 0) return false;
  if (allTime.length !== recent.length) return false;
  return allTime.every((pr, index) => key(pr) === key(recent[index]));
}

/** Running rows are identified by their heading, their figure and the day
 *  the run happened — the three things the card puts on screen. */
export const runningPRKey = (pr: {
  label: string;
  value: string;
  date: string;
}): PRKey => `${pr.label}|${pr.value}|${pr.date}`;

/** A lift record is the exercise, the set that holds it, and its day. */
export const liftPRKey = (pr: {
  name: string;
  weight: number;
  reps: number;
  date: string;
}): PRKey => `${pr.name}|${pr.weight}|${pr.reps}|${pr.date}`;
