/**
 * Build the percentage-delta payload consumed by the
 * `<StatCard delta=…>` chip on the History page and any other
 * surface that wants an arrow + magnitude formatted relative to a
 * previous period.
 *
 * Suppresses the delta entirely (returns null) for:
 *   - Non-finite inputs (NaN / Infinity).
 *   - Zero / negative previous values — no meaningful denominator.
 *   - Sub-1% deltas — noise floor; we don't want the UI shouting
 *     about a 0.4% change.
 */
export interface DeltaPayload {
  value: string;
  positive: boolean;
}

export function buildDelta(
  current: number,
  previous: number,
): DeltaPayload | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return null;
  if (previous <= 0) return null;
  const pct = ((current - previous) / previous) * 100;
  if (Math.abs(pct) < 1) return null;
  const positive = pct >= 0;
  return { value: `${Math.abs(Math.round(pct))}%`, positive };
}
