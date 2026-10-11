/**
 * The virtual runner: a person the simulator puts through the app's run
 * plan. running-evidence §6.2–6.7 specifies it; every number comes from
 * `RUNNER` in `athleteParameters.ts`.
 *
 * What it models, and what it leaves out:
 * - Fitness and fatigue: running averages of weekly effort-minutes over τ₁
 *   and τ₂ days, a quality minute counting more. A runner arrives at the
 *   steady state of the load they ran before the plan.
 * - True VDOT: the untrained base plus a concave curve of fitness, scaled
 *   by a responder draw. On the day, freshness (recent load under fitness)
 *   adds up to a taper's worth, fatigue (over it) takes as much away, and
 *   there is noise.
 * - A run: segments at the paces the runner can hold that day, from the
 *   app's own Daniels–Gilbert bands (`trainingBands`). A prescribed pace
 *   faster than that is run at what they can do.
 * - Injury: a per-hour hazard, higher in a novice's first weeks, for a run
 *   much longer than the month's longest, and for a year after an injury.
 *   An injury halves running for a week or stops it for days or weeks.
 * - Not modelled: heat, terrain, economy, running form, illness.
 *
 * Deterministic for a seed: one PRNG (`mulberry32`), drawn in a fixed order.
 */
import { trainingBands, type RunIntensity } from "@/lib/runPaces";
import { mulberry32 } from "@/test/prng";
import { RUNNER } from "./athleteParameters";

/** Which end of each weak parameter a run uses. */
export interface RunnerVariant {
  name: string;
  fitnessTauDays: number;
  fatigueTauDays: number;
  headroom: number;
  loadScale: number;
  freshnessCap: number;
  /** A quality minute's load against an easy one. */
  qualityLoadFactor: number;
  /** × the injury rates. */
  injuryScale: number;
}

const R = RUNNER;

export const BASE_RUNNER: RunnerVariant = {
  name: "base",
  fitnessTauDays: R.fitnessTauDays.value,
  fatigueTauDays: R.fatigueTauDays.value,
  headroom: R.headroom.value,
  loadScale: R.loadScale.value,
  freshnessCap: R.freshnessCap.value,
  qualityLoadFactor: R.qualityLoadFactor.value,
  injuryScale: 1,
};

/** The pessimistic end: fitness that fades faster, fatigue that lingers,
 *  less to gain, injuries at the novice rate's top. */
export const HARSH_RUNNER: RunnerVariant = {
  name: "harsh",
  fitnessTauDays: R.fitnessTauDays.range[0],
  fatigueTauDays: R.fatigueTauDays.range[1],
  headroom: R.headroom.range[0],
  loadScale: R.loadScale.range[1],
  freshnessCap: R.freshnessCap.range[0],
  qualityLoadFactor: R.qualityLoadFactor.value,
  injuryScale: R.injuryNovice.range[1] / R.injuryNovice.value,
};

/** The base model with quality sessions credited at their top weight
 *  (TRIMP's interval-minute weighting): how much of an outcome rests on
 *  what the model gives intensity. */
export const INTENSITY_RUNNER: RunnerVariant = {
  ...BASE_RUNNER,
  name: "intensity",
  qualityLoadFactor: R.qualityLoadFactor.range[1],
};

export interface RunnerSetup {
  /** True VDOT at the start. */
  vdot: number;
  /** Weekly effort-minutes before the plan: the load they arrive fit for. */
  weeklyMinutes: number;
  /** Weeks of regular running before the plan. */
  runningWeeks: number;
  /** An injury in the year before. */
  priorInjury?: boolean;
  /** Lifts as well: a beginner's aerobic gain is damped (§6.6). */
  lifts?: boolean;
  /** A fixed responder in place of the draw, for calibration. */
  responder?: number;
  /** Their longest run in the month before, km: by default a third of
   *  their weekly minutes at their easy pace, so the plan's first long run
   *  is judged against it (the single-run guard). */
  longestRunKm?: number;
}

/** One stretch of a run. `minutes` or `km` sets how long; `pace` (s/km) is
 *  the target the app gave, when it gave one. */
export interface RunSegment {
  intensity: RunIntensity;
  minutes?: number;
  km?: number;
  pace?: number;
}

export interface RunDone {
  minutes: number;
  km: number;
  /** Average pace, s/km. */
  pace: number;
  /** Any segment above easy. */
  quality: boolean;
  /** Minutes run above easy. */
  qualityMinutes: number;
  /** Effort-minutes it added to the runner's load. */
  load: number;
  /** A target pace the runner couldn't hold. */
  tooFast: boolean;
  /** An injury from this run. */
  injury: InjuryKind | null;
}

export type InjuryKind = "reduced" | "short" | "long";

/** What the runner can do today. */
export type RunnerToday =
  | { kind: "fit" }
  | { kind: "reduced"; until: number }
  | { kind: "stopped"; until: number };

const NOVICE_EASE_WEEKS = R.noviceRiskWeeks.value;

export class VirtualRunner {
  readonly seed: number;
  readonly setup: RunnerSetup;
  readonly variant: RunnerVariant;
  private readonly rand: () => number;
  /** Responder r. */
  readonly responder: number;
  /** The untrained base VDOT. */
  readonly base: number;
  private fitness: number;
  private fatigue: number;
  /** Effort-minutes run today. */
  private todayLoad = 0;
  private dayNoise = 0;
  private day = 0;
  private weeksRunning: number;
  /** Day index → km, for the longest run of the last 30 days. */
  private recent: { day: number; km: number }[] = [];
  private injuredUntil = -1;
  private reducedUntil = -1;
  private lastInjuryDay: number | null = null;

  constructor(setup: RunnerSetup, seed: number, variant = BASE_RUNNER) {
    this.seed = seed;
    this.setup = setup;
    this.variant = variant;
    this.rand = mulberry32(seed ^ 0x5bd1e995);
    const drawn = Math.exp(R.responderSigma.value * this.normal());
    this.responder = setup.responder ?? drawn;
    this.fitness = setup.weeklyMinutes;
    this.fatigue = setup.weeklyMinutes;
    this.base = setup.vdot - this.curve(setup.weeklyMinutes);
    this.weeksRunning = setup.runningWeeks;
    if (setup.priorInjury) this.lastInjuryDay = -1;
    const [fast, slow] = trainingBands(setup.vdot).easy;
    const longest =
      setup.longestRunKm ??
      ((setup.weeklyMinutes / 3) * 60) / ((fast + slow) / 2);
    if (longest > 0) this.recent.push({ day: -7, km: longest });
  }

  private normal(): number {
    const u = Math.max(this.rand(), 1e-12);
    const w = this.rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * w);
  }

  /** A uniform draw, for the person's own choices. */
  chance(probability: number): boolean {
    return this.rand() < probability;
  }

  /** VDOT above the base that a fitness level carries. */
  private curve(fitness: number): number {
    return (
      this.variant.headroom *
      this.responder *
      (1 - Math.exp(-Math.max(0, fitness) / this.variant.loadScale))
    );
  }

  /** True VDOT: what the runner's fitness supports, before the day. */
  trueVdot(): number {
    return this.base + this.curve(this.fitness);
  }

  /** Freshness (+) or fatigue (−), as a share of VDOT: the full cap once
   *  recent load is a quarter off fitness, either way. */
  form(): number {
    const scale = Math.max(this.fitness, 0.1 * this.variant.loadScale);
    const share = (this.fitness - this.fatigue) / (0.25 * scale);
    return this.variant.freshnessCap * Math.max(-1, Math.min(1, share));
  }

  /** What the runner can do on the day. */
  dayVdot(): number {
    return this.trueVdot() * (1 + this.form() + this.dayNoise);
  }

  /** The weekly load the runner is fit for. */
  fitnessMinutes(): number {
    return this.fitness;
  }

  today(): RunnerToday {
    if (this.day < this.injuredUntil)
      return { kind: "stopped", until: this.injuredUntil };
    if (this.day < this.reducedUntil)
      return { kind: "reduced", until: this.reducedUntil };
    return { kind: "fit" };
  }

  /** The morning. */
  startDay(): void {
    this.dayNoise = R.dayNoise.value * this.normal();
  }

  /** The longest run of the last 30 days. */
  longestRecent(): number {
    return Math.max(
      0,
      ...this.recent.filter((r) => r.day > this.day - 30).map((r) => r.km)
    );
  }

  /** Runs `segments`, halved while an injury only reduces running. */
  run(
    segments: readonly RunSegment[],
    options: { afterHeavyLegs?: boolean } = {}
  ): RunDone {
    const vdot = this.dayVdot();
    const bands = trainingBands(vdot);
    const reduced = this.day < this.reducedUntil ? 0.5 : 1;
    let minutes = 0;
    let km = 0;
    let load = 0;
    let quality = false;
    let qualityMinutes = 0;
    let tooFast = false;
    for (const seg of segments) {
      const [fastest, slowest] = bands[seg.intensity];
      const own = (fastest + slowest) / 2;
      // A target slower than the band is easy to hold; one faster than the
      // band's quick end is run at what the runner can do.
      let pace = seg.pace ?? own;
      if (pace < fastest) {
        tooFast = true;
        pace = fastest;
      }
      const segMinutes = (seg.minutes ?? ((seg.km ?? 0) * pace) / 60) * reduced;
      const segKm = (segMinutes * 60) / pace;
      const isQuality = seg.intensity !== "easy";
      minutes += segMinutes;
      km += segKm;
      quality ||= isQuality;
      if (isQuality) qualityMinutes += segMinutes;
      load +=
        segMinutes *
        (isQuality ? this.variant.qualityLoadFactor : 1) *
        (isQuality && options.afterHeavyLegs ? R.afterHeavyLegs.value : 1);
    }
    if (this.setup.lifts && this.weeksRunning < NOVICE_EASE_WEEKS)
      load *= R.concurrentNovice.value;
    const injury = this.injuryFrom(km, minutes);
    this.recent.push({ day: this.day, km });
    this.todayLoad += load;
    return {
      minutes,
      km,
      pace: km > 0 ? (minutes * 60) / km : 0,
      quality,
      qualityMinutes,
      load,
      tooFast,
      injury,
    };
  }

  /** The hazard for a run of `km` over `minutes`, and the draw. */
  private injuryFrom(km: number, minutes: number): InjuryKind | null {
    const novice = Math.max(
      0,
      Math.min(1, 1 - this.weeksRunning / NOVICE_EASE_WEEKS)
    );
    const perThousand =
      (R.injuryRecreational.value +
        (R.injuryNovice.value - R.injuryRecreational.value) * novice) *
      this.variant.injuryScale;
    const longest = this.longestRecent();
    const ratio = longest > 0 ? km / longest : 1;
    const spike =
      ratio > 2
        ? R.spikeOver100.value
        : ratio > 1.3
          ? R.spike30to100.value
          : ratio > 1.1
            ? R.spike10to30.value
            : 1;
    const prior =
      this.lastInjuryDay !== null && this.day - this.lastInjuryDay < 365
        ? R.priorInjury.value
        : 1;
    const hazard = (perThousand * spike * prior * (minutes / 60)) / 1000;
    if (!(this.rand() < 1 - Math.exp(-hazard))) return null;
    this.lastInjuryDay = this.day;
    const kind = this.rand();
    if (kind < R.injuryReducedShare.value) {
      this.reducedUntil = this.day + 1 + 7;
      return "reduced";
    }
    if (kind < R.injuryReducedShare.value + R.injuryShortShare.value) {
      this.injuredUntil =
        this.day +
        1 +
        Math.round(R.injuryShortDays.value * (0.5 + this.rand()));
      return "short";
    }
    this.injuredUntil =
      this.day + 1 + Math.round(R.injuryLongDays.value * (0.5 + this.rand()));
    return "long";
  }

  /** Overnight: today's load joins fitness and fatigue. */
  endDay(): void {
    const weekly = this.todayLoad * 7;
    const a1 = Math.exp(-1 / this.variant.fitnessTauDays);
    const a2 = Math.exp(-1 / this.variant.fatigueTauDays);
    this.fitness = this.fitness * a1 + (1 - a1) * weekly;
    this.fatigue = this.fatigue * a2 + (1 - a2) * weekly;
    this.todayLoad = 0;
    this.day++;
    if (this.day % 7 === 0 && this.recent.some((r) => r.day > this.day - 7))
      this.weeksRunning++;
    this.recent = this.recent.filter((r) => r.day > this.day - 30);
  }
}
