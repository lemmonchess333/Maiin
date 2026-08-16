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
  /** RUN-EV-08 two-tier consent (owner decision 2026-08-09): true while an
   *  AUTO-derived benchmark awaits the user's explicit acceptance. A pending
   *  benchmark informs measurement surfaces (predictions, the fitness
   *  section) but must NOT change a prescription — use
   *  `prescriptivePaceTableFromFitness` at prescription call sites. */
  pendingConfirmation?: boolean;
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

/**
 * A2 — the ONE band scale for "goal VDOT vs current VDOT" gaps. Shared by
 * the feasibility verdict (raceGoalPlanner, display) and the goal-pace
 * enrichment gate (runPlanMetadata, prescription) so the surface that
 * TELLS the user "long shot" and the surface that declines to prescribe
 * that pace can never disagree on where the boundary sits.
 */
export type RaceTargetBand =
  | "on_track"
  | "within_reach"
  | "stretch"
  | "long_shot";

export function raceTargetBand(gapVdot: number): RaceTargetBand {
  if (gapVdot <= 0) return "on_track";
  if (gapVdot <= 2) return "within_reach";
  if (gapVdot <= 4) return "stretch";
  return "long_shot";
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

/** Parse a "mm:ss" or "h:mm:ss" finish time to seconds. Null when unparseable
 *  (UI benchmark entry). Minutes/seconds must be < 60; result must be > 0. */
export function parseRaceTimeToSeconds(input: string): number | null {
  const parts = input.trim().split(":");
  if (parts.length < 2 || parts.length > 3) return null;
  const nums = parts.map((p) => Number(p));
  if (nums.some((n) => !Number.isFinite(n) || n < 0)) return null;
  let seconds: number;
  if (nums.length === 2) {
    if (nums[1] >= 60) return null;
    seconds = nums[0] * 60 + nums[1];
  } else {
    if (nums[1] >= 60 || nums[2] >= 60) return null;
    seconds = nums[0] * 3600 + nums[1] * 60 + nums[2];
  }
  return seconds > 0 ? seconds : null;
}

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
  const resolved = resolveFitnessVdot(fitness);
  if (!resolved) return null;
  const { vdot, benchmark } = resolved;

  return {
    vdot: Math.round(vdot * 10) / 10,
    ...trainingBands(vdot),
    race: racePaces(resolveRefBenchmark(benchmark, vdot)),
  };
}

/**
 * RUN-EV-08: the pace table for PRESCRIPTION consumers — anything that
 * writes a target pace into a run config, a plan prefill, or a scheduled
 * session. Identical to `paceTableFromFitness` except an unconfirmed
 * auto-derived benchmark yields null, so callers fall back to template
 * paces exactly as if no benchmark existed. Measurement consumers
 * (predictions, the settings pace grid, the post-run verdict) keep
 * reading `paceTableFromFitness` — the two-tier split is by consequence,
 * not by field.
 */
export function prescriptivePaceTableFromFitness(
  fitness: RunFitnessInput | null | undefined
): PaceTable | null {
  if (fitness?.pendingConfirmation) return null;
  return paceTableFromFitness(fitness);
}

/** Shared vdot resolution: stored vdot wins, else derive from the benchmark;
 *  null when neither is usable. `benchmark` is echoed back only when valid. */
function resolveFitnessVdot(fitness: RunFitnessInput | null | undefined): {
  vdot: number;
  benchmark: { distanceM: number; timeS: number } | null;
} | null {
  if (!fitness) return null;
  const benchmark =
    fitness.benchmark &&
    fitness.benchmark.distanceM > 0 &&
    fitness.benchmark.timeS > 0
      ? fitness.benchmark
      : null;
  let vdot = 0;
  if (benchmark) {
    vdot =
      fitness.vdot && fitness.vdot > 0
        ? fitness.vdot
        : vdotFromRace(benchmark.distanceM, benchmark.timeS);
  } else if (fitness.vdot && fitness.vdot > 0) {
    vdot = fitness.vdot;
  }
  return vdot > 0 ? { vdot, benchmark } : null;
}

/** The concrete effort Riegel projections run off: the real benchmark when
 *  one exists, else a 5K synthesised from the vdot. Shared by the paces table
 *  and the Analytics race predictions so the two can never disagree. */
function resolveRefBenchmark(
  benchmark: { distanceM: number; timeS: number } | null,
  vdot: number
): { distanceM: number; timeS: number } {
  return benchmark && benchmark.distanceM > 0 && benchmark.timeS > 0
    ? benchmark
    : { distanceM: 5000, timeS: vdotEquivalent5kTimeS(vdot) };
}

/**
 * Predicted finish TIMES (seconds) per race distance from a user's
 * `runFitness`, or `null` when there's no usable benchmark/vdot. Same
 * reference-benchmark rules as `paceTableFromFitness` (real effort preferred,
 * vdot-only synthesises an equivalent 5K), so the Analytics predictions and
 * the planner's race paces always come from the same effort.
 */
export function predictedRaceTimesFromFitness(
  fitness: RunFitnessInput | null | undefined
): Record<RaceDistanceKey, number> | null {
  const resolved = resolveFitnessVdot(fitness);
  if (!resolved) return null;

  const ref = resolveRefBenchmark(resolved.benchmark, resolved.vdot);
  const out = {} as Record<RaceDistanceKey, number>;
  for (const key of Object.keys(RACE_DISTANCES_M) as RaceDistanceKey[]) {
    out[key] = Math.round(predictRaceTimeS(ref, RACE_DISTANCES_M[key]));
  }
  return out;
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

/** Map a race template's target distance (km) to a PaceTable race key. Shared
 *  by the run surfaces that show a race session's predicted pace. */
export function raceDistanceKeyFromKm(
  distanceKm?: number
): RaceDistanceKey | undefined {
  if (distanceKm == null) return undefined;
  if (distanceKm <= 5) return "5k";
  if (distanceKm <= 10) return "10k";
  if (distanceKm <= 21.2) return "half";
  return "marathon";
}

/**
 * Pace Insights (Phase 2, Pro) — the adaptive recalibration signal. Compares
 * the VDOT the user's recent runs IMPLY against their stored benchmark; when
 * the best recent effort diverges by a meaningful margin, returns a suggestion
 * to recalibrate (the user approves — we never silently change the benchmark).
 *
 * Pure. `recentRuns` are caller-filtered to eligible outdoor efforts.
 * `direction` is relative to the stored benchmark: "faster" = improved (best
 * recent effort implies a higher VDOT); "slower" = even the best recent effort
 * is well below the stored mark (detrained / stale benchmark).
 */
export interface PaceInsight {
  currentVdot: number;
  suggestedVdot: number;
  suggestedBenchmark: {
    distanceM: number;
    timeS: number;
    sourceRunId?: string;
    sourceRunAt?: string;
  };
  direction: "faster" | "slower";
  /** How the runner's own post-run ratings bore on this suggestion. */
  effort: EffortAgreement;
}

/** The post-run "how did that feel?" tap. Stored on every saved run. */
export type RelativeEffort = "easier" | "matched" | "harder" | null;

export type EffortAgreement = "agrees" | "neutral" | "conflicts";

/**
 * At least this many RATED runs before the ratings bear on anything.
 *
 * One tap must not move a training block, and that is a design position
 * rather than timidity. Across the adaptive-plan products checked, THREE of
 * three collect a subjective post-run rating and ZERO route it into the
 * scheduler: Runna's own support doc says its thumbs rating "is used
 * internally by Runna's coaching and product teams", and that "in the near
 * future" it will play a more direct role — future tense. What actually
 * moves Runna's paces is Pace Insights, an objective pace-vs-target trend
 * across multiple sessions that the user then accepts. TrainingPeaks routes
 * RPE to a human coach; Garmin's Self Evaluation is journaling, and its
 * Daily Suggested Workouts adapt from load, sleep and HRV.
 *
 * So the rating never TRIGGERS a change here. It sharpens, or blocks, a
 * conclusion the objective trend has already reached on its own.
 */
const MIN_RATED_RUNS = 2;

/**
 * Do the runner's ratings point the same way as the objective trend?
 *
 * The mapping is not obvious in isolation, so state it: `direction:
 * "faster"` means recent efforts imply MORE fitness than the stored
 * benchmark, and a run that felt EASIER than expected is the subjective
 * version of that same claim. Conversely "slower" pairs with "harder". The
 * crossed pairs — running faster while it felt harder, or slower while it
 * felt easier — are evidence disagreeing with itself.
 *
 * "matched" is not a vote. It is the runner saying the session landed where
 * it should, which is consistent with any objective drift, so it counts for
 * neither side.
 */
export function resolveEffortAgreement(
  direction: "faster" | "slower",
  efforts: RelativeEffort[]
): EffortAgreement {
  const agreeingTap = direction === "faster" ? "easier" : "harder";
  const conflictingTap = direction === "faster" ? "harder" : "easier";

  let agreeing = 0;
  let conflicting = 0;
  for (const e of efforts) {
    if (e === agreeingTap) agreeing++;
    else if (e === conflictingTap) conflicting++;
  }

  if (agreeing >= MIN_RATED_RUNS && agreeing > conflicting) return "agrees";
  if (conflicting >= MIN_RATED_RUNS && conflicting > agreeing)
    return "conflicts";
  return "neutral";
}

/**
 * How far the ratings may move the bar.
 *
 * NEUTRAL IS EXACTLY TODAY'S NUMBER, on purpose: a runner who never taps the
 * chips must get precisely the behaviour they had before this existed, so
 * the caller's `minDeltaVdot` is left alone and only modulated FROM.
 *
 * The two agreeing gates are asymmetric — easing off is cheaper to trigger
 * than pushing harder. That is deliberate hysteresis in the direction where
 * the errors differ in cost: paces prescribed too easy cost a little
 * training stimulus, paces prescribed too hard cost an injury.
 */
const AGREEING_GATE = { faster: 1.3, slower: 1.1 } as const;

export function resolvePaceInsight(
  fitness: RunFitnessInput | null | undefined,
  recentRuns: {
    distanceM: number;
    durationS: number;
    /** The runner's own post-run read. Absent on legacy runs and on any run
     *  they skipped the chip for — both are simply not votes. */
    relativeEffort?: RelativeEffort;
  }[],
  minDeltaVdot = 1.5,
  minRuns = 3
): PaceInsight | null {
  if (!fitness) return null;
  const currentVdot =
    fitness.vdot && fitness.vdot > 0
      ? fitness.vdot
      : fitness.benchmark
        ? vdotFromRace(fitness.benchmark.distanceM, fitness.benchmark.timeS)
        : 0;
  if (currentVdot <= 0) return null;
  if (recentRuns.length < minRuns) return null;

  const best = deriveBenchmarkFromRuns(recentRuns);
  if (!best) return null;
  const bestVdot = vdotFromRace(best.distanceM, best.timeS);
  if (bestVdot <= 0) return null;

  const direction = bestVdot > currentVdot ? "faster" : "slower";
  const effort = resolveEffortAgreement(
    direction,
    recentRuns.map((r) => r.relativeEffort ?? null)
  );

  /* The rating modulates the bar; it never clears it alone. A conflict
     REFUSES outright rather than merely raising the bar — when the runner's
     own read of the sessions contradicts what the times say, the honest
     output is nothing. Runna ships two named statuses whose whole job is
     declining for exactly this reason ("Variable Pace Detected",
     "Monitoring Your Pace Data"); a recommendation is not owed on every
     query. */
  if (effort === "conflicts") return null;
  const gate = effort === "agrees" ? AGREEING_GATE[direction] : minDeltaVdot;
  if (Math.abs(bestVdot - currentVdot) < gate) return null;

  return {
    currentVdot: Math.round(currentVdot * 10) / 10,
    suggestedVdot: Math.round(bestVdot * 10) / 10,
    suggestedBenchmark: best,
    direction,
    effort,
  };
}

/**
 * Derive a fitness benchmark from a runner's history (the silent-derive path,
 * locked decision §10). Picks the effort implying the HIGHEST VDOT among
 * representative runs (≥ 2 km, finite positive pace). Caller passes
 * already-eligibility-filtered runs (`isVolumeEligible`). Returns `null` when
 * nothing qualifies → warmup / template fallback.
 */
export function deriveBenchmarkFromRuns(
  runs: {
    distanceM: number;
    durationS: number;
    /** RUN-EV-08 provenance: the winning run's id/date are echoed back so
     *  the write site can record WHICH run set the benchmark. Optional —
     *  callers without ids get the pre-provenance behaviour. */
    id?: string;
    completedAt?: Date;
  }[]
): {
  distanceM: number;
  timeS: number;
  sourceRunId?: string;
  sourceRunAt?: string;
} | null {
  let best: {
    distanceM: number;
    timeS: number;
    sourceRunId?: string;
    sourceRunAt?: string;
  } | null = null;
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
      best = {
        distanceM: r.distanceM,
        timeS: r.durationS,
        ...(r.id ? { sourceRunId: r.id } : {}),
        ...(r.completedAt ? { sourceRunAt: r.completedAt.toISOString() } : {}),
      };
    }
  }
  return best;
}
