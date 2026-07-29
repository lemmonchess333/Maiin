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
import { pickExercise, pickAccessory, exerciseBank } from "./variationBank";
import {
  balanceWeeklyVolume,
  balancePushPull,
  volumeLandmark,
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
   GOAL PROFILE â€” maps PrimaryGoal â†’ rep ranges / volume / progression
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
  fat_loss: {
    mainReps: 12,
    mainRepsMax: 15,
    accessoryReps: 15,
    accessoryRepsMax: 20,
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
  // running-goal users still lift to support their running â€” matches the
  // fullBodyBeginner prescription: moderate reps, lower volume.
  running: {
    mainReps: 8,
    mainRepsMax: 12,
    accessoryReps: 12,
    accessoryRepsMax: 15,
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
 * `Pull-Ups 3Ã—17-22`, `Barbell Squat 4Ã—17-20`, `Deadlift 3Ã—15-20`.
 *
 * 20 is not a new number â€” `MAX_BODYWEIGHT_REPS` above is already the point
 * where the progression engine stops adding reps and tells the user to add
 * load. Prescribing past it asks for something the app's own advice says to
 * stop doing. Bodyweight lifts stop earlier still: they cannot be loaded
 * DOWN, so a high-rep target is the wrong tool rather than a hard one, and a
 * beginner handed 17-rep pull-ups simply cannot start the set.
 */
const MAX_PRESCRIBED_REPS = MAX_BODYWEIGHT_REPS;
const MAX_PRESCRIBED_BODYWEIGHT_REPS = 15;

/** Highest rep target the generator may prescribe for this exercise. */
function prescribedRepCeiling(ex: {
  exerciseId?: string;
  repUnit?: string;
}): number {
  // Timed holds count seconds, not reps â€” a 30-45s plank is not a 30-rep set.
  if (ex.repUnit === "seconds") return Number.POSITIVE_INFINITY;
  return isBodyweightExerciseId(ex.exerciseId)
    ? MAX_PRESCRIBED_BODYWEIGHT_REPS
    : MAX_PRESCRIBED_REPS;
}
/** Timed holds climb in 5-second steps (N2's time axis). */
const HOLD_STEP_SECONDS = 5;
/** Ceiling for a hold with no authored range â€” past this, add load instead. */
const MAX_HOLD_SECONDS = 60;
// Load step (backlog #7, H3) â€” the discriminator lives in movementClass.ts;
// see that module for why `isAccessory` was the wrong one.

/* ================================
   WEEKLY PRESCRIPTION
================================ */

export function generateWeekPrescription(week: number): WeeklyPrescription {
  if (week % 4 === 0) {
    return {
      week,
      intensityMultiplier: 0.85,
      volumeModifier: 0.7,
      deload: true,
    };
  }
  return {
    week,
    intensityMultiplier: 1 + (week % 4) * 0.025,
    volumeModifier: 1,
    deload: false,
  };
}

/**
 * A mesocycle ends on its deload week â€” completing that week means the user
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
  if (weeklyTarget <= 0) return "full_body"; // run-only athlete â€” no lift days
  // Cap at 6. 7 hard lift days/week is the wrong default for every tier
  // (beginner through advanced) â€” recovery needs at least one non-lift
  // slot. If a user sets 7, we return the 6-day split and the scheduler
  // fills the 7th weekday as active rest / mobility.
  const clamped = Math.min(6, weeklyTarget);
  if (clamped === 1) return "full_body";
  if (clamped === 2) return "upper_lower";
  // 3-day full-body beats 3-day PPL for hypertrophy (2Ã— weekly frequency
  // > 1Ã—, Schoenfeld 2016 at matched volume). Pre-W1a the procedural
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
      return "Push / Pull / Legs Ã—2";
    case "ppl_x2_fb":
      return "Push / Pull / Legs Ã—2 + Full Body";
  }
}

/**
 * D-LIFT-7: the one-line "why" behind the daysâ†’split mapping, so the derived
 * split (Pgm5 Q1: structure follows lift-days, not a user toggle) reads as a
 * deliberate coaching choice rather than an ignored preference. Mirrors
 * `chooseSplit`; the thread is weekly per-muscle FREQUENCY.
 */
export function splitRationale(weeklyLiftDays: number): string {
  const d = Math.min(6, Math.max(0, Math.round(weeklyLiftDays)));
  switch (d) {
    case 0:
      return "No lift days set â€” add some to build a split.";
    case 1:
      return "One day a week is full-body so you still train everything.";
    case 2:
      return "Two days splits upper / lower â€” each trained about twice a week.";
    case 3:
      return "Three days stays full-body: every muscle 3Ã— a week beats a 3-way split at the same volume.";
    case 4:
      return "Four days is upper / lower twice â€” each muscle about twice a week.";
    case 5:
      return "Five days layers push/pull/legs onto upper/lower to keep most muscles near 2Ã— a week.";
    default:
      return "Six days runs push/pull/legs twice â€” each muscle about twice a week.";
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
 * `isAccessory` is a VOLUME ROLE, not a movement class (movementClass.ts) â€”
 * it marks the slots the volume machinery may adjust: #5's ramp, #9's
 * add/reduce arms, and `balanceWeeklyVolume`'s under-dosed-muscle top-up.
 * `buildFullBody` needs to mark supporting slots WITHOUT `makeAccessory`,
 * which re-picks from the non-primary pool and can't carry `existing` â€”
 * using it there would rewrite users' exercises and wipe their logged loads
 * on every regenerate. Hence the parameter (backlog #15).
 *
 * `existing` is only carried when it is the SAME MOVEMENT. The builders find
 * it positionally (`findExisting(dayIdx, exIdx)`), which assumes the saved
 * plan's slots line up with the ones being built â€” true for a
 * generatedâ†’generated regenerate, and false for anyone whose plan came from a
 * TEMPLATE. Measured 2026-07-28 on a template user's first settings change:
 * `Bench Press@100 [from Barbell Squat]`, `Pull-Ups@106 [from Deadlift]` â€”
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
    name: ex.name,
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
  to: { id: string; name: string },
  loadCtx?: StartingLoadContext,
  calibrationSource: ProgramExercise = ex
): ProgramExercise {
  if (ex.exerciseId === to.id) return ex;
  const calibrated = weightAfterExerciseSwap(calibrationSource, to.id, loadCtx);
  return {
    ...ex,
    exerciseId: to.id,
    name: to.name,
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
    // Backlog #7 (H3): isolations progress by REPS, not load â€” `isAccessory`
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

/* ================================
   SPLIT TEMPLATES
================================ */

/**
 * Builder-local volume multiplier â€” combines lifting-goal stimulus
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
  profile: GoalP×:êÚ$z{-®éÜj×WFFVBæ6öç6V7WF—fTf–ÇW&W2Ò°¢WFFVBçÆFVT6÷VçBÒ°¢ÒVÇ6R°¢WFFVBæ6öç6V7WF—fTf–ÇW&W2Ò†W†W&6—6Ræ6öç6V7WF—fTf–ÇW&W2ÇÂ’²° ¢–b‡WFFVBæ6öç6V7WF—fTf–ÇW&W2ãÒ2’°¢–b†—4&öG—vV–v‡B’°¢òò&öG—vV–v‡BFVÆöC¢&VGV6R&WF&vWB†Ö–æ–×VÒB¢WFFVBç&W2ÒÖF‚æÖ‚ƒBÂW†W&6—6Rç&W2Ò“°¢ÒVÇ6R°¢WFFVBçvV–v‡BÒÖF‚ç&÷VæB†W†W&6—6RçvV–v‡B¢ã“R¢"’ò#°¢Ð¢WFFVBæ6öç6V7WF—fTf–ÇW&W2Ò°¢WFFVBçÆFVT6÷VçBÒ†W†W&6—6RçÆFVT6÷VçBÇÂ’²°¢Ð¢Ð¢ÒVÇ6R°¢–b†6ö×ÆWFVB’°¢–b†—4&öG—vV–v‡B’°¢òò&öG—vV–v‡BÆ–æV#¢–æ7&V6R&WF&vWBv†VâW†6VVF–ær'’"†6VB¢–b†7GVÅ&W2ãÒW†W&6—6Rç&W2²"bb'Tö²’°¢'V×&öG—vV–v‡E&W2‚“°¢Ð¢ÒVÇ6R–b†Ö–7&öÆöF–ærbb'Tö²’°¢WFFVBçvV–v‡BÒW†W&6—6RçvV–v‡B²°¢ÒVÇ6R°¢–b†7GVÅ&W2ãÒW†W&6—6Rç&W2²"bb'Tö²’°¢òòæòvöÂ&öçW2öâF†RÆ–æV"F‚(	B&RÒ3r&V†f–÷W"Â¶WBà¢WFFVBçvV–v‡BÒW†W&6—6RçvV–v‡B²ÆöE7FW°¢WFFVBç&W2Ò&W6WE&W3²òò&W6WBFò÷&–v–æÂ&W67&—F–öâÂæ÷BG&–gFVBfÇVP¢Ð¢Ð¢WFFVBæÆ7E7V66W76gVÅvV–v‡BÒ7GVÅvV–v‡C°¢WFFVBæ6öç6V7WF—fTf–ÇW&W2Ò°¢WFFVBçÆFVT6÷VçBÒ°¢ÒVÇ6R°¢WFFVBæ6öç6V7WF—fTf–ÇW&W2Ò†W†W&6—6Ræ6öç6V7WF—fTf–ÇW&W2ÇÂ’²°¢–b‡WFFVBæ6öç6V7WF—fTf–ÇW&W2ãÒ2’°¢–b†—4&öG—vV–v‡B’°¢WFFVBç&W2ÒÖF‚æÖ‚ƒBÂW†W&6—6Rç&W2Ò“°¢ÒVÇ6R°¢WFFVBçvV–v‡BÒÖF‚æÖ‚ƒÂW†W&6—6RçvV–v‡BÒ“°¢Ð¢WFFVBæ6öç6V7WF—fTf–ÇW&W2Ò°¢WFFVBçÆFVT6÷VçBÒ†W†W&6—6RçÆFVT6÷VçBÇÂ’²°¢Ð¢Ð¢Ð ¢&WGW&âWFFVC°§Ð ¢ò¢ÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÐ¢dD”uTRòDTÄôBòEdä4TÔTå@£ÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÒ¢ð ¢ò¢ ¢¢7WFRG&–æ–ærÖfF–wVR66÷&Rf÷"F†RvVV²§W7BG&–æVBÂFW&—fVBg&öÒF†P¢¢W"ÖW†W&6—6Rf–ÇW&R7FFRF†RÆövvW"Ç&VG’G&6·2„BÔÄ”eBÓ‚’âÇ”fF–wVV ¢¢G&–×2æW‡BvVV²w2föÇVÖRv†VâF†—2W†6VVG2#²&Wf–÷W6Ç’F†R66÷&R—B&V@¢¢†7FFRæfF–wVU66÷&V’v2æWfW"WFFVB'’ç—F†–ærÂ6òF†R7WBæWfW"f—&VBà¢ ¢¢6–væÂÒVç&W6öÇfVB&V6VçBf–ÇW&W2†6öç6V7WF—fTf–ÇW&W6Ââã"(	BF†R7&@¢¢Ö—72G&–vvW'2&6¶öfbF†B&W6WG2—B’â7WFR'’6öç7G'V7F–öã¢—B6Æ–Ö'0¢¢v†–ÆRÆ–gFW"—2w&–æF–ær6WG2æBfÆÇ2öæ6RÆöG2&6²öfbÂ6ò—B6âw@¢¢&F6†WBWf÷&WfW"F†Rv’7V×VÆF—fRÆFVT6÷VçFv÷VÆBâvV–v‡FVB6òF†P¢¢ã#7WBæVVG2ÖVæ–ævgVÂ6†&RöbF†R&öw&Ò7F—fVÇ’f–Æ–ærŽ(˜ƒ"Æ–gG2@¢¢Gvò7G&–v‡BÖ—76W2Â÷"ã2BöæR’ÂæB6Æ×VBf÷"6fWG’à¢¢ð¦W‡÷'BgVæ7F–öâ6ö×WFTfF–wVU66÷&R‡v÷&¶÷WG3¢v÷&¶÷WDF•µÒ“¢çVÖ&W"°¢ÆWBf–ÇW&W2Ò°¢f÷"†6öç7BF’öbv÷&¶÷WG2’°¢f÷"†6öç7BW‚öbF’æW†W&6—6W2’°¢f–ÇW&W2³ÒÖF‚æÖ‚ƒÂW‚æ6öç6V7WF—fTf–ÇW&W2óò“°¢Ð¢Ð¢&WGW&âÖF‚æÖ–âƒÂf–ÇW&W2¢‚“°§Ð ¦W‡÷'BgVæ7F–öâÇ”fF–wVR€¢v÷&¶÷WG3¢v÷&¶÷WDF•µÒÀ¢fF–wVU66÷&S¢çVÖ&W ¢“¢v÷&¶÷WDF•µÒ°¢–b†fF–wVU66÷&RÃÒ#’&WGW&âv÷&¶÷WG3°¢&WGW&âv÷&¶÷WG2æÖ‚†F’’Óâ‡°¢ââæF’À¢W†W&6—6W3¢F’æW†W&6—6W2æÖ‚†W‚’Óâ‡°¢ââæW‚À¢6WG3¢ÖF‚æÖ‚ƒ"ÂÖF‚ç&÷VæB†W‚ç6WG2¢ã’’’À¢Ò’’À¢Ò’“°§Ð ¢ò¢ ¢¢FVÆöB&WfÆö÷"f÷"F†R÷7BÖæ÷f–6R&V6—R(	BR×&W7G&VæwF‚Ö–âG&÷0¢¢Fò2Âæ÷BFòâ6†&VBv—F‚F†R4bÖ—'&÷"à¢¢ð¦6öç7BDTÄôEõ$U5ôdÄôõ"Ò3° ¢ò¢ ¢¢&6¶Æör3‚‡G&–æ–ærÖ&öö²&6¶Æös²ƒB&W6öÇf–ærÓB“¢F†RFVÆöB&V6—R—0¢¢6†÷6Vâ'’E$”ä”ärtRâG&÷÷2w26WG>(‰#²ÆöN(‰#RR—2†VÆ×2w2¦æ÷f–6R ¢¢ç7vW"ÂæB—Bv2&V–ærÆ–VBFòWfW'–öæRà¢ ¢¢Ò&Vv–ææW"†æBç’6ÆÆW"F†BFöW6âwB¶æ÷r“¢Væ6†ævVB(	BöæR6WBfWvW ¢¢†fÆö÷""’æBv÷&¶–ærvV–v‡B9sãƒRöâF†R"ãR¶rw&–Bâ7WGF–ærÆöB—0¢¢v†Bæ÷f–6RæVVG2Â&V6W6Ræ÷f–6Rw27FÆÂ—2W7VÆÇ’F†RÆöBà¢¢Ò–çFW&ÖVF–FRòGfæ6VC¢&÷Vv†Ç’†ÆbF†RföÇVÖRBF†R4ÔRÆöB(	@¢¢öæR6WBfWvW"æBGvò&W2öfbF†RF&vWB†fÆö÷"2’ÂvV–v‡BVçF÷V6†V@¢¢„†VÆ×2w2v÷&¶VBW†×ÆS¢<9s9s#(i",9sŒ9s#’â7BF†Ræ÷f–6R†6P¢¢F†RfF–wVR6öÖW2g&öÒ67V×VÆFVBföÇVÖRÂæ÷Bg&öÒF†RF÷ÖVæBÆöBÀ¢¢æBG&÷–ærF†R&"vV–v‡B6÷7G2F†R6¶–ÆÂW‡÷7W&RF†B¶VW2¢¢†Vg’Æ–gB6†'à¢ ¢¢&W6VçFF–öâöÆ–7“¢”åd•4”$ÄR(	BF†R7FWÖ&6²vVV²6–×Ç’Æöö·2F–ffW&VçBà¢¢F†RöæRf—6–&ÆR7W&f6R—23Bw27FWÖ&6²7VRÂv†–6‚—2&V6—RÖvæ÷7F–2à¢¢ð¦W‡÷'BgVæ7F–öâÇ”FVÆöB€¢v÷&¶÷WG3¢v÷&¶÷WDF•µÒÀ¢W‡W&–Væ6Só¢W‡W&–Væ6P¢“¢v÷&¶÷WDF•µÒ°¢6öç7B†öÆDÆöBÒW‡W&–Væ6RÓÓÒ&–çFW&ÖVF–FR"ÇÂW‡W&–Væ6RÓÓÒ&Gfæ6VB#°¢&WGW&âv÷&¶÷WG2æÖ‚†F’’Óâ‡°¢ââæF’À¢W†W&6—6W3¢F’æW†W&6—6W2æÖ‚†W‚’Óâ°¢6öç7B6WG2ÒÖF‚æÖ‚ƒ"ÂW‚ç6WG2Ò“°¢–b††öÆDÆöB’°¢&WGW&â°¢ââæW‚À¢6WG2À¢&W3 ¢W‚ç&WVæ—BÓÓÒ'6V6öæG2 ¢òÖF‚æÖ‚ƒÂW‚ç&W2Ò„ôÄEõ5DUõ4T4ôäE2¢¢ÖF‚æÖ‚„DTÄôEõ$U5ôdÄôõ"ÂW‚ç&W2Ò"’À¢Ó°¢Ð¢&WGW&â°¢ââæW‚À¢6WG2À¢òòvV–v‡B†&öG—vV–v‡B÷"Væ6Æ–'&FVB“¢æòvV–v‡BFòFVÆö@¢òò(	BÆVfRBâ6WG2&VGV7F–öâ&÷fR—2F†RFVÆöB6–væÂà¢òòvV–v‡FVC¢&÷VæBFò"ãV¶r–æ7&VÖVçG2‡7FæF&BÆFR6—¦R’à¢vV–v‡C ¢W‚çvV–v‡BÓÓÒò¢ÖF‚ç&÷VæB‚†W‚çvV–v‡B¢ãƒR’ò"ãR’¢"ãRÀ¢Ó°¢Ò’À¢Ò’“°§Ð ¦W‡÷'BgVæ7F–öâ6†÷VÆDGfæ6UvVV²‡v÷&¶÷WG3¢v÷&¶÷WDF•µÒ“¢&ööÆVâ°¢&WGW&âv÷&¶÷WG2æWfW'’‚†F’’ÓâF’æ6ö×ÆWFVBÇÂF’ç6¶—VB“°§Ð ¢ò¢¢66W76÷'’&×6V–Æ–ær(	BÖ—'&÷'2föÇVÖTÖöFVÂw244U54õ%•õ4UEô4â¢ð¦6öç7B44U54õ%•õ$Õô4ÒS° ¢ò¢ ¢¢VçFW&–ærâWFöÖF–2FVÆöBvVV³¢&RÖæ6†÷"6WG2Fò&6U6WG2æB7F6€¢¢V6‚ÆöFVBW†W&6—6Rw2vV–v‡BæB&WF&vWB6òÖW6òW†—B6â&W7F÷&P¢¢F†VÒâÇ”FVÆöBF†Vâ7WG2g&öÒF†Rä4„õ$TBfÇVW2Â6ò—G27WB6à¢¢æWfW"6ö×÷VæB7&÷72ÖW6ö7–6ÆW2‡F†RÖçVÂFVÆöB6öÖÖæBwV&G2F†P¢¢6ÖR†¦&Bv—F‚—G2VæFò6æ6†÷B(	BF†RWFòF‚†BæòwV&BBÆÂ’à¢ ¢¢&÷F‚7F6†W2&RVæ6öæF—F–öæÂrç"çBâF†RFVÆöB&V6—R†&6¶Æör3‚“ ¢¢öæÇ’F†R÷7BÖæ÷f–6R&V6—R7WG2&W2æBöæÇ’F†Ræ÷f–6R&V6—R7WG0¢¢ÆöBÂ'WBW6W"v†ò6†ævW2W‡W&–Væ6RÆWfVÂÖ–BÖÖW6ö7–6ÆR×W7B7F–ÆÀ¢¢vWB&6²v†–6†WfW"öæRv27WBà¢¢ð¦gVæ7F–öâ&W&Tf÷$FVÆöB‡v÷&¶÷WG3¢v÷&¶÷WDF•µÒ“¢v÷&¶÷WDF•µÒ°¢&WGW&âv÷&¶÷WG2æÖ‚†F’’Óâ‡°¢ââæF’À¢W†W&6—6W3¢F’æW†W&6—6W2æÖ‚†W‚’Óâ°¢6öç7B&6RÒW‚æ&6U6WG2óòW‚ç6WG3°¢6öç7B÷WC¢&öw&ÔW†W&6—6RÒ²ââæW‚Â&6U6WG3¢&6RÂ6WG3¢&6RÓ°¢–b†÷WBçvV–v‡Bâ’÷WBç&TFVÆöEvV–v‡BÒ÷WBçvV–v‡C°¢÷WBç&TFVÆöE&W2Ò÷WBç&W3°¢&WGW&â÷WC°¢Ò’À¢Ò’“°§Ð ¢ò¢ ¢¢&6¶Æör3R‡G&–æ–ærÖ&öö²&6¶Æös²Ó"ôã“¢F†RföÇVÖR&×âæöâÖFVÆö@¢¢vVV·2FW&—fR6WG2g&öÒF†R&6U6WG2æ6†÷"(	B66W76÷&–W2'Và¢¢&6^(‰#ò&6Rò&6R³7&÷72F†RÖW6ò‡7F'B&VÆ÷rF&vWBÂ'V–ÆBÀ¢¢F†VâFVÆöB’ÂÖ–ç2†öÆBB&6RâÇ6ò&W7F÷&W2&RÖFVÆöBÆöG2öà¢¢ÖW6òW†—B†Ö‚‚’¶VW2ç—F†–ærF†RW6W"&öw&W76VBEU$”ärF†RFVÆö@¢¢vVV²’âæ6†÷"ÖFW&—fVB&V6ö×WFRÖ¶W2F†RvVV¶Ç’6†R–FV×÷FVçC ¢¢Ç”fF–wVRw26†fRÆ7G2W†7FÇ’öæRvVV²â&W6VçFF–öâöÆ–7“ ¢¢”åd•4”$ÄR(	BF†R&W67&—F–öâ6–×Ç’F–ffW'2vVV²FòvVV²à¢¢ð¦gVæ7F–öâÇ•vVV¶Ç•föÇVÖU6†R€¢v÷&¶÷WG3¢v÷&¶÷WDF•µÒÀ¢vVV³¢çVÖ&W ¢“¢v÷&¶÷WDF•µÒ°¢6öç7BvVV´–äÖW6òÒ‚‡vVV²Ò’RB’²²òòâã2†W&S²vVV²BFVÆöG0¢&WGW&âv÷&¶÷WG2æÖ‚†F’’Óâ‡°¢ââæF’À¢W†W&6—6W3¢F’æW†W&6—6W2æÖ‚†W‚’Óâ°¢6öç7B&6RÒW‚æ&6U6WG2óòW‚ç6WG3°¢6öç7B÷WC¢&öw&ÔW†W&6—6RÒ²ââæW‚Â&6U6WG3¢&6RÓ°¢–b‡G—VöbW‚ç&TFVÆöEvV–v‡BÓÓÒ&çVÖ&W""’°¢÷WBçvV–v‡BÒÖF‚æÖ‚†÷WBçvV–v‡BÂW‚ç&TFVÆöEvV–v‡B“°¢FVÆWFR÷WBç&TFVÆöEvV–v‡C°¢Ð¢òò&6¶Æör3ƒ¢6ÖRÖ‚‚’×v–ç2&W7F÷&Rf÷"F†R&WF&vWBÂv†–6‚F†P¢òò÷7BÖæ÷f–6RFVÆöB&V6—R7WG2âv—F†÷WB—BF†R7WBv÷VÆBFV6’F†P¢òò&W67&—F–öâWfW'’ÖW6ö7–6ÆR(	BF†RW†7B†¦&B3Rf—†VBf÷"6WG0¢òòæBÆöBÂ&V–çG&öGV6VBF‡&÷Vv‚F†—&Bf–VÆBà¢–b‡G—VöbW‚ç&TFVÆöE&W2ÓÓÒ&çVÖ&W""’°¢÷WBç&W2ÒÖF‚æÖ‚†÷WBç&W2ÂW‚ç&TFVÆöE&W2“°¢FVÆWFR÷WBç&TFVÆöE&W3°¢Ð¢–b†W‚æ—466W76÷'’ÓÓÒG'VR’°¢÷WBç6WG2Ð¢vVV´–äÖW6òÓÓÒ¢òÖF‚æÖ‚ƒÂ&6RÒ¢¢vVV´–äÖW6òÓÓÒ0¢òÖF‚æÖ–â„44U54õ%•õ$Õô4Â&6R²¢¢&6S°¢ÒVÇ6R°¢÷WBç6WG2Ò&6S°¢Ð¢&WGW&â÷WC°¢Ò’À¢Ò’“°§Ð ¢ò¢¢fÆö÷"f÷"F†R7FVG’×7FFR66W76÷'’æ6†÷"(	BÆ–gBæWfW"G&÷2&VÆ÷rF†—2â¢ð¦6öç7B44U54õ%•ôä4„õ%ôdÄôõ"Ò#° ¢ò¢ ¢¢&6¶Æör3’‡G&–æ–ærÖ&öö²&6¶Æös²ƒR“¢Ç’F†RF§W7FÖVçBF†R'VÆP¢¢6†÷6Râ7Æ—B7&÷72F†RGvòföÇVÖR&Vv—7FW'23RW7F&Æ—6†VBÂv†–6‚—0¢¢v†BÖ¶W2V6‚7F–öâÆ7BF†R&–v‡BÆVæwF‚öbF–ÖS ¢ ¢¢ÒFE÷föÇVÖVò&V÷&væ—¦VÖ÷fRF†Rä4„õ"†&6U6WG6’Â6òF†R6†ævP¢¢7W'f—fW2Ç•vVV¶Ç•föÇVÖU6†Vw2–FV×÷FVçB&V6ö×WFR(	BF†W6R&P¢¢fW&F–7G2&÷WBF†R&öw&ÖÖRà¢¢Ò&VGV6U÷föÇVÖVÖ÷fW2öæÇ’6WG6Â6ò—BÆ7G2W†7FÇ’öæRvVV²æB—0¢¢F†Vâ&V6ö×WFVBv’Â6ÖR2Ç”fF–wVVw26†fR(	B—Bw2Æ–v‡@¢¢vVV²Âæ÷BæWr&6VÆ–æRà¢ ¢¢Ö–ç2&RæWfW"F÷V6†VBâF†W’&RF†R&öw&W76–öâæ6†÷"ÂæBWfW'¢¢6÷W&6R–âF†R&Wf–WrWG2F†RF§W7F&ÆRföÇVÖR–â66W76÷'’v÷&²à¢¢&V÷&væ—¦VÇ6ò&÷FFW2F†R7FÆÆVBÆ–gG2Fòg&W6‚f&–F–öâæ@¢¢6ÆV'2F†V—"ÆFVR6÷VçFW"(	B†VÆ×2w2&÷"F†RföÇVÖR÷&væ—6V@¢¢F–ffW&VçFÇ’"ÂæBF†R&W6WB—2v†BÆWG2F†R'VÆRFVÆÂäUr7FÆÂg&öÐ¢¢F†RöæR—BÇ&VG’&W7öæFVBFòà¢¢ð¦gVæ7F–öâÇ”F§W7FÖVçB€¢v÷&¶÷WG3¢v÷&¶÷WDF•µÒÀ¢7F–öã¢F§W7FÖVçD7F–öâÀ¢ò¢¢ÆWfVÂvFR(	B&V÷&væ—¦V&R×–6·2f&–F–öâÂ6ò—BæVVG2F†R6ÖP¢¢6öç7G&–çBF†RvVæW&F÷"Æ–W2ƒ##bÓrÓ#‚7vVW’â¢ð¢W‡W&–Væ6Só¢W‡W&–Væ6P¢“¢v÷&¶÷WDF•µÒ°¢–b†7F–öâÓÓÒ&†öÆB"’&WGW&âv÷&¶÷WG3°¢&WGW&âv÷&¶÷WG2æÖ‚†F’’Óâ‡°¢ââæF’À¢W†W&6—6W3¢F’æW†W&6—6W2æÖ‚†W‚’Óâ°¢6öç7B÷WC¢&öw&ÔW†W&6—6RÒ²ââæW‚Ó°¢6öç7B&6RÒW‚æ&6U6WG2óòW‚ç6WG3°¢–b†W‚æ—466W76÷'’ÓÓÒG'VR’°¢–b†7F–öâÓÓÒ&FE÷föÇVÖR"’°¢÷WBæ&6U6WG2ÒÖF‚æÖ–â„44U54õ%•õ$Õô4Â&6R²“°¢÷WBç6WG2ÒÖF‚æÖ–â„44U54õ%•õ$Õô4Â÷WBç6WG2²“°¢ÒVÇ6R–b†7F–öâÓÓÒ'&VGV6U÷föÇVÖR"’°¢÷WBç6WG2ÒÖF‚æÖ‚„44U54õ%•ôä4„õ%ôdÄôõ"Â÷WBç6WG2Ò“°¢ÒVÇ6R°¢÷WBæ&6U6WG2ÒÖF‚æÖ‚„44U54õ%•ôä4„õ%ôdÄôõ"Â&6RÒ“°¢÷WBç6WG2ÒÖF‚æÖ‚„44U54õ%•ôä4„õ%ôdÄôõ"Â÷WBç6WG2Ò“°¢Ð¢Ð¢–b†7F–öâÓÓÒ'&V÷&væ—¦R"bb†W‚çÆFVT6÷VçBóò’â’°¢6öç7B7vÒ–6´W†W&6—6R€¢W‚æÖ÷fVÖVçD6FVv÷'’À¢ÖF‚æÖ‚ƒ2ÂW‚çÆFVT6÷VçBóò’À¢W‚æW†W&6—6T–BÀ¢W‡W&–Væ6P¢“°¢òòöæÇ’6ÆV"F†R7FÆÂöæ6RF†R&V÷&væ—6F–öâ7GVÆÇ’6†ævVBF†P¢òòÖ÷fVÖVçBâ&Wf–÷W6Ç’6÷VçG2(	3"ÖFR–6´W†W&6—6V&WGW&âF†R6ÖP¢òò–BæBvR7F–ÆÂW&6VBF†RWf–FVæ6RöbF†RVç&W6öÇfVBÆFVRà¢–b‡7væ–BÓÒW‚æW†W&6—6T–B’°¢&WGW&â7vW†W&6—6T–FVçF—G’†÷WBÂ7vÂVæFVf–æVBÂW‚“°¢Ð¢Ð¢&WGW&â÷WC°¢Ò’À¢Ò’“°§Ð ¦W‡÷'BgVæ7F–öâGfæ6UvVV²€¢7FFS¢&öw&Õ7FFRÀ¢W‡W&–Væ6Só¢W‡W&–Væ6RÀ¢&V6÷fW'“¢&V6÷fW'•7FFRÒ'Væ¶æ÷vâ ¢“¢&öw&Õ7FFR°¢òò6BS"vVV·2ƒ–V"’F†Vâ&V7–6ÆR(	BF†RB×vVV²W&–öF—¦F–öâ7–6ÆP¢òò6öçF–çVW2f–ÖöGVÆòÂ'WBF†RçVÖ&W"7F—2ÖVæ–ævgVÂf÷"T’F—7Æ¢6öç7BæW‡EvVV²Ò7FFRçvVV´çVÖ&W"ãÒS"ò¢7FFRçvVV´çVÖ&W"²°¢6öç7B&W67&—F–öâÒvVæW&FUvVVµ&W67&—F–öâ†æW‡EvVV²“° ¢6öç7B6æ6†÷BÒ²vVV´çVÖ&W#¢7FFRçvVV´çVÖ&W"Âv÷&¶÷WG3¢7FFRçv÷&¶÷WG2Ó°¢6öç7B†—7F÷'’Ò²âââ‡7FFRçvVV´†—7F÷'’óòµÒ’Â6æ6†÷EÒç6Æ–6R‚Ó‚“° ¢òò&W6WB$õD‚6ö×ÆWFVBæB6¶—VBf÷"F†RæWrvVV²â6''––æp¢òò6¶—VC¢G'VVf÷'v&BÖVçBW6W"v†ò6¶—VBF’2Æ7BvVV°¢òòv÷VÆB7F–ÆÂ6VRF’226¶—VBöâF†Rg&W6‚vVV²(	BWfVâF†÷Vv€¢òòF†RvVV²æB&W67&—F–öâ&RæWrâ&Wf–÷W6Ç’öæÇ’6ö×ÆWFVF ¢òòv2&W6WBÂÆVf–ær6¶—VFFòÆV²7&÷72vVV·2à¢ÆWBv÷&¶÷WG3¢v÷&¶÷WDF•µÒÒ7FFRçv÷&¶÷WG2æÖ‚†F’’Óâ‡°¢ââæF’À¢6ö×ÆWFVC¢fÇ6RÀ¢6¶—VC¢fÇ6RÀ¢Ò’“° ¢òò7WFRfF–wVRg&öÒF†RvVV²§W7BG&–æVB„BÔÄ”eBÓ‚’(	B6ö×WFVBg&öÒF†P¢òòÆövvVBW"ÖW†W&6—6Rf–ÇW&R7FFR&F†W"F†âF†Rf÷&ÖW&Ç’ÖFVBW'6—7FV@¢òò66Æ"à¢6öç7BfF–wVRÒ6ö×WFTfF–wVU66÷&R‡7FFRçv÷&¶÷WG2“°¢òò&6¶Æör3’„ƒR“¢F†R¦ö–çBÆFVR9r&V6÷fW'’'VÆRâWfÇVFVBg&öÒF†P¢òòvVV²§W7BE$”äTB‡7FFRçv÷&¶÷WG2’Â&Vf÷&RF†RvVV¶Ç’&W6†R&Ww&—FW0¢òò6WG2Â6ò—B&VG2F†R7FÆÂF†RW6W"7GVÆÇ’§W7B†—Bà¢6öç7BÆFVVVDW†W&6—6W2Ò6÷VçEÆFVVVDW†W&6—6W2‡7FFRçv÷&¶÷WG2“°¢6öç7B7F–öâÒ&W6öÇfTF§W7FÖVçB‡°¢ÆFVVVDW†W&6—6W2À¢&V6÷fW'’À¢&–÷%&VGV7F–öç3¢7FFRçÆFVU&W7öç6W2óòÀ¢Ò“° ¢–b‡&W67&—F–öâæFVÆöB’°¢òòFVÆöBvVV²•2F†RÆ–v‡BvVV²(	BFöâwB7F6²âF§W7FÖVçBöâF÷ö`¢òò—BâF†R'VÆRw2&öö¶¶VW–ær&VÆ÷r7F–ÆÂ'Vç2Â6ò7FÆÂF†B7ç2¢òòFVÆöB—2&VÖVÖ&W&VB&F†W"F†â6–ÆVçFÇ’f÷&v—fVâà¢v÷&¶÷WG2ÒÇ”FVÆöB‡&W&Tf÷$FVÆöB‡v÷&¶÷WG2’ÂW‡W&–Væ6R“°¢ÒVÇ6R°¢v÷&¶÷WG2ÒÇ•vVV¶Ç•föÇVÖU6†R‡v÷&¶÷WG2ÂæW‡EvVV²“°¢òòöæÇ’Ç’fF–wVRöâæöâÖFVÆöBvVV·2Fòfö–BF÷V&ÆRföÇVÖR&VGV7F–öà¢v÷&¶÷WG2ÒÇ”fF–wVR‡v÷&¶÷WG2ÂfF–wVR“°¢v÷&¶÷WG2ÒÇ”F§W7FÖVçB‡v÷&¶÷WG2Â7F–öâÂW‡W&–Væ6R“°¢Ð ¢òò&W6WBF†RÖVÖ÷'’öæ6RF†R7FÆÂ—G6VÆb6ÆV'3²÷F†W'v—6R6''’—BÂæ@¢òò6÷VçB&VGV7F–öâ6ò4T4ôäB7FÆÂW66ÆFW2Fò&V÷&væ—¦V–ç7FVBö`¢òò7WGF–ærv–ââ„†VÆ×3¢–b—B&V7W'2ÂF†Rç7vW"—6âwBæ÷F†W"FVÆöBâ¢6öç7BÆFVU&W7öç6W2Ð¢ÆFVVVDW†W&6—6W2Â$ôu$ÔÔUõÄDTUôÔ”à¢ò ¢¢‡7FFRçÆFVU&W7öç6W2óò’²†7F–öâÓÓÒ'&VGV6U÷föÇVÖR"ò¢“° ¢òòBÔÄ”eBÓC¢BF†R7F'BöbæWrÖW6ö7–6ÆR‡vVV·2RÂ’Â(
bæBF†RS.(i#¢òò&V7–6ÆR’Â&÷FFRTåE$”äTB66W76÷&–W2Fòg&W6‚f&–F–öâf÷"æ÷fVÇG’°¢òò¦ö–çB†VÇF‚âG&–æVB66W76÷&–W2†ÆövvVB†—7F÷'’’æBÆÂÖ–ç27F’WB(	@¢òòÖ–ç2&RF†R&öw&W76–öâæ6†÷"ÂæBÆ–gBF†RW6W"7GVÆÇ’G&–ç2—0¢òòF†V—'2Fò¶VWâ&RÖFVGWVB6ò&÷FF–öâ6âwB6öÆÆ–FRv—F†–âF’à¢–b†æW‡EvVV²RBÓÓÒ’°¢v÷&¶÷WG2ÒFVGWTF”W†W&6—6W2€¢&÷FFUVçG&–æVD66W76÷&–W2‡v÷&¶÷WG2ÂW‡W&–Væ6R¢“°¢ÒVÇ6R–b†7F–öâÓÓÒ'&V÷&væ—¦R"’°¢òò6ÖR†¦&Bg&öÒ3’w2&÷FF–öã¢7vVBÆ–gB6â6öÆÆ–FRv—F€¢òòæ÷F†W"W†W&6—6RÇ&VG’–âF†BF’à¢v÷&¶÷WG2ÒFVGWTF”W†W&6—6W2‡v÷&¶÷WG2“°¢Ð ¢&WGW&â°¢ââç7FFRÀ¢vVV´çVÖ&W#¢æW‡EvVV²À¢7W'&VçE†6S¢&W67&—F–öâæFVÆöBò&FVÆöB"¢'&öw&W76–öâ"À¢v÷&¶÷WG2À¢vVV´†—7F÷'“¢†—7F÷'’À¢òòFVÆöB6ÆV'267V×VÆFVB7WFRfF–wVS²÷F†W'v—6RW'6—7BF†R6ö×WFV@¢òòfÇVR6òF†Rf–VÆB—2ÖVæ–ævgVÂ²ö'6W'f&ÆR†æòÆöævW"FVB’à¢fF–wVU66÷&S¢&W67&—F–öâæFVÆöBò¢fF–wVRÀ¢ÆFVU&W7öç6W2À¢WFFVDC¢FFRææ÷r‚’À¢æW‡Ev÷&¶÷WD÷fW'&–FS¢VæFVf–æVBÀ¢Ó°§Ð