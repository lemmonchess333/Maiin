/**
 * Heart-rate zones — the pure math (no React/DOM/Firebase, mirror-ready).
 *
 * Live heart rate (from the paired Watch or a Bluetooth chest strap or
 * armband) and the Settings zone preview share this pure maths. See
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

/**
 * Where a reading came from: the paired Apple Watch, or a Bluetooth sensor
 * speaking the standard Heart Rate Service (a chest strap or an armband).
 */
export type HeartRateSourceKind = "apple-watch" | "bluetooth";

export function isHeartRateSourceKind(
  value: unknown
): value is HeartRateSourceKind {
  return value === "apple-watch" || value === "bluetooth";
}

/** One reading. `at` is a Unix epoch in milliseconds. */
export interface HeartRateSample {
  bpm: number;
  at: number;
  source: HeartRateSourceKind;
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
  /** The source that covered the most of the run. */
  source: HeartRateSourceKind;
}

/** A sample cannot stand in for a long gap or a disconnected source. */
export const MAX_HEART_RATE_SAMPLE_AGE_MS = 15_000;

/**
 * One reading at a time when both sources are on: a Watch reading is set
 * aside while a sensor reading is fresh (taken within the last 15 seconds).
 * A chest strap reads the heart's electrical signal and agrees with an ECG
 * more closely than a wrist's optical sensor during exercise (Gillinov et
 * al. 2017, Med Sci Sports Exerc 49(8): the Polar H7 strap's agreement with
 * ECG was about 0.99, the Apple Watch's 0.87, the best of the wrist
 * devices), and a sensor is paired by the runner for this purpose. The
 * Watch fills any gap the sensor leaves. The live source and the summary
 * both ask this.
 */
export function watchReadingSetAside(
  watchAt: number,
  lastSensorAt: number | null
): boolean {
  return (
    lastSensorAt != null &&
    watchAt >= lastSensorAt &&
    watchAt - lastSensorAt < MAX_HEART_RATE_SAMPLE_AGE_MS
  );
}

/** `samples` sorted by time, without the Watch readings set aside. */
function preferSensorReadings<T extends Pick<HeartRateSample, "at" | "source">>(
  samples: readonly T[]
): T[] {
  let lastSensorAt: number | null = null;
  const kept: T[] = [];
  for (const sample of samples) {
    if (sample.source === "bluetooth") {
      lastSensorAt = sample.at;
      kept.push(sample);
    } else if (!watchReadingSetAside(sample.at, lastSensorAt)) {
      kept.push(sample);
    }
  }
  return kept;
}

/**
 * Run24 (12) with live heart rate: an easy or a long run is held to the
 * top of Zone 2 (Easy), the band Train's run card and the day's sheet
 * already show for it ("Z2 112–130 bpm"), from the same max heart rate
 * (measured, else the age estimate). 0 when the max is unknown, so the
 * caller keeps to the pace cue.
 */
export function easyHeartRateCeiling(maxHr: number): number {
  return hrZones(maxHr).find((band) => band.zone === 2)?.maxBpm ?? 0;
}

/** How far over the top of Zone 2 a reading goes before it counts as over:
 *  3 bpm, about what the pace cue's 10 s /km margin is at an easy pace
 *  (ACSM's running equation, with heart rate reserve following oxygen
 *  uptake reserve: 2.2 to 3.3 bpm for runners from 5:30 to 7:30 /km).
 *  A Tropos heuristic. */
export const EASY_HR_MARGIN_BPM = 3;

/** How long heart rate stays over before the easy cue speaks, s: long
 *  enough that a short hill or a crossing's sprint says nothing, as heart
 *  rate takes a minute or more to settle after a change of effort. A dip
 *  back under that does not hold for `EASY_HR_DIP_HOLD_S` keeps the clock
 *  running. Tropos heuristics. */
export const EASY_HR_SUSTAIN_S = 60;
export const EASY_HR_DIP_HOLD_S = 15;

/**
 * Summarize readings over the phone's actual moving intervals. Samples
 * are held only until the next reading or 15 seconds, whichever comes first,
 * so the zones are elapsed time whatever the cadence: a Watch reading every
 * few seconds and a strap's every second count the same minute the same.
 * This excludes pauses, missing readings and retransmitted sample IDs.
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
  const valid = samples
    .filter((sample) => {
      if (
        !isHeartRateSourceKind(sample.source) ||
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
    // A sensor reading at the same instant as a Watch one goes first, so
    // the Watch's is the one set aside.
    .sort(
      (a, b) =>
        a.at - b.at ||
        Number(a.source !== "bluetooth") - Number(b.source !== "bluetooth")
    );
  const ordered = preferSensorReadings(valid);
  if (!ordered.length) return null;

  let coveredMs = 0;
  let weightedBpm = 0;
  let maxBpm = 0;
  let belowZoneMs = 0;
  const zoneMs = [0, 0, 0, 0, 0] as [number, number, number, number, number];
  const sourceMs: Record<HeartRateSourceKind, number> = {
    "apple-watch": 0,
    bluetooth: 0,
  };

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
      sourceMs[sample.source] += span;
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
    source:
      sourceMs.bluetooth > sourceMs["apple-watch"]
        ? "bluetooth"
        : "apple-watch",
  };
}
