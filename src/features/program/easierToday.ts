/**
 * Easier today (PROGRAM-ADAPT-01) — a user-controlled reduced execution
 * of an existing programme day.
 *
 * The retention gap this closes: on a rough day the choice was the full
 * prescription or nothing. "Easier today" is a ONE-SESSION execution
 * option in the pre-session chooser: same exercises, same order, one
 * set less per lift, deload-policy loads — and it never touches the
 * stored programme, progression state or future weeks. The session that
 * happened is saved truthfully; the plan the user returns to tomorrow
 * is exactly the plan they left.
 *
 * Policy (deliberately conservative — no fake AI readiness):
 *   1. Exercise identity and ORDER are preserved — nothing is dropped,
 *      substituted or reordered. An easier day is the same session,
 *      lighter.
 *   2. Every exercise loses ONE set, floored at
 *      {@link EASIER_PRIMARY_MIN_SETS} for primaries/compounds
 *      (`isAccessory !== true` — the undefined-legacy rule matches
 *      expressSession: ambiguity protects) and
 *      {@link EASIER_ACCESSORY_MIN_SETS} for accessories.
 *   3. Non-zero suggested loads follow the EXISTING deload policy
 *      (programEngine.applyDeload's weight rule): ×0.85, rounded to the
 *      nearest 2.5 kg. Bodyweight/uncalibrated zero loads stay 0 — the
 *      set reduction is the whole signal.
 *   4. Recommendation ({@link easierTodayRecommendation}) is pure and
 *      deterministic, fired only from strong EXISTING signals, and
 *      gives one factual reason — never a readiness percentage. Full
 *      Plan remains the primary choice and is never auto-overridden.
 *
 * Privacy: the reason and the recovery inputs stay on this device — the
 * only persisted trace of an easier session is
 * `sessionVariant: "easier_today"` on the PRIVATE workout record
 * (users/{uid}/workouts). Nothing variant- or reason-shaped enters
 * social posts, notifications or analytics events.
 */

import type { ProgramExercise, WorkoutDay } from "./programTypes";
import { estimateSessionMinutes, type ExpressPlan } from "./expressSession";
import { primaryCanonicalForExercise } from "./volumeModel";
import type { MuscleRecoveryEntry } from "@/lib/muscleRecovery";

/** A primary/compound never goes below 2 sets on an easier day. */
export const EASIER_PRIMARY_MIN_SETS = 2;
/** An accessory never goes below 1 set (it is never dropped). */
export const EASIER_ACCESSORY_MIN_SETS = 1;

/**
 * The existing deload weight rule — MIRRORS programEngine.applyDeload
 * (×0.85, nearest 2.5 kg plate; zero stays zero). Pinned equal to
 * applyDeload by easierToday.test.ts so the two can't drift.
 */
export function deloadWeight(weight: number): number {
  return weight === 0 ? 0 : Math.round((weight * 0.85) / 2.5) * 2.5;
}

export interface EasierAdjustments {
  /** Exercises whose sets were reduced (floors can make this a no-op). */
  setsReduced: number;
  /** Exercises whose non-zero load was lowered. */
  loadsReduced: number;
}

export interface EasierPlan extends Omit<ExpressPlan, "trim"> {
  variant: "easier_today";
  adjustments: EasierAdjustments;
}

/**
 * Build the easier execution clone of a programme day. Pure +
 * deterministic; the input day is never mutated — the caller feeds the
 * clone into the live session exactly like an Express plan
 * (sourceIndexes is the identity mapping since nothing is dropped).
 */
export function buildEasierSession(day: WorkoutDay): EasierPlan {
  const adjustments: EasierAdjustments = { setsReduced: 0, loadsReduced: 0 };
  const exercises: ProgramExercise[] = day.exercises.map((ex) => {
    const floor =
      ex.isAccessory === true
        ? EASIER_ACCESSORY_MIN_SETS
        : EASIER_PRIMARY_MIN_SETS;
    const sets = Math.max(floor, ex.sets - 1);
    const weight = deloadWeight(ex.weight);
    if (sets !== ex.sets) adjustments.setsReduced += 1;
    if (weight !== ex.weight) adjustments.loadsReduced += 1;
    return { ...ex, sets, weight };
  });
  return {
    variant: "easier_today",
    exercises,
    sourceIndexes: exercises.map((_, i) => i),
    estimatedMinutes: estimateSessionMinutes(exercises),
    adjustments,
  };
}

/** Chooser copy for what the easier plan actually does — factual. */
export function summarizeEasier(plan: EasierPlan): string {
  const parts: string[] = [];
  if (plan.adjustments.setsReduced > 0) parts.push("one set less per lift");
  if (plan.adjustments.loadsReduced > 0) parts.push("lighter loads");
  return parts.length > 0 ? parts.join(", ") : "same session, no changes";
}

// ── Recommendation ───────────────────────────────────────────────

export interface EasierTodaySignals {
  /** Yesterday held a demanding run (shared isHardRun predicate). */
  hardRunYesterday: boolean;
  /** Today's session loads the lower body (knee/hip-dominant work). */
  lowerBodyDay: boolean;
  /** Day target muscles still "recovering" per muscleRecovery. */
  recoveringMuscles: string[];
  /** The performance engine's existing deload recommendation flag. */
  deloadRecommended: boolean;
}

export interface EasierTodayRecommendation {
  recommended: boolean;
  /** ONE factual reason — never a readiness percentage. Null when not
   *  recommended. */
  reason: string | null;
}

/**
 * Whether to mark "Easier today" as Recommended, from strong EXISTING
 * signals only. Pure + deterministic; first matching signal wins, in
 * specificity order. Deliberately NOT a readiness score — and it never
 * reads the performance recoveryScore (a retrospective weekly analytics
 * input, not a medical/readiness measure).
 */
export function easierTodayRecommendation(
  s: EasierTodaySignals
): EasierTodayRecommendation {
  if (s.hardRunYesterday && s.lowerBodyDay) {
    return {
      recommended: true,
      reason: "hard run yesterday, and this session loads the same legs",
    };
  }
  if (s.recoveringMuscles.length > 0) {
    const list =
      s.recoveringMuscles.length <= 2
        ? s.recoveringMuscles.join(" and ")
        : `${s.recoveringMuscles.slice(0, 2).join(", ")} and more`;
    return {
      recommended: true,
      reason: `${list} still recovering from recent training`,
    };
  }
  if (s.deloadRecommended) {
    return {
      recommended: true,
      reason: "your recent training week points to a deload",
    };
  }
  return { recommended: false, reason: null };
}

// ── Signal derivation helpers (pure — Program.tsx supplies the data) ──

/** A day "loads the lower body" when any exercise is knee- or
 *  hip-dominant. (The saved-doc `/leg|lower/` category test elsewhere
 *  never matched these values — key off movementCategory directly.) */
export function isLowerBodyDay(day: Pick<WorkoutDay, "exercises">): boolean {
  return day.exercises.some(
    (ex) =>
      ex.movementCategory === "knee_dominant" ||
      ex.movementCategory === "hip_dominant"
  );
}

/**
 * The day's target muscles that are still "recovering". Exercises
 * resolve to canonical muscles with the volume tally's own attribution
 * rule (`primaryCanonicalForExercise`: DB primary by exerciseId, else
 * the movement-category fallback for custom lifts) so this speaks the
 * identical muscle language as the recovery model. Only PRIMARY
 * involvement counts as a target.
 */
export function recoveringTargetMuscles(
  day: Pick<WorkoutDay, "exercises">,
  entries: MuscleRecoveryEntry[]
): string[] {
  const recovering = new Set(
    entries.filter((e) => e.status === "recovering").map((e) => e.muscle)
  );
  const out: string[] = [];
  for (const ex of day.exercises) {
    const primary = primaryCanonicalForExercise(ex);
    if (primary && recovering.has(primary) && !out.includes(primary)) {
      out.push(primary);
    }
  }
  return out;
}
