import type {
  Experience,
  GoalProfile,
  MovementCategory,
  PrimaryGoal,
  ProgramExercise,
  ProgramState,
  SplitType,
  WorkoutDay,
} from "./programTypes";
import { generateInstanceId, loweringOf } from "./programTypes";
import {
  calendarLighterWeek,
  EASING_BACK_WEEKS,
  lighterWeeksScheduled,
  isRaceBuildWeek,
  raceLiftWeek,
  type RaceBlockWeek,
} from "./weekPrescription";
import { loadsTheLegs } from "./easierToday";
import {
  pickExercise,
  pickAccessory,
  exerciseBank,
  exerciseDisplayName,
} from "./variationBank";
import { inferMovementCategory } from "@/lib/exerciseMovementCategory";
import {
  balancePushPull,
  judgementLandmark,
  reconcileToLandmarks,
} from "./volumeModel";
import { fitSessionsToTime, sessionFits } from "./sessionFit";
import {
  applyEquipmentFilterToWorkouts,
  applyInjuryFiltersToWorkouts,
  restoreSwappedLifts,
} from "./matchTemplate";
import { extraPastCeiling, twiceWeeklyAdditions } from "./weeklyFrequency";
import {
  seedStartingLoads,
  weightAfterExerciseSwap,
  type StartingLoadContext,
} from "./startingLoads";
import {
  automaticStepUp,
  lighterBy,
  loadGridFor,
  loweredLoad,
  MISSES_BEFORE_LOWERING,
  stretchedRepCeiling,
  type LoadGrid,
} from "./loadSteps";
import {
  capRepeatedLifts,
  lowCostAlternative,
  orderForAdjacency,
  surplusExposures,
} from "./overlapModel";
import {
  applyComplexityGate,
  toExperience,
  usesUndulation,
} from "./experienceModel";
import { mainRepAnchor, roleRepsFor } from "./roleTable";
import { nextUpIndex } from "./nextUpCursor";
import {
  hardestEffort,
  recordedReps,
  sessionOutcome,
  type SessionRead,
} from "./sessionSets";
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
   *     does not influence lean-mass preservation during energy restriction,
   *     which is why a cut leaves the lifting's volume alone (Lift4 (4)).
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

/**
 * The rep ceiling a range-LESS double progression already implies.
 *
 * `repRangeMax` is stamped by generation's final pass, so a freshly generated
 * plan always has one. Several LIVE writers do not, and each was checked
 * rather than assumed: the v3 coverage backfill in `migrations.ts` appends
 * calf raises and a lateral raise as `progressionType: "double"` with no
 * range; `templateExToProgEx` leaves per-side forms ("10/leg" — 15 of the
 * 245 authored template exercises) range-less; and every document generated
 * before backlog #7 carries range-less mains.
 *
 * All of them took the legacy arm in `applyProgression`, which fires only
 * when the lifter SPONTANEOUSLY exceeds the prescription by two — so the
 * target itself never moved, and a lifter who does exactly what the app asks
 * for is frozen. Measured over 12 sessions driven from those real writers: a
 * migration-added calf raise sat at 3×12@40 kg the entire time while a ranged
 * accessory beside it took three load steps.
 *
 * The ceiling returned here is NOT new policy — it is the one the legacy arm
 * already acts on, made explicit so the TARGET can climb toward it:
 *
 *   weighted   — `resetReps + 2`, the overshoot at which the legacy arm steps
 *                the load and resets the target;
 *   bodyweight — `MAX_BODYWEIGHT_REPS`, the ceiling `bumpBodyweightReps`
 *                already falls back to when no range is authored.
 *
 * On the WEIGHTED arm that makes the fallback exactly behaviour-preserving
 * for a lifter who does overshoot by two — same load step, same reset —
 * and the only change is that a compliant lifter is now ASKED for the next
 * rep instead of having to volunteer it. The BODYWEIGHT arm is not identical
 * and shouldn't be: an overshoot to 10 used to set the next target to 9
 * (current + 1), and now sets it to 11, because the range-aware bodyweight
 * contract is "one past what was actually done". A range-less pull-up now
 * behaves like a ranged one instead of like a different feature.
 *
 * Anchored on `resetReps`, never on the live `reps`: a ceiling derived from a
 * target that is itself climbing would never terminate.
 *
 * Seconds are excluded deliberately. A hold climbs in 5-second steps toward
 * `MAX_HOLD_SECONDS`, so `resetReps + 2` would mean two seconds — the same
 * rep-shaped reasoning LIFT-EV-01 took out of the hold deload. Holds keep
 * today's behaviour until the time axis is looked at on its own terms.
 */
function impliedDoubleRangeMax(
  resetReps: number,
  isBodyweight: boolean,
  isTimed: boolean
): number | undefined {
  if (isTimed) return undefined;
  const ceiling = isBodyweight ? MAX_BODYWEIGHT_REPS : resetReps + 2;
  return ceiling > resetReps ? ceiling : undefined;
}

/**
 * The reps a lift is set, as the person reads them (Lift4 (3)): a range for
 * a lift that climbs reps before it adds weight ("8–12"), the target alone
 * for a fixed one ("5"). The range runs from the bottom the reps return to
 * after a step to the top that earns one, or past it where the next weight
 * is too big a step and the target has climbed on (`loadSteps.ts`).
 */
export function prescribedRepRange(
  ex: Pick<
    ProgramExercise,
    "exerciseId" | "reps" | "baseReps" | "repRangeMax" | "repUnit"
  > & { progressionType?: ProgramExercise["progressionType"] }
): { bottom: number; top: number } {
  const base = ex.baseReps ?? ex.reps;
  const top =
    ex.progressionType === "double"
      ? (ex.repRangeMax ??
        impliedDoubleRangeMax(
          base,
          isBodyweightExerciseId(ex.exerciseId),
          ex.repUnit === "seconds"
        ))
      : undefined;
  return {
    bottom: Math.min(base, ex.reps),
    top: Math.max(ex.reps, top ?? ex.reps),
  };
}

/** Timed holds climb in 5-second steps (N2's time axis). */
const HOLD_STEP_SECONDS = 5;
/** Ceiling for a hold with no authored range — past this, add load instead. */
const MAX_HOLD_SECONDS = 60;
/** Floor for any hold reduction (failure deload or mesocycle deload) — below
 *  ~10s the movement stops being a hold. LIFT-EV-01 named what was a magic
 *  literal in the deload path. */
const MIN_HOLD_SECONDS = 10;

/**
 * Per-exercise `performanceHistory` ceiling.
 *
 * D2: this was `.slice(-10)` here, but `.slice(-20)` on `useProgram`'s
 * block-amnesty branch — so how much history a lifter kept silently depended
 * on whether a training block happened to be holding progression that week.
 * Exported so the sites share one number.
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

/* ================================
   EXERCISE BUILDER HELPER
================================ */

/**
 * The level the builders pick at. Every plan is built from the intermediate
 * tier's standard lifts, then `applyComplexityGate` re-points what a beginner
 * can't be offered; an advanced lifter's specialised variations come in only
 * when they pick one. Named here because a pick without a level is a
 * beginner's (`toExperience`).
 */
const BUILDER_TIER: Experience = "intermediate";

/**
 * Build a programme exercise from the PRIMARY variation pool, preserving an
 * existing row's load/history/instanceId across a regenerate.
 *
 * `isAccessory` marks a supporting slot rather than one of the session's
 * main lifts: the role table reads it (`exerciseRole.ts`), and the time fit
 * and the volume balance cut supporting slots first. `buildFullBody` needs to mark supporting slots WITHOUT `makeAccessory`,
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
  const currentOption = existing
    ? (exerciseBank[category] ?? []).find(
        (option) => option.id === existing.exerciseId
      )
    : undefined;
  // Keep a carried variation, stalled or not: the engine never swaps a lift
  // on its own (Lift4 (2)). The builders pick at the intermediate tier, so
  // asking `pickExercise` to validate it here would silently turn an
  // advanced specialist lift back into the primary on the next
  // regeneration; the complexity gate owns downgrades.
  const ex = currentOption ?? pickExercise(category, undefined, BUILDER_TIER);
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
    ...(existing && !identityChanged && existing.swappedFrom
      ? { swappedFrom: existing.swappedFrom }
      : {}),
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
  };
}

function makeAccessory(
  category: MovementCategory,
  sets: number,
  reps: number,
  weight: number,
  excludeId?: string
): ProgramExercise {
  const ex = pickAccessory(category, excludeId, BUILDER_TIER);
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
    // makes this meaningful is stamped in generateProgram's final pass.
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

function buildFullBody(
  profile: GoalProfile,
  count: number,
  existing?: WorkoutDay[]
): WorkoutDay[] {
  const vm = profile.volumeMultiplier;
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
  existing?: WorkoutDay[]
): WorkoutDay[] {
  const vm = profile.volumeMultiplier;
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

function buildPPL(profile: GoalProfile, existing?: WorkoutDay[]): WorkoutDay[] {
  const vm = profile.volumeMultiplier;
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
function buildLegsB(profile: GoalProfile, existing?: WorkoutDay[]): WorkoutDay {
  const vm = profile.volumeMultiplier;
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
 * (a main carried on a variation an accessory also picked) is re-pointed
 * to the first unused variation in the same movement category. Deterministic;
 * leaves the duplicate as-is only if the category has no free alternative.
 * Pure — returns a new array.
 */
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
 * Lift4 (5): every lift's sets, reps and progression from its role
 * (`roleTable.ts`). A range climbs ("double"); a fixed target steps whenever
 * every set reaches it ("linear"). Timed holds keep their seconds.
 */
function applyRoleTable(
  workouts: WorkoutDay[],
  goal: PrimaryGoal | undefined,
  experience: Experience | undefined
): WorkoutDay[] {
  return workouts.map((day) => ({
    ...day,
    exercises: day.exercises.map((ex) => {
      if (ex.repUnit === "seconds") return ex;
      const row = roleRepsFor(goal, ex, experience);
      return {
        ...ex,
        sets: row.sets,
        reps: row.bottom,
        baseReps: row.bottom,
        progressionType: row.top === undefined ? "linear" : "double",
      };
    }),
  }));
}

/**
 * The week's volume passes, once its sessions fit their time (Lift4 (5)).
 * The weekly bands are only a ceiling, in two tiers (a beginner's, everyone
 * else's). ADR-0010's staged condition, landed with the SECONDARY_SET_WEIGHT
 * 1:1 flip, runs reconcile → balance → reconcile:
 *   1. shrink what the builders over-authored (the ceilings' authority);
 *   2. D-LIFT-3: keep weekly pull volume ≥ push (shoulder-health balance),
 *      adding only inside what each session fits;
 *   3. a second reconcile polices anything the adds re-inflated (at 1:1 an
 *      add credits every secondary too).
 * Shared by a new plan and a plan re-fitted to a new session length, so the
 * two come out alike.
 */
export function balanceWeekVolume(
  workouts: WorkoutDay[],
  goal: PrimaryGoal | undefined,
  experience: Experience | undefined,
  minutes: number
): WorkoutDay[] {
  const ceiling = (m: Parameters<typeof judgementLandmark>[1]) =>
    judgementLandmark(goal, m, toExperience(experience));
  const balanced = balancePushPull(
    reconcileToLandmarks(workouts, ceiling),
    ceiling,
    (exercises) => sessionFits(exercises, minutes)
  );
  return reconcileToLandmarks(balanced, ceiling);
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
      return { ...ex, ...carriedState(prev) };
    }),
  }));
}

/** What a regenerate carries of an accessory the plan already had: its
 *  identity and what has been logged against it. Sets and reps are the new
 *  build's. */
function carriedState(prev: ProgramExercise): Partial<ProgramExercise> {
  return {
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
    // A swapped lift keeps its way back (Lift4 (11)).
    ...(prev.swappedFrom !== undefined
      ? { swappedFrom: prev.swappedFrom }
      : {}),
  };
}

/**
 * Add the lifts that work every muscle on two days a week
 * (`twiceWeeklyAdditions`), each at the end of its day, and say which they
 * are: the time fit lets them go before the builders' own lifts. A
 * regenerate keeps one the plan already had, with its load and history: the
 * same lift on the day of the same name first, then anywhere in the old
 * week, never one the new week already holds.
 */
function addTwiceWeeklyLifts(
  workouts: WorkoutDay[],
  existing?: WorkoutDay[]
): { workouts: WorkoutDay[]; extras: Set<string> } {
  const extras = new Set<string>();
  const additions = twiceWeeklyAdditions(workouts);
  if (additions.length === 0) return { workouts, extras };
  const held = new Set(
    workouts.flatMap((d) => d.exercises.map((e) => e.instanceId))
  );
  const carried = new Set<ProgramExercise>();
  const days = workouts.map((d) => ({ ...d, exercises: [...d.exercises] }));
  for (const { day, exerciseId } of additions) {
    const sameName = existing?.filter((d) => d.dayName === days[day].dayName);
    const prev = [...(sameName ?? []), ...(existing ?? [])]
      .flatMap((d) => d.exercises)
      .find(
        (e) =>
          e.exerciseId === exerciseId &&
          !carried.has(e) &&
          (e.instanceId === undefined || !held.has(e.instanceId))
      );
    // Sets, reps and load are placeholders: the role table and the seeding
    // below give the lift its own.
    const fresh = makeNamedAccessory(exerciseId, 3, 12, 0);
    const lift = prev ? { ...fresh, ...carriedState(prev) } : fresh;
    if (prev) carried.add(prev);
    if (lift.instanceId) extras.add(lift.instanceId);
    days[day].exercises.push(lift);
  }
  return { workouts: days, extras };
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

export function generateProgram(
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
   * The lifter's level (`experienceModel.ts`). Gates movement COMPLEXITY,
   * whether the week undulates, and the role table's beginner column
   * (`roleTable.ts`): a beginner's main lifts take a fixed target and
   * everything else two sets.
   *
   * Deliberately its OWN parameter rather than read off `loadCtx.experience`,
   * even though the context carries it: `loadCtx` is undefined whenever the
   * bodyweight is unknown, so reading it there would silently hand a beginner
   * the intermediate programme for an unrelated reason. Absent → a
   * beginner's, as an unknown level is everywhere (Lift4 (5)); every plan
   * build passes the person's (`toExperience`).
   */
  experience?: Experience,
  /**
   * The session length the plan is built for (Lift4 (5), `sessionFit.ts`):
   * each session is cut to fit it. Every plan build passes one
   * (`sessionMinutesFor`); absent, only the 18-set ceiling applies.
   */
  sessionMinutes?: number,
  /**
   * What the person can do (Lift4 (11)): their equipment and injuries. A
   * lift they can't do or that their injury rules out is swapped
   * (`matchTemplate.ts`) before the role table, the seeding and the time
   * fit, so the plan's numbers and its fit are the lifts they'll do.
   * Absent: a full gym and no injuries.
   */
  limits?: {
    equipment?: string;
    injuries?: readonly string[];
    /** A barbell and a rack beside a home gym's kit. */
    barbellAtHome?: boolean;
  }
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
        workouts = buildFullBody(profile, fbDays, existingWorkouts);
        break;
      }
      case "ppl":
        workouts = buildPPL(profile, existingWorkouts).slice(0, 3);
        break;
      case "upper_lower": {
        const ul = buildUpperLower(profile, existingWorkouts);
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
          ...buildPPL(profile, existingWorkouts).slice(0, 3),
          ...buildUpperLower(profile, existingWorkouts?.slice(3)).slice(0, 2),
        ];
        break;
      case "ppl_x2": {
        const ppl = buildPPL(profile, existingWorkouts);
        workouts = [...ppl, buildLegsB(profile, existingWorkouts)];
        break;
      }
      case "ppl_x2_fb": {
        // Retained for backward-compat — `chooseSplit` no longer returns
        // this (capped at 6 days) but existing programState rows on disk
        // may still pass through here on regeneration.
        const ppl7 = buildPPL(profile, existingWorkouts);
        // Same offset rule as `ppl_ul` — this day sits at week position 6.
        const fb = buildFullBody(profile, 1, existingWorkouts?.slice(6));
        workouts = [
          ...ppl7,
          buildLegsB(profile, existingWorkouts),
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
        workouts = buildUpperLower(profile, existingWorkouts);
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

  // D-LIFT-12: ensure no day picks the same exercise twice (e.g. a main
  // carried on a variation an accessory then matched). Re-picks the duplicate
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
  // Lift4 (5): every muscle worked on two days a week. After the identity
  // passes, so it counts the lifts the person gets, and before the role
  // table, the seeding and the time fit, which treat what it adds like any
  // other lift.
  const twiceWeekly = addTwiceWeeklyLifts(workouts, existingWorkouts);
  workouts = twiceWeekly.workouts;
  // Lift4 (11): injuries first (safety), then equipment, whose picker is
  // injury-aware; both keep a slot's place, so what the passes above
  // settled, the added lifts included, stays where it is.
  if (limits) {
    const injuries = [...(limits.injuries ?? [])];
    workouts = applyInjuryFiltersToWorkouts(
      restoreSwappedLifts(
        workouts,
        injuries,
        limits.equipment ?? "full_gym",
        loadCtx,
        limits.barbellAtHome
      ),
      injuries,
      limits.equipment,
      loadCtx,
      limits.barbellAtHome
    );
    workouts = applyEquipmentFilterToWorkouts(
      workouts,
      limits.equipment ?? "full_gym",
      injuries,
      experience,
      loadCtx,
      limits.barbellAtHome
    );
  }
  // Lift4 (5): each lift's sets, reps and progression come from its role
  // (`roleTable.ts`), once the identity passes have settled who is where;
  // then backlog #3's day roles shift the reps, see applyDayRoles above.
  workouts = applyRoleTable(workouts, primaryGoal, experience);
  workouts = applyDayRoles(workouts, experience);
  // D-LIFT-5: seed bodyweight-relative cold-start loads on never-trained lifts
  // (lifts with logged history keep theirs; with no bodyweight, the plan
  // starts from the bar). After every pass that settles who is where, so it
  // calibrates whatever the caps above re-pointed, and before the time fit,
  // which prices each lift's warm-up from its load.
  workouts = seedStartingLoads(
    workouts,
    loadCtx,
    mainRepAnchor(primaryGoal, experience)
  );
  // Lift4 (5): time decides the volume. Each session is cut to the minutes
  // the person has (`sessionFit.ts`), then the week is balanced inside them.
  const minutes = sessionMinutes ?? Number.POSITIVE_INFINITY;
  let fitted = fitSessionsToTime(workouts, minutes, twiceWeekly.extras);
  // A lift added for the two days a week that leaves a muscle over its
  // ceiling once the week is balanced goes, and the week is balanced again
  // without it, so nothing is trimmed to make room for a lift that isn't
  // there.
  for (;;) {
    workouts = balanceWeekVolume(fitted, primaryGoal, experience, minutes);
    const past = extraPastCeiling(
      workouts,
      twiceWeekly.extras,
      (m) => judgementLandmark(primaryGoal, m, toExperience(experience)).high
    );
    if (past === undefined) break;
    fitted = fitted.map((d) => ({
      ...d,
      exercises: d.exercises.filter((ex) => ex.instanceId !== past),
    }));
  }

  // Backlog #5: stamp the steady-state volume anchor AFTER balancing and
  // seeding — advanceWeek derives each week's sets from baseSets.
  // Backlog #7: stamp the rep-range ceiling in the same pass, and for the
  // same reason — it must be derived from the FINAL `reps`, after day roles
  // have shifted them. Carrying a fixed ceiling through applyDayRoles would
  // hand a heavy day (reps 8 → 6) the untouched 12-rep ceiling, turning a
  // 4-rep climb into a 6-rep one. Deriving from the span keeps the range
  // width constant across every role. A fixed target has none.
  workouts = workouts.map((day) => ({
    ...day,
    exercises: day.exercises.map((ex) => {
      const out: ProgramExercise = { ...ex, baseSets: ex.sets };
      if (ex.repUnit === "seconds") return out;
      const row = roleRepsFor(primaryGoal, ex, experience);
      const span = row.top === undefined ? 0 : row.top - row.bottom;
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

/**
 * The load a session moves a lift's prescription to before any step: the
 * weight actually lifted, however far above or below the prescription it
 * was. The owner's rule, which reverses Lift2 (plan file): the plan adjusts
 * to what was lifted, so a seed that is too light or too heavy is put right
 * by the first session rather than typed over in every session after it.
 *
 * `null` when there is no load to follow: a bodyweight movement, whose axis
 * is reps, or a set saved with no load (a cleared weight field saves 0).
 */
export function liftedLoad(
  exerciseId: string | undefined,
  actualWeight: number
): number | null {
  if (isBodyweightExerciseId(exerciseId)) return null;
  return Number.isFinite(actualWeight) && actualWeight > 0
    ? actualWeight
    : null;
}

export function applyProgression(
  exercise: ProgramExercise,
  actualReps: number,
  actualWeight: number,
  smallPlates: boolean,
  actualRpe?: number,
  /** How much a miss here counts: half for a leg lift within a day after a
   *  long or hard run (Lift4 (7)), one otherwise. */
  missCounts = 1,
  /** The session's local date (yyyy-MM-dd) for its history record, so the
   *  record belongs to the day the session started (Lift3) and the engine
   *  reads no clock. Today when absent. */
  date: string = format(new Date(), "yyyy-MM-dd")
): ProgramExercise {
  const record = {
    date,
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
  // The plan follows the load lifted (see `liftedLoad`).
  // A loaded lift's prescription moves to the weight actually lifted,
  // heavier or lighter and by any margin. There is no typo guard: a wrong
  // number is put right by lifting the right one next session. Success is
  // the target reps at that weight, and the steps below run from it: the
  // range climb, the step at the top of a range or on a fixed target, and
  // the RPE hold. Reps missed: the prescription still
  // moves to the load lifted and the miss counts, and two in a row lower the
  // lift (`countMiss`). No load logged: nothing to follow, so the session is
  // recorded and the prescription and its failure count stay as they were.
  // Bodyweight movements are untouched: they progress by reps, and success
  // still asks for any load the plan adds. No note is written — `notes` is
  // the injury-warning slot.
  const lifted = liftedLoad(exercise.exerciseId, actualWeight);
  if (!isBodyweight && lifted === null) return updated;
  const anchor = lifted ?? exercise.weight;
  updated.weight = anchor;
  const completed =
    actualReps >= exercise.reps &&
    (!isBodyweight || actualWeight >= exercise.weight);
  // Lift4 (6): the weight steps on its equipment's grid (`loadSteps.ts`),
  // and a step of more than about 15% is never taken on its own: the target
  // climbs a rep past what was done instead, as far as the next weight's
  // equal effort, and the plan follows the heavier weight once the person
  // picks it up (`applySessionSets`).
  const grid = loadGridFor(exercise.exerciseId, smallPlates);
  const stepOrStretch = () => {
    const next = automaticStepUp(grid, anchor);
    if (next !== null) {
      updated.weight = next;
      updated.reps = resetReps;
      return;
    }
    const ceiling = stretchedRepCeiling(anchor, grid.above(anchor), resetReps);
    updated.reps = Math.max(exercise.reps, Math.min(actualReps + 1, ceiling));
  };
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
      // Authored ceiling, or the one the legacy arm below already implies —
      // see `impliedDoubleRangeMax`. Without the fallback a range-less double
      // never progresses at all for a lifter who hits the prescription.
      const rangeMax =
        exercise.repRangeMax ??
        impliedDoubleRangeMax(resetReps, isBodyweight, isTimed);
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
            stepOrStretch();
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
          stepOrStretch();
        }
      }
      // Otherwise: success recorded but reps still accumulating toward ceiling
      updated.lastSuccessfulWeight = actualWeight;
      updated.consecutiveFailures = 0;
      updated.plateauCount = 0;
    } else {
      countMiss(
        updated,
        exercise,
        anchor,
        isBodyweight,
        isTimed,
        grid,
        missCounts
      );
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
      } else if (rpeOk) {
        // A fixed target met on every set: the weight goes up a step.
        stepOrStretch();
      }
      updated.lastSuccessfulWeight = actualWeight;
      updated.consecutiveFailures = 0;
      updated.plateauCount = 0;
    } else {
      countMiss(
        updated,
        exercise,
        anchor,
        isBodyweight,
        isTimed,
        grid,
        missCounts
      );
    }
  }

  return updated;
}

/** Misses in a row that lower a lift (Lift4, owner call (1)): two, as
 *  Madcow and Helms use, since most lifts come round once or twice a week. */

/**
 * A miss at the plan's weight (Lift4 (7)). The first holds, silently: the
 * sets explain it. The second in a row lowers the lift. A loaded lift comes
 * down 10% on its grid, by at least one step (`loweredLoad`), with the rep
 * target kept,
 * and climbs back to the weight it came from (`applySessionSets`). A
 * bodyweight lift comes down a rep, and a hold five seconds (LIFT-EV-01: a
 * rep-sized step walked a plank down one second at a time). Either way the
 * record (`lowered`) gives the next session its one line, and
 * `plateauCount` records the stall.
 */
function countMiss(
  updated: ProgramExercise,
  exercise: ProgramExercise,
  anchor: number,
  isBodyweight: boolean,
  isTimed: boolean,
  grid: LoadGrid,
  missCounts: number
): void {
  updated.consecutiveFailures =
    (exercise.consecutiveFailures || 0) + missCounts;
  if (updated.consecutiveFailures < MISSES_BEFORE_LOWERING) return;
  if (isBodyweight) {
    updated.reps = isTimed
      ? Math.max(MIN_HOLD_SECONDS, exercise.reps - HOLD_STEP_SECONDS)
      : Math.max(4, exercise.reps - 1);
    updated.lowered = {
      exerciseId: exercise.exerciseId,
      from: exercise.reps,
      unit: isTimed ? "s" : "reps",
      target: exercise.reps,
    };
  } else {
    updated.weight = loweredLoad(grid, anchor);
    updated.lowered = {
      exerciseId: exercise.exerciseId,
      from: anchor,
      unit: "kg",
      target: exercise.reps,
    };
  }
  updated.consecutiveFailures = 0;
  updated.plateauCount = (exercise.plateauCount || 0) + 1;
}

/**
 * One finished session's progression for an exercise, read from all its
 * working sets (Lift4). `sessionSets.ts` decides which sets count and what
 * they earned; the climb and the steps are `applyProgression`'s.
 *
 * - step: the climb or the load step from the weight followed, with the
 *   weakest counted set as the reps done, so the next target is one past
 *   what every set reached, and the hardest logged effort as the session's;
 * - miss: `applyProgression`'s miss, at the plan's own weight;
 * - hold: the plan follows the weight lifted, and a run of misses ends
 *   there. A heavier weight starts the reps from the bottom again, as the
 *   plan's own step does: the target climbed at the lighter weight isn't
 *   one for it.
 *
 * A lift the plan lowered climbs back first: a step a session that is not a
 * miss, to the weight it came down from (`lowered`), and then the usual
 * rules resume. Its line was the next session's alone, so the record goes
 * on only as that way back.
 *
 * The session's record shows the average set at the weight followed
 * (`recordedReps`), so a session that met its target never records under
 * it. An uncalibrated lift, or a loaded one logged with no
 * load, goes to `applyProgression` whatever the sets earned: it calibrates
 * the first, and keeps the second as it was.
 */
export function applySessionSets(
  exercise: ProgramExercise,
  read: SessionRead,
  smallPlates: boolean,
  /** How much a miss counts (`applyProgression`). */
  missCounts = 1,
  /** The session's local date for its history record (`applyProgression`). */
  date: string = format(new Date(), "yyyy-MM-dd")
): ProgramExercise {
  const isBodyweight = isBodyweightExerciseId(exercise.exerciseId);
  const reps = recordedReps(read);
  const weakest = Math.min(...read.counted.map((set) => set.reps));
  const lifted = liftedLoad(exercise.exerciseId, read.weight);
  const outcome = sessionOutcome(read, exercise, isBodyweight);
  const uncalibrated =
    !isBodyweight && (exercise.weight === 0 || lifted === null);

  const progressed = (ex: ProgramExercise) =>
    withRecordedReps(
      applyProgression(
        ex,
        weakest,
        read.weight,
        smallPlates,
        hardestEffort(read),
        missCounts,
        date
      ),
      reps
    );
  const lowering = loweringOf(exercise);
  const { lowered: _line, ...base } = exercise;

  // Climbing back to where the plan lowered the lift from: a step a session
  // that is not a miss, at most to that weight, and the rep target as it
  // was. At it or past it, the usual rules take over from the weight lifted.
  if (
    lowering?.unit === "kg" &&
    !uncalibrated &&
    lifted !== null &&
    lifted < lowering.from
  ) {
    const climbing = {
      ...base,
      lowered: { ...lowering, shown: true as const },
    };
    if (outcome === "miss") return progressed(climbing);
    const weight = Math.min(
      lowering.from,
      loadGridFor(exercise.exerciseId, smallPlates).above(lifted)
    );
    return {
      ...recorded(
        weight < lowering.from ? climbing : base,
        read,
        reps,
        outcome === "step",
        date
      ),
      weight,
      ...(outcome === "step" ? { lastSuccessfulWeight: read.weight } : {}),
    };
  }

  if (uncalibrated || outcome !== "hold") return progressed(base);
  const heavier = lifted !== null && lifted > exercise.weight + 0.01;
  return {
    ...recorded(base, read, reps, false, date),
    ...(lifted === null ? {} : { weight: lifted }),
    ...(heavier && base.baseReps !== undefined ? { reps: base.baseReps } : {}),
  };
}

/**
 * A lift once a session has shown its lowered line: the line said, and a
 * lowered weight's way back kept. A record a swap left behind goes.
 */
export function afterLoweredLine(exercise: ProgramExercise): ProgramExercise {
  if (!exercise.lowered) return exercise;
  const lowering = loweringOf(exercise);
  const { lowered: _line, ...rest } = exercise;
  return lowering?.unit === "kg" && exercise.weight < lowering.from
    ? { ...rest, lowered: { ...lowering, shown: true } }
    : rest;
}

/** A session recorded with no step and no miss: its history line, what was
 *  lifted, and the end of any run of misses. */
function recorded(
  exercise: ProgramExercise,
  read: SessionRead,
  reps: number,
  completed: boolean,
  date: string
): ProgramExercise {
  return {
    ...exercise,
    lastAttemptedWeight: read.weight,
    performanceHistory: [
      ...(exercise.performanceHistory || []),
      {
        date,
        weight: read.weight,
        repsCompleted: reps,
        repsTarget: exercise.reps,
      },
    ].slice(-PERFORMANCE_HISTORY_CAP),
    lastPerformance: {
      sets: exercise.sets,
      reps,
      weight: read.weight,
      completed,
    },
    consecutiveFailures: 0,
  };
}

/** `applyProgression` records the reps it was given; the session's record
 *  shows its average set instead. */
function withRecordedReps(
  exercise: ProgramExercise,
  reps: number
): ProgramExercise {
  const history = exercise.performanceHistory ?? [];
  return {
    ...exercise,
    ...(history.length
      ? {
          performanceHistory: history.map((record, i) =>
            i === history.length - 1
              ? { ...record, repsCompleted: reps }
              : record
          ),
        }
      : {}),
    ...(exercise.lastPerformance
      ? { lastPerformance: { ...exercise.lastPerformance, reps } }
      : {}),
  };
}

/* ================================
   FATIGUE / DELOAD / ADVANCEMENT
================================ */

/**
 * A lighter week (Lift4 (9)): one recipe for everyone, half the working
 * sets, rounded up, at the same weights and reps. It halves the plan's own
 * sets (`baseSets`, stamped here on a plan that predates it), so it can't
 * compound, and the next week's reset puts them back. A lighter week's
 * sessions can move a weight up, never down (`applySessionProgression`).
 */
export function applyDeload(workouts: WorkoutDay[]): WorkoutDay[] {
  return workouts.map((day) => ({
    ...day,
    exercises: day.exercises.map((ex) => {
      const base = ex.baseSets ?? ex.sets;
      return { ...ex, baseSets: base, sets: Math.max(1, Math.ceil(base / 2)) };
    }),
  }));
}

export function shouldAdvanceWeek(workouts: WorkoutDay[]): boolean {
  return workouts.every((day) => day.completed || day.skipped);
}

/**
 * Each week starts from the plan's own sets: every lift is set back to its
 * `baseSets` anchor (stamped here on a plan that predates it), so a lighter
 * week's cut lasts that week and nothing compounds. Leaving a lighter week
 * also restores the weight and reps it stashed; `max()` keeps anything the
 * person progressed during it.
 */
export function resetToBaseSets(workouts: WorkoutDay[]): WorkoutDay[] {
  return workouts.map((day) => ({
    ...day,
    exercises: day.exercises.map((ex) => {
      const base = ex.baseSets ?? ex.sets;
      const out: ProgramExercise = { ...ex, baseSets: base, sets: base };
      if (typeof ex.preDeloadWeight === "number") {
        out.weight = Math.max(out.weight, ex.preDeloadWeight);
        delete out.preDeloadWeight;
      }
      // The same max()-wins restore for the rep target, which the
      // post-novice deload recipe cuts; without it the cut would decay the
      // prescription every cycle.
      if (typeof ex.preDeloadReps === "number") {
        out.reps = Math.max(out.reps, ex.preDeloadReps);
        delete out.preDeloadReps;
      }
      return out;
    }),
  }));
}

export function advanceWeek(
  state: ProgramState,
  experience?: Experience,
  /**
   * D1: local week key the rolled-into week belongs to. Stamped onto
   * `liftWeekKey` so the calendar rollover has an anchor to compare against
   * next time. Passed in rather than read from the clock here to keep this
   * function pure — every other input is already explicit.
   *
   * Optional so existing callers and the whole test suite keep compiling; when
   * omitted the anchor is carried forward unchanged, which is the correct
   * degenerate behaviour (a caller that does not know the date must not
   * pretend the week moved).
   */
  nextWeekKey?: string,
  /**
   * Where the run plan stands in the week rolled into, when a race plan
   * runs (`raceBlockWeek` of the next week's run plan): its step-back weeks
   * are then the lighter weeks (Lift4 (9)), and its final weeks the race's
   * (Lift4 (10)). Absent, lighter weeks come every 4th trained week.
   */
  nextRaceWeek?: RaceBlockWeek | null,
  /** The answer at race setup (`raceLegTrim` on the profile): yes trims
   *  the leg lifts from the run plan's build weeks until the two lighter
   *  weeks before the race (Lift4 (10), `isRaceBuildWeek`). */
  options: { raceLegTrim?: boolean } = {}
): ProgramState {
  /* Did the week being rolled OUT of actually happen?
     `liftWeekKey` tracks where the user is in TIME; `weekNumber` tracks where
     they are in the TRAINING BLOCK. Those are different things, and conflating
     them would count weeks nobody trained toward the next lighter week. */
  const weekWasTrained = state.workouts.some((day) => day.completed);

  /* Cap at 52 weeks (1 year) then recycle — the 4-week periodization cycle
     continues via modulo, but the number stays meaningful for UI display.

     An untrained week HOLDS the number. A cycle accumulates training, so a
     week with no session accumulated nothing and did not move the person
     through it: the lighter week comes every 4th TRAINED week (Lift4 (9)),
     and a returning lifter resumes at the position they left. The calendar
     anchor still advances every iteration, so the rollover loop still
     terminates and nobody is stuck re-rolling the same week. */
  const heldOrNext = !weekWasTrained
    ? state.weekNumber
    : state.weekNumber >= 52
      ? 1
      : state.weekNumber + 1;
  /* Lift4 (10): the race's final weeks (`raceLiftWeek`). The week after
     the race ends a cycle, so the calendar's count starts again after it. */
  const raceWeek = raceLiftWeek(nextRaceWeek, state.raceWeek);
  const nextWeek =
    raceWeek === "after" ? Math.ceil(heldOrNext / 4) * 4 : heldOrNext;

  /* Archive only weeks that happened. `weekHistory` is capped at 8, so
     archiving absent weeks would let a 12-week catch-up evict every real
     week the user trained and replace it with eight copies of an empty one —
     an archive that says nothing happened for two months is not the "honest
     record" the unattended-days trade-off was defending; that reasoning is
     about a week the user was PRESENT for and left unfinished. */
  const history = weekWasTrained
    ? [
        ...(state.weekHistory ?? []),
        {
          weekNumber: state.weekNumber,
          workouts: state.workouts,
          ...(state.currentPhase === "deload"
            ? { lighter: true as const }
            : {}),
        },
      ].slice(-8)
    : (state.weekHistory ?? []);

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
  // Miss counts start again after a lighter week (Lift4 (7)): a miss from
  // before it says nothing about the lifter coming out of it.
  if (state.currentPhase === "deload") {
    workouts = workouts.map((day) => ({
      ...day,
      exercises: day.exercises.map((ex) =>
        ex.consecutiveFailures ? { ...ex, consecutiveFailures: 0 } : ex
      ),
    }));
  }

  /* A deload dissipates ACCUMULATED fatigue. A week with no completed session
     accumulated none, so there is nothing to dissipate — and running the
     recipe anyway is not merely a no-op, it hands the user a REDUCED week
     (sets re-anchored down, loads and reps cut) at the exact moment they are
     returning to training and need their plan intact.

     This was live: `advanceWeek` branched on `prescription.deload` alone, so
     an untrained week 3→4 produced a deload IDENTICAL to a fully-trained
     one — measured, not inferred (sets 3→2, reps 8→6 on both). The calendar
     rollover runs unattended on open, and its catch-up loop iterates up to 12
     weeks, so a user back from a month away rolled through multiple deloads
     of a plan they had never touched. Per CLAUDE.md, lapsed-and-returning is
     a real user segment, not an edge case.

     Note this withholds the RECIPE only. The rollover itself is untouched:
     the calendar anchor still advances and the weekly reset still runs, so
     nobody gets stuck. (`weekWasTrained` is computed at the top of
     this function, where it also decides whether the week number and the
     history archive move.) */
  /* Lift4 (9): the calendar's lighter week is for intermediates and up on
     three or more lift days (`lighterWeeksScheduled`), falls on the run
     plan's step-back week with a race plan (`calendarLighterWeek`), and
     lighter weeks come one at a time: never straight after one, a manual
     one included. */
  /* Lift4 (11): the weeks of a return after a break count down by trained
     weeks. The first keeps its set fewer until it has been trained, and no
     calendar lighter week comes in either of them: the break was the
     rest. */
  const easingLeft = state.easingBack
    ? state.easingBack.weeksLeft - (weekWasTrained ? 1 : 0)
    : 0;
  /* The race's final weeks are lighter for everyone with a race plan,
     whatever the level or the week before, and win over every other
     lightening (the precedence table in the lifting handoff). */
  const applyDeloadThisWeek =
    raceWeek !== null ||
    (weekWasTrained &&
      state.currentPhase !== "deload" &&
      easingLeft <= 0 &&
      calendarLighterWeek(nextWeek, nextRaceWeek ?? null) &&
      lighterWeeksScheduled(experience, state.workouts.length));

  workouts = applyDeloadThisWeek
    ? applyDeload(resetToBaseSets(workouts))
    : resetToBaseSets(workouts);
  if (raceWeek === null && easingLeft >= EASING_BACK_WEEKS) {
    workouts = oneSetFewer(workouts);
  }
  /* The race build's leg trim (Lift4 (10)), on a yes at race setup. Last in
     the order the precedence table gives: never in a lighter week or the
     first week back, which take sets away already. */
  const legTrim =
    options.raceLegTrim === true &&
    raceWeek === null &&
    !applyDeloadThisWeek &&
    easingLeft < EASING_BACK_WEEKS &&
    isRaceBuildWeek(nextRaceWeek);
  if (legTrim) workouts = withRaceLegTrim(workouts, true);

  /* Lift4: the week opens with the session the last one didn't reach.
     Lifts run in order, not by weekday (ADR-0002), so the session that was
     up next when the week ended is still next. It moves to the front and the
     rest follow in their order, once each, with nothing doubled up to catch
     up. Every calendar surface puts workouts[0] on the week's first lift day,
     so the week strip opens with it too. When nothing was left to do, or the
     first session was still next, the order stays as it was.

     Last, after every per-day transform, so they all run on the same days
     they did before; the archive above keeps the week in the order it was
     trained in. */
  const upNext = nextUpIndex(state);
  if (upNext > 0) {
    workouts = [...workouts.slice(upNext), ...workouts.slice(0, upNext)];
  }
  if (raceWeek === "race") {
    workouts = raceWeekSession(workouts, state.settings?.smallPlates === true);
  }

  // The retired per-muscle recovery session's list (Lift4 (13)): nothing
  // reads it, so a stored one goes with this week. The return's weeks go
  // once they are done.
  const {
    recoveringMuscles: _retired,
    easingBack: _easing,
    raceWeek: _lastRaceWeek,
    ...kept
  } = state;
  return {
    ...kept,
    ...(easingLeft > 0 ? { easingBack: { weeksLeft: easingLeft } } : {}),
    ...(raceWeek
      ? { raceWeek }
      : legTrim
        ? { raceWeek: "build" as const }
        : {}),
    weekNumber: nextWeek,
    // Both of these key off the RESOLVED flag, not the raw prescription.
    // Keying the phase off `prescription.deload` would label a week "deload"
    // that carries an ordinary prescription — the UI would announce a deload
    // (and `WorkoutSession` would run in deload mode) over a plan nothing cut.
    // Two fields deciding "was this a deload?" by two different tests is how
    // the copies drift apart.
    currentPhase: applyDeloadThisWeek ? "deload" : "progression",
    workouts,
    weekHistory: history,
    ...(nextWeekKey ? { liftWeekKey: nextWeekKey } : {}),
    updatedAt: Date.now(),
    nextWorkoutOverride: undefined,
  };
}

/** A week with one set fewer on every lift, from the plan's own sets: the
 *  first week back after a break (Lift4 (11)). */
export function oneSetFewer(workouts: WorkoutDay[]): WorkoutDay[] {
  return workouts.map((day) => ({
    ...day,
    exercises: day.exercises.map((ex) => {
      const base = ex.baseSets ?? ex.sets;
      return { ...ex, baseSets: base, sets: Math.max(1, base - 1) };
    }),
  }));
}

/** A leg lift's sets in a race build week (Lift4 (10)): a third fewer,
 *  never below two (or the one set a single-set lift has). */
export function raceLegSets(sets: number): number {
  return Math.max(Math.min(sets, 2), Math.round((sets * 2) / 3));
}

/**
 * The race build's leg trim on the sessions not yet done (Lift4 (10)): on,
 * each leg lift (`loadsTheLegs`) has `raceLegSets` of its plan's sets, at
 * the same weights; off, the plan's sets again. Nothing else changes.
 */
export function withRaceLegTrim(
  workouts: WorkoutDay[],
  on: boolean
): WorkoutDay[] {
  return workouts.map((day) =>
    day.completed
      ? day
      : {
          ...day,
          exercises: day.exercises.map((ex) => {
            if (!loadsTheLegs(ex)) return ex;
            const base = ex.baseSets ?? ex.sets;
            return {
              ...ex,
              baseSets: base,
              sets: on ? raceLegSets(base) : base,
            };
          }),
        }
  );
}

/**
 * Race week's lifting (Lift4 (10)): one short session, the week's first,
 * with nothing heavy for the legs; the other days are skipped. Its sets are
 * already halved (`applyDeload`), and each leg lift comes down to half its
 * weight on its own steps, stashed so the next week gets it back
 * (`resetToBaseSets`). A leg lift already under its stash stays as it is,
 * so a rebuild can apply it again.
 */
export function raceWeekSession(
  workouts: WorkoutDay[],
  smallPlates: boolean
): WorkoutDay[] {
  return workouts.map((day, index) =>
    index > 0
      ? { ...day, skipped: true }
      : {
          ...day,
          exercises: day.exercises.map((ex) => {
            if (!loadsTheLegs(ex) || !(ex.weight > 0)) return ex;
            if ((ex.preDeloadWeight ?? 0) > ex.weight) return ex;
            const light = lighterBy(
              loadGridFor(ex.exerciseId, smallPlates),
              ex.weight,
              0.5
            );
            return light > 0
              ? {
                  ...ex,
                  preDeloadWeight: Math.max(ex.weight, ex.preDeloadWeight ?? 0),
                  weight: light,
                }
              : ex;
          }),
        }
  );
}

/**
 * "Ease back in" on the Welcome back sheet (Lift4 (11)), on the person's
 * yes. Every loaded lift comes down `share` (10%, or 20% after a long
 * break; `liftLayoff.ts`) on its own steps, by at least one, and climbs
 * back a step a session to the weight it came down from (`lowered`,
 * already marked shown: the person chose this, so no line explains it).
 * A bodyweight lift or a hold comes down as much in reps or seconds and
 * climbs back by the usual rules; a lift with no weight yet keeps it. This
 * week has one set fewer on every lift, the miss counts start again, and
 * the return's two weeks begin (`easingBack`, which `advanceWeek` counts
 * down). A lighter week already has fewer sets and wins (the precedence
 * table in the lifting handoff), so in one the sets stay as they are.
 */
export function easeBackIn(state: ProgramState, share: number): ProgramState {
  const smallPlates = state.settings?.smallPlates === true;
  const workouts =
    state.currentPhase === "deload"
      ? state.workouts
      : oneSetFewer(state.workouts);
  return {
    ...state,
    workouts: workouts.map((day) => ({
      ...day,
      exercises: day.exercises.map((ex) =>
        easedBack({ ...ex, consecutiveFailures: 0 }, share, smallPlates)
      ),
    })),
    easingBack: { weeksLeft: EASING_BACK_WEEKS },
    updatedAt: Date.now(),
  };
}

function easedBack(
  ex: ProgramExercise,
  share: number,
  smallPlates: boolean
): ProgramExercise {
  if (isBodyweightExerciseId(ex.exerciseId)) {
    const timed = ex.repUnit === "seconds";
    const step = timed ? HOLD_STEP_SECONDS : 1;
    const floor = Math.min(timed ? MIN_HOLD_SECONDS : 4, ex.reps);
    const cut = Math.max(step, Math.round((ex.reps * share) / step) * step);
    return { ...ex, reps: Math.max(floor, ex.reps - cut) };
  }
  if (!(ex.weight > 0)) return ex;
  const grid = loadGridFor(ex.exerciseId, smallPlates);
  const climbing = loweringOf(ex);
  // Race week's legs are lighter for the week already, with the weight
  // they go back to stashed: that weight comes down instead.
  const stash = ex.preDeloadWeight;
  if (typeof stash === "number" && stash > ex.weight) {
    const back = lighterBy(grid, stash, share);
    if (!(back > 0)) return ex;
    return {
      ...ex,
      preDeloadWeight: Math.max(back, ex.weight),
      lowered: {
        exerciseId: ex.exerciseId,
        from: Math.max(stash, climbing?.unit === "kg" ? climbing.from : stash),
        unit: "kg",
        target: ex.reps,
        shown: true,
      },
    };
  }
  const weight = lighterBy(grid, ex.weight, share);
  if (!(weight > 0)) return ex;
  return {
    ...ex,
    weight,
    lowered: {
      exerciseId: ex.exerciseId,
      from: Math.max(
        ex.weight,
        climbing?.unit === "kg" ? climbing.from : ex.weight
      ),
      unit: "kg",
      target: ex.reps,
      shown: true,
    },
  };
}
