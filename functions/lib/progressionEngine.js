"use strict";

/**
 * Progression engine (packet 18) — server mirror of applyProgression in
 * src/features/program/programEngine.ts.
 *
 * The programme command reducer runs `logExercise` server-side, which must
 * produce the IDENTICAL next prescription the client engine produces for the
 * same input (double/linear progression, bodyweight rep-bumps, RPE hold,
 * failure deloads, plateau counting). programEngine.ts is Vite/TS and can't be
 * required from CommonJS Cloud Functions, so this is a hand-maintained TS↔JS
 * equality mirror.
 *
 * MUST return identical output to the client applyProgression for identical
 * input (excluding the informational performanceHistory[].date stamp, which is
 * clock-derived on both sides). Pinned in lockstep by
 * src/features/program/__tests__/applyProgression.cross.test.ts, which runs the
 * client engine and this copy over a broad input matrix and asserts equality.
 * Any change to one side must land on the other in the same commit.
 */

const { isBodyweightExerciseId } = require("./bodyweightExerciseIds");

const RPE_HOLD_THRESHOLD = 9.5;
// Mirrors PERFORMANCE_HISTORY_CAP in programEngine.ts (pinned by the
// applyProgression cross-test). Named + exported rather than an inline -10:
// programCommands.js's easing-hold branch appends history too, and a second
// literal is exactly how the two copies drift apart.
const PERFORMANCE_HISTORY_CAP = 10;
const MAX_BODYWEIGHT_REPS = 20;
// Backlog #7's time axis (N2) — mirror of the client constants.
const HOLD_STEP_SECONDS = 5;
const MAX_HOLD_SECONDS = 60;
// Backlog #7 (H3) — mirror of src/features/program/movementClass.ts. The
// step keys on the MOVEMENT and its load, not on `isAccessory`; see that
// module for why the flag (a volume role, filled from the non-primary pool
// with RDLs and hack squats) can't answer the proportionality question.
const MICROPLATE_STEP = 1.25;
const PLATE_PAIR_STEP = 2.5;
const HEAVY_LOAD_KG = 40;
const SINGLE_JOINT_CATEGORIES = new Set(["arms_biceps", "arms_triceps"]);

function usesMicroplateStep(category, weight) {
  return SINGLE_JOINT_CATEGORIES.has(category) || weight < HEAVY_LOAD_KG;
}

function goalWeightBonus(goal) {
  return goal === "lean bulk" ? 1.25 : 0;
}

// performanceHistory date stamp. The client uses local `new Date()`; the server
// derives it from the command timestamp in UTC. The field is informational (not
// week-bucketed), and the parity cross-test ignores it, so the local/UTC
// difference is intentional and harmless.
function dateStampUTC(now) {
  const d = new Date(typeof now === "number" ? now : 0);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * @param {object} exercise - a ProgramExercise
 * @param {number} actualReps
 * @param {number} actualWeight
 * @param {string} goal
 * @param {boolean} microloading
 * @param {number} [actualRpe]
 * @param {number} [now] - ms timestamp for the history date stamp
 * @returns {object} next ProgramExercise
 */
function applyProgression(
  exercise,
  actualReps,
  actualWeight,
  goal,
  microloading,
  actualRpe,
  now
) {
  const today = dateStampUTC(now);
  const record = {
    date: today,
    weight: actualWeight,
    repsCompleted: actualReps,
    repsTarget: exercise.reps,
  };
  const history = [...(exercise.performanceHistory || []), record].slice(
    -PERFORMANCE_HISTORY_CAP
  );

  const updated = {
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

  const isBodyweight = isBodyweightExerciseId(exercise.exerciseId);
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
  const resetReps = exercise.baseReps ?? exercise.reps;

  const rpeOk = actualRpe == null || actualRpe < RPE_HOLD_THRESHOLD;
  // Backlog #7 (H3) — proportional load step, keyed on movement + load.
  const microplate = usesMicroplateStep(
    exercise.movementCategory,
    exercise.weight
  );
  const loadStep = microplate ? MICROPLATE_STEP : PLATE_PAIR_STEP;
  const loadBonus = microplate ? 0 : goalWeightBonus(goal);
  // Backlog #7's time axis (N2) — mirror; see programEngine.ts for why the
  // rep cap is meaningless for a hold that starts above it.
  const isTimed = exercise.repUnit === "seconds";
  const bumpBodyweightReps = () => {
    if (isTimed) {
      const ceiling = exercise.repRangeMax == null ? MAX_HOLD_SECONDS : exercise.repRangeMax;
      if (exercise.reps >= ceiling) {
        updated.notes =
          "Holding this long already — add load (weighted vest / band) to keep progressing.";
      } else {
        updated.reps = Math.min(ceiling, exercise.reps + HOLD_STEP_SECONDS);
      }
      return;
    }
    const ceiling =
      exercise.repRangeMax == null
        ? MAX_BODYWEIGHT_REPS
        : exercise.repRangeMax;
    if (exercise.reps >= ceiling) {
      updated.notes =
        `Hitting ${ceiling}+ reps — add load (weighted vest / band) to keep progressing.`;
    } else {
      updated.reps = Math.min(ceiling, exercise.reps + 1);
    }
  };

  if (exercise.progressionType === "double") {
    if (completed) {
      const rangeMax = exercise.repRangeMax;
      if (!isBodyweight && rangeMax != null && rangeMax > resetReps) {
        // Range-aware double progression (P1) — mirror of the client branch;
        // see programEngine.ts for the full rationale.
        if (rpeOk) {
          if (actualReps >= rangeMax) {
            updated.weight = exercise.weight + loadStep + loadBonus;
            updated.reps = resetReps;
          } else {
            updated.reps = Math.min(rangeMax, actualReps + 1);
          }
        }
      } else if (actualReps >= exercise.reps + 2 && rpeOk) {
        if (isBodyweight) {
          bumpBodyweightReps();
        } else {
          updated.weight = exercise.weight + loadStep + loadBonus;
          updated.reps = resetReps;
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
          updated.weight = Math.round(exercise.weight * 0.95 * 2) / 2;
        }
        updated.consecutiveFailures = 0;
        updated.plateauCount = (exercise.plateauCount || 0) + 1;
      }
    }
  } else {
    if (completed) {
      if (isBodyweight) {
        if (actualReps >= exercise.reps + 2 && rpeOk) {
          bumpBodyweightReps();
        }
      } else if (microloading && rpeOk) {
        updated.weight = exercise.weight + 1;
      } else {
        if (actualReps >= exercise.reps + 2 && rpeOk) {
          // No goal bonus on the linear path — pre-#7 behaviour, kept.
          updated.weight = exercise.weight + loadStep;
          updated.reps = resetReps;
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

module.exports = {
  applyProgression,
  dateStampUTC,
  goalWeightBonus,
  PERFORMANCE_HISTORY_CAP,
  RPE_HOLD_THRESHOLD,
  MAX_BODYWEIGHT_REPS,
};
