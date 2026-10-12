/**
 * The virtual lifter: a person the simulator puts through the app's plan.
 * docs/training-engine-2026-10/lifting-evidence.md §4.4 specifies it; every
 * number comes from `athleteParameters.ts`.
 *
 * What it models, and what it leaves out:
 * - Strength, per movement family (the plan's `movementCategory`), as a
 *   multiple of the start. It grows each week from that week's effective
 *   sets, how often the family was trained and how heavy, towards a ceiling
 *   set by training age (`STRENGTH_CURVE`, fitted to §4.2). A lift's true 1RM
 *   is its start times its family's multiple, so a variation the plan
 *   rotates in carries what the family has gained. Muscle size, the
 *   heavy-load skill term and the slow fatigue component are not modelled
 *   yet; §4.2's targets fold skill into the curve.
 * - Reps at a load: Nuzzo's mean and spread, one z-score per person
 *   (`repCapacity.ts`). The person stops at the target or at failure.
 * - Day to day: noise, and acute fatigue per half of the body from the
 *   last sessions' hard sets.
 * - Effort: a set counts in full within 4 reps of failure, less past that,
 *   so a plan that under-loads gives a smaller dose. Without that, the
 *   simulator could not tell a plan that keeps up from one that doesn't.
 *
 * Deterministic for a seed: one PRNG (`mulberry32`), drawn in a fixed
 * order.
 */
import { mulberry32 } from "@/test/prng";
import { LIFTER, STRENGTH_CURVE } from "./athleteParameters";
import { repClassOf, repsToFailure } from "./repCapacity";

export type TrainingAge = "novice" | "intermediate" | "advanced";
export type Half = "upper" | "lower";

/** Which end of each weak parameter a run uses: the model variants. */
export interface LifterVariant {
  name: string;
  gamma: number;
  fatigueTauDays: number;
  fatiguePerHardSet: number;
  setFailureCost: number;
  repsSpreadScale: number;
  effortLossPerRirPast4: number;
  detrainShareOfGain: number;
  retrainMultiplier: number;
}

const v = LIFTER;

/** Every value at its table value. */
export const BASE_VARIANT: LifterVariant = {
  name: "base",
  gamma: STRENGTH_CURVE.gamma.value,
  fatigueTauDays: v.fatigueTauDays.value,
  fatiguePerHardSet: v.fatiguePerHardSet.value,
  setFailureCost: v.setFailureCost.value,
  repsSpreadScale: v.repsSpreadScale.value,
  effortLossPerRirPast4: v.effortLossPerRirPast4.value,
  detrainShareOfGain: v.detrainShareOfGain.value,
  retrainMultiplier: v.retrainMultiplier.value,
};

/** The pessimistic end: slow-clearing, larger fatigue (strength-sport
 *  fits), costlier sets to failure, effort counted strictly, faster
 *  detraining. */
export const HARSH_VARIANT: LifterVariant = {
  name: "harsh",
  gamma: STRENGTH_CURVE.gamma.range[1],
  fatigueTauDays: 15,
  fatiguePerHardSet: v.fatiguePerHardSet.range[1],
  setFailureCost: v.setFailureCost.range[1],
  repsSpreadScale: v.repsSpreadScale.range[0],
  effortLossPerRirPast4: v.effortLossPerRirPast4.range[1],
  detrainShareOfGain: v.detrainShareOfGain.range[1],
  retrainMultiplier: v.retrainMultiplier.range[0],
};

export interface LifterSetup {
  trainingAge: TrainingAge;
  /** True 1RMs at the start, kg, by exercise id. A lift not named here is
   *  read off the plan's first prescription at `seedRir` reps in reserve. */
  start1RM: Readonly<Record<string, number>>;
  /** Reps in reserve the plan's first numbers leave for a lift not named
   *  in `start1RM`. */
  seedRir: number;
  /** Runs alongside: the lower body's gains are damped (C_s). */
  concurrentRunning?: boolean;
}

/** One set as the person did it. */
export interface SetDone {
  /** The weight it was done at: the row's, or a lighter one the person
   *  took the weight down to (`performLift`). */
  weight: number;
  reps: number;
  completed: boolean;
  /** True reps in reserve at the end of the set (failure = 0). */
  rir: number;
}

/** What a week of training added up to, per family. */
interface FamilyWeek {
  effectiveSets: number;
  sessions: Set<string>;
  /** Σ effective sets × load-zone factor, for the week's average zone. */
  zoneWeighted: number;
}

const LOWER = new Set(["knee_dominant", "hip_dominant"]);
export const halfOf = (family: string): Half =>
  LOWER.has(family) ? "lower" : "upper";

/** Epley's 1RM from a set, for a lift's start (`seedRir` past the reps). */
const epley = (weight: number, reps: number) => weight * (1 + reps / 30);

export class VirtualLifter {
  readonly seed: number;
  readonly setup: LifterSetup;
  readonly variant: LifterVariant;
  private readonly rand: () => number;
  /** Strength responder, r_s. */
  readonly responder: number;
  /** Nuzzo z-score for reps at a load. */
  readonly repsZ: number;
  private readonly dayNoise: number;
  /** Family → strength as a multiple of the start. */
  private readonly strength = new Map<string, number>();
  /** Family → best multiple so far (for retraining). */
  private readonly peak = new Map<string, number>();
  /** Exercise id → [true 1RM at the start, its family]. */
  private readonly lifts = new Map<string, { start: number; family: string }>();
  /** Bodyweight and timed lifts: reps (or seconds) to failure at the start. */
  private readonly capacity = new Map<string, number>();
  private fatigue: Record<Half, number> = { upper: 0, lower: 0 };
  private week = new Map<string, FamilyWeek>();
  private today: { noise: number; legsAfterHardRun: boolean } = {
    noise: 0,
    legsAfterHardRun: false,
  };

  constructor(setup: LifterSetup, seed: number, variant = BASE_VARIANT) {
    this.seed = seed;
    this.setup = setup;
    this.variant = variant;
    this.rand = mulberry32(seed);
    this.responder = Math.exp(v.responderSigma.value * this.normal());
    this.repsZ = this.normal();
    this.dayNoise =
      setup.trainingAge === "novice"
        ? v.dayNoiseNovice.value
        : v.dayNoiseTrained.value;
  }

  /** A standard normal draw (Box–Muller). */
  private normal(): number {
    const u = Math.max(this.rand(), 1e-12);
    const w = this.rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * w);
  }

  /** A uniform draw, for the person's own choices (adherence). */
  chance(probability: number): boolean {
    return this.rand() < probability;
  }

  /** Meet a lift: fix its start the first time the plan shows it. */
  meet(ex: {
    exerciseId: string;
    movementCategory: string;
    weight: number;
    reps: number;
    bodyweight: boolean;
  }): void {
    if (ex.bodyweight || ex.weight <= 0) {
      if (!this.capacity.has(ex.exerciseId))
        this.capacity.set(ex.exerciseId, ex.reps + this.setup.seedRir);
      return;
    }
    if (this.lifts.has(ex.exerciseId)) return;
    const family = ex.movementCategory;
    if (!this.strength.has(family)) {
      this.strength.set(family, 1);
      this.peak.set(family, 1);
    }
    // A lift met later starts where its family stands: its plan numbers are
    // read as of the family's start.
    const named = this.setup.start1RM[ex.exerciseId];
    const now = this.strength.get(family)!;
    const startAtFamilyStart =
      named ?? epley(ex.weight, ex.reps + this.setup.seedRir) / now;
    this.lifts.set(ex.exerciseId, { start: startAtFamilyStart, family });
  }

  /** The lift's true 1RM today, before the day's noise and fatigue. */
  trueMax(exerciseId: string): number | null {
    const lift = this.lifts.get(exerciseId);
    if (!lift) return null;
    return lift.start * (this.strength.get(lift.family) ?? 1);
  }

  /** Strength of a family as a multiple of its start. */
  familyStrength(family: string): number {
    return this.strength.get(family) ?? 1;
  }

  /**
   * The heaviest load the person knows they can lift for `reps` with `rir`
   * in reserve, from their true 1RM (no day noise): what someone who knows
   * their lifts loads the first time the plan shows one. Null for a lift
   * not met yet.
   */
  knownWorkingWeight(
    exerciseId: string,
    reps: number,
    rir: number
  ): number | null {
    const max = this.trueMax(exerciseId);
    if (max === null) return null;
    const cls = repClassOf(exerciseId);
    const z = this.repsZ * this.variant.repsSpreadScale;
    // From 1RM down in 0.5% steps to the first load that allows the reps.
    for (let share = 1; share > 0.3; share -= 0.005) {
      if (repsToFailure(cls, max * share, max, z) >= reps + rir)
        return max * share;
    }
    return max * 0.3;
  }

  /** The morning: noise for today's session, and fatigue cleared since. */
  startDay(options: { legsAfterHardRun?: boolean } = {}): void {
    this.today = {
      noise: this.dayNoise * this.normal(),
      legsAfterHardRun: options.legsAfterHardRun === true,
    };
  }

  /** Overnight: acute fatigue decays. */
  endDay(): void {
    const keep = Math.exp(-1 / this.variant.fatigueTauDays);
    this.fatigue = {
      upper: this.fatigue.upper * keep,
      lower: this.fatigue.lower * keep,
    };
  }

  /**
   * The person does one lift's working sets, in order, each at its row's
   * weight and target reps, stopping at the target or at failure. A set
   * short of half its target makes them take weight off for the rest, as
   * anyone would: down the equipment's weights (`lighter`, the next weight
   * down, or the same weight where there is none) to the first they can
   * lift for the target with 2 reps in reserve, as the set just done tells
   * them.
   */
  performLift(
    ex: {
      exerciseId: string;
      movementCategory: string;
      bodyweight: boolean;
      timed: boolean;
    },
    rows: readonly { weight: number; reps: number }[],
    sessionKey: string,
    lighter?: (weight: number) => number
  ): SetDone[] {
    const family = ex.movementCategory;
    const half = halfOf(family);
    if (ex.bodyweight || ex.timed || !this.lifts.has(ex.exerciseId)) {
      const start = this.capacity.get(ex.exerciseId) ?? 12;
      let can = start * Math.pow(this.familyStrength(family), 1.5);
      return rows.map((row) => {
        const most = Math.floor(can);
        const reps = Math.max(0, Math.min(row.reps, most));
        const done: SetDone = {
          weight: row.weight,
          reps,
          completed: reps > 0,
          rir: Math.max(0, most - reps),
        };
        this.count(family, sessionKey, done);
        can *= 1 - this.variant.setFailureCost * this.hardness(done.rir);
        return done;
      });
    }
    const max = this.trueMax(ex.exerciseId)!;
    const legs = half === "lower" && this.today.legsAfterHardRun;
    const day =
      max *
      (1 - this.fatigue[half]) *
      Math.exp(this.today.noise) *
      (legs ? v.legsAfterHardRun.value : 1);
    const cls = repClassOf(ex.exerciseId);
    const z = this.repsZ * this.variant.repsSpreadScale;
    let p = day;
    let takenDownTo: number | null = null;
    return rows.map((row) => {
      const weight = takenDownTo ?? row.weight;
      const most = Math.floor(repsToFailure(cls, weight, p, z));
      const reps = Math.max(0, Math.min(row.reps, most));
      const done: SetDone = {
        weight,
        reps,
        completed: reps > 0,
        rir: Math.max(0, most - reps),
      };
      this.count(family, sessionKey, done);
      if (done.completed && done.rir <= 4)
        this.fatigue[half] += this.variant.fatiguePerHardSet;
      p *= 1 - this.variant.setFailureCost * this.hardness(done.rir);
      if (lighter && takenDownTo === null && reps < Math.ceil(row.reps / 2)) {
        let next = weight;
        for (let step = 0; step < 100; step++) {
          const down = lighter(next);
          if (!(down > 0) || down >= next) break;
          next = down;
          if (repsToFailure(cls, next, p, z) >= row.reps + 2) break;
        }
        takenDownTo = next;
      }
      return done;
    });
  }

  /** How close to failure a set went, for what it costs the next: 1 at
   *  failure, 0 from 3 in reserve. */
  private hardness(rir: number): number {
    return Math.min(1, Math.max(0, (3 - rir) / 3));
  }

  /** A set's share of the week's dose. */
  private count(family: string, sessionKey: string, done: SetDone): void {
    if (!done.completed) return;
    const effort =
      done.rir <= 4
        ? 1
        : Math.max(0, 1 - this.variant.effortLossPerRirPast4 * (done.rir - 4));
    if (effort <= 0) return;
    // The load zone is read from the reps the load allows, not the target:
    // 8RM or heavier is heavy.
    const repMax = done.reps + done.rir;
    const zone =
      repMax <= 8
        ? 1
        : repMax <= 15
          ? v.loadZoneModerate.value
          : v.loadZoneLight.value;
    const week = this.week.get(family) ?? {
      effectiveSets: 0,
      sessions: new Set<string>(),
      zoneWeighted: 0,
    };
    week.effectiveSets += effort;
    week.zoneWeighted += effort * zone;
    week.sessions.add(sessionKey);
    this.week.set(family, week);
  }

  /** The week's dose, against the reference: 8 sets, twice, heavy. */
  private doseFactor(week: FamilyWeek): number {
    const sets = week.effectiveSets;
    if (sets <= 0) return 0;
    const d = (v.doseMax.value * sets) / (sets + v.doseHalf.value);
    const n = week.sessions.size;
    const fq =
      n <= 1
        ? v.frequency1x.value
        : n === 2
          ? 1
          : n === 3
            ? v.frequency3x.value
            : v.frequency4x.value;
    const zone = week.zoneWeighted / sets;
    return d * fq * zone;
  }

  /** The end of a week: every family moves on its week's dose. */
  endWeek(): void {
    for (const [family, b] of this.strength) {
      const week = this.week.get(family);
      const half = halfOf(family);
      const curve = STRENGTH_CURVE[this.setup.trainingAge][half];
      if (!week || week.effectiveSets <= 0) {
        // Detraining: a share of the gain so far.
        const next = 1 + (b - 1) * (1 - this.variant.detrainShareOfGain);
        this.strength.set(family, b > 1 ? next : b);
        continue;
      }
      const gap = Math.max(0, 1 - b / curve.ceiling.value);
      const retraining =
        b < (this.peak.get(family) ?? 1) ? this.variant.retrainMultiplier : 1;
      const concurrent =
        this.setup.concurrentRunning && half === "lower"
          ? v.concurrentLower.value
          : 1;
      const step =
        curve.rate.value *
        this.responder *
        retraining *
        concurrent *
        this.doseFactor(week) *
        Math.pow(gap, this.variant.gamma);
      const next = b + step;
      this.strength.set(family, next);
      this.peak.set(family, Math.max(this.peak.get(family) ?? 1, next));
    }
    this.week = new Map();
  }
}
