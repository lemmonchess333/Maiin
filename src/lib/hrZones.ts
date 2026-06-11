/**
 * Heart-rate zones — the pure math (no React/DOM/Firebase, mirror-ready).
 *
 * Groundwork for HR support (the #1 running table-stakes gap in the competitive
 * analysis). The LIVE HR stream is native/operator-gated (see
 * `heartRateSource.ts` + docs/heart-rate-healthkit.md); this module is the
 * reusable maths that powers the zone display, the Settings preview, and
 * (later) the run HUD + post-run zone distribution.
 *
 * Five-zone %HRmax model (the common coaching split):
 *   Z1 Recovery 50–60 · Z2 Easy 60–70 · Z3 Aerobic 70–80 ·
 *   Z4 Threshold 80–90 · Z5 Max 90–100
 */

export type ZoneNumber = 1 | 2 | 3 | 4 | 5;

export interface HrZone {
  zone: ZoneNumber;
  name: string;
  /** Inclusive lower / exclusive upper bpm (upper inclusive for Z5). */
  minBpm: number;
  maxBpm: number;
  minPct: number;
  maxPct: number;
}

export const ZONE_NAMES: Record<ZoneNumber, string> = {
  1: "Recovery",
  2: "Easy",
  3: "Aerobic",
  4: "Threshold",
  5: "Max",
};

const ZONE_PCT: Record<ZoneNumber, [number, number]> = {
  1: [0.5, 0.6],
  2: [0.6, 0.7],
  3: [0.7, 0.8],
  4: [0.8, 0.9],
  5: [0.9, 1.0],
};

/**
 * Age-predicted max HR via Tanaka (208 − 0.7·age) — better-validated across
 * ages than the classic 220−age. A user-measured max (Settings) always wins
 * over this estimate. Returns 0 for nonsensical age.
 */
export function maxHrFromAge(age: number): number {
  if (!Number.isFinite(age) || age <= 0 || age > 120) return 0;
  return Math.round(208 - 0.7 * age);
}

/** The five zones as bpm bands for a given max HR. Empty when maxHr invalid. */
export function hrZones(maxHr: number): HrZone[] {
  if (!Number.isFinite(maxHr) || maxHr <= 0) return [];
  return ([1, 2, 3, 4, 5] as ZoneNumber[]).map((z) => {
    const [minPct, maxPct] = ZONE_PCT[z];
    return {
      zone: z,
      name: ZONE_NAMES[z],
      minBpm: Math.round(maxHr * minPct),
      maxBpm: Math.round(maxHr * maxPct),
      minPct,
      maxPct,
    };
  });
}

/**
 * Zone (1–5) for a heart rate, or 0 when below Z1 (very easy / not yet warm).
 * Boundaries are inclusive-lower; the top of Z5 is open upward (an HR above
 * the estimated max still reads Z5 rather than falling off).
 */
export function zoneForHr(hr: number, maxHr: number): 0 | ZoneNumber {
  if (!Number.isFinite(hr) || hr <= 0 || maxHr <= 0) return 0;
  const pct = hr / maxHr;
  if (pct < 0.5) return 0;
  if (pct < 0.6) return 1;
  if (pct < 0.7) return 2;
  if (pct < 0.8) return 3;
  if (pct < 0.9) return 4;
  return 5;
}

export interface ZoneShare {
  zone: ZoneNumber;
  name: string;
  samples: number;
  /** Fraction 0..1 of in-zone samples (excludes below-Z1). */
  pct: number;
}

/**
 * Distribution of HR samples across zones (for the post-run breakdown).
 * Samples are equally weighted (assumes a roughly even sampling cadence).
 * Below-Z1 samples are excluded from the denominator so the bars reflect
 * "time training", not warm-up idling.
 */
export function zoneDistribution(
  bpmSamples: number[],
  maxHr: number
): ZoneShare[] {
  const counts: Record<ZoneNumber, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let total = 0;
  if (maxHr > 0) {
    for (const hr of bpmSamples) {
      const z = zoneForHr(hr, maxHr);
      if (z !== 0) {
        counts[z] += 1;
        total += 1;
      }
    }
  }
  return ([1, 2, 3, 4, 5] as ZoneNumber[]).map((z) => ({
    zone: z,
    name: ZONE_NAMES[z],
    samples: counts[z],
    pct: total > 0 ? counts[z] / total : 0,
  }));
}
