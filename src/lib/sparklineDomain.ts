/**
 * Y-domain for a decorative sparkline.
 *
 * Recharts defaults a numeric axis to `[0, dataMax]`, which is right for a
 * chart you read values off and wrong for a sparkline. A sparkline is about
 * SHAPE: anchoring the floor at zero squashes every series into the top of
 * its band, so a month of runs between 48 and 52 km draws as a flat line
 * with a full-height fill under it — indistinguishable from a series that
 * genuinely never moved.
 *
 * The degenerate case is the visible one. A constant series (an average
 * pace that held steady, a target that never changed) gets `[0, v]`, which
 * pins the line to the very top and fills the entire band — a solid slab
 * that reads as a broken card rather than as "steady". Analytics showed
 * exactly this: Monthly Distance drew a shape, Avg Pace beside it drew a
 * block, and the two peer cards looked like different components.
 *
 * So: bound the band by the DATA, with headroom either side, and give a
 * flat series a band of its own so it lands mid-height. Same pattern
 * `ElevationProfile` already uses (`[minAlt - 5, maxAlt + 5]`).
 */
export function sparklineDomain(values: number[]): [number, number] {
  const finite = values.filter((v) => Number.isFinite(v));
  // Callers gate on length, but a domain of [Infinity, -Infinity] would
  // render nothing at all rather than fail loudly, so don't rely on it.
  if (finite.length === 0) return [0, 1];

  const lo = Math.min(...finite);
  const hi = Math.max(...finite);
  const span = hi - lo;

  /* A varying series keeps its shape and gains a little headroom so the
     stroke isn't clipped by the band edge. A flat one has no shape to
     scale, so the pad is derived from the value itself — enough to place
     the line in the middle of the band. The `|| 1` covers an all-zero
     series, where a proportional pad would be zero and the domain would
     collapse back to a point. */
  const pad = span > 0 ? span * 0.15 : Math.abs(hi) * 0.1 || 1;

  return [lo - pad, hi + pad];
}
