import {
  calculateTDEE,
  type ActivityLevel,
  type FitnessGoal,
  type TDEEResult,
} from "./tdee";
import { offsetFromWeeklyRate } from "./macroConstants";

/**
 * Goal-weight + rate → nutrition direction (Tier 2).
 *
 * Locked product decision: the TARGET WEIGHT owns the nutrition direction
 * (MFP / MacroFactor model), not the training `primaryGoal`. So "Build
 * muscle" with a target weight BELOW current honestly resolves to a slight
 * deficit (a real recomp / mini-cut scenario) instead of silently forcing a
 * surplus. `primaryGoal` continues to drive the LIFTING programme only.
 *
 * Direction is set by target vs current weight with a deadband, so a target
 * within ~1kg of current reads as "maintain at current weight" (recomp) — it
 * avoids a 0.2kg target nudge flipping the user into a cut/bulk.
 */

/** Targets within this many kg of current weight count as "maintain". */
export const MAINTAIN_DEADBAND_KG = 1;

export type WeightDirection = "lose" | "gain" | "maintain";

export function directionForTarget(
  currentKg: number,
  targetKg: number,
  deadbandKg: number = MAINTAIN_DEADBAND_KG
): WeightDirection {
  const delta = targetKg - currentKg;
  if (delta < -deadbandKg) return "lose";
  if (delta > deadbandKg) return "gain";
  return "maintain";
}

/** Map a weight direction to the engine's FitnessGoal (nutrition phase). */
export function fitnessGoalForDirection(dir: WeightDirection): FitnessGoal {
  if (dir === "lose") return "cut";
  if (dir === "gain") return "lean bulk";
  return "recomp";
}

export interface GoalWeightPlan {
  direction: WeightDirection;
  fitnessGoal: FitnessGoal;
  /** Per-day calorie offset (negative = deficit, positive = surplus). */
  dailyOffset: number;
  /** Signed weekly rate actually applied (kg/week), 0 when maintaining. */
  effectiveRateKgPerWeek: number;
}

/**
 * Resolve the full nutrition plan from current weight, target weight, and a
 * desired (unsigned) weekly rate. The rate's sign is taken from the
 * direction, so callers pass a positive magnitude (e.g. 0.5) regardless of
 * lose/gain. Maintain forces rate + offset to 0.
 */
export function resolveGoalWeightPlan(args: {
  currentKg: number;
  targetKg: number;
  rateKgPerWeek: number;
  deadbandKg?: number;
}): GoalWeightPlan {
  const direction = directionForTarget(
    args.currentKg,
    args.targetKg,
    args.deadbandKg
  );
  const fitnessGoal = fitnessGoalForDirection(direction);
  if (direction === "maintain") {
    return {
      direction,
      fitnessGoal,
      dailyOffset: 0,
      effectiveRateKgPerWeek: 0,
    };
  }
  const magnitude = Math.abs(args.rateKgPerWeek);
  const signed = direction === "lose" ? -magnitude : magnitude;
  return {
    direction,
    fitnessGoal,
    dailyOffset: offsetFromWeeklyRate(signed),
    effectiveRateKgPerWeek: signed,
  };
}

// ── Shared persist recipe + the goal-reached offer ────────────────────────

/** The slice of UserProfile the goal-weight persist recipe reads. Structural,
 *  so tests and callers pass plain objects. */
export interface GoalWeightProfileInputs {
  weightKg?: number | null;
  heightCm?: number | null;
  age?: number | null;
  activityLevel?: ActivityLevel | null;
  sex?: "male" | "female" | null;
  goalWeightKg?: number | null;
  weeklyRateKg?: number | null;
  customCalorieTarget?: number | null;
  program?: { goal?: string; startWeight?: number; currentPhase?: string };
}

export interface GoalWeightPersistPayload {
  goalWeightKg: number;
  weeklyRateKg: number;
  program: { goal: FitnessGoal; startWeight: number; currentPhase: string };
  tdeeBase: number;
  targetCalories: number;
  targetProtein: number;
  targetCarbs: number;
  targetFat: number;
}

/**
 * The ONE recipe for persisting a goal-weight resolution to the profile.
 *
 * Extracted from SettingsNutrition's reactive-save effect so the
 * goal-reached prompt cannot drift from what Settings writes — the
 * tested-copy rule: two hand-maintained copies of "what does a goal change
 * persist?" is exactly how the e1b0296 / 4db6cb7 class of bug ships. Both
 * callers now compute the payload here; SettingsNutrition additionally
 * mirrors `programState.goal` (resolveProgramGoalMirror), which the
 * prompt's apply path reuses too.
 *
 * Derivation rules preserved exactly:
 * - the SIGNED effective rate is persisted (0 when maintaining), so
 *   downstream readers (adaptive-TDEE offset, onboarding parity) see the
 *   true direction;
 * - `customCalorieTarget` survives as targetCalories (manual override wins);
 * - program.startWeight / currentPhase carry forward, seeding from current
 *   weight / "base" only when absent.
 */
export function buildGoalWeightPersistPayload(args: {
  profile: GoalWeightProfileInputs;
  currentKg: number;
  targetKg: number;
  /** Unsigned magnitude — direction supplies the sign. */
  rateKgPerWeek: number;
}): {
  payload: GoalWeightPersistPayload;
  plan: GoalWeightPlan;
  /** The full TDEE computation, for display surfaces (bmr / deficit etc.). */
  tdee: TDEEResult;
} {
  const { profile, currentKg, targetKg, rateKgPerWeek } = args;
  const plan = resolveGoalWeightPlan({
    currentKg,
    targetKg,
    rateKgPerWeek,
  });
  const tdee = calculateTDEE(
    currentKg,
    profile.heightCm ?? 170,
    profile.age ?? 25,
    profile.activityLevel ?? "moderate",
    plan.fitnessGoal,
    profile.sex ?? "male",
    plan.dailyOffset
  );
  return {
    plan,
    tdee,
    payload: {
      goalWeightKg: targetKg,
      weeklyRateKg: plan.effectiveRateKgPerWeek,
      program: {
        goal: plan.fitnessGoal,
        startWeight: profile.program?.startWeight ?? currentKg,
        currentPhase: profile.program?.currentPhase ?? "base",
      },
      tdeeBase: tdee.targetCalories,
      targetCalories: profile.customCalorieTarget || tdee.targetCalories,
      targetProtein: tdee.protein,
      targetCarbs: tdee.carbs,
      targetFat: tdee.fat,
    },
  };
}

export interface GoalReachedOffer {
  /** The direction the user was travelling when they arrived. */
  storedDirection: "lose" | "gain";
  /** Their goal weight — the dismissal key, so a NEW goal re-asks. */
  goalWeightKg: number;
  /** Current (mirrored) weight the offer was computed against. */
  currentKg: number;
}

/**
 * Should Tropos offer "switch to maintenance" right now?
 *
 * The gap this closes (probe sweep, 2026-08-05, verifier-confirmed): the
 * direction was resolved ONLY inside a Settings/onboarding edit session, so
 * a cutter who reached their goal kept the full −550 offset indefinitely —
 * including through the adaptive-TDEE path, which re-applies the stale
 * signed rate to the learned maintenance estimate. MacroFactor and MFP both
 * surface a "goal reached" moment and ask; neither silently flips, and
 * neither silently keeps cutting. Asking — not auto-switching — is also
 * this repo's own standing rule (never silently rewrite a user decision).
 *
 * Fires only when:
 * - a real goal weight and a real current weight exist (the weigh-in mirror
 *   keeps `profile.weightKg` fresh, which is what makes this reliable);
 * - the STORED signed rate says they were cutting or gaining (rate 0 =
 *   already maintaining, nothing to offer);
 * - re-resolving direction at today's weight no longer agrees with the
 *   stored direction — arrived (deadband) or passed the goal.
 */
export function goalReachedOffer(
  profile: GoalWeightProfileInputs
): GoalReachedOffer | null {
  const currentKg = profile.weightKg ?? 0;
  const goalKg = profile.goalWeightKg ?? 0;
  const rate = profile.weeklyRateKg ?? 0;
  if (currentKg <= 0 || goalKg <= 0) return null;
  if (!Number.isFinite(rate) || rate === 0) return null;

  // The stored direction must be attested by BOTH signals when both exist.
  // Pre-NUTR-M2 profiles stored the rate UNSIGNED (always positive), so a
  // legacy cutter reads rate=+0.5 — sign alone would call them a bulker and
  // fire this prompt mid-cut. `program.goal` carries the phase the same
  // save wrote; when the two disagree (or the phase says recomp), the data
  // is ambiguous legacy state and the honest move is silence — the prompt's
  // failure direction is "never nag wrongly", and the next Settings save
  // re-signs the rate anyway.
  const rateDirection: "lose" | "gain" = rate < 0 ? "lose" : "gain";
  const phase = profile.program?.goal;
  const phaseDirection =
    phase === "cut" ? "lose" : phase === "lean bulk" ? "gain" : null;
  if (phaseDirection === null || phaseDirection !== rateDirection) return null;
  const storedDirection = rateDirection;

  const nowDirection = directionForTarget(currentKg, goalKg);
  if (nowDirection === storedDirection) return null; // still travelling

  return { storedDirection, goalWeightKg: goalKg, currentKg };
}

/**
 * The patch "Switch to maintenance" applies: maintain AT today's weight.
 *
 * The goal is re-anchored to the current weight — not left at the old
 * target — because the Settings surface reactively re-resolves direction
 * from (current, goal): leaving a goal 1.5 kg away would flip the user
 * straight back into a cut/surplus on their next Settings visit, silently
 * undoing the choice they just made here.
 */
export function buildMaintenancePayload(
  profile: GoalWeightProfileInputs
): GoalWeightPersistPayload | null {
  const currentKg = profile.weightKg ?? 0;
  if (currentKg <= 0) return null;
  const anchored = Math.round(currentKg * 10) / 10;
  return buildGoalWeightPersistPayload({
    profile,
    currentKg: anchored,
    targetKg: anchored,
    rateKgPerWeek: 0,
  }).payload;
}
