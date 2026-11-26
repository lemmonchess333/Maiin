/**
 * Plate calculator maths (#985 — the last missing in-session logging
 * primitive vs Hevy/Strong). Standard Olympic bar + metric plate set;
 * greedy decomposition is exact for this denomination set because every
 * plate is a multiple of the smallest (1.25): whatever remains after the
 * larger plates is still a multiple of 1.25 and gets finished by 1.25s,
 * so greedy can't strand remainder a different combo would have covered.
 * (It is NOT the "each plate ≥ 2× the next" coin property — 25 vs 20
 * breaks that — so if the plate set ever changes, keep the smallest
 * plate a common divisor of all the others or exactness is lost.)
 *
 * The numbers are in whichever unit the bar and plates are given in: kg for
 * the metric set, lb for an lb kit (Lift18), where 2.5 lb divides every
 * plate in the same way.
 */
import type { LiftUnit } from "./liftLoad";
import { kgToLb } from "./weightUnits";

export const DEFAULT_BAR_KG = 20;
/** Women's / technique bar in metric kits. */
export const LIGHT_BAR_KG = 15;
/** Per-side plate denominations, descending (standard metric gym set). */
export const DEFAULT_PLATES_KG = [25, 20, 15, 10, 5, 2.5, 1.25];
/** Metric set with fractional small plates (0.625 kg/side → 1.25 kg barbell step).
 *  Every larger plate is an exact integer multiple of 0.625, preserving greedy exactness. */
export const MICRO_PLATES_KG = [...DEFAULT_PLATES_KG, 0.625];

export interface PlateBreakdown {
  bar: number;
  /** e.g. [{ plate: 20, count: 1 }, { plate: 2.5, count: 1 }] per side. */
  perSide: { plate: number; count: number }[];
  /** Weight that couldn't be plated with the denomination set (0 = exact). */
  remainder: number;
  /** The exactly-loadable weight (targetKg − remainder). */
  loadable: number;
}

/**
 * Decompose a target barbell weight into per-side plates. Returns null
 * when the target doesn't reach the bar (nothing to plate — the UI shows
 * "just the bar" copy for exact-bar weights via an empty perSide).
 */
export function platesPerSide(
  targetKg: number,
  bar: number = DEFAULT_BAR_KG,
  plates: number[] = DEFAULT_PLATES_KG
): PlateBreakdown | null {
  if (!Number.isFinite(targetKg) || targetKg < bar) return null;

  let perSideRemaining = (targetKg - bar) / 2;
  const perSide: { plate: number; count: number }[] = [];
  for (const plate of [...plates].sort((a, b) => b - a)) {
    if (plate <= 0) continue;
    const count = Math.floor((perSideRemaining + 1e-9) / plate);
    if (count > 0) {
      perSide.push({ plate: plate, count });
      perSideRemaining -= count * plate;
    }
  }
  const remainder = Math.round(perSideRemaining * 2 * 100) / 100;
  return {
    bar,
    perSide,
    remainder,
    loadable: Math.round((targetKg - remainder) * 100) / 100,
  };
}

/** An lb gym's bar and plates (Lift18). */
export const LB_BAR = 45;
/** Women's / technique bar in lb kits. */
export const LIGHT_BAR_LB = 35;
export const LB_PLATES = [45, 35, 25, 10, 5, 2.5];
/** Imperial set with fractional small plates (1.25 lb/side → 2.5 lb barbell step). */
export const MICRO_PLATES_LB = [...LB_PLATES, 1.25];

export interface PlatesInKitOptions {
  /** Include fractional microplates matching `programState.settings.smallPlates`. */
  smallPlates?: boolean;
  /** Override bar weight in the lifter's unit (e.g. 15 kg or 35 lb). */
  barWeight?: number;
}

/**
 * A target stored in kg, broken into the lifter's own bar and plates: the
 * metric set for kg, and the lb set for lb, every number in the breakdown
 * in that unit.
 */
export function platesInKit(
  targetKg: number,
  unit: LiftUnit,
  options?: PlatesInKitOptions
): PlateBreakdown | null {
  const smallPlates = options?.smallPlates === true;
  if (unit === "kg") {
    const bar =
      typeof options?.barWeight === "number" &&
      Number.isFinite(options.barWeight) &&
      options.barWeight > 0
        ? options.barWeight
        : DEFAULT_BAR_KG;
    return platesPerSide(
      targetKg,
      bar,
      smallPlates ? MICRO_PLATES_KG : DEFAULT_PLATES_KG
    );
  }
  const bar =
    typeof options?.barWeight === "number" &&
    Number.isFinite(options.barWeight) &&
    options.barWeight > 0
      ? options.barWeight
      : LB_BAR;
  const target = Math.round(kgToLb(targetKg) * 100) / 100;
  return platesPerSide(target, bar, smallPlates ? MICRO_PLATES_LB : LB_PLATES);
}

export interface WarmupStep {
  /** Short step tag such as "Bar", "50%", "70%", "85%". */
  label: string;
  /** Suggested repetitions for this warm-up set. */
  reps: number;
  /** Exactly loadable barbell weight in the lifter's unit (`kg` or `lb`). */
  weight: number;
  /** Per-side plate breakdown for this warm-up weight. */
  breakdown: PlateBreakdown;
}

const WARMUP_TARGETS: readonly {
  label: string;
  ratio: number;
  reps: number;
}[] = [
  { label: "50%", ratio: 0.5, reps: 5 },
  { label: "70%", ratio: 0.7, reps: 3 },
  { label: "85%", ratio: 0.85, reps: 1 },
];

/**
 * Builds a monotonically increasing, kit-loadable warm-up ramp leading up to
 * a working barbell weight (empty bar × 8, ~50% × 5, ~70% × 3, ~85% × 1).
 * Duplicate loads and loads at or above the working weight are omitted so
 * lighter working sets still get a sensible progression.
 */
export function buildWarmupRamp(
  workWeightKg: number,
  unit: LiftUnit,
  options?: PlatesInKitOptions
): WarmupStep[] {
  const work = platesInKit(workWeightKg, unit, options);
  if (!work || work.loadable <= work.bar) return [];

  const smallPlates = options?.smallPlates === true;
  const plates =
    unit === "kg"
      ? smallPlates
        ? MICRO_PLATES_KG
        : DEFAULT_PLATES_KG
      : smallPlates
        ? MICRO_PLATES_LB
        : LB_PLATES;
  const smallestPlate = Math.min(...plates);
  const step = smallestPlate * 2;
  const { bar } = work;

  const steps: WarmupStep[] = [];
  const seen = new Set<number>();

  const pushStep = (label: string, reps: number, rawWeight: number) => {
    const snapped =
      Math.round((bar + Math.round((rawWeight - bar) / step) * step) * 100) /
      100;
    const clamped = Math.max(bar, snapped);
    if (clamped >= work.loadable || seen.has(clamped)) return;
    const breakdown = platesPerSide(clamped, bar, plates);
    if (!breakdown || breakdown.loadable >= work.loadable) return;
    if (seen.has(breakdown.loadable)) return;
    seen.add(breakdown.loadable);
    steps.push({
      label,
      reps,
      weight: breakdown.loadable,
      breakdown,
    });
  };

  pushStep("Bar", 8, bar);
  for (const { label, ratio, reps } of WARMUP_TARGETS) {
    pushStep(label, reps, work.loadable * ratio);
  }

  return steps;
}
