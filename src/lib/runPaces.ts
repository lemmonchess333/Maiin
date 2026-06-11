/**
 * Adaptive Paces — the pure pace engine.
 *
 * One per-user fitness BENCHMARK (a representative race/effort) → a VDOT
 * (Jack Daniels) → personalized training paces for every run intensity. This
 * module is the single source of truth for that math (design:
 * docs/adaptive-paces-design.md).
 *
 * PURE + MIRROR-READY (Principle 4): no React/DOM/clock/Firebase. If a server
 * mirror is ever needed (e.g. pace-aware Performance Index), this becomes a
 * copy + parity test, not a rewrite — exactly like performanceEngine.ts↔.js.
 *
 * Units: every pace is **sec/km** (matches the RunConfig contract — zero unit
 * translation downstream). Distances in **metres**, times in **seconds**.
 */

export type RunIntensity =
  | "easy"
  | "marathon"
  | "threshold"
  | "interval"
  | "repetition";

/** [faster, slower] sec/km — a band, like Runna shows. */
export type PaceBand = [number, number];

export type RaceDistanceKey = "5k" | "10k" | "half" | "marathon";

export interface PaceTable {
  vdot: number;
  easy: PaceBand;
  marathon: PaceBand;
  threshold: PaceBand;
  interval: PaceBand;
  repetition: PaceBand;
  /** Predicted race pace (sec/km) per distance, via Riegel off the benchmark. */
  race: Record<RaceDistanceKey, number>;
}

/** Structural shape of `profile.runFitness` — kept local so this module stays
 *  decoupled from the React `auth.tsx` (Principle 4). */
export interface RunFitnessInput {
  benchmark: { distanceM: number; timeS: number } | null;
  vdot: number | null;
}

const RACE_DISTANCES_M: Record<RaceDistanceKey, number> = {
  "5k": 5000,
  "10k": 10000,
  half: 21097.5,
  marathon: 42195,
};

// Daniels/Gilbert running-formula coefficients (the standard model).
const VO2_A = 0.000104;
const VO2_B = 0.182258;
const VO2_C = -4.6;

/** Oxygen cost (ml/kg/min) of running at velocity `v` (metres/min). */
function vo2AtVelocity(v: number): number {
  return VO2_C + VO2_B * v + VO2_A * v * v;
}

/** Invert vo2AtVelocity: velocity (m/min) that costs `vo2`. Positive root. */
function velocityForVo2(vo2: number): number {
  // VO2_A v^2 + VO2_B v + (VO2_C - vo2) = 0
  const c = VO2_C - vo2;
  const disc = VO2_B * VO2_B - 4 * VO2_A * c;
  if (disc <= 0) return 0;
  return (-VO2_B + Math.sqrt(disc)) / (2 * VO2_A);
}

/** Fraction of VO2max sustainable for a race of `tMin` minutes (drop-off). */
function pctMaxForDuration(tMin: number): number {
  return (
    0.8 +
    0.1894393 * Math.exp(-0.012778 * tMin) +
    0.2989558 * Math.exp(-0.1932605 * tMin)
  );
}

/**
 * VDOT from a race/time-trial. `distanceM` metres, `timeS` seconds.
 * Returns 0 for nonsensical inputs (caller treats 0 as "no benchmark").
 */
export function vdotFromRace(distanceM: number, timeS: number): number {
  if (
    !Number.isFinite(distanceM) ||
    !Number.isFinite(timeS) ||
    distanceM <= 0 ||
    timeS <= 0
  ) {
    return 0;
  }
  const tMin = timeS / 60;
  const velocity = distanceM / tMin; // m/min
  const vo2 = vo2AtVelocity(velocity);
  const pct = pctMaxForDuration(tMin);
  if (pct <= 0) return 0;
  return vo2 / pct;
}

/** sec/km to run at a given fraction of VO2max for this VDOT. */
function paceForPctVo2max(vdot: number, pct: number): number {
  const targetVo2 = vdot * pct;
  const v = velocityForVo2(targetVo2); // m/min
  if (v <= 0) return 0;
  return 60000 / v; // (1000 m / v m·min⁻¹) × 60 s
}

function band(vdot: number, fastPct: number, slowPct: number): PaceBand {
  // higher %VO2max → faster → smaller sec/km, so [fast, slow] = [hiPct, loPct]
  return [
    Math.round(paceForPctVo2max(vdot, fastPct)),
    Math.round(paceForPctVo2max(vdot, slowPct)),
  ];
}

// Daniels training-intensity %VO2max bands.
const INTENSITY_PCT: Record<RunIntensity, [number, number]> = {
  easy: [0.72, 0.62], // [fast, slow]
  marathon: [0.85, 0.81],
  threshold: [0.88, 0.86],
  interval: [1.0, 0.97],
  repetition: [1.1, 1.05],
};

/** Riegel race-time prediction: T2 = T1 · (D2/D1)^1.06. */
export function predictRaceTimeS(
  benchmark: { distanceM: number; timeS: number },
  distanceM: number
): number {
  if (benchmark.distanceM <= 0 || benchmark.timeS <= 0) return 0;
  return benchmark.timeS * Math.pow(distanceM / benchmark.distanceM, 1.06);
}

function racePaces(benchmark: {
  distanceM: number;
  timeS: number;
}): Record<RaceDistanceKey, number> {
  const out = {} as Record<RaceDistanceKey, number>;
  for (const key of Object.keys(RACE_DISTANCES_M) as RaceDistanceKey[]) {
    const dM = RACE_DISTANCES_M[key];
    const t = predictRaceTimeS(benchmark, dM);
    out[key] = Math.round(t / (dM / 1000));
  }
  return out;
}

/** The five training-intensity bands for a VDOT (race paces need a benchmark,
 *  added by `paceTableFromFitness`). */
export function trainingBands(vdot: number): Omit<PaceTable, "vdot" | "race"> {
  return {
    easy: band(vdot, INTENSITY_PCT.easy[0], INTENSITY_PCT.easy[1]),
    marathon: band(vdot, INTENSITY_PCT.marathon[0], INTENSITY_PCT.marathon[1]),
    threshold: band(
      vdot,
      INTENSITY_PCT.threshold[0],
      INTENSITY_PCT.threshold[1]
    ),
    interval: band(vdot, INTENSITY_PCT.interval[0], INTENSITY_PCT.interval[1]),
    repetition: band(
      vdot,
      INTENSITY_PCT.repetition[0],
      INTENSITY_PCT.repetition[1]
    ),
  };
}

/**
 * Full paces table from a user's `runFitness`, or `null` when there's no usable
 * benchmark (→ callers fall back to template defaults; nothing breaks).
 *
 * Prefers the stored `benchmark` (so race paces use the real effort via
 * Riegel); falls back to a cached `vdot` with race paces synthesised from a
 * VDOT-equivalent 5K.
 */
export function paceTableFromFitness(
  fitness: RunFitnessInput | null | undefined
): PaceTable | null {
  if (!fitness) return null;
  const benchmark = fitness.benchmark;
  let vdot = 0;
  if (benchmark && benchmark.distanceM > 0 && benchmark.timeS > 0) {
    vdot =
      fitness.vdot && fitness.vdot > 0
        ? fitness.vdot
        : vdotFromRace(benchmark.distanceM, benchmark.timeS);
  } else if (fitness.vdot && fitness.vdot > 0) {
    vdot = fitness.vdot;
  }
  if (vdot <= 0) return null;

  // Race paces want a concrete effort. Use the real benchmark; if only a vdot
  // is known, synthesise an equivalent 5K time so Riegel still works.
  const refBenchmark =
    benchmark && benchmark.distanceM > 0 && benchmark.timeS > 0
      ? benchmark
      : { distanceM: 5000, timeS: vdotEquivalent5kTimeS(vdot) };

  return {
    vdot: Math.round(vdot * 10) / 10,
    ...trainingBands(vdot),
    race: racePaces(refBenchmark),
  };
}

/** Approximate the 5K time a VDOT predicts (for race-pace synthesis when only
 *  a cached vdot is available). Inverts the race relation numerically. */
function vdotEquivalent5kTimeS(vdot: number): number {
  // Find t where vo2(5000/(t/60)) / pctMax(t/60) == vdot, by bisection on t.
  let lo = 600; // 10:00 (very fast)
  let hi = 3600; // 60:00 (very slow)
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    const v = vdotFromRace(5000, mid);
    if (v > vdot) lo = mid;
    else hi = mid;
  }
  return Math.round((lo + hi) / 2);
}

/**
 * Resolve a run template's prescribed pace for a user. `type` is the template's
 * existing intensity proxy (`easy|tempo|intervals|long|race`); the template's
 * own hardcoded pace is the fallback when there's no benchmark.
 *
 * Returns the fields a prescription cares about:
 *  - `targetPace`  — single sec/km for `RunConfig.target` (tempo, race)
 *  - `workPace`    — single sec/km for interval work reps
 *  - `band`        — the [fast, slow] range for display
 * Any field is `undefined` when it doesn't apply (e.g. easy/long have no target
 * pace today — kept that way for non-breaking parity).
 */
export function resolveSessionPaces(
  type: "easy" | "tempo" | "intervals" | "long" | "race",
  paceTable: PaceTable | null,
  opts: { fallbackPace?: number; raceDistanceKey?: RaceDistanceKey } = {}
): { targetPace?: number; workPace?: number; band?: PaceBand } {
  if (!paceTable) {
    // No benchmark → today's behaviour exactly.
    return opts.fallbackPace ? { targetPace: opts.fallbackPace } : {};
  }
  switch (type) {
    case "tempo":
      return {
        targetPace: mid(paceTable.threshold),
        band: paceTable.threshold,
      };
    case "intervals":
      return { workPace: mid(paceTable.interval), band: paceTable.interval };
    case "race": {
      const key = opts.raceDistanceKey;
      return key
        ? { targetPace: paceTable.race[key] }
        : opts.fallbackPace
          ? { targetPace: opts.fallbackPace }
          : {};
    }
    case "easy":
    case "long":
      // Easy/long stay distance-led (no enforced target pace today); expose the
      // band for guidance/display without setting a target that would trip
      // pace alerts.
      return { band: paceTable.easy };
    default:
      return {};
  }
}

function mid([fast, slow]: PaceBand): number {
  return Math.round((fast + slow) / 2);
}

/**
 * Derive a fitness benchmark from a runner's history (the silent-derive path,
 * locked decision §10). Picks the effort implying the HIGHEST VDOT among
 * representative runs (≥ 2 km, finite positive pace). Caller passes
 * already-eligibility-filtered runs (`isVolumeEligible`). Returns `null` when
 * nothing qualifies → warmup / template fallback.
 */
export function deriveBenchmarkFromRuns(
  runs: { distanceM: number; durationS: number }[]
): { distanceM: number; timeS: number } | null {
  let best: { distanceM: number; timeS: number } | null = null;
  let bestVdot = 0;
  for (const r of runs) {
    if (
      !Number.isFinite(r.distanceM) ||
      !Number.isFinite(r.durationS) ||
      r.distanceM < 2000 ||
      r.durationS <= 0
    ) {
      continue;
    }
    const v = vdotFromRace(r.distanceM, r.durationS);
    if (v > bestVdot) {
      bestVdot = v;
      best = { distanceM: r.distanceM, timeS: r.durationS };
    }
  }
  return best;
}
