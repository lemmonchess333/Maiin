/**
 * Which rep counts the per-exercise "Personal bests by reps" card
 * reports — the ones this lifter actually trains, not a fixed four.
 *
 * The card matches EXACTLY: a set counts for a column only when its
 * reps equal that column's number, which is what makes the `{n}RM`
 * label a true claim rather than an approximation. That part is right
 * and stays.
 *
 * What was wrong is where the numbers came from. They were the constant
 * `[1, 3, 5, 10]`, so every other rep count — 2, 4, 6, 7, 8, 9, 11, 12 —
 * produced nothing at all, and a lifter programming eights, which is
 * ordinary hypertrophy work, saw four em-dashes for as long as they
 * trained that way. Beside a "Best 1RM" estimate taken over EVERY set at
 * any rep count, so the page showed a confident figure next to four
 * blanks with nothing to reconcile them.
 *
 * Widening the fixed buckets into ranges was considered and refused: it
 * would file an eight-rep set under "10RM", claiming a performance the
 * lifter never gave. Reading the rep counts off their own sets keeps
 * every label exactly true AND fills the card, which is the option that
 * did not require choosing between the two.
 */

/** Columns the card has room for, at `grid-cols-4`. */
export const MAX_REP_BUCKETS = 4;

export interface RepBucketRecord {
  reps: number;
  weightKg: number;
  /**
   * The session that set it — the FIRST to reach this weight, not the
   * most recent to match it. Repeating a best does not reset its date;
   * that is when you did it.
   */
  date: string;
}

interface SessionLike {
  date: string;
  sets: { reps: number; weightKg: number }[];
}

/**
 * Best set at each of the rep counts this lifter uses most for the
 * exercise, heaviest-weight-wins within a rep count.
 *
 * Selection is by how OFTEN a rep count is trained, so the card reflects
 * the lifter's programming rather than their outliers — a single
 * curiosity single does not displace the eights they actually run. Ties
 * go to the lower rep count, which keeps the choice deterministic and
 * leans the card towards the heavier end where a record reads as one.
 *
 * Returned ascending by reps, so the row runs heavy to light the way the
 * fixed columns did.
 */
export function bestSetsByReps(
  sessions: readonly SessionLike[],
  max: number = MAX_REP_BUCKETS
): RepBucketRecord[] {
  const setCount = new Map<number, number>();
  const best = new Map<number, RepBucketRecord>();

  for (const session of sessions) {
    for (const set of session.sets) {
      // A logged failure carries no rep count worth a column.
      if (!Number.isFinite(set.reps) || set.reps <= 0) continue;
      setCount.set(set.reps, (setCount.get(set.reps) ?? 0) + 1);
      const existing = best.get(set.reps);
      if (!existing || set.weightKg > existing.weightKg)
        best.set(set.reps, {
          reps: set.reps,
          weightKg: set.weightKg,
          date: session.date,
        });
    }
  }

  return [...setCount.entries()]
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .slice(0, Math.max(0, max))
    .map(([reps]) => best.get(reps)!)
    .sort((a, b) => a.reps - b.reps);
}
