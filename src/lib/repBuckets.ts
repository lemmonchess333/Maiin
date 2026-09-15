/**
 * The rep counts the per-exercise "Personal bests by reps" card reports,
 * and the note it shows when a lifter has hit none of them.
 *
 * The card matches EXACTLY: a set counts for a bucket only when
 * `set.reps === bucket`. So 1, 3, 5 and 10 are served and every other
 * rep count — 2, 4, 6, 7, 8, 9, 11, 12 — produces nothing at all. A
 * lifter programming eights, which is ordinary hypertrophy work, sees
 * four em-dashes for as long as they train that way.
 *
 * That was already awkward; what made it read as broken is the card
 * directly above, whose "Best 1RM" is an Epley estimate taken over
 * EVERY set at any rep count. So the page showed a confident 101 kg
 * beside four blanks, with nothing to reconcile them.
 *
 * Whether the buckets themselves should change is a product question
 * and is deliberately not decided here: widening them to ranges would
 * mean filing an eight-rep set under "10RM", which claims a
 * performance the lifter did not give — the same false-label shape as
 * the running records. Naming the gap is honest; papering over it with
 * a wrong bucket is not.
 */
export const REP_BUCKETS = [1, 3, 5, 10] as const;

/** "1, 3, 5 or 10" — built from the constant so the copy cannot drift. */
export function listRepBuckets(
  buckets: readonly number[] = REP_BUCKETS
): string {
  if (buckets.length === 0) return "";
  if (buckets.length === 1) return String(buckets[0]);
  return `${buckets.slice(0, -1).join(", ")} or ${buckets[buckets.length - 1]}`;
}

/**
 * The line under an all-empty bucket row, or null when at least one
 * bucket has a record and the figures speak for themselves.
 *
 * `isBodyweight` drops the second sentence: that branch's header stat
 * is not a 1RM estimate, so the reconciliation it offers would be
 * about a number the reader cannot see.
 */
export function emptyRepBucketNote(opts: {
  hasAnyBucketRecord: boolean;
  isBodyweight: boolean;
  buckets?: readonly number[];
}): string | null {
  if (opts.hasAnyBucketRecord) return null;
  const list = listRepBuckets(opts.buckets ?? REP_BUCKETS);
  const first = `No sets at ${list} reps yet.`;
  if (opts.isBodyweight) return first;
  return `${first} The 1RM estimate above reads every set, whatever the rep count.`;
}
