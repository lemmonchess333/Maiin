import type { LiftUnit } from "@/lib/liftLoad";
import { loadGridFor } from "./loadSteps";

const roundKg = (value: number): number => Math.round(value * 1000) / 1000;

/**
 * Direction of a next-set load nudge from the current set's RPE.
 *
 *   <= 6.5  +1 (step up one kit increment)
 *   >= 9.5  -1 (step down one kit increment)
 *   else     0 (on target — no nudge)
 */
export function rpeNudgeDirection(rpe: number | undefined | null): -1 | 0 | 1 {
  if (typeof rpe !== "number" || !Number.isFinite(rpe)) return 0;
  if (rpe <= 6.5) return 1;
  if (rpe >= 9.5) return -1;
  return 0;
}

/**
 * Computes the next-set target weight in **kg**, snapped to the lift's
 * equipment grid (`loadGridFor`) in the lifter's unit (`kg` or `lbs`).
 *
 * Returns `null` when the set is unloaded, on target, or already at the
 * bottom of the equipment grid (so stepping down would reach 0).
 */
export function rpeNudgeTarget(
  weightKg: number,
  rpe: number | undefined | null,
  exerciseId: string | undefined,
  unit: LiftUnit,
  smallPlates = false
): number | null {
  if (!Number.isFinite(weightKg) || weightKg <= 0) return null;
  const dir = rpeNudgeDirection(rpe);
  if (dir === 0) return null;

  const grid = loadGridFor(exerciseId, smallPlates, unit);
  const next = dir > 0 ? grid.above(weightKg) : grid.below(weightKg);
  const rounded = roundKg(next);

  if (rounded <= 0 || Math.abs(rounded - weightKg) < 1e-3) return null;
  return rounded;
}
