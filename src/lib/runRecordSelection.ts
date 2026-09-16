/**
 * Which runs hold the running records, and when a row has nothing to add.
 *
 * Selection only — the page owns formatting. What matters here is that
 * `runs5k` is a SUBSET of `runs1k`, so the two pace records name the same
 * run whenever the best-paced run was already 5 km or longer. That is
 * most of the time for most runners, and it rendered as two rows carrying
 * the same figure and the same date under two different headings.
 *
 * The sustained-distance record still earns its place when a short blast
 * holds the overall one: "5:32" over 1.2 km beside "5:58" over 10 km are
 * two genuinely different facts. So it is returned only when it differs.
 */

export interface RunRecordCandidate {
  /** Metres. */
  distance: number;
  /** Seconds per kilometre — a whole-run average. */
  avgPace: number;
  completedAt: Date;
}

export interface RunRecords<T extends RunRecordCandidate> {
  /** Best whole-run average pace over any run of at least a kilometre. */
  bestPace: T | null;
  /**
   * Best whole-run average pace over a run of at least 5 km — `null` when
   * no such run exists, AND when the same run already holds `bestPace`.
   */
  bestSustainedPace: T | null;
  longest: T | null;
}

/** Below this a whole-run average pace is not a meaningful record. */
export const PACE_RECORD_MIN_METRES = 1000;
/** The sustained-effort floor. */
export const SUSTAINED_RECORD_MIN_METRES = 5000;

function fastest<T extends RunRecordCandidate>(pool: readonly T[]): T | null {
  return pool.length
    ? pool.reduce((best, r) => (r.avgPace < best.avgPace ? r : best))
    : null;
}

export function selectRunRecords<T extends RunRecordCandidate>(
  pool: readonly T[],
  opts: { includeLongest?: boolean } = {}
): RunRecords<T> {
  const bestPace = fastest(
    pool.filter((r) => r.distance >= PACE_RECORD_MIN_METRES)
  );
  const sustained = fastest(
    pool.filter((r) => r.distance >= SUSTAINED_RECORD_MIN_METRES)
  );
  return {
    bestPace,
    // Identity, not value: two DIFFERENT runs that happen to share a pace
    // are two records, and the dates beside them say so.
    bestSustainedPace: sustained && sustained !== bestPace ? sustained : null,
    longest:
      opts.includeLongest !== false && pool.length
        ? pool.reduce((best, r) => (r.distance > best.distance ? r : best))
        : null,
  };
}
