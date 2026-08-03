"use strict";

/**
 * Server mirror of the goal-prescription engine.
 *
 * ── What this is for ─────────────────────────────────────────────────────
 *
 * A training block re-derives a whole week's rep targets for a new focus.
 * `startTrainingBlock` applies that transform; `releaseTrainingBlock` applies
 * the SAME transform with `goalBefore`, which is why there is no per-slot
 * snapshot to restore. Both were the last writers holding a document write
 * for a reason the boundary could not dodge: the output is the entire
 * `workouts` array, and a client-supplied workouts array is exactly the
 * whole-document write the boundary exists to refuse (`replaceProgramme` is a
 * private server transition by construction). So the rule has to live here.
 *
 * ── What is mirrored, and from where ─────────────────────────────────────
 *
 *   GOAL_PROFILES, goalProfileFor, prescribedRepCeiling, assignDayRoles,
 *   repDeltaForRole, repFloorFor, repRangeMaxFor  → programEngine.ts
 *   usesUndulation, toExperience                  → experienceModel.ts
 *   scaleLoadForReps, represcribeWorkouts         → represcribe.ts
 *   BLOCK_AMNESTY_WEEKS                           → represcribe.ts
 *   makeBlockId                                   → trainingBlock.ts
 *
 * `isBodyweightExerciseId` is NOT re-mirrored — it already exists here and is
 * already pinned by its own cross-test.
 *
 * `MAX_PRESCRIBED_REPS` is derived from `MAX_BODYWEIGHT_REPS` rather than
 * written as 20, exactly as the client derives it. The client's comment is
 * the reason: "20 is not a new number — MAX_BODYWEIGHT_REPS is already the
 * point where the progression engine stops adding reps and tells the user to
 * add load." Two literals would let those drift apart silently.
 *
 * ── The one deliberate DIVERGENCE ────────────────────────────────────────
 *
 * `goalProfileFor` on the client is `GOAL_PROFILES[goal ?? "general"]`, which
 * returns `undefined` for a goal outside the union and then throws on the
 * first property read. That is fine there: `PrimaryGoal` is a compile-time
 * union and the value comes from typed state. It is NOT fine here. This
 * reducer reads `block.goalBefore` out of a stored document, which is
 * untrusted and may predate any given union member — and a throw inside the
 * transaction fails the whole command rather than degrading. So an unknown
 * goal falls back to `general`.
 *
 * The cross-test therefore pins equality across the real union and documents
 * this case rather than asserting it, which is the honest shape: a mirror
 * that silently hardened would be a mirror nobody could trust to be equal.
 *
 * TESTED-COPY RULE: pinned by
 * `src/features/program/__tests__/represcribe.cross.test.ts`.
 */

const { isBodyweightExerciseId } = require("./bodyweightExerciseIds");
const { MAX_BODYWEIGHT_REPS } = require("./progressionEngine");

/** Mirror of programEngine.ts GOAL_PROFILES. */
const GOAL_PROFILES = Object.freeze({
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
  // Heavy + brief. See the client row's comment for the evidence
  // (Llanos-Lagos et al. 2024: submaximal load, 40-79% 1RM, did not improve
  // running economy; >=80% did). This is the copy that actually WRITES a
  // training block's prescription — startTrainingBlock / releaseTrainingBlock
  // both go through it — so it must move in the same commit as the client or
  // a runner is shown one target and written another.
  running: {
    mainReps: 4,
    mainRepsMax: 6,
    accessoryReps: 10,
    accessoryRepsMax: 12,
    volumeMultiplier: 0.85,
    mainProgression: "linear",
  },
});

const PRIMARY_GOALS = Object.freeze(Object.keys(GOAL_PROFILES));

/** Mirror of programEngine.ts goalProfileFor. See the divergence note above. */
function goalProfileFor(primaryGoal) {
  return GOAL_PROFILES[primaryGoal] || GOAL_PROFILES.general;
}

// Mirror of programEngine.ts. Derived, not a second literal — see the header.
const MAX_PRESCRIBED_REPS = MAX_BODYWEIGHT_REPS;
const MAX_PRESCRIBED_BODYWEIGHT_REPS = 15;

/** Mirror of programEngine.ts prescribedRepCeiling. */
function prescribedRepCeiling(ex) {
  // Timed holds count seconds, not reps — a 30-45s plank is not a 30-rep set.
  if (ex && ex.repUnit === "seconds") return Number.POSITIVE_INFINITY;
  return isBodyweightExerciseId(ex && ex.exerciseId)
    ? MAX_PRESCRIBED_BODYWEIGHT_REPS
    : MAX_PRESCRIBED_REPS;
}

/** Mirror of programEngine.ts assignDayRoles. */
function assignDayRoles(count) {
  if (count <= 1) return count === 1 ? ["moderate"] : [];
  return Array.from({ length: count }, (_, i) => {
    if (i < Math.floor(count / 2)) return "heavy";
    if (i >= Math.ceil(count / 2)) return "pump";
    return "moderate";
  });
}

/** Mirror of programEngine.ts repDeltaForRole. */
function repDeltaForRole(role) {
  return role === "heavy" ? -2 : role === "pump" ? 2 : 0;
}

/** Mirror of programEngine.ts repFloorFor. */
function repFloorFor(ex) {
  return ex && ex.isAccessory === true ? 6 : 3;
}

/** Mirror of programEngine.ts repRangeMaxFor. */
function repRangeMaxFor(ex, reps, span) {
  const ceiling = Math.min(reps + span, prescribedRepCeiling(ex));
  return span > 0 && ceiling > reps ? ceiling : undefined;
}

/** Mirror of experienceModel.ts usesUndulation. */
function usesUndulation(experience) {
  return (experience === undefined || experience === null
    ? "intermediate"
    : experience) !== "beginner";
}

/** Mirror of experienceModel.ts toExperience. */
function toExperience(value) {
  return value === "beginner" ||
    value === "advanced" ||
    value === "intermediate"
    ? value
    : "intermediate";
}

/** Mirror of represcribe.ts scaleLoadForReps (Epley-shaped load rescale). */
function scaleLoadForReps(weight, fromReps, toReps) {
  if (!Number.isFinite(weight) || weight <= 0) return 0;
  if (!Number.isFinite(fromReps) || !Number.isFinite(toReps)) return weight;
  if (toReps <= fromReps) return weight;
  const ratio = (1 + fromReps / 30) / (1 + toReps / 30);
  return Math.round((weight * ratio) / 2.5) * 2.5;
}

/** Mirror of represcribe.ts BLOCK_AMNESTY_WEEKS. */
const BLOCK_AMNESTY_WEEKS = 3;

/** Mirror of trainingBlock.ts makeBlockId. */
function makeBlockId(startDate, createdAt) {
  return `${startDate}-${createdAt}`;
}

/**
 * Mirror of represcribe.ts represcribeWorkouts — re-derive a week's
 * prescription for `goal`, preserving everything else.
 */
function represcribeWorkouts(workouts, goal, experience) {
  const list = Array.isArray(workouts) ? workouts : [];
  const profile = goalProfileFor(goal);
  const mainSpan = Math.max(0, profile.mainRepsMax - profile.mainReps);
  const accessorySpan = Math.max(
    0,
    profile.accessoryRepsMax - profile.accessoryReps
  );
  // Undulation is applied per DAY INDEX, so the roles have to be computed
  // over the whole week before any slot is touched.
  const roles = assignDayRoles(list.length);
  const undulates = usesUndulation(experience);

  return list.map((day, dayIndex) => ({
    ...day,
    exercises: (Array.isArray(day.exercises) ? day.exercises : []).map((ex) => {
      // A 30-45s plank is not a 12-rep set, and no goal profile authors a
      // seconds target. The honest handling is to leave them entirely alone.
      if (ex.repUnit === "seconds") return { ...ex };

      // `undefined` falls to MAIN, matching generateProgram's own convention
      // for legacy and unflagged slots.
      const isAccessory = ex.isAccessory === true;
      const tierReps = isAccessory ? profile.accessoryReps : profile.mainReps;
      const span = isAccessory ? accessorySpan : mainSpan;
      const delta = undulates ? repDeltaForRole(roles[dayIndex]) : 0;

      const reps = Math.min(
        prescribedRepCeiling(ex),
        Math.max(repFloorFor(ex), tierReps + delta)
      );
      const rangeMax = repRangeMaxFor(ex, reps, span);

      const out = {
        ...ex,
        reps,
        // applyProgression resets the climbing target back to `baseReps`
        // after a load step, so leaving it on the old focus's number would
        // walk the user back to the retired prescription one step later.
        baseReps: reps,
        progressionType: isAccessory ? "double" : profile.mainProgression,
        weight: scaleLoadForReps(ex.weight, ex.baseReps ?? ex.reps, reps),
        // Failure counters accumulated against a rep target that no longer
        // exists are not evidence of anything.
        consecutiveFailures: 0,
        plateauCount: 0,
      };
      // Omitted rather than zeroed when the profile authors no span — a
      // `repRangeMax` of 0 would read as a ceiling below the target.
      if (rangeMax !== undefined) out.repRangeMax = rangeMax;
      else delete out.repRangeMax;
      return out;
    }),
  }));
}

module.exports = {
  BLOCK_AMNESTY_WEEKS,
  GOAL_PROFILES,
  MAX_PRESCRIBED_BODYWEIGHT_REPS,
  MAX_PRESCRIBED_REPS,
  PRIMARY_GOALS,
  assignDayRoles,
  goalProfileFor,
  makeBlockId,
  prescribedRepCeiling,
  repDeltaForRole,
  repFloorFor,
  repRangeMaxFor,
  represcribeWorkouts,
  scaleLoadForReps,
  toExperience,
  usesUndulation,
};
