/**
 * Heart-rate zones — the pure math (no React/DOM/Firebase, mirror-ready).
 *
 * Live Watch HR and the Settings zone preview share this pure maths. The
 * connected training release flag gates native streaming; see
 * `heartRateSource.ts` and docs/heart-rate-healthkit.md.
 *
 * Five-zone %HRmax model (the common coaching split):
 *   Z1 Recovery 50–60 · Z2 Easy 60–70 · Z3 Steady 70–80 ·
 *   Z4 Comfortably hard 80–90 · Z5 Hard 90–100
 * Each zone is named by how it feels, in Run21 (1)'s effort words for runs,
 * not by its physiology (it was Aerobic, Threshold and Max).
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
  3: "Steady",
  4: "Comfortably hard",
  5: "Hard",
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

/**
 * Run session intensity → prescribed HR zone. The HR analogue of
 * `resolveSessionPaces` (runPaces.ts): "run easy in Zone 2", "tempo in Zone 4".
 * Mirrors the template intensity union (easy|tempo|intervals|long|race) plus
 * `recovery`. Conventional coaching mapping:
 *   recovery → Z1 · easy/long → Z2 · tempo → Z4 · intervals → Z5 ·
 *   race → by its distance (Run21 (1)): a 5K or 10K is raced at 90% of max
 *   heart rate or more, Z5, and a half or marathon at about 80–89%, Z4
 *   (running-evidence §5.0b; Daniels). A race of no known distance keeps Z4.
 */
export type RunIntensity =
  "easy" | "tempo" | "intervals" | "long" | "race" | "recovery";

const ZONE_FOR_INTENSITY: Record<RunIntensity, ZoneNumber> = {
  recovery: 1,
  easy: 2,
  long: 2,
  tempo: 4,
  intervals: 5,
  race: 4,
};

/**
 * The prescribed HR-zone band for a run session type, or `null` when the max
 * HR is unknown (so callers fall back to the pace-only display rather than
 * rendering a bogus band).
 */
export function targetZoneForRun(
  type: RunIntensity,
  maxHr: number,
  /** A race's distance, which sets its zone. */
  raceDistanceKm?: number
): HrZone | null {
  if (!Number.isFinite(maxHr) || maxHr <= 0) return null;
  const z =
    type === "race" && raceDistanceKm && raceDistanceKm <= 10
      ? 5
      : ZONE_FOR_INTENSITY[type];
  if (!z) return null;
  return hrZones(maxHr).find((b) => b.zone === z) ?? null;
}

/**
 * A run's target zone as a meta line's items, "Z2 · Easy · 111–129 bpm"
 * (Run21 (1)): the zone, its name and its range, each its own item so a
 * narrow line can wrap between them.
 */
export function zoneMetaItems(band: HrZone): string[] {
  return [`Z${band.zone}`, band.name, `${band.minBpm}–${band.maxBpm} bpm`];
}

/**
 * A run's target zone as one short item, "Z2 112–130 bpm", for Train's
 * run card. The card's feel line already gives the effort in words
 * ("Easy: you can talk in full sentences"), so the zone's name would say
 * it twice; the day's sheet keeps all three (`zoneMetaItems`).
 */
export function zoneShortLabel(band: HrZone): string {
  return `Z${band.zone} ${band.minBpm}–${band.maxBpm} bpm`;
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

/** A reading from the paired Watch. `at` is a Unix epoch in milliseconds. */
export interface HeartRateSample {
  bpm: number;
  at: number;
  source: "apple-watch";
  /** Stable native sample identity; retransmissions must not count twice. */
  id?: string;
}

/** Half-open interval during which the phone's run timer was moving. */
export interface ActiveRunInterval {
  startMs: number;
  endMs: number;
}

export interface HeartRateSummary {
  averageBpm: number;
  maxBpm: number;
  /** Seconds with a recent reading, including time below Zone 1. */
  coveredSeconds: number;
  movingSeconds: number;
  /** Covered / moving seconds, 0..1. Hide the zone chart below 0.5. */
  coverage: number;
  /** Actual covered seconds in Zones 1–5, indexed by zone minus one. */
  zoneSeconds: [number, number, number, number, number];
  belowZoneSeconds: number;
  maxHr: number;
  source: "apple-watch";
}

/** A sample cannot stand in for a long gap or a disconnected Watch. */
export const MAX_HEART_RATE_SAMPLE_AGE_MS = 15_000;

/**
 * Summarize Watch readings over the phone's actual moving intervals. Samples
 * are held only until the next reading or 15 seconds, whichever comes first.
 * This excludes pauses, missing readings and retransmitted sample IDs. The
 * older `zoneDistribution` is deliberately left sample-weighted for legacy
 * callers and must not be labelled as elapsed time.
 */
export function summarizeHeartRate(
  samples: readonly HeartRateSample[],
  activeIntervals: readonly ActiveRunInterval[],
  maxHr: number,
  /** Phone timer's moving seconds, if it survived a gap the HR tracker did not. */
  movingSecondsOverride?: number
): HeartRateSummary | null {
  const intervals = activeIntervals
    .filter(
      ({ startMs, endMs }) =>
        Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs
    )
    .sort((a, b) => a.startMs - b.startMs);
  const merged: ActiveRunInterval[] = [];
  for (const interval of intervals) {
    const last = merged.at(-1);
    if (last && interval.startMs <= last.endMs) {
      last.endMs = Math.max(last.endMs, interval.endMs);
    } else {
      merged.push({ ...interval });
    }
  }
  const intervalMovingMs = merged.reduce(
    (sum, { startMs, endMs }) => sum + endMs - startMs,
    0
  );
  const movingMs = Math.max(
    intervalMovingMs,
    Number.isFinite(movingSecondsOverride) && (movingSecondsOverride ?? 0) > 0
      ? movingSecondsOverride! * 1000
      : 0
  );
  if (!movingMs) return null;
  const zonesAvailable = Number.isFinite(maxHr) && maxHr > 0;

  const seen = new Set<string>();
  const ordered = samples
    .filter((sample) => {
      if (
        sample.source !== "apple-watch" ||
        !Number.isFinite(sample.bpm) ||
        sample.bpm < 30 ||
        sample.bpm > 250 ||
        !Number.isFinite(sample.at)
      )
        return false;
      if (sample.id) {
        if (seen.has(sample.id)) return false;
        seen.add(sample.id);
      }
      return true;
    })
    .sort((a, b) => a.at - b.at);
  if (!ordered.length) return null;

  let coveredMs = 0;
  let weightedBpm = 0;
  let maxBpm = 0;
  let belowZoneMs = 0;
  const zoneMs = [0, 0, 0, 0, 0] as [number, number, number, number, number];

  for (const interval of merged) {
    for (let i = 0; i < ordered.length; i += 1) {
      const sample = ordered[i];
      // A beat taken while paused cannot seed coverage after Resume.
      if (sample.at < interval.startMs || sample.at >= interval.endMs) continue;
      const nextAt = ordered[i + 1]?.at ?? Number.POSITIVE_INFINITY;
      const from = Math.max(sample.at, interval.startMs);
      const to = Math.min(
        nextAt,
        sample.at + MAX_HEART_RATE_SAMPLE_AGE_MS,
        interval.endMs
      );
      if (to <= from) continue;
      const span = to - from;
      coveredMs += span;
      weightedBpm += sample.bpm * span;
      maxBpm = Math.max(maxBpm, sample.bpm);
      if (zonesAvailable) {
        const zone = zoneForHr(sample.bpm, maxHr);
        if (zone === 0) belowZoneMs += span;
        else zoneMs[zone - 1] += span;
      }
    }
  }
  if (!coveredMs) return null;
  return {
    averageBpm: Math.round(weightedBpm / coveredMs),
    maxBpm,
    coveredSeconds: coveredMs / 1000,
    movingSeconds: movingMs / 1000,
    coverage: Math.min(1, coveredMs / movingMs),
    zoneSeconds: zoneMs.map(
      (duration) => duration / 1000
    ) as HeartRateSummary["zoneSeconds"],
    belowZoneSeconds: belowZoneMs / 1000,
    maxHr: zonesAvailable ? maxHr : 0,
    source: "apple-watch",
  };
}
