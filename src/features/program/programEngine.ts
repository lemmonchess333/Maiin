import type {
  Experience,
  Goal,
  GoalProfile,
  MovementCategory,
  PrimaryGoal,
  ProgramExercise,
  ProgramState,
  SplitType,
  WorkoutDay,
  WeeklyPrescription,
} from "./programTypes";
import { generateInstanceId } from "./programTypes";
import {
  pickExercise,
  pickAccessory,
  exerciseBank,
  exerciseDisplayName,
  CATALOGUE_PINNED_ACCESSORY_IDS,
  rescaleForSwap,
} from "./variationBank";
import { inferMovementCategory } from "@/lib/exerciseMovementCategory";
import {
  applyRecoverySession,
  escalatesToWholeBody,
  musclesAtMrv,
  recoveryTargets,
} from "./recoveryTrigger";
import {
  balanceWeeklyVolume,
  balancePushPull,
  judgementLandmark,
  reconcileToLandmarks,
} from "./volumeModel";
import {
  seedStartingLoads,
  weightAfterExerciseSwap,
  type StartingLoadContext,
} from "./startingLoads";
import {
  countPlateauedExercises,
  resolveAdjustment,
  PROGRAMME_PLATEAU_MIN,
  type AdjustmentAction,
  type RecoveryState,
} from "./adjustmentRule";
import {
  usesMicroplateStep,
  MICROPLATE_STEP,
  PLATE_PAIR_STEP,
} from "./movementClass";
import {
  capRepeatedLifts,
  lowCostAlternative,
  orderForAdjacency,
  surplusExposures,
} from "./overlapModel";
import { applyComplexityGate, usesUndulation } from "./experienceModel";
import { isBodyweightExerciseId } from "@/lib/exercises";
import { format } from "date-fns";

/* ================================
   GOAL PROFILE — maps PrimaryGoal → rep ranges / volume / progression
   ================================
   Reconciles the two-enum drift that existed before W1a: the procedural
   engine only consumed the nutrition `Goal` (cut/lean bulk/recomp) and
   hardcoded main-lift reps at 6, so a user whose `primaryGoal = "strength"`
   silently received hypertrophy reps on every regenerate. `goalProfileFor`
   is the single seam where lifting stimulus now tracks what the user
   actually asked for in onboarding.
*/

const GOAL_PROFILES: Record<PrimaryGoal, GoalProfile> = {
  strength: {
    mainReps: 5,
    mainRepsMax: 7,
    accessoryReps: 8,
    accessoryRepsMax: 12,
    volumeMultiplier: 0.9,
    mainProgression: "linear",
  },
  hypertrophy: {
    mainReps: 8,
    mainRepsMax: 12,
    accessoryReps: 12,
    accessoryRepsMax: 15,
    volumeMultiplier: 1.0,
    mainProgression: "double",
  },
  /**
   * A deficit is a phase to PRESERVE through, not a reason to train light.
   *
   * This row used to read 12-15 / 15-20 — the "high reps to get lean" idea,
   * and it inverts the principle the project's own corpus states. Fleck &
   * Kraemer p.179, quoted in `lifting-v8-evaluation.md` §3.12: "To maintain
   * strength gains the INTENSITY should be maintained, but the volume and
   * frequency of training can be reduced." The old row did the reverse — it
   * dropped intensity and held volume at 1.0.
   *
   * Being precise about what the evidence does and does not say, because the
   * obvious framing overstates it:
   *
   *   - Schoenfeld et al. 2017 (JSCR meta): hypertrophy is SIMILAR across
   *     load ranges when sets are taken near failure. So 12-15 was never
   *     wrong for holding muscle, and calling it a myth outright would be.
   *   - The same meta: maximal strength significantly favours HEAVY loads.
   *     Strength is load-specific, and a cut is exactly when you are trying
   *     not to lose it.
   *   - Roth et al. 2023 (Scand J Med Sci Sports): resistance-training VOLUME
   *     does not influence lean-mass preservation during energy restriction.
   *     Which is why the volume half of this is deliberately untouched — see
   *     `goalVolumeMultiplier` below.
   *
   * So: same mains as `general` (8-12), and the accessories come with them.
   * Nothing here is a fat-loss-specific stimulus, because there is no such
   * thing — the deficit does the fat loss, the training protects what is
   * under it.
   */
  fat_loss: {
    mainReps: 8,
    mainRepsMax: 12,
    accessoryReps: 12,
    accessoryRepsMax: 15,
    volumeMultiplier: 1.0,
    mainProgression: "linear",
  },
  general: {
    mainReps: 8,
    mainRepsMax: 12,
    accessoryReps: 12,
    accessoryRepsMax: 15,
    volumeMultiplier: 1.0,
    mainProgression: "double",
  },
  /**
   * A runner lifts HEAVY and briefly. The mains are a strength prescription;
   * the low `volumeMultiplier` is what keeps it from competing with the run
   * training.
   *
   * This row used to read 8-12 with the note "matches the fullBodyBeginner
   * prescription: moderate reps, lower volume" — a justification taken from a
   * template rather than from the outcome a runner lifts for. The evidence
   * runs the other way, and it is specific about the band:
   *
   *   Llanos-Lagos et al. 2024 (Sports Medicine 54:1801-1833) — a systematic
   *   review + meta-analysis of strength methods in middle- and long-distance
   *   runners. High load is defined as >=80% 1RM, submaximal as 40-79%. High
   *   load improved running economy across 8.64-17.85 km/h and time-trial
   *   performance; SUBMAXIMAL LOAD DID NOT IMPROVE RUNNING ECONOMY AT ALL,
   *   and neither did isometric work. Combining high load with plyometrics
   *   was better still.
   *
   * 8-12 reps is roughly 70-80% 1RM — the submaximal band the meta found
   * ineffective for the one adaptation a runner is chasing. 4-6 is ~85-90%.
   *
   * Undulation keeps the whole week inside the band rather than straddling
   * it: `repDeltaForRole` shifts heavy days -2 (clamped at the rep floor of
   * 3, so 3-5 ~= 87-93%) and pump days +2 (6-8 ~= 80-85%). Both ends clear
   * 80%, which the old 8-12 band did not.
   *
   * `mainProgression` stays "linear" deliberately: the linear arm adds load
   * at `actualReps >= reps + 2`, which at a 4-rep target is exactly the top
   * of the 4-6 band. The rep range is the trigger, not decoration.
   *
   * NOTE the load half is what actually delivers this — see
   * `startingLoads.repScaledSeed`. Fewer reps at an unchanged weight is a
   * strictly easier session, so this row on its own would have inverted its
   * own rationale.
   */
  running: {
    mainReps: 4,
    mainRepsMax: 6,
    accessoryReps: 10,
    accessoryRepsMax: 12,
    volumeMultiplier: 0.85,
    mainProgression: "linear",
  },
};

export function goalProfileFor(primaryGoal?: PrimaryGoal): GoalProfile {
  return GOAL_PROFILES[primaryGoal ?? "general"];
}

// Progression tuning (D-LIFT-6 / D-LIFT-11).
/** A logged set at this RPE or above holds load/reps for the cycle. */
const RPE_HOLD_THRESHOLD = 9.5;
/** Bodyweight rep target stops climbing here; the user is prompted to add load. */
const MAX_BODYWEIGHT_REPS = 20;
/**
 * Ceilings the GENERATOR will not prescribe past (2026-07-28 audit).
 *
 * `applyDayRoles` shifts a pump day +2 reps with a floor and no ceiling, and
 * the final pass then stamps `repRangeMax = reps + span`. On the higher-rep
 * goal profiles the two compounded into prescriptions nobody would write:
 * `Pull-Ups 3×17-22`, `Barbell Squat 4×17-20`, `Deadlift 3×15-20`.
 *
 * 20 is not a new number — `MAX_BODYWEIGHT_REPS` above is already the point
 * where the progression engine stops adding reps and tells the user to add
 * load. Prescribing past it asks for something the app's own advice says to
 * stop doing. Bodyweight lifts stop earlier still: they cannot be loaded
 * DOWN, so a high-rep target is the wrong tool rather than a hard one, and a
 * beginner handed 17-rep pull-ups simply cannot start the set.
 */
const MAX_PRESCRIBED_REPS = MAX_BODYWEIGHT_REPS;
const MAX_PRESCRIBED_BODYWEIGHT_REPS = 15;

/**
 * Highest rep target the generator may prescribe for this exercise.
 *
 * Exported for `represcribe.ts` (Blk2), which re-derives a whole week's
 * prescription for a new training focus without going near a builder. It
 * has to clamp exactly as generation does or a block could hand out the
 * `Pull-Ups 3×17-22` this ceiling exists to prevent.
 */
export function prescribedRepCeiling(ex: {
  exerciseId?: string;
  repUnit?: string;
}): number {
  // Timed holds count seconds, not reps — a 30-45s plank is not a 30-rep set.
  if (ex.repUnit === "seconds") return Number.POSITIVE_INFINITY;
  return isBodyweightExerciseId(ex.exerciseId)
    ? MAX_PRESCRIBED_BODYWEIGHT_REPS
    : MAX_PRESCRIBED_REPS;
}
/** Timed holds climb in 5-second steps (N2's time axis). */
const HOLD_STEP_SECONDS = 5;
/** Ceiling for a hold with no authored range — past this, add load instead. */
const MAX_HOLD_SECONDS = 60;

/**
 * Per-exercise `performanceHistory` ceiling.
 *
 * D2: this was `.slice(-10)` here and in the server mirror, but `.slice(-20)`
 * on `useProgram`'s block-amnesty branch — so how much history a lifter kept
 * silently depended on whether a training block happened to be holding
 * progression that week. Exported so the three sites share one number.
 *
 * NOT raised to cover the multi-week phenomena the lifting arc cares about
 * (interference takes ~8 weeks to appear, periodisation diverges after ~6),
 * even though 10 sessions is plainly shorter than that. The reason is
 * document size, not principle: `advanceWeek` snapshots the WHOLE `workouts`
 * array into `weekHistory` and keeps 8 of them, so every record here is
 * multiplied ~9× inside one programState doc — and
 * `programStateTooLarge` rejects the command outright past its ceiling.
 * Raising it needs that size analysis first.
 *
 * It is also less urgent than it looks: the durable evidence now lives in the
 * per-session workout documents, which are uncapped (D2). This array is a
 * convenience cache on programState, not the record of truth.
 */
export const PERFORMANCE_HISTORY_CAP = 10;
// Load step (backlog #7, H3) — the discriminator lives in movementClass.ts;
// see that module for why `isAccessory` was the wrong one.

/* ================================
   WEEKLY PRESCRIPTION
================================ */

/**
 * The mesocycle position of a week. Every 4th week is a deload.
 *
 * This used to also return `intensityMultiplier` (`1 + (week % 4) * 0.025`,
 * i.e. an advertised 2.5%/week intensity ramp) and `volumeModifier`. Both were
 * written here and read NOWHERE — not in `src/`, not in `functions/`, not by
 * `advanceWeek`, which branches only on `.deload`. The ramp did not exist as
 * behaviour, so the whole "periodization" was already this one boolean; the
 * two fields only made it look like more.
 *
 * Deleted rather than wired, because wiring them would change every user's
 * prescription and none of the sources support that particular shape:
 * Schoenfeld p.193 (systematic review of 12 studies — no clear benefit to
 * periodizing for HYPERTROPHY; it is established for strength), p.194 (linear
 * and undulating equivalent across a meta-analysis plus 8 primary studies),
 * Helms p.79 ("asking 'which type of periodization is the best?' is the wrong
 * question"). A mod-4 intensity ramp is not a finding, it is a decoration.
 *
 * Safe to delete outright: `WeeklyPrescription` is computed on demand at each
 * call site and never persisted — `advanceWeek` stores only the derived
 * `currentPhase` string — so there is no stored document carrying these
 * fields and no sanitiser allow-list to update.
 */
export function generateWeekPrescription(week: number): WeeklyPrescription {
  return { week, deload: week % 4 === 0 };
}

/**
 * A mesocycle ends on its deload week — completing that week means the user
 * finished a full 4-week programme cycle (drives the `programme_complete`
 * badge). Derives the answer from `generateWeekPrescription` so it can never
 * drift from the periodization schedule itself (don't re-hardcode `% 4`).
 */
export function isCycleEndWeek(week: number): boolean {
  return week > 0 && generateWeekPrescription(week).deload;
}

/* ================================
   GOAL ADJUSTMENTS
================================ */

function goalVolumeMultiplier(goal: Goal): number {
  switch (goal) {
    case "cut":
      return 0.9;
    case "lean bulk":
      return 1.12;
    case "recomp":
      return 1.0;
  }
}

function goalWeightBonus(goal: Goal): number {
  switch (goal) {
    case "lean bulk":
      return 1.25;
    default:
      return 0;
  }
}

/* ================================
   SPLIT SELECTION
================================ */

export function chooseSplit(weeklyTarget: number): SplitType {
  if (weeklyTarget <= 0) return "full_body"; // run-only athlete — no lift days
  // Cap at 6. 7 hard lift days/week is the wrong default for every tier
  // (beginner through advanced) — recovery needs at least one non-lift
  // slot. If a user sets 7, we return the 6-day split and the scheduler
  // fills the 7th weekday as active rest / mobility.
  const clamped = Math.min(6, weeklyTarget);
  if (clamped === 1) return "full_body";
  // 2-day is full-body for the same frequency reason as 3-day below — an
  // upper/lower pair trains every muscle ONCE a week (the 2026-08-03
  // coach-read audit measured it: 1×/week for all 13 judgement groups
  // except upper back), which is the exact 1×-vs-2× gap Schoenfeld 2016
  // found inferior at matched volume. Every reference 2-day prescription
  // (full-body A/B — Starting Strength, Helms' pyramid, RP's minimums) is
  // full-body; upper/lower only reaches 2×/muscle from 4 days up.
  if (clamped === 2) return "full_body";
  // 3-day full-body beats 3-day PPL for hypertrophy (2× weekly frequency
  // > 1×, Schoenfeld 2016 at matched volume). Pre-W1a the procedural
  // engine returned "ppl" here, silently contradicting the 3-day
  // full-body hand-written templates.
  if (clamped === 3) return "full_body";
  if (clamped === 4) return "upper_lower";
  if (clamped === 5) return "ppl_ul";
  return "ppl_x2";
}

export function splitLabel(split: SplitType): string {
  switch (split) {
    case "full_body":
      return "Full Body";
    case "upper_lower":
      return "Upper / Lower";
    case "ppl":
      return "Push / Pull / Legs";
    case "ppl_ul":
      return "Push / Pull / Legs + Upper / Lower";
    case "ppl_x2":
      return "Push / Pull / Legs ×2";
    case "ppl_x2_fb":
      return "Push / Pull / Legs ×2 + Full Body";
  }
}

/**
 * D-LIFT-7: the one-line "why" behind the days→split mapping, so the derived
 * split (Pgm5 Q1: structure follows lift-days, not a user toggle) reads as a
 * deliberate coaching choice rather than an ignored preference. Mirrors
 * `chooseSplit`; the thread is weekly per-muscle FREQUENCY.
 */
export function splitRationale(weeklyLiftDays: number): string {
  const d = Math.min(6, Math.max(0, Math.round(weeklyLiftDays)));
  switch (d) {
    case 0:
      return "No lift days set — add some to build a split.";
    case 1:
      return "One day a week is full-body so you still train everything.";
    case 2:
      return "Two days runs full-body twice — every muscle hit both sessions instead of once a week.";
    case 3:
      return "Three days stays full-body: every muscle 3× a week beats a 3-way split at the same volume.";
    case 4:
      return "Four days is upper / lower twice — each muscle about twice a week.";
    case 5:
      return "Five days layers push/pull/legs onto upper/lower to keep most muscles near 2× a week.";
    default:
      return "Six days runs push/pull/legs twice — each muscle about twice a week.";
  }
}

export function primaryGoalLabel(g?: PrimaryGoal): string {
  switch (g) {
    case "strength":
      return "Strength";
    case "hypertrophy":
      return "Hypertrophy";
    case "fat_loss":
      return "Fat Loss";
    case "general":
      return "General Fitness";
    case "running":
      return "Running Support";
    default:
      return "General Fitness";
  }
}

/* ================================
   EXERCISE BUILDER HELPER
================================ */

/**
 * Build a programme exercise from the PRIMARY variation pool, preserving an
 * existing row's load/history/instanceId across a regenerate.
 *
 * `isAccessory` is a VOLUME ROLE, not a movement class (movementClass.ts) —
 * it marks the slots the volume machinery may adjust: #5's ramp, #9's
 * add/reduce arms, and `balanceWeeklyVolume`'s under-dosed-muscle top-up.
 * `buildFullBody` needs to mark supporting slots WITHOUT `makeAccessory`,
 * which re-picks from the non-primary pool and can't carry `existing` —
 * using it there would rewrite users' exercises and wipe their logged loads
 * on every regenerate. Hence the parameter (backlog #15).
 *
 * `existing` is only carried when it is the SAME MOVEMENT. The builders find
 * it positionally (`findExisting(dayIdx, exIdx)`), which assumes the saved
 * plan's slots line up with the ones being built — true for a
 * generated→generated regenerate, and false for anyone whose plan came from a
 * TEMPLATE. Measured 2026-07-28 on a template user's first settings change:
 * `Bench Press@100 [from Barbell Squat]`, `Pull-Ups@106 [from Deadlift]` —
 * a deadlift's load landed on a bodyweight pull-up. The category check makes
 * the corruption impossible; a slot with no same-movement predecessor falls
 * back to defaults and is then seeded, which loses a load but never lies
 * about one. (`carryExistingAccessories` has always guarded this way.)
 */
function makeExercise(
  category: MovementCategory,
  sets: number,
  reps: number,
  weight: number,
  progression: "double" | "linear",
  existingAtSlot?: ProgramExercise,
  isAccessory = false
): ProgramExercise {
  const existing =
    existingAtSlot?.movementCategory === category ? existingAtSlot : undefined;
  const currentOption =
    existing && (existing.plateauCount ?? 0) < 3
      ? (exerciseBank[category] ?? []).find(
          (option) => option.id === existing.exerciseId
        )
      : undefined;
  // Keep a valid, non-stalled carried variation stable. `makeExercise` does
  // not receive the user's experience, so asking `pickExercise` to validate
  // it here applies the default intermediate gate and silently turns an
  // advanced specialist lift back into the primary on the next regeneration.
  // The experience-aware post-pass below owns downgrades and will still
  // replace this row if the user's level no longer permits it.
  const ex =
    currentOption ??
    pickExercise(category, existing?.plateauCount ?? 0, existing?.exerciseId);
  const identityChanged =
    existing !== undefined && existing.exerciseId !== ex.id;
  const w = identityChanged
    ? weightAfterExerciseSwap(existing, ex.id).weight
    : (existing?.weight ?? weight);
  return {
    name: exerciseDisplayName(ex.id),
    exerciseId: ex.id,
    instanceId:
      existing && !identityChanged ? existing.instanceId : generateInstanceId(), // #1038
    movementCategory: category,
    sets,
    reps,
    baseReps: reps,
    weight: w,
    progressionType: progression,
    lastSuccessfulWeight:
      existing && !identityChanged ? existing.lastSuccessfulWeight : w,
    lastAttemptedWeight:
      existing && !identityChanged ? existing.lastAttemptedWeight : w,
    consecutiveFailures:
      existing && !identityChanged ? existing.consecutiveFailures : 0,
    plateauCount: existing && !identityChanged ? existing.plateauCount : 0,
    performanceHistory:
      existing && !identityChanged ? existing.performanceHistory : [],
    lastPerformance:
      existing && !identityChanged ? existing.lastPerformance : null,
    isAccessory,
  };
}

function swapExerciseIdentity(
  ex: ProgramExercise,
  // Id only. The display name comes from the catalogue (11b) — a caller that
  // also happens to hold a name must not be able to write a different one.
  to: { id: string },
  loadCtx?: StartingLoadContext,
  calibrationSource: ProgramExercise = ex
): ProgramExercise {
  if (ex.exerciseId === to.id) return ex;
  const calibrated = weightAfterExerciseSwap(calibrationSource, to.id, loadCtx);
  return {
    ...ex,
    exerciseId: to.id,
    name: exerciseDisplayName(to.id),
    instanceId: generateInstanceId(),
    movementCategory: calibrated.movementCategory,
    weight: calibrated.weight,
    lastSuccessfulWeight: calibrated.weight,
    lastAttemptedWeight: calibrated.weight,
    consecutiveFailures: 0,
    plateauCount: 0,
    performanceHistory: [],
    lastPerformance: null,
    // A one-shot swap IS a calibration (properly rescaled above), so the
    // rotation anchor moves with it — future rotations scale from this
    // identity/weight pair, not from whatever preceded the swap.
    ...(calibrated.weight > 0
      ? {
          rotationAnchor: { exerciseId: to.id, weight: calibrated.weight },
        }
      : {}),
  };
}

function makeAccessory(
  category: MovementCategory,
  sets: number,
  reps: number,
  weight: number,
  excludeId?: string
): ProgramExercise {
  const ex = pickAccessory(category, excludeId);
  return {
    name: ex.name,
    exerciseId: ex.id,
    instanceId: generateInstanceId(), // #1038
    movementCategory: category,
    sets,
    reps,
    baseReps: reps,
    weight,
    // Backlog #7 (H3): isolations progress by REPS, not load — `isAccessory`
    // is exactly Helms's compound/isolation discriminator. The rep range that
    // makes this meaningful is stamped in generateProgram's final pass. This
    // also retires a runaway: the linear branch's `microloading` case added
    // 1 kg per completed session with no rep requirement, which on an 8 kg
    // lateral raise is a 12% jump every workout.
    progressionType: "double",
    lastSuccessfulWeight: weight,
    lastAttemptedWeight: weight,
    consecutiveFailures: 0,
    plateauCount: 0,
    performanceHistory: [],
    lastPerformance: null,
    isAccessory: true,
  };
}

/**
 * An accessory slot pinned to a SPECIFIC catalogue exercise rather than drawn
 * from the variation bank's category rotation.
 *
 * Exists for muscles the bank cannot reach: the bank groups by movement
 * pattern, and calves have no pattern of their own (the four calf raises are
 * decreed `knee_dominant` in exerciseMovementCategory.ts, but putting them in
 * that bank pool would offer a calf raise as a SQUAT swap). Measured before
 * this helper existed: every goal × day-count combination produced 0 direct
 * calf sets — below maintenance volume everywhere, i.e. the generated
 * programmes were literally atrophying calves by RP's own landmark model,
 * because `balanceWeeklyVolume` is add-only and had no calf slot to grow.
 *
 * State carry across regenerates is positional, same as every accessory —
 * `carryExistingAccessories` matches on (dayIndex, exIndex, category), so
 * these slots must be appended at stable positions (the END of a day).
 */
function makeNamedAccessory(
  exerciseId: string,
  sets: number,
  reps: number,
  weight: number
): ProgramExercise {
  return {
    name: exerciseDisplayName(exerciseId),
    exerciseId,
    instanceId: generateInstanceId(),
    movementCategory: inferMovementCategory(
      exerciseDisplayName(exerciseId),
      exerciseId
    ),
    sets,
    reps,
    baseReps: reps,
    weight,
    progressionType: "double",
    lastSuccessfulWeight: weight,
    lastAttemptedWeight: weight,
    consecutiveFailures: 0,
    plateauCount: 0,
    performanceHistory: [],
    lastPerformance: null,
    isAccessory: true,
  };
}

/* ================================
   SPLIT TEMPLATES
================================ */

/**
 * Builder-local volume multiplier — combines lifting-goal stimulus
 * (profile.volumeMultiplier: cut keeps volume steady, running-supportive
 * lifters drop 15%) with nutrition-phase modulation (cut -10%, lean bulk
 * +12%). Both are legitimate independent axes; they compound.
 */
function combinedVolumeMultiplier(
  profile: GoalProfile,
  nutritionGoal: Goal
): number {
  return profile.volumeMultiplier * goalVolumeMultiplier(nutritionGoal);
}

function buildFullBody(
  profile: GoalProfile,
  nutritionGoal: Goal,
  count: number,
  existing?: WorkoutDay[]
): WorkoutDay[] {
  const vm = combinedVolumeMultiplier(profile, nutritionGoal);
  const round = (n: number) => Math.max(1, Math.round(n));
  const findExisting = (dayIdx: number, exIdx: number) =>
    existing?.[dayIdx]?.exercises[exIdx];
  const main = profile.mainReps;
  const acc = profile.accessoryReps;

  const dayA: WorkoutDay = {
    dayName: "Full Body — Squat Focus",
    dayType: "full_body",
    completed: false,
    exercises: [
      makeExercise(
        "horizontal_push",
        round(3 * vm),
        main,
        60,
        profile.mainProgression,
        findExisting(0, 0)
      ),
      makeExercise(
        "knee_dominant",
        round(3 * vm),
        main,
        80,
        profile.mainProgression,
        findExisting(0, 1)
      ),
      makeExercise(
        "vertical_pull",
        round(3 * vm),
        acc,
        0,
        profile.mainProgression,
        findExisting(0, 2),
        true
      ),
      makeExercise(
        "hip_dominant",
        round(3 * vm),
        acc,
        60,
        "linear",
        findExisting(0, 3),
        true
      ),
      makeExercise(
        "core",
        round(2 * vm),
        12,
        15,
        "linear",
        findExisting(0, 4),
        true
      ),
      // Direct calf work — the bank has no calves category, so this is a
      // named slot (see makeNamedAccessory). Appended LAST: positions of the
      // slots above feed findExisting and must not shift.
      makeNamedAccessory("standing-calf-raise", round(2 * vm), 12, 40),
    ],
  };

  if (count === 1) return [dayA];

  const dayB: WorkoutDay = {
    dayName: "Full Body — Deadlift Focus",
    dayType: "full_body",
    completed: false,
    exercises: [
      makeExercise(
        "vertical_push",
        round(3 * vm),
        main,
        40,
        profile.mainProgression,
        findExisting(1, 0)
      ),
      makeExercise(
        "hip_dominant",
        round(3 * vm),
        main,
        80,
        profile.mainProgression,
        findExisting(1, 1)
      ),
      makeExercise(
        "horizontal_pull",
        round(3 * vm),
        acc,
        50,
        profile.mainProgression,
        findExisting(1, 2),
        true
      ),
      makeExercise(
        "knee_dominant",
        round(3 * vm),
        acc,
        60,
        "linear",
        findExisting(1, 3),
        true
      ),
      makeExercise(
        "arms_biceps",
        round(2 * vm),
        12,
        10,
        "linear",
        findExisting(1, 4),
        true
      ),
    ],
  };

  if (count === 2) {
    // A 2-day week never sees day C's seated raise, leaving calves one
    // ~3-set slot — under even the calf-specific maintenance floor. Give
    // day B the soleus-biased partner directly, at the 3-base the
    // upper/lower builders use: the balancer can't top this week up later
    // (both sessions run at the session-size guard). Appended LAST
    // (positions above feed findExisting); only for count 2, so the 3-day
    // rotation keeps its A-standing / C-seated split unchanged.
    return [
      dayA,
      {
        ...dayB,
        exercises: [
          ...dayB.exercises,
          makeNamedAccessory("seated-calf-raise", round(3 * vm), 15, 30),
        ],
      },
    ];
  }

  // 3 days — add a posterior-emphasis day to complete the rotation
  const dayC: WorkoutDay = {
    dayName: "Full Body — Posterior Focus",
    dayType: "full_body",
    completed: false,
    exercises: [
      makeExercise(
        "hip_dominant",
        round(3 * vm),
        main,
        80,
        profile.mainProgression,
        findExisting(2, 0)
      ),
      makeExercise(
        "horizontal_push",
        round(3 * vm),
        acc,
        60,
        profile.mainProgression,
        findExisting(2, 1),
        true
      ),
      makeExercise(
        "vertical_pull",
        round(3 * vm),
        acc,
        0,
        profile.mainProgression,
        findExisting(2, 2),
        true
      ),
      makeExercise(
        "knee_dominant",
        round(3 * vm),
        acc,
        60,
        "linear",
        findExisting(2, 3),
        true
      ),
      makeExercise(
        "core",
        round(2 * vm),
        12,
        15,
        "linear",
        findExisting(2, 4),
        true
      ),
      // Soleus-biased partner to day A's standing raise (bent knee shifts
      // the load — same split the hand-authored templates use).
      makeNamedAccessory("seated-calf-raise", round(2 * vm), 15, 30),
    ],
  };

  return [dayA, dayB, dayC];
}

function buildUpperLower(
  profile: GoalProfile,
  nutritionGoal: Goal,
  existing?: WorkoutDay[]
): WorkoutDay[] {
  const vm = combinedVolumeMultiplier(profile, nutritionGoal);
  const round = (n: number) => Math.max(1, Math.round(n));
  const findExisting = (dayIdx: number, exIdx: number) =>
    existing?.[dayIdx]?.exercises[exIdx];
  const main = profile.mainReps;
  const acc = profile.accessoryReps;

  return [
    {
      dayName: "Upper — Chest & Back",
      dayType: "upper",
      completed: false,
      exercises: [
        makeExercise(
          "horizontal_push",
          round(4 * vm),
          main,
          60,
          profile.mainProgression,
          findExisting(0, 0)
        ),
        makeExercise(
          "horizontal_pull",
          round(4 * vm),
          main,
          60,
          profile.mainProgression,
          findExisting(0, 1)
        ),
        makeExercise(
          "vertical_push",
          round(3 * vm),
          acc,
          30,
          "linear",
          findExisting(0, 2)
        ),
        makeExercise(
          "arms_biceps",
          round(3 * vm),
          12,
          12,
          "double",
          findExisting(0, 3),
          true
        ),
        makeExercise(
          "arms_triceps",
          round(3 * vm),
          12,
          15,
          "double",
          findExisting(0, 4),
          true
        ),
      ],
    },
    {
      dayName: "Lower — Squat Focus",
      dayType: "lower",
      completed: false,
      exercises: [
        makeExercise(
          "knee_dominant",
          round(4 * vm),
          main,
          80,
          profile.mainProgression,
          findExisting(1, 0)
        ),
        makeExercise(
          "hip_dominant",
          round(4 * vm),
          main,
          80,
          profile.mainProgression,
          findExisting(1, 1)
        ),
        makeAccessory("knee_dominant", round(3 * vm), 12, 40, "squat"),
        makeExercise(
          "core",
          round(3 * vm),
          12,
          15,
          "double",
          findExisting(1, 3),
          true
        ),
        // Direct calf work (named slot — see makeNamedAccessory). Appended
        // last so the findExisting positions above stay valid.
        makeNamedAccessory("standing-calf-raise", round(3 * vm), 12, 40),
      ],
    },
    {
      dayName: "Upper — Shoulders & Arms",
      dayType: "upper",
      completed: false,
      exercises: [
        makeExercise(
          "vertical_push",
          round(4 * vm),
          main,
          40,
          profile.mainProgression,
          findExisting(2, 0)
        ),
        makeExercise(
          "vertical_pull",
          round(4 * vm),
          main,
          0,
          profile.mainProgression,
          findExisting(2, 1)
        ),
        makeAccessory("horizontal_push", round(3 * vm), acc, 30, "bench-press"),
        // Arm isolation runs at the 2-base here, not the 3-base day A uses:
        // this day funds the lateral-raise slot below inside the 18-set
        // session budget (generatorAudit pins it), and arms already take
        // their heavier dose on Upper A.
        makeExercise(
          "arms_biceps",
          round(2 * vm),
          12,
          10,
          "double",
          findExisting(2, 3),
          true
        ),
        makeExercise(
          "arms_triceps",
          round(2 * vm),
          12,
          12,
          "double",
          findExisting(2, 4),
          true
        ),
        // Direct side-delt work (named slot — see makeNamedAccessory). The
        // 2026-08-03 coach-read audit measured 0 side-delt sets across every
        // goal × day-count: presses credit the FRONT delt, the bank has no
        // raise pattern, and `balanceWeeklyVolume` is add-only — the same
        // no-slot-to-grow failure the calf slots fixed. The hand-authored
        // templates already prescribe this on every shoulder day. Appended
        // last so the findExisting positions above stay valid.
        makeNamedAccessory("lateral-raise", round(3 * vm), 12, 8),
      ],
    },
    {
      dayName: "Lower — Deadlift Focus",
      dayType: "lower",
      completed: false,
      exercises: [
        makeExercise(
          "hip_dominant",
          round(4 * vm),
          main,
          80,
          profile.mainProgression,
          findExisting(3, 0)
        ),
        makeAccessory("knee_dominant", round(3 * vm), acc, 50, "squat"),
        makeAccessory("hip_dominant", round(3 * vm), 12, 40, "deadlift"),
        makeExercise(
          "core",
          round(3 * vm),
          12,
          15,
          "double",
          findExisting(3, 3),
          true
        ),
        // Seated (soleus-biased) on the deadlift day, standing on the squat
        // day — the same standing/seated split the templates author.
        makeNamedAccessory("seated-calf-raise", round(3 * vm), 15, 30),
      ],
    },
  ];
}

function buildPPL(
  profile: GoalProfile,
  nutritionGoal: Goal,
  existing?: WorkoutDay[]
): WorkoutDay[] {
  const vm = combinedVolumeMultiplier(profile, nutritionGoal);
  const round = (n: number) => Math.max(1, Math.round(n));
  const findExisting = (dayIdx: number, exIdx: number) =>
    existing?.[dayIdx]?.exercises[exIdx];
  const main = profile.mainReps;
  const acc = profile.accessoryReps;

  return [
    {
      dayName: "Push — Chest Focus",
      dayType: "push",
      completed: false,
      exercises: [
        makeExercise(
          "horizontal_push",
          round(4 * vm),
          main,
          60,
          profile.mainProgression,
          findExisting(0, 0)
        ),
        makeExercise(
          "vertical_push",
          round(3 * vm),
          acc,
          30,
          "linear",
          findExisting(0, 1)
        ),
        makeAccessory("horizontal_push", round(3 * vm), 12, 30, "bench-press"),
        makeExercise(
          "arms_triceps",
          round(3 * vm),
          12,
          15,
          "double",
          findExisting(0, 3),
          true
        ),
        makeAccessory(
          "arms_triceps",
          round(3 * vm),
          15,
          10,
          "rope-tricep-pushdown"
        ),
        // Direct side-delt slot (see the Upper — Shoulders & Arms note):
        // 2 base sets here, 3 on the shoulder-focus push day; a 5-day week
        // (which slices PPL to this one push day) still gets direct work.
        makeNamedAccessory("lateral-raise", round(2 * vm), 12, 8),
      ],
    },
    {
      dayName: "Pull — Lat Focus",
      dayType: "pull",
      completed: false,
      exercises: [
        makeExercise(
          "vertical_pull",
          round(4 * vm),
          main,
          0,
          profile.mainProgression,
          findExisting(1, 0)
        ),
        makeExercise(
          "horizontal_pull",
          round(3 * vm),
          acc,
          50,
          "linear",
          findExisting(1, 1)
        ),
        makeAccessory("vertical_pull", round(3 * vm), 12, 40, "pull-ups"),
        makeExercise(
          "arms_biceps",
          round(3 * vm),
          12,
          12,
          "double",
          findExisting(1, 3),
          true
        ),
        makeAccessory("arms_biceps", round(3 * vm), 15, 8, "barbell-curl"),
      ],
    },
    {
      dayName: "Legs — Squat Focus",
      dayType: "legs",
      completed: false,
      exercises: [
        makeExercise(
          "knee_dominant",
          round(4 * vm),
          main,
          80,
          profile.mainProgression,
          findExisting(2, 0)
        ),
        makeExercise(
          "hip_dominant",
          round(4 * vm),
          main,
          80,
          profile.mainProgression,
          findExisting(2, 1)
        ),
        makeAccessory("knee_dominant", round(3 * vm), 12, 40, "squat"),
        makeExercise(
          "core",
          round(3 * vm),
          15,
          15,
          "double",
          // Was findExisting(2, 4) — an off-by-one. This day has four slots
          // (0-3), so index 4 never resolved and the core lift was rebuilt
          // from defaults on EVERY regenerate, silently dropping the user's
          // logged weight and history. Same family as #17; found by the
          // regenerate-preserves-load test rather than by reading indices.
          findExisting(2, 3),
          true
        ),
        // Direct calf work (named slot — see makeNamedAccessory). Appended
        // last so the findExisting positions above stay valid.
        makeNamedAccessory("standing-calf-raise", round(3 * vm), 12, 40),
      ],
    },
    {
      dayName: "Push — Shoulder Focus",
      dayType: "push",
      completed: false,
      exercises: [
        makeExercise(
          "vertical_push",
          round(4 * vm),
          main,
          40,
          profile.mainProgression,
          findExisting(3, 0)
        ),
        makeAccessory("horizontal_push", round(3 * vm), acc, 40, "bench-press"),
        makeAccessory("vertical_push", round(3 * vm), 12, 20, "overhead-press"),
        makeExercise(
          "arms_triceps",
          round(3 * vm),
          12,
          15,
          "double",
          findExisting(3, 3),
          true
        ),
        // Direct side-delt slot (see the Upper — Shoulders & Arms note).
        makeNamedAccessory("lateral-raise", round(3 * vm), 12, 8),
      ],
    },
    {
      dayName: "Pull — Row Focus",
      dayType: "pull",
      completed: false,
      exercises: [
        makeExercise(
          "horizontal_pull",
          round(4 * vm),
          main,
          60,
          profile.mainProgression,
          findExisting(4, 0)
        ),
        makeAccessory("vertical_pull", round(3 * vm), acc, 40, "pull-ups"),
        makeAccessory("horizontal_pull", round(3 * vm), 12, 30, "barbell-row"),
        makeExercise(
          "arms_biceps",
          round(3 * vm),
          12,
          10,
          "double",
          findExisting(4, 3),
          true
        ),
      ],
    },
  ];
}

/** Legs B — flipped emphasis from Legs A.
 *  Legs A leads with squat (knee), Legs B leads with deadlift (hip).
 *  Accessories also swap order for different training stimulus. */
function buildLegsB(
  profile: GoalProfile,
  nutritionGoal: Goal,
  existing?: WorkoutDay[]
): WorkoutDay {
  const vm = combinedVolumeMultiplier(profile, nutritionGoal);
  const round = (n: number) => Math.max(1, Math.round(n));
  // Use index 5 for existing exercises (Legs B is the 6th workout day)
  const findExisting = (exIdx: number) => existing?.[5]?.exercises[exIdx];
  const main = profile.mainReps;
  const acc = profile.accessoryReps;

  return {
    dayName: "Legs — Deadlift Focus",
    dayType: "legs",
    completed: false,
    exercises: [
      // Flipped: hip-dominant leads
      makeExercise(
        "hip_dominant",
        round(4 * vm),
        main,
        80,
        profile.mainProgression,
        findExisting(0)
      ),
      makeExercise(
        "knee_dominant",
        round(4 * vm),
        acc,
        60,
        profile.mainProgression,
        findExisting(1)
      ),
      // Accessories in reversed order with different rep ranges
      makeAccessory("hip_dominant", round(3 * vm), 10, 40, "deadlift"),
      // One set traded to the calf slot below: at 6d the audit measured
      // quads OVER the volume ceiling and calves below maintenance, and
      // this day was already at the 18-set session budget — the swap moves
      // a set from the surplus muscle to the deficient one instead of
      // growing the session.
      makeAccessory("knee_dominant", round(2 * vm), 10, 40, "squat"),
      makeExercise(
        "core",
        round(3 * vm),
        12,
        15,
        "double",
        findExisting(4),
        true
      ),
      // Seated pairs with Legs A's standing raise (see makeNamedAccessory).
      makeNamedAccessory("seated-calf-raise", round(2 * vm), 15, 30),
    ],
  };
}

/* ================================
   GENERATE FULL PROGRAM
================================ */

/**
 * Number of lift WorkoutDays `generateProgram` emits for a weekly lift-day
 * target. Mirrors `chooseSplit` + the per-case slicing in generateProgram
 * (full_body caps at 3, UL slices to 2 at ≤2 days, ppl_ul = 5, ppl_x2 = 6) —
 * the net length equals the target, capped at 6 (chooseSplit clamps 7→6), and
 * 0 for a non-positive target. Pgm5 (Q2): planBuilder uses this to distinguish
 * a CONTENT edit (same day count → preserve the user's workouts) from a
 * lift-days change (→ rebuild). Pinned to `generateProgram(...).workouts.length`
 * by a parity test, so a future template change that breaks the equality is
 * caught rather than silently misrouting edits.
 */
export function expectedDayCount(weeklyTarget: number): number {
  if (weeklyTarget <= 0) return 0;
  return Math.min(weeklyTarget, 6);
}

/**
 * D-LIFT-12: within each day, ensure no exercise id appears twice. A duplicate
 * (a main that rotated onto a variation an accessory also picked) is re-pointed
 * to the first unused variation in the same movement category. Deterministic;
 * leaves the duplicate as-is only if the category has no free alternative.
 * Pure — returns a new array.
 */
/**
 * D-LIFT-4: rotate UNTRAINED accessories (no logged history) to a different
 * variation in the same movement category — periodic novelty without disturbing
 * the user's actual training. Mains and any accessory with logged history are
 * left untouched. Keeps the slot's `instanceId` (same row, new movement) so the
 * reorderable list doesn't churn. Pure.
 */
export function rotateUntrainedAccessories(
  workouts: WorkoutDay[],
  /**
   * The lifter's level. Without it the mesocycle rotation was a second escape
   * route around the complexity gate (2026-07-28 sweep): at weeks 5, 9, … a
   * beginner's untrained accessories were re-picked from the FULL bank, so a
   * plan that started correctly gated drifted above their level four weeks in.
   */
  experience?: Experience
): WorkoutDay[] {
  return workouts.map((day) => ({
    ...day,
    exercises: day.exercises.map((ex) => {
      if (!ex.isAccessory) return ex; // mains never rotate
      if ((ex.performanceHistory?.length ?? 0) > 0) return ex; // trained → keep
      // Catalogue-pinned slots (direct calf work) have no pool to rotate
      // within — their category pool is squat-pattern lifts, and rotating
      // into it deletes the programme's only calf coverage.
      if (CATALOGUE_PINNED_ACCESSORY_IDS.has(ex.exerciseId)) return ex;
      const next = pickAccessory(
        ex.movementCategory,
        ex.exerciseId,
        experience
      );
      if (next.id === ex.exerciseId) return ex; // no alternative available
      // Load: scale from the ROTATION ANCHOR when the slot carries one AND
      // its lineage is intact — the current weight is exactly what the
      // anchor implies for the current identity. Anchored scaling is what
      // naive rescaling could never be: every rotation computes from the
      // same fixed pair, so repeated rotation cannot compound (the measured
      // 50 → 30 → 12.5 decay came from scaling each rotation against the
      // PREVIOUS rotation's already-scaled output).
      //
      // The lineage check is what keeps a USER'S number safe: a manually
      // edited weight on an untrained slot diverges from the anchor, and
      // snapping it back to an anchor-derived value would silently discard
      // the user's calibration. Diverged (and legacy no-anchor) slots keep
      // the old deliberate carry-the-weight behaviour — a mis-scaled load
      // beats a discarded one, and the next seedStartingLoads on a
      // regenerate re-derives everything. Guarded by "never compounds
      // across mesocycles" and "ramps accessories …" in
      // programEngine.test.ts, plus the anchored-rotation block that pins
      // the new path.
      const anchor = ex.rotationAnchor;
      const impliedCurrent = anchor
        ? anchor.exerciseId === ex.exerciseId
          ? anchor.weight
          : rescaleForSwap(
              anchor.weight,
              anchor.exerciseId,
              ex.exerciseId,
              ex.movementCategory
            )
        : 0;
      const lineageIntact =
        anchor !== undefined &&
        impliedCurrent > 0 &&
        impliedCurrent === (ex.weight ?? 0);
      const anchored =
        anchor !== undefined && lineageIntact
          ? rescaleForSwap(
              anchor.weight,
              anchor.exerciseId,
              next.id,
              ex.movementCategory
            )
          : 0;
      return {
        ...ex,
        exerciseId: next.id,
        name: next.name,
        ...(anchored > 0
          ? {
              weight: anchored,
              lastSuccessfulWeight: anchored,
              lastAttemptedWeight: anchored,
            }
          : {}),
        lastPerformance: null,
        consecutiveFailures: 0,
        plateauCount: 0,
      };
    }),
  }));
}

export function dedupeDayExercises(workouts: WorkoutDay[]): WorkoutDay[] {
  return workouts.map((day) => {
    const seen = new Set<string>();
    const exercises = day.exercises.map((ex) => {
      if (!seen.has(ex.exerciseId)) {
        seen.add(ex.exerciseId);
        return ex;
      }
      const alt = (exerciseBank[ex.movementCategory] ?? []).find(
        (o) => !seen.has(o.id)
      );
      if (!alt) {
        seen.add(ex.exerciseId);
        return ex; // no free variation — leave it
      }
      seen.add(alt.id);
      return swapExerciseIdentity(ex, alt);
    });
    return { ...day, exercises };
  });
}

/* ================================
   DAY ROLES (backlog #3 — N9 daily undulating periodization)
================================ */

export type DayRole = "heavy" | "moderate" | "pump";

/** Rep shift a day role applies on top of the goal profile's base. */
export function repDeltaForRole(role: DayRole): number {
  return role === "heavy" ? -2 : role === "pump" ? 2 : 0;
}

/**
 * Per-EXERCISE undulation delta: the pump day's +2 does not apply to a
 * hip-dominant MAIN. A heavy hinge is the one movement class the corpus
 * consistently warns against prescribing high-rep as a session baseline —
 * form decays under fatigue with the spine loaded, so a 4×10 deadlift was
 * the audit's flagged output (6d Legs — Deadlift Focus lands the pump
 * role). The heavy day's −2 still applies (a 4-6 rep hinge is exactly what
 * heavy days are for), hinge ACCESSORIES still undulate (an RDL or
 * back-extension at 12 is normal), and the double-progression range climb
 * is untouched — that climb is earned over weeks and resets on a load
 * step, which is different from opening the session at +2.
 */
export function undulationDeltaFor(
  ex: { movementCategory?: string; isAccessory?: boolean },
  role: DayRole
): number {
  const delta = repDeltaForRole(role);
  if (
    delta > 0 &&
    ex.movementCategory === "hip_dominant" &&
    ex.isAccessory !== true
  ) {
    return 0;
  }
  return delta;
}

/** Lowest rep target a shifted day may fall to, by session role. */
export function repFloorFor(ex: { isAccessory?: boolean }): number {
  return ex.isAccessory === true ? 6 : 3;
}

/**
 * The stamped top of an exercise's rep range, or `undefined` when the goal
 * profile authors no span (in which case the field is omitted, not zeroed).
 *
 * Clamped at both ends: a target already clamped to the prescribed ceiling
 * must not still advertise a higher top end, or double progression climbs
 * straight back through it. Shared by generation's final pass and by
 * `represcribe.ts`, so a block's ranges are stamped by the same rule.
 */
export function repRangeMaxFor(
  ex: { exerciseId?: string; repUnit?: string },
  reps: number,
  span: number
): number | undefined {
  const ceiling = Math.min(reps + span, prescribedRepCeiling(ex));
  return span > 0 && ceiling > reps ? ceiling : undefined;
}

/**
 * Deterministic role per generated day: first half of the week heavier,
 * back half higher-rep, an odd middle day at the goal base, and a
 * single-day week entirely at base.
 *
 * Was module-private ("the only contract is generateProgram's output").
 * Exported for `represcribe.ts` (Blk2): a training block re-derives the
 * week's rep targets for a new focus WITHOUT calling a builder, so it has
 * to reproduce this role delta itself. Writing a flat per-tier rep target
 * instead would silently delete weekly undulation for every intermediate
 * and advanced user — the shift below happens after the goal profile, so
 * it is invisible to anything reading `GOAL_PROFILES` alone.
 */
export function assignDayRoles(count: number): DayRole[] {
  if (count <= 1) return count === 1 ? ["moderate"] : [];
  return Array.from({ length: count }, (_, i) => {
    if (i < Math.floor(count / 2)) return "heavy";
    if (i >= Math.ceil(count / 2)) return "pump";
    return "moderate";
  });
}

/**
 * Backlog #3 (training-book backlog; N9): put the first rep variation
 * into a Tropos week. Every source converged on varying what the week
 * asks for; daily undulation is the stateless version — heavy days sit
 * ±2 reps around the goal profile's base, structures/sets/progression
 * mechanics untouched. baseReps moves with reps so progression resets
 * stay role-consistent. Presentation policy: INVISIBLE — the
 * prescription simply differs; no labels, no new UI.
 */
function applyDayRoles(
  workouts: WorkoutDay[],
  experience?: Experience
): WorkoutDay[] {
  // Not for a novice (2026-07-28). Undulation exists because an intermediate
  // can no longer add load every session, so the stimulus has to be varied
  // instead; a novice CAN, and a heavy day plus a pump day muddies the one
  // signal their programme runs on — did today beat last time? See
  // `usesUndulation`.
  if (!usesUndulation(experience)) return workouts;
  const roles = assignDayRoles(workouts.length);
  return workouts.map((day, i) => {
    const role = roles[i];
    if (role === "moderate") return day;
    return {
      ...day,
      exercises: day.exercises.map((ex) => {
        const delta = undulationDeltaFor(ex, role);
        const reps = Math.min(
          prescribedRepCeiling(ex),
          Math.max(repFloorFor(ex), ex.reps + delta)
        );
        return { ...ex, reps, baseReps: reps };
      }),
    };
  });
}

/**
 * Carry a user's accessories through a regenerate (backlog #17).
 *
 * `makeAccessory` takes no `existing` — unlike `makeExercise` — so it re-rolls
 * `pickAccessory` (which is `Math.random()`-backed) and rebuilds from the
 * passed defaults on EVERY regenerate. Measured on main: regenerating a 4-day
 * programme turned a 55 kg Bulgarian Split Squat with logged history into a
 * 40 kg Hack Squat with none, and reset an Incline DB Press from 55 kg to 30.
 * A regenerate is what a settings change triggers — goal, days per week,
 * split — so changing any of those silently wiped every accessory's load and
 * history and shuffled the exercises.
 *
 * Done as a post-pass rather than threading `existing` through fifteen
 * `makeAccessory` call sites: one place to reason about, and it uses the same
 * positional correspondence `findExisting` already relies on. Only IDENTITY
 * and LOGGED state carry — sets and reps stay whatever the builders and the
 * volume machinery just computed, so a genuine prescription change still
 * lands. Guarded on category equality, so a slot that legitimately changed
 * movement (see `applyOverlapCaps`) is left alone.
 *
 * This also puts Tropos properly on the side of N5's "stability within a
 * block, novelty between blocks": `rotateUntrainedAccessories` still refreshes
 * untrained accessories at each mesocycle boundary, which is the intended
 * novelty — it just no longer happens by accident on every settings change.
 */
function carryExistingAccessories(
  workouts: WorkoutDay[],
  existing?: WorkoutDay[]
): WorkoutDay[] {
  if (!existing) return workouts;
  return workouts.map((day, dayIndex) => ({
    ...day,
    exercises: day.exercises.map((ex, exIndex) => {
      if (ex.isAccessory !== true) return ex; // makeExercise already carries
      const prev = existing[dayIndex]?.exercises[exIndex];
      if (
        !prev ||
        prev.isAccessory !== true ||
        prev.movementCategory !== ex.movementCategory
      ) {
        return ex;
      }
      return {
        ...ex,
        exerciseId: prev.exerciseId,
        name: prev.name,
        instanceId: prev.instanceId,
        weight: prev.weight,
        lastSuccessfulWeight: prev.lastSuccessfulWeight,
        lastAttemptedWeight: prev.lastAttemptedWeight,
        consecutiveFailures: prev.consecutiveFailures,
        plateauCount: prev.plateauCount,
        performanceHistory: prev.performanceHistory,
        lastPerformance: prev.lastPerformance,
        // The anchor travels with the load lineage it describes.
        ...(prev.rotationAnchor !== undefined
          ? { rotationAnchor: prev.rotationAnchor }
          : {}),
      };
    }),
  }));
}

/**
 * Backlog #10 (training-book backlog; D1 + M6 + H6): re-point the
 * expensive-pattern slots that exceed the overlap caps. The decision is pure
 * (overlapModel.ts); this only rewrites `exerciseId` / `name` on the chosen
 * slots.
 *
 * A demoted slot keeps its category, its sets, its reps, its accessory role,
 * its position and its history — the ONLY thing that moves is which variation
 * of the same movement fills it, from a barbell pull to something that spares
 * the lower back. That is the whole of what the cap is trying to achieve, and
 * keeping everything else fixed is what makes the pass safe: the positional
 * accessory carry still matches, the muscle keeps its weekly volume, and the
 * builder's authoring of the day is not second-guessed.
 *
 * See `lowCostAlternative` for the three defects the previous cross-category
 * version shipped, all of them measured.
 */
function applyOverlapCaps(
  workouts: WorkoutDay[],
  experience?: Experience,
  loadCtx?: StartingLoadContext
): WorkoutDay[] {
  const surplus = surplusExposures(workouts);
  if (surplus.length === 0) return workouts;

  const out = workouts.map((d) => ({ ...d, exercises: [...d.exercises] }));
  for (const { dayIndex, exIndex } of surplus) {
    const day = out[dayIndex];
    const old = day.exercises[exIndex];
    const swap = lowCostAlternative(
      old.movementCategory,
      new Set(day.exercises.map((e) => e.exerciseId)),
      old.isAccessory !== true,
      experience
    );
    // No back-sparing variation left in the category that isn't already in
    // the day. Leave the slot alone — the cap is a bias, not a guarantee, and
    // dropping the work or importing a foreign movement are both worse.
    if (!swap) continue;
    day.exercises[exIndex] = swapExerciseIdentity(old, swap, loadCtx);
  }
  return out;
}

/**
 * The builders predate the experience argument and their `makeExercise` call
 * cannot see it. Re-resolve only carried, stalled main slots here so the real
 * generation lifecycle reaches the same specialist choice as the pure picker.
 */
function applyExperienceAwarePlateauPicks(
  workouts: WorkoutDay[],
  existing: WorkoutDay[] | undefined,
  experience: Experience | undefined,
  loadCtx: StartingLoadContext | undefined
): WorkoutDay[] {
  if (!existing) return workouts;
  return workouts.map((day, dayIndex) => ({
    ...day,
    exercises: day.exercises.map((ex, exIndex) => {
      if (ex.isAccessory === true) return ex;
      const previous = existing[dayIndex]?.exercises[exIndex];
      if (
        !previous ||
        previous.movementCategory !== ex.movementCategory ||
        (previous.plateauCount ?? 0) < 3
      ) {
        return ex;
      }
      const pick = pickExercise(
        ex.movementCategory,
        previous.plateauCount ?? 0,
        previous.exerciseId,
        experience
      );
      return swapExerciseIdentity(ex, pick, loadCtx, previous);
    }),
  }));
}

export function generateProgram(
  nutritionGoal: Goal,
  weeklyTarget: number,
  existingWorkouts?: WorkoutDay[],
  primaryGoal?: PrimaryGoal,
  loadCtx?: StartingLoadContext,
  /**
   * The user's planned week SHAPE (backlog #10, M6 adjacency). Read-only, and
   * used for one thing: knowing whether the planned lift days are
   * back-to-back, so two posterior-chain-heavy sessions aren't scheduled on
   * consecutive days. This does NOT date-pin lifts — ADR-0002 keeps them
   * split-ordered on purpose, because pinning would mark a
   * Tuesday-instead-of-Monday session as "missed Monday" and drop its volume.
   * Absent → adjacency is simply not applied.
   */
  weekSchedule?: ReadonlyArray<{ day: number; type: string }>,
  /**
   * The lifter's level (`experienceModel.ts`). Gates movement COMPLEXITY and
   * whether the week undulates — never volume.
   *
   * Deliberately its OWN parameter rather than read off `loadCtx.experience`,
   * even though the context carries it: `loadCtx` is undefined whenever the
   * bodyweight is unknown, so reading it there would silently hand a beginner
   * the intermediate programme for an unrelated reason. Absent → intermediate,
   * which is the behaviour every caller had before this existed.
   */
  experience?: Experience
): { splitType: SplitType; workouts: WorkoutDay[] } {
  // 0 lift days → run-only athlete, return empty workouts
  if (weeklyTarget <= 0) {
    return { splitType: "full_body", workouts: [] };
  }

  // The training stimulus (reps / main-lift progression / volume) now
  // tracks the user's declared `primaryGoal`. Before W1a the engine only
  // knew the nutrition goal, so strength users silently got hypertrophy
  // reps on every regenerate. `goalProfileFor` defaults to "general" if
  // `primaryGoal` wasn't passed (e.g. legacy call sites).
  const profile = goalProfileFor(primaryGoal);

  const splitType = chooseSplit(weeklyTarget);

  const buildSplit = (existingWorkouts?: WorkoutDay[]): WorkoutDay[] => {
    let workouts: WorkoutDay[];

    switch (splitType) {
      case "full_body": {
        // `chooseSplit` now returns "full_body" for 3-day targets too
        // (beats 3-day PPL for hypertrophy). Cap at 3 days of rotation.
        const fbDays = Math.min(weeklyTarget, 3);
        workouts = buildFullBody(
          profile,
          nutritionGoal,
          fbDays,
          existingWorkouts
        );
        break;
      }
      case "ppl":
        workouts = buildPPL(profile, nutritionGoal, existingWorkouts).slice(
          0,
          3
        );
        break;
      case "upper_lower": {
        const ul = buildUpperLower(profile, nutritionGoal, existingWorkouts);
        // 2-day uses first upper + first lower only
        workouts = weeklyTarget <= 2 ? ul.slice(0, 2) : ul;
        break;
      }
      case "ppl_ul":
        // The second builder starts at week position 3, so it must be handed
        // the saved plan FROM position 3 — its `findExisting(0, …)` means
        // "my first day", not "the week's first day". Without the slice the
        // Upper/Lower half of a 5-day plan carried its loads from the
        // Push/Pull days; found 2026-07-28 once the carry test used
        // distinct per-lift weights instead of stamping 61 everywhere.
        workouts = [
          ...buildPPL(profile, nutritionGoal, existingWorkouts).slice(0, 3),
          ...buildUpperLower(
            profile,
            nutritionGoal,
            existingWorkouts?.slice(3)
          ).slice(0, 2),
        ];
        break;
      case "ppl_x2": {
        const ppl = buildPPL(profile, nutritionGoal, existingWorkouts);
        workouts = [
          ...ppl,
          buildLegsB(profile, nutritionGoal, existingWorkouts),
        ];
        break;
      }
      case "ppl_x2_fb": {
        // Retained for backward-compat — `chooseSplit` no longer returns
        // this (capped at 6 days) but existing programState rows on disk
        // may still pass through here on regeneration.
        const ppl7 = buildPPL(profile, nutritionGoal, existingWorkouts);
        // Same offset rule as `ppl_ul` — this day sits at week position 6.
        const fb = buildFullBody(
          profile,
          nutritionGoal,
          1,
          existingWorkouts?.slice(6)
        );
        workouts = [
          ...ppl7,
          buildLegsB(profile, nutritionGoal, existingWorkouts),
          {
            ...fb[0],
            dayName: "Full Body (Recovery)",
            completed: false,
            exercises: fb[0].exercises.map((ex) => ({ ...ex })),
          },
        ];
        break;
      }
      default:
        workouts = buildUpperLower(profile, nutritionGoal, existingWorkouts);
    }
    return workouts;
  };

  /**
   * Align a saved plan to the builders' CANONICAL day order before handing it
   * over (backlog #10).
   *
   * The builders carry a saved exercise by POSITION (`findExisting(dayIdx,
   * exIdx)`), which silently assumes the saved plan is in the same day order
   * the builder emits. Adjacency ordering breaks that assumption, and the
   * failure is data corruption rather than a visible error: with a saved
   * order of Pull,Push,Legs and a builder order of Push,Pull,Legs, the user's
   * logged pull-up weight lands on bench press.
   *
   * Matching on `dayName` fixes it, and fixes it generally — the carry stops
   * depending on day order at all, so ANY future reordering is safe. A probe
   * build (no existing, so it is pure and cheap) supplies the canonical order.
   *
   * SLOTS are aligned the same way, and for the same reason one layer down
   * (added 2026-07-28). Day names only line up between two GENERATED plans;
   * a plan seeded from a template has names the generator never emits
   * ("Full Body A", "Upper A", "Push A"), so alignment bailed and every
   * template user's first settings change carried their saved loads onto
   * whatever the builder happened to put at the same index. `makeExercise`
   * now refuses a cross-movement carry outright, which makes that safe; this
   * pass is what makes it lossLESS as well, by putting each saved lift at the
   * index its own movement will be built at.
   */
  const alignSlots = (saved: WorkoutDay, reference: WorkoutDay): WorkoutDay => {
    const pool = [...saved.exercises];
    const take = (match: (e: ProgramExercise) => boolean) => {
      const i = pool.findIndex(match);
      return i >= 0 ? pool.splice(i, 1)[0] : undefined;
    };
    // Two passes so an exact same-lift match is never stolen by a
    // same-category slot that happens to come first.
    const byId = reference.exercises.map((ref) =>
      take((e) => e.exerciseId === ref.exerciseId)
    );
    const exercises = reference.exercises.map(
      (ref, i) =>
        byId[i] ?? take((e) => e.movementCategory === ref.movementCategory)
    );
    // Leftovers keep their identity at the tail; unmatched slots take a
    // placeholder the category guard in `makeExercise` will reject.
    return {
      ...saved,
      exercises: exercises.map((e, i) => e ?? pool[i] ?? saved.exercises[i]),
    };
  };

  const alignExistingTo = (
    saved: WorkoutDay[] | undefined,
    reference: WorkoutDay[]
  ): WorkoutDay[] | undefined => {
    if (!saved || saved.length !== reference.length) return saved;
    const byName = new Map<string, WorkoutDay[]>();
    for (const d of saved) {
      const list = byName.get(d.dayName);
      if (list) list.push(d);
      else byName.set(d.dayName, [d]);
    }
    // Names match one-for-one → a generated plan; align days by name. Any
    // mismatch means the plan came from somewhere else (a template) and the
    // day ORDER is all we can keep.
    const namesLineUp = reference.every(
      (c) => (byName.get(c.dayName) ?? []).length > 0
    );
    const dayAligned: WorkoutDay[] = [];
    if (namesLineUp) {
      const pool = new Map([...byName].map(([k, v]) => [k, [...v]]));
      for (const c of reference) {
        const list = pool.get(c.dayName);
        if (!list || list.length === 0) return saved;
        dayAligned.push(list.shift() as WorkoutDay);
      }
    } else {
      dayAligned.push(...saved);
    }
    return dayAligned.map((d, i) => alignSlots(d, reference[i]));
  };

  const existingForBuild = alignExistingTo(
    existingWorkouts,
    buildSplit(undefined)
  );
  let workouts = buildSplit(existingForBuild);
  workouts = applyExperienceAwarePlateauPicks(
    workouts,
    existingForBuild,
    experience,
    loadCtx
  );

  // D-LIFT-12: ensure no day picks the same exercise twice (e.g. a main that
  // rotated to a variation an accessory then matched). Re-picks the duplicate
  // to another variation in the same movement category.
  // Backlog #10 (M6 adjacency): order the week so back-to-back days aren't the
  // two that hammer the same lower back. Safe to apply on EVERY generation
  // now that the carry keys on day NAME rather than position — reordering
  // used to land a logged pull-up weight on bench press, which is what kept
  // this unbuilt.
  workouts = orderForAdjacency(workouts, weekSchedule);

  // Everything below still matches the saved plan POSITIONALLY, so realign it
  // to the order the week actually ended up in. Missing this is exactly the
  // bug above, one layer down: the builders carried correctly and then the
  // accessory carry put day 0's accessories on whatever day now sits first.
  const alignedExisting = alignExistingTo(existingWorkouts, workouts);

  // Backlog #17: accessories keep their identity and logged state across a
  // regenerate — makeAccessory rebuilds from defaults and re-rolls its
  // random pick, so without this a settings change wipes them.
  workouts = carryExistingAccessories(workouts, alignedExisting);
  workouts = dedupeDayExercises(workouts);
  // Backlog #10: cap expensive-pattern overlap BEFORE day roles and the
  // volume balancers, so a re-pointed slot is shifted and budgeted exactly
  // like an originally-built one rather than escaping both.
  workouts = applyOverlapCaps(workouts, experience, loadCtx);
  // Backlog #3: day roles — see applyDayRoles above.
  workouts = applyDayRoles(workouts, experience);
  // Experience gate: no movement above the lifter's level. Runs with the
  // other identity-only post-passes, and BEFORE the repeat cap so the cap
  // counts the exercises the user will actually receive.
  workouts = applyComplexityGate(
    workouts,
    experience,
    exerciseBank,
    (ex, toId) =>
      weightAfterExerciseSwap(ex as ProgramExercise, toId, loadCtx).weight,
    exerciseDisplayName
  );
  // Variety: no single lift more than twice a week. Must run BEFORE the
  // volume balancers so they budget against the shape the user actually
  // gets, and AFTER the overlap caps so a re-pointed slot is counted.
  workouts = capRepeatedLifts(workouts, experience, (ex, to) =>
    swapExerciseIdentity(ex, to, loadCtx)
  );
  // ADR-0010's staged condition, landed with the SECONDARY_SET_WEIGHT 1:1
  // flip. The volume passes run reconcile → balance → reconcile:
  //   1. shrink what the builders over-authored (the ceilings' authority);
  //   2. the add-only balancers top up under-floor muscles — including the
  //      secondary credit the first pass's cuts drained — inside the freed
  //      session budget;
  //   3. a second reconcile polices anything the adds re-inflated (at 1:1 an
  //      add credits every secondary too). Measured 2026-08-03: running the
  //      reconciler only before the balancers left re-inflation standing,
  //      only after left 44 under-floor readings the balancer never saw.
  workouts = reconcileToLandmarks(workouts, (m) =>
    judgementLandmark(primaryGoal, m)
  );
  // D-LIFT-1 (active): nudge under-dosed muscles up toward the goal volume
  // landmark by growing their accessories (add-only, mains untouched).
  workouts = balanceWeeklyVolume(workouts, (m) =>
    judgementLandmark(primaryGoal, m)
  );
  // D-LIFT-3: keep weekly pull volume ≥ push (shoulder-health balance).
  workouts = balancePushPull(workouts, (m) =>
    judgementLandmark(primaryGoal, m)
  );
  workouts = reconcileToLandmarks(workouts, (m) =>
    judgementLandmark(primaryGoal, m)
  );
  // D-LIFT-5: seed bodyweight-relative cold-start loads on never-trained lifts
  // (no-op without a load context, or for lifts with logged history). Runs
  // last so it also calibrates whatever the caps above re-pointed.
  if (loadCtx)
    workouts = seedStartingLoads(workouts, loadCtx, profile.mainReps);

  // Backlog #5: stamp the steady-state volume anchor AFTER balancing and
  // seeding — advanceWeek derives each week's sets from baseSets.
  // Backlog #7: stamp the rep-range ceiling in the same pass, and for the
  // same reason — it must be derived from the FINAL `reps`, after day roles
  // have shifted them. Carrying a fixed ceiling through applyDayRoles would
  // hand a heavy day (reps 8 → 6) the untouched 12-rep ceiling, turning a
  // 4-rep climb into a 6-rep one. Deriving from the span keeps the range
  // width constant across every role.
  const mainSpan = Math.max(0, profile.mainRepsMax - profile.mainReps);
  const accessorySpan = Math.max(
    0,
    profile.accessoryRepsMax - profile.accessoryReps
  );
  workouts = workouts.map((day) => ({
    ...day,
    exercises: day.exercises.map((ex) => {
      const span = ex.isAccessory === true ? accessorySpan : mainSpan;
      const out: ProgramExercise = { ...ex, baseSets: ex.sets };
      // The ceiling is clamped at both ends inside `repRangeMaxFor` —
      // otherwise a target clamped to 15 still advertises a 20-rep top end
      // and the double progression climbs straight back through it.
      const rangeMax = repRangeMaxFor(ex, ex.reps, span);
      if (rangeMax !== undefined) out.repRangeMax = rangeMax;
      return out;
    }),
  }));

  return { splitType, workouts };
}

/* ================================
   EXERCISE-SPECIFIC PROGRESSION
================================ */

export function applyProgression(
  exercise: ProgramExercise,
  actualReps: number,
  actualWeight: number,
  goal: Goal,
  microloading: boolean,
  actualRpe?: number
): ProgramExercise {
  const today = format(new Date(), "yyyy-MM-dd");
  const record = {
    date: today,
    weight: actualWeight,
    repsCompleted: actualReps,
    repsTarget: exercise.reps,
  };
  const history = [...(exercise.performanceHistory || []), record].slice(
    -PERFORMANCE_HISTORY_CAP
  );

  const updated: ProgramExercise = {
    ...exercise,
    lastAttemptedWeight: actualWeight,
    performanceHistory: history,
    lastPerformance: {
      sets: exercise.sets,
      reps: actualReps,
      weight: actualWeight,
      completed: actualReps >= exercise.reps,
    },
  };

  const completed =
    actualReps >= exercise.reps && actualWeight >= exercise.weight;

  // Use the static EXERCISES.equipment field to identify true
  // bodyweight movements (Pull-Ups, Dips, etc.). The previous
  // `weight === 0` shortcut couldn't distinguish bodyweight from
  // "weighted exercise with no calibrated starting weight yet" — so
  // a fresh Lat Pulldown or Leg Press at 0kg got progressed via the
  // BW path (rep increases instead of load increases) and rendered
  // in history as "BW × 10" with 0kg volume.
  const isBodyweight = isBodyweightExerciseId(exercise.exerciseId);
  // Uncalibrated weighted exercise — skip progression entirely. We
  // can't add a sensible load increment from 0, and the "add reps"
  // BW fallback would mislabel the movement going forward.
  const isUncalibrated = !isBodyweight && exercise.weight === 0;
  if (isUncalibrated) {
    const calibratedWeight =
      Number.isFinite(actualWeight) && actualWeight > 0
        ? actualWeight
        : exercise.weight;
    return {
      ...updated,
      weight: calibratedWeight,
      lastSuccessfulWeight: calibratedWeight,
      lastAttemptedWeight: calibratedWeight,
      consecutiveFailures: 0,
      plateauCount: 0,
    };
  }
  const resetReps = exercise.baseReps ?? exercise.reps; // anchor to original prescription

  // D-LIFT-6 (RPE autoregulation): a logged near-maximal effort (RPE ≥ 9.5)
  // means the load is already at the edge — HOLD this cycle rather than add
  // load/reps, even on a completed set. No RPE logged → progress as before.
  const rpeOk = actualRpe == null || actualRpe < RPE_HOLD_THRESHOLD;
  // Backlog #7 (H3): load moves in proportion to the lift. The step keys on
  // the MOVEMENT and its load, not on `isAccessory` — see movementClass.ts
  // for why that flag (a volume role) can't answer this question. The
  // lean-bulk accelerator rides the same test: a lift too light for a full
  // plate is too light for a bonus on top of one.
  const microplate = usesMicroplateStep(
    exercise.movementCategory,
    exercise.weight
  );
  const loadStep = microplate ? MICROPLATE_STEP : PLATE_PAIR_STEP;
  const loadBonus = microplate ? 0 : goalWeightBonus(goal);
  // D-LIFT-11: bodyweight rep target rises by 1 per success, but is capped —
  // a pull-up shouldn't drift to "25 reps"; at the cap, prompt adding load.
  // Backlog #7's time axis (N2). A timed hold counts SECONDS, not reps, so
  // neither the +1 step nor the 20-rep ceiling means anything to it: a plank
  // prescribed 30-45s starts ABOVE the rep cap, so any overshoot immediately
  // advised "add load" at an ordinary hold length. Time climbs in 5-second
  // steps toward the authored ceiling, and the add-load prompt waits until
  // the hold is genuinely long.
  const isTimed = exercise.repUnit === "seconds";
  const bumpBodyweightReps = () => {
    if (isTimed) {
      const ceiling = exercise.repRangeMax ?? MAX_HOLD_SECONDS;
      if (exercise.reps >= ceiling) {
        updated.notes =
          "Holding this long already — add load (weighted vest / band) to keep progressing.";
      } else {
        updated.reps = Math.min(ceiling, exercise.reps + HOLD_STEP_SECONDS);
      }
      return;
    }
    const ceiling = exercise.repRangeMax ?? MAX_BODYWEIGHT_REPS;
    if (exercise.reps >= ceiling) {
      updated.notes = `Hitting ${ceiling}+ reps — add load (weighted vest / band) to keep progressing.`;
    } else {
      updated.reps = Math.min(ceiling, exercise.reps + 1);
    }
  };

  if (exercise.progressionType === "double") {
    if (completed) {
      const rangeMax = exercise.repRangeMax;
      if (isBodyweight && rangeMax != null && rangeMax > resetReps) {
        // Range-aware BODYWEIGHT progression. This branch did not exist:
        // the range-aware arm below was gated `!isBodyweight`, so a
        // bodyweight main fell through to the legacy +2-overshoot arm —
        // the exact "target itself never moved" defect P1's comment says
        // it fixed, left in place for the one movement class with no load
        // dial. Measured before the fix by a 13-week compliant-user
        // emulation: pull-ups sat frozen at 4×6 the entire time while
        // every loaded lift climbed.
        //
        // Same climb contract as the weighted arm (next target = one past
        // what was done, capped at the range; RPE >= threshold holds), but
        // the top of the range prompts ADDING LOAD instead of silently
        // adding weight the movement doesn't have. Timed holds keep their
        // 5-second step via bumpBodyweightReps — a +1 target move means
        // one second, which is noise, not progression.
        if (rpeOk) {
          if (isTimed) {
            bumpBodyweightReps();
          } else if (actualReps >= rangeMax) {
            updated.notes = `Hitting ${rangeMax}+ reps — add load (weighted vest / band) to keep progressing.`;
          } else {
            updated.reps = Math.min(rangeMax, actualReps + 1);
          }
        }
      } else if (!isBodyweight && rangeMax != null && rangeMax > resetReps) {
        // Range-aware double progression (P1, training-book backlog): the
        // rep TARGET climbs through [baseReps, repRangeMax] as targets are
        // completed; load rises only once the top of the range is reached,
        // then the target resets to the bottom. Pre-range behaviour (below)
        // waited for the user to spontaneously overshoot by 2 — the target
        // itself never moved. RPE ≥ threshold holds the climb, same hold
        // contract as every other progression path.
        if (rpeOk) {
          if (actualReps >= rangeMax) {
            updated.weight = exercise.weight + loadStep + loadBonus;
            updated.reps = resetReps;
          } else {
            // Next target: one past what was actually done (monotonic —
            // completed ⇒ actualReps >= exercise.reps), capped at the range.
            updated.reps = Math.min(rangeMax, actualReps + 1);
          }
        }
      } else if (actualReps >= exercise.reps + 2 && rpeOk) {
        // Legacy double progression (no authored range): accumulate reps
        // until a 2-rep overshoot, then increase weight
        if (isBodyweight) {
          // Bodyweight: progress via rep target increase (capped)
          bumpBodyweightReps();
        } else {
          // Weighted: increase weight and reset reps to base prescription
          updated.weight = exercise.weight + loadStep + loadBonus;
          updated.reps = resetReps;
        }
      }
      // Otherwise: success recorded but reps still accumulating toward ceiling
      updated.lastSuccessfulWeight = actualWeight;
      updated.consecutiveFailures = 0;
      updated.plateauCount = 0;
    } else {
      updated.consecutiveFailures = (exercise.consecutiveFailures || 0) + 1;

      if (updated.consecutiveFailures >= 3) {
        if (isBodyweight) {
          // Bodyweight deload: reduce rep target (minimum 4)
          updated.reps = Math.max(4, exercise.reps - 1);
        } else {
          updated.weight = Math.round(exercise.weight * 0.95 * 2) / 2;
        }
        updated.consecutiveFailures = 0;
        updated.plateauCount = (exercise.plateauCount || 0) + 1;
      }
    }
  } else {
    if (completed) {
      if (isBodyweight) {
        const rangeMax = exercise.repRangeMax;
        if (rangeMax != null && rangeMax > resetReps) {
          // Range-aware bodyweight climb on the LINEAR path too — a
          // running-goal pull-up main (4-6, linear) was frozen for a
          // compliant user exactly like the double-path case above.
          // Same contract; timed holds keep the 5-second step.
          if (rpeOk) {
            if (isTimed) {
              bumpBodyweightReps();
            } else if (actualReps >= rangeMax) {
              updated.notes = `Hitting ${rangeMax}+ reps — add load (weighted vest / band) to keep progressing.`;
            } else {
              updated.reps = Math.min(rangeMax, actualReps + 1);
            }
          }
        } else if (actualReps >= exercise.reps + 2 && rpeOk) {
          // Legacy: no authored range — climb on a 2-rep overshoot (capped)
          bumpBodyweightReps();
        }
      } else if (microloading && rpeOk) {
        updated.weight = exercise.weight + 1;
      } else {
        if (actualReps >= exercise.reps + 2 && rpeOk) {
          // No goal bonus on the linear path — pre-#7 behaviour, kept.
          updated.weight = exercise.weight + loadStep;
          updated.reps = resetReps; // reset to original prescription, not drifted value
        }
      }
      updated.lastSuccessfulWeight = actualWeight;
      updated.consecutiveFailures = 0;
      updated.plateauCount = 0;
    } else {
      updated.consecutiveFailures = (exercise.consecutiveFailures || 0) + 1;
      if (updated.consecutiveFailures >= 3) {
        if (isBodyweight) {
          updated.reps = Math.max(4, exercise.reps - 1);
        } else {
          updated.weight = Math.max(0, exercise.weight - 1);
        }
        updated.consecutiveFailures = 0;
        updated.plateauCount = (exercise.plateauCount || 0) + 1;
      }
    }
  }

  return updated;
}

/* ================================
   FATIGUE / DELOAD / ADVANCEMENT
================================ */

/**
 * Acute training-fatigue score for the week just trained, derived from the
 * per-exercise failure state the logger already tracks (D-LIFT-8). `applyFatigue`
 * trims next week's volume when this exceeds 20; previously the score it read
 * (`state.fatigueScore`) was never updated by anything, so the cut never fired.
 *
 * Signal = unresolved recent failures (`consecutiveFailures`, 0..2 — the 3rd
 * miss triggers a backoff that resets it). Acute by construction: it climbs
 * while a lifter is grinding sets and falls once loads back off, so it can't
 * ratchet up forever the way a cumulative `plateauCount` would. Weighted so the
 * >20 cut needs a meaningful share of the program actively failing (≈2 lifts at
 * two straight misses, or ~3 at one), and clamped for safety.
 */
export function computeFatigueScore(workouts: WorkoutDay[]): number {
  let failures = 0;
  for (const day of workouts) {
    for (const ex of day.exercises) {
      failures += Math.max(0, ex.consecutiveFailures ?? 0);
    }
  }
  return Math.min(100, failures * 8);
}

export function applyFatigue(
  workouts: WorkoutDay[],
  fatigueScore: number
): WorkoutDay[] {
  if (fatigueScore <= 20) return workouts;
  return workouts.map((day) => ({
    ...day,
    exercises: day.exercises.map((ex) => ({
      ...ex,
      sets: Math.max(2, Math.round(ex.sets * 0.9)),
    })),
  }));
}

/**
 * Deload rep floor for the post-novice recipe — a 5-rep strength main drops
 * to 3, not to 1. Shared with the CF mirror.
 */
const DELOAD_REPS_FLOOR = 3;

/**
 * Backlog #8 (training-book backlog; H4 resolving M4): the deload recipe is
 * chosen by TRAINING AGE. Tropos's sets−1 + load−15% is Helms's *novice*
 * answer, and it was being applied to everyone.
 *
 * - Beginner (and any caller that doesn't know): unchanged — one set fewer
 *   (floor 2) and working weight ×0.85 on the 2.5 kg grid. Cutting load is
 *   what a novice needs, because a novice's stall is usually the load.
 * - Intermediate / advanced: roughly half the volume at the SAME load —
 *   one set fewer and two reps off the target (floor 3), weight untouched
 *   (Helms's worked example: 3×10×200 → 2×8×200). Past the novice phase
 *   the fatigue comes from accumulated volume, not from the top-end load,
 *   and dropping the bar weight costs the skill exposure that keeps a
 *   heavy lift sharp.
 *
 * Presentation policy: INVISIBLE — the step-back week simply looks different.
 * The one visible surface is #4's step-back cue, which is recipe-agnostic.
 */
export function applyDeload(
  workouts: WorkoutDay[],
  experience?: Experience
): WorkoutDay[] {
  const holdLoad = experience === "intermediate" || experience === "advanced";
  return workouts.map((day) => ({
    ...day,
    exercises: day.exercises.map((ex) => {
      const sets = Math.max(2, ex.sets - 1);
      if (holdLoad) {
        return {
          ...ex,
          sets,
          reps:
            ex.repUnit === "seconds"
              ? Math.max(10, ex.reps - HOLD_STEP_SECONDS)
              : Math.max(DELOAD_REPS_FLOOR, ex.reps - 2),
        };
      }
      return {
        ...ex,
        sets,
        // 0 weight (bodyweight or uncalibrated): no weight to deload
        // — leave at 0. Sets reduction above is the deload signal.
        // Weighted: round to 2.5kg increments (standard plate size).
        weight:
          ex.weight === 0 ? 0 : Math.round((ex.weight * 0.85) / 2.5) * 2.5,
      };
    }),
  }));
}

export function shouldAdvanceWeek(workouts: WorkoutDay[]): boolean {
  return workouts.every((day) => day.completed || day.skipped);
}

/** Accessory ramp ceiling — mirrors volumeModel's ACCESSORY_SET_CAP. */
const ACCESSORY_RAMP_CAP = 5;

/**
 * Entering an automatic deload week: re-anchor sets to baseSets and stash
 * each loaded exercise's weight and rep target so meso exit can restore
 * them. applyDeload then cuts from the ANCHORED values, so its cut can
 * never compound across mesocycles (the manual deload command guards the
 * same hazard with its undo snapshot — the auto path had no guard at all).
 *
 * Both stashes are unconditional w.r.t. the deload recipe (backlog #8):
 * only the post-novice recipe cuts reps and only the novice recipe cuts
 * load, but a user who changes experience level mid-mesocycle must still
 * get back whichever one was cut.
 */
function prepareForDeload(workouts: WorkoutDay[]): WorkoutDay[] {
  return workouts.map((day) => ({
    ...day,
    exercises: day.exercises.map((ex) => {
      const base = ex.baseSets ?? ex.sets;
      const out: ProgramExercise = { ...ex, baseSets: base, sets: base };
      if (out.weight > 0) out.preDeloadWeight = out.weight;
      out.preDeloadReps = out.reps;
      return out;
    }),
  }));
}

/**
 * Backlog #5 (training-book backlog; M2/N1): the volume ramp. Non-deload
 * weeks derive sets from the baseSets anchor — accessories run
 * base−1 / base / base+1 across the meso (start below target, build,
 * then deload), mains hold at base. Also restores pre-deload loads on
 * meso exit (max() keeps anything the user progressed DURING the deload
 * week). Anchor-derived recompute makes the weekly shape idempotent:
 * applyFatigue's shave lasts exactly one week. Presentation policy:
 * INVISIBLE — the prescription simply differs week to week.
 */
function applyWeeklyVolumeShape(
  workouts: WorkoutDay[],
  week: number
): WorkoutDay[] {
  const weekInMeso = ((week - 1) % 4) + 1; // 1..3 here; week 4 deloads
  return workouts.map((day) => ({
    ...day,
    exercises: day.exercises.map((ex) => {
      const base = ex.baseSets ?? ex.sets;
      const out: ProgramExercise = { ...ex, baseSets: base };
      if (typeof ex.preDeloadWeight === "number") {
        out.weight = Math.max(out.weight, ex.preDeloadWeight);
        delete out.preDeloadWeight;
      }
      // Backlog #8: same max()-wins restore for the rep target, which the
      // post-novice deload recipe cuts. Without it the cut would decay the
      // prescription every mesocycle — the exact hazard #5 fixed for sets
      // and load, reintroduced through a third field.
      if (typeof ex.preDeloadReps === "number") {
        out.reps = Math.max(out.reps, ex.preDeloadReps);
        delete out.preDeloadReps;
      }
      if (ex.isAccessory === true) {
        out.sets =
          weekInMeso === 1
            ? Math.max(1, base - 1)
            : weekInMeso === 3
              ? Math.min(ACCESSORY_RAMP_CAP, base + 1)
              : base;
      } else {
        out.sets = base;
      }
      return out;
    }),
  }));
}

/** Floor for the steady-state accessory anchor — a lift never drops below this. */
const ACCESSORY_ANCHOR_FLOOR = 2;

/**
 * Backlog #9 (training-book backlog; H5): apply the adjustment the rule
 * chose. Split across the two volume registers #5 established, which is
 * what makes each action last the right length of time:
 *
 * - `add_volume` / `reorganize` move the ANCHOR (`baseSets`), so the change
 *   survives `applyWeeklyVolumeShape`'s idempotent recompute — these are
 *   verdicts about the programme.
 * - `reduce_volume` moves only `sets`, so it lasts exactly one week and is
 *   then recomputed away, same as `applyFatigue`'s shave — it's a light
 *   week, not a new baseline.
 *
 * Mains are never touched. They are the progression anchor, and every
 * source in the review puts the adjustable volume in accessory work.
 * `reorganize` also rotates the stalled lifts to a fresh variation and
 * clears their plateau counter — Helms's "or the volume organised
 * differently", and the reset is what lets the rule tell a NEW stall from
 * the one it already responded to.
 */
function applyAdjustment(
  workouts: WorkoutDay[],
  action: AdjustmentAction,
  /** Level gate — `reorganize` re-picks a variation, so it needs the same
   *  constraint the generator applies (2026-07-28 sweep). */
  experience?: Experience
): WorkoutDay[] {
  if (action === "hold") return workouts;
  return workouts.map((day) => ({
    ...day,
    exercises: day.exercises.map((ex) => {
      const out: ProgramExercise = { ...ex };
      const base = ex.baseSets ?? ex.sets;
      // Every lever below is ACCESSORY-ONLY, including the reorganise swap.
      // Mains are the progression anchor — the same reason `add_volume` and
      // `reduce_volume` have always been scoped this way.
      //
      // The swap used to sit OUTSIDE this guard, so a stalled MAIN could be
      // re-picked and run through `swapExerciseIdentity`, which zeroes
      // `performanceHistory`, `lastPerformance`, `consecutiveFailures` and
      // `plateauCount`. That is an unrecoverable response to a stall: a coach
      // does not answer a plateau by deleting the lift's training log, and the
      // user cannot undo it. `represcribe.ts` already documented this as a
      // live hazard and worked around it (Epley rescaling + a 3-week amnesty)
      // rather than fixing it here.
      //
      // Ordered by REVERSIBILITY, an exercise swap is a costlier intervention
      // than a deload even though it is a smaller-looking change: a deload's
      // error cost is near zero (Schoenfeld p.200 — a 3-week break mid-
      // programme did not interfere with adaptations; RP Ch3 P213 — deloading
      // early is less detrimental than deloading late), whereas a swap's error
      // cost is a destroyed history. So the cheap intervention is the one the
      // engine is allowed to apply unattended, and the expensive one is not.
      //
      // A stalled MAIN is not left unhandled: `applyProgression`'s backoff
      // still cuts its load 5% every third failure, the mesocycle deload still
      // reaches it, and a user who genuinely wants a different main lift can
      // swap it themselves. What is removed is the engine silently doing it.
      if (ex.isAccessory === true) {
        if (action === "add_volume") {
          out.baseSets = Math.min(ACCESSORY_RAMP_CAP, base + 1);
          out.sets = Math.min(ACCESSORY_RAMP_CAP, out.sets + 1);
        } else if (action === "reduce_volume") {
          out.sets = Math.max(ACCESSORY_ANCHOR_FLOOR, out.sets - 1);
        } else {
          out.baseSets = Math.max(ACCESSORY_ANCHOR_FLOOR, base - 1);
          out.sets = Math.max(ACCESSORY_ANCHOR_FLOOR, out.sets - 1);
        }

        if (action === "reorganize" && (ex.plateauCount ?? 0) > 0) {
          const swap = pickExercise(
            ex.movementCategory,
            Math.max(3, ex.plateauCount ?? 0),
            ex.exerciseId,
            experience
          );
          // Only clear the stall once the reorganisation actually changed the
          // movement. Previously counts 1–2 made `pickExercise` return the same
          // id and we still erased the evidence of the unresolved plateau.
          if (swap.id !== ex.exerciseId) {
            return swapExerciseIdentity(out, swap, undefined, ex);
          }
        }
      }
      return out;
    }),
  }));
}

export function advanceWeek(
  state: ProgramState,
  experience?: Experience,
  recovery: RecoveryState = "unknown",
  /**
   * D1: local Sunday week key the rolled-into week belongs to. Stamped onto
   * `liftWeekKey` so the calendar rollover has an anchor to compare against
   * next time. Passed in rather than read from the clock here to keep this
   * function pure — every other input is already explicit.
   *
   * Optional so existing callers and the whole test suite keep compiling; when
   * omitted the anchor is carried forward unchanged, which is the correct
   * degenerate behaviour (a caller that does not know the date must not
   * pretend the week moved).
   */
  nextWeekKey?: string
): ProgramState {
  // Cap at 52 weeks (1 year) then recycle — the 4-week periodization cycle
  // continues via modulo, but the number stays meaningful for UI display
  const nextWeek = state.weekNumber >= 52 ? 1 : state.weekNumber + 1;
  const prescription = generateWeekPrescription(nextWeek);

  const snapshot = { weekNumber: state.weekNumber, workouts: state.workouts };
  const history = [...(state.weekHistory ?? []), snapshot].slice(-8);

  // Reset BOTH completed and skipped for the new week. Carrying
  // `skipped: true` forward meant a user who skipped Day 3 last week
  // would still see Day 3 as skipped on the fresh week — even though
  // the week and prescription are new. Previously only `completed`
  // was reset, leaving `skipped` to leak across weeks.
  let workouts: WorkoutDay[] = state.workouts.map((day) => ({
    ...day,
    completed: false,
    skipped: false,
  }));

  // Acute fatigue from the week just trained (D-LIFT-8) — computed from the
  // logged per-exercise failure state rather than the formerly-dead persisted
  // scalar.
  const fatigue = computeFatigueScore(state.workouts);
  // Backlog #9 (H5): the joint plateau × recovery rule. Evaluated from the
  // week just TRAINED (state.workouts), before the weekly reshape rewrites
  // sets, so it reads the stall the user actually just hit.
  const plateauedExercises = countPlateauedExercises(state.workouts);
  // Blk2 amnesty. A block that changed the focus, or that the user set to
  // "easing back in", makes early misses EXPECTED rather than informative:
  // the rep targets just moved, or the user is deliberately under-reaching
  // while they find their feet. Without this, a represcribe can plateau
  // every main at once and `resolveAdjustment` escalates to `reorganize`,
  // whose arm calls `swapExerciseIdentity` on mains and zeroes their
  // history — the exact "fights the adaptive engine" failure Blk1 named.
  //
  // Only the programme-level RESPONSE is held. `plateauCount` keeps
  // accumulating truthfully on each lift, so nothing is being hidden; the
  // engine simply doesn't act on it for the first few weeks. The counter
  // self-decrements below, so amnesty expires with no sweep, no clock and
  // no review step — including for a user who abandons the block.
  const amnestyWeeksLeft = state.trainingBlock?.amnestyWeeksLeft ?? 0;
  const action =
    amnestyWeeksLeft > 0
      ? "hold"
      : resolveAdjustment({
          plateauedExercises,
          recovery,
          priorReductions: state.plateauResponses ?? 0,
        });

  /* 14b — the evidence-triggered tier, read from the week just TRAINED.
     The calendar deload (`week % 4 === 0`) is a starting point, not a
     detector: Schoenfeld p.200 says no study has quantified that cadence.
     This reads RP Ch3 P154's two-session regression instead, escalates
     muscle-local → whole-body per Ch3 P209-212, and biases toward firing
     because a false positive costs ~nothing (Ch3 P213; Schoenfeld p.200's
     3-week-break study) while a miss costs overtraining.

     Muscles still re-entering from LAST week's recovery session are excluded
     — the cut restores itself in full, so without that they would re-trigger
     forever. See `recoveryTrigger.ts`. */
  const { atMrv, trained } = musclesAtMrv(state.workouts);
  const recoveryMuscles = recoveryTargets(atMrv, state.recoveringMuscles);
  const escalateWholeBody =
    !prescription.deload &&
    recoveryMuscles.length > 0 &&
    escalatesToWholeBody(recoveryMuscles, trained);

  if (prescription.deload || escalateWholeBody) {
    // A deload week IS the light week — don't stack an adjustment on top of
    // it. The rule's bookkeeping below still runs, so a stall that spans a
    // deload is remembered rather than silently forgiven.
    //
    // The escalated case takes the SAME path deliberately: `prepareForDeload`
    // is what anchors sets and stashes load/reps so the cut cannot compound
    // across cycles, which is the D4 hazard this arc already paid for once.
    workouts = applyDeload(prepareForDeload(workouts), experience);
  } else {
    workouts = applyWeeklyVolumeShape(workouts, nextWeek);
    // Only apply fatigue on non-deload weeks to avoid double volume reduction
    workouts = applyFatigue(workouts, fatigue);
    workouts = applyAdjustment(workouts, action, experience);
    // Muscle-local recovery sessions land LAST, on the shaped week — halve
    // what the lifter would otherwise have done, not what they did before the
    // shape ran. Zatsiorsky p.81: fatigue is specific, so the muscles that are
    // fine keep their full week.
    workouts = applyRecoverySession(workouts, recoveryMuscles);
  }

  // Reset the memory once the stall itself clears; otherwise carry it, and
  // count a reduction so a SECOND stall escalates to `reorganize` instead of
  // cutting again. (Helms: if it recurs, the answer isn't another deload.)
  const plateauResponses =
    plateauedExercises < PROGRAMME_PLATEAU_MIN
      ? 0
      : (state.plateauResponses ?? 0) + (action === "reduce_volume" ? 1 : 0);

  // D-LIFT-4: at the start of a new mesocycle (weeks 5, 9, … and the 52→1
  // recycle), rotate UNTRAINED accessories to a fresh variation for novelty +
  // joint health. Trained accessories (logged history) and all mains stay put —
  // mains are the progression anchor, and a lift the user actually trains is
  // theirs to keep. Re-deduped so a rotation can't collide within a day.
  if (nextWeek % 4 === 1) {
    workouts = dedupeDayExercises(
      rotateUntrainedAccessories(workouts, experience)
    );
  } else if (action === "reorganize") {
    // Same hazard from #9's rotation: a swapped lift can collide with
    // another exercise already in that day.
    workouts = dedupeDayExercises(workouts);
  }

  return {
    ...state,
    weekNumber: nextWeek,
    currentPhase: prescription.deload ? "deload" : "progression",
    workouts,
    weekHistory: history,
    // A deload clears accumulated acute fatigue; otherwise persist the computed
    // value so the field is meaningful + observable (no longer dead).
    fatigueScore: prescription.deload ? 0 : fatigue,
    plateauResponses,
    // Blk2: monotone, so amnesty runs out on its own.
    ...(state.trainingBlock
      ? {
          trainingBlock: {
            ...state.trainingBlock,
            amnestyWeeksLeft: Math.max(0, amnestyWeeksLeft - 1),
          },
        }
      : {}),
    ...(nextWeekKey ? { liftWeekKey: nextWeekKey } : {}),
    // The refractory list for next week. Written even when empty so a muscle
    // that finishes re-entering is released rather than held forever, and
    // omitted entirely when there is nothing to say — Firestore rejects
    // `undefined`, and an always-present empty array is bytes for no
    // information. A whole-body escalation records nothing: `applyDeload` is
    // its own restore cycle and does not need this guard.
    ...(!escalateWholeBody &&
    (recoveryMuscles.length > 0 || state.recoveringMuscles?.length)
      ? { recoveringMuscles: recoveryMuscles }
      : {}),
    updatedAt: Date.now(),
    nextWorkoutOverride: undefined,
  };
}
