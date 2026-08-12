import {
  calculateTDEE,
  splitMacrosForTarget,
  proteinMultiplierForGoal,
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
  /** The full TDEE computation, for display surfaces (bmr / deficit etc.),
   *  resolved against the target actually IN FORCE — a manual
   *  `customCalorieTarget` replaces the formula target here, and the macro
   *  split follows it. This is what `payload` persists, so a display surface
   *  reading it cannot disagree with what was stored. */
  tdee: TDEEResult;
  /** The pre-override formula result, for the rare caller that needs the
   *  baseline rather than the effective target. Identical to `tdee` when no
   *  override is set. */
  formulaTdee: TDEEResult;
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
  /* A manual `customCalorieTarget` replaces the formula target, and the macro
     split has to follow it. It did not: `targetCalories` took the override
     while the grams stayed the formula's, so a user who pinned 1400 kcal had
     a profile storing 1400 alongside a triple summing to 2209 — 58% over —
     and Settings rendered the formula's 2209 as "Daily target" under a line
     reading "Manual target — you set this". Three surfaces, two numbers, and
     the one the user typed was on none of them.

     `effectiveTdee` is the same result recomputed at whatever target is
     actually in force, and is `tdee` itself when there is no override. `bmr`
     and `tdee` (maintenance) stay formula facts; `deficit` is restated
     against maintenance so it keeps meaning what it says. `tdeeBase` stays
     the FORMULA target deliberately — the adaptive engine treats it as the
     pre-override baseline. */
  const effectiveCalories = profile.customCalorieTarget || tdee.targetCalories;
  const effectiveTdee: TDEEResult =
    effectiveCalories === tdee.targetCalories
      ? tdee
      : {
          ...tdee,
          targetCalories: effectiveCalories,
          deficit: effectiveCalories - tdee.tdee,
          ...splitMacrosForTarget(
            effectiveCalories,
            currentKg,
            proteinMultiplierForGoal(plan.fitnessGoal)
          ),
        };

  return {
    plan,
    tdee: effectiveTdee,
    formulaTdee: tdee,
    payload: {
      goalWeightKg: targetKg,
      weeklyRateKg: plan.effectiveRateKgPerWeek,
      program: {
        goal: plan.fitnessGoal,
        startWeight: profile.program?.startWeight ?? currentKg,
        currentPhase: profile.program?.currentPhase ?? "base",
      },
      tdeeBase: tdee.targetCalories,
      targetCalories: effectiveTdee.targetCalories,
      targetProtein: effectiveTdee.protein,
      targetCarbs: effectiveTdee.carbs,
      targetFat: effectiveTdee.fat,
    },
  };
}

/**
 * The stored weekly rate, but ONLY when its sign is attested by the phase.
 *
 * Pre-NUTR-M2 profiles stored `weeklyRateKg` UNSIGNED (always positive), so a
 * legacy cutter reads `+0.5`. Sign alone calls them a bulker. `program.goal`
 * carries the phase the same save wrote, so the two together are checkable:
 * when they disagree — or when the phase is recomp, which should carry no
 * rate at all — the data is ambiguous legacy state and the rate cannot be
 * trusted for direction.
 *
 * Extracted because two consumers read this field and only one defended it.
 * `goalReachedOffer` has carried this rule since NUTR-M2; `goalCalorieOffset`
 * in `useAdaptiveTdee` passed the raw value straight to
 * `offsetFromWeeklyRate`, so a legacy cutter got a +550 kcal SURPLUS where
 * -550 was intended. `applyWeeklyCap` then walks the target up 150/week from
 * the formula figure, which is slow enough to look like the adaptive engine
 * working rather than a sign error.
 *
 * Returns null for absent / zero / non-finite rates too, so callers get one
 * "can I trust this?" question instead of four.
 */
export function attestedWeeklyRateKg(
  profile:
    | {
        weeklyRateKg?: number | null;
        program?: { goal?: string } | null;
      }
    | null
    | undefined
): number | null {
  const rate = profile?.weeklyRateKg ?? 0;
  if (!Number.isFinite(rate) || rate === 0) return null;
  const phase = profile?.program?.goal;
  const phaseDirection =
    phase === "cut" ? "lose" : phase === "lean bulk" ? "gain" : null;
  if (phaseDirection === null) return null;
  const rateDirection = rate < 0 ? "lose" : "gain";
  return phaseDirection === rateDirection ? rate : null;
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
  if (currentKg <= 0 || goalKg <= 0) return null;

  // The stored direction must be attested by BOTH signals — see
  // `attestedWeeklyRateKg`, which is where this rule now lives. Ambiguous
  // legacy state means silence here: the prompt's failure direction is
  // "never nag wrongly", and the next Settings save re-signs the rate.
  const rate = attestedWeeklyRateKg(profile);
  if (rate === null) return null;
  const storedDirection: "lose" | "gain" = rate < 0 ? "lose" : "gain";

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

/**
 * The payload for setting a MANUAL calorie override outside the goal-weight
 * recipe — currently the plateau nudge in `StallModal`.
 *
 * It lives here, next to `buildGoalWeightPersistPayload`, because it applies
 * that function's hard-won rule and must not drift from it. That rule is
 * written out at the `effectiveTdee` block above: a manual
 * `customCalorieTarget` replaces the formula target AND THE MACRO SPLIT HAS
 * TO FOLLOW IT. The comment there records what happens otherwise — "a user
 * who pinned 1400 kcal had a profile storing 1400 alongside a triple summing
 * to 2209 — 58% over".
 *
 * StallModal reintroduced exactly that by writing `customCalorieTarget`
 * alone. Nothing derives the mirrors from it: `updateProfile` persists the
 * patch verbatim, and the only site that mirrors an override into
 * `targetCalories` + the grams is the goal-weight recipe, reachable only
 * from Settings → Nutrition and the Home goal-reached prompt. So the modal's
 * write left `targetCalories` and all three macro targets on their previous
 * values, and — because a manual override is what switches adaptive calories
 * OFF — dropped the displayed target back to the stale
 * `profile.targetCalories`. A user on an engaged adaptive target of 2919
 * tapped "+150" and watched their target become 2500, under a toast reading
 * "Calorie target increased by 150".
 *
 * `useAdaptiveTdee` states the invariant this restores, at the line that
 * reads the field: "Formula target = the stored base (already
 * customCalorieTarget || formula)". That is only true while every writer of
 * an override also writes the mirror.
 *
 * The macro split is recomputed at the new target through the same
 * `splitMacrosForTarget` + `proteinMultiplierForGoal` pair the recipe uses,
 * so the grams agree with the calories by construction rather than by
 * anyone remembering to update them.
 */
export function buildCalorieOverridePayload(args: {
  profile: GoalWeightProfileInputs;
  /** The manual target to pin, in kcal. Rounded and floored at 0. */
  overrideCalories: number;
}): {
  customCalorieTarget: number;
  targetCalories: number;
  targetProtein: number;
  targetCarbs: number;
  targetFat: number;
} {
  const { profile, overrideCalories } = args;
  const calories = Math.max(0, Math.round(overrideCalories));
  const weightKg = profile.weightKg ?? 70;
  const goal = (profile.program?.goal as FitnessGoal) ?? "recomp";
  const macros = splitMacrosForTarget(
    calories,
    weightKg,
    proteinMultiplierForGoal(goal)
  );
  return {
    customCalorieTarget: calories,
    targetCalories: calories,
    targetProtein: macros.protein,
    targetCarbs: macros.carbs,
    targetFat: macros.fat,
  };
}
