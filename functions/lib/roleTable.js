"use strict";

/**
 * Server mirror of the role table (Lift4 (5)): the sets and reps a plan gives
 * each lift by its role (main lift, other compound, isolation), the goal and
 * the level. The client's copy is `src/features/program/roleTable.ts`, which
 * carries the table and its reasons.
 *
 * A training block re-prescribes a week for a new focus on the server
 * (`represcribe.js`), so the server has to know each lift's role. The role
 * comes from the catalogue's `mechanic` and the slot's `isAccessory`
 * (`exerciseRole.ts`), and the Build muscle 12–20 isolations from the
 * catalogue's muscle group. The catalogue can't be required from CommonJS,
 * so this keeps the two id lists those reads produce.
 *
 * TESTED-COPY RULE: pinned by
 * `src/features/program/__tests__/roleTable.cross.test.ts`, which derives
 * both lists from EXERCISES and compares every row of the table. Add an
 * isolation, or a calf, side-delt or ab exercise, to the catalogue and these
 * lists change in the same commit.
 */

/** The catalogue's `mechanic: "isolation"` rows. */
const ISOLATION_EXERCISE_IDS = Object.freeze([
  "ab-wheel",
  "barbell-curl",
  "barbell-shrug",
  "bayesian-cable-curl",
  "bicycle-crunch",
  "cable-crossover",
  "cable-crunch",
  "cable-curl",
  "cable-fly",
  "cable-glute-kickback",
  "cable-lateral-raise",
  "cable-woodchopper",
  "calf-raise",
  "concentration-curl",
  "cross-body-hammer-curl",
  "crunches",
  "cuban-press",
  "db-curl",
  "db-flyes",
  "dead-bug",
  "decline-sit-up",
  "donkey-calf-raise",
  "dragon-flag",
  "ez-bar-curl",
  "face-pulls",
  "front-raise",
  "glute-ham-raise",
  "hammer-curl",
  "hip-abduction-machine",
  "hip-adduction-machine",
  "incline-db-curl",
  "l-sit",
  "lateral-raise",
  "leg-extension",
  "leg-raise",
  "lu-raise",
  "machine-chest-fly",
  "mountain-climbers",
  "nordic-hamstring-curl",
  "overhead-cable-tricep-extension",
  "overhead-extension",
  "pallof-press",
  "pec-deck",
  "plank",
  "preacher-curl",
  "rear-delt-machine-fly",
  "reverse-barbell-curl",
  "reverse-flyes",
  "reverse-grip-cable-pushdown",
  "reverse-pec-deck",
  "rope-tricep-pushdown",
  "russian-twist",
  "seated-calf-raise",
  "seated-leg-curl",
  "shrugs",
  "side-plank",
  "single-arm-cable-pushdown",
  "single-leg-calf-raise",
  "sissy-squat",
  "skull-crushers",
  "spider-db-curl",
  "standing-calf-raise",
  "straight-arm-pulldown",
  "superman-hold",
  "toe-touches",
  "tricep-kickback",
  "weighted-plank",
  "zottman-curl",
]);

/** The catalogue's calf, side-delt and ab rows: Build muscle gives them
 *  12–20. */
const HIGH_REP_EXERCISE_IDS = Object.freeze([
  "ab-wheel",
  "bicycle-crunch",
  "cable-crunch",
  "cable-lateral-raise",
  "cable-woodchopper",
  "calf-raise",
  "crunches",
  "dead-bug",
  "decline-sit-up",
  "donkey-calf-raise",
  "dragon-flag",
  "l-sit",
  "lateral-raise",
  "leg-raise",
  "mountain-climbers",
  "pallof-press",
  "plank",
  "russian-twist",
  "seated-calf-raise",
  "side-plank",
  "single-leg-calf-raise",
  "standing-calf-raise",
  "toe-touches",
  "weighted-plank",
]);

const ISOLATION_SET = new Set(ISOLATION_EXERCISE_IDS);
const HIGH_REP_SET = new Set(HIGH_REP_EXERCISE_IDS);

/** Mirror of roleTable.ts ROLE_TABLE. */
const ROLE_TABLE = Object.freeze({
  hypertrophy: {
    main: { bottom: 6, top: 10 },
    compound: { bottom: 8, top: 12 },
    isolation: { bottom: 10, top: 15 },
  },
  strength: {
    main: { bottom: 5 },
    compound: { bottom: 6, top: 10 },
    isolation: { bottom: 8, top: 12 },
  },
  general: {
    main: { bottom: 8, top: 12 },
    compound: { bottom: 8, top: 12 },
    isolation: { bottom: 10, top: 15 },
  },
  running: {
    main: { bottom: 5 },
    compound: { bottom: 6, top: 10 },
    isolation: { bottom: 8, top: 12 },
  },
});

/** Mirror of experienceModel.ts toExperience. */
function toExperience(value) {
  return value === "beginner" ||
    value === "advanced" ||
    value === "intermediate"
    ? value
    : "intermediate";
}

/** Mirror of exerciseRole.ts exerciseRole. */
function exerciseRole(exercise) {
  if (exercise && ISOLATION_SET.has(exercise.exerciseId)) return "isolation";
  return exercise && exercise.isAccessory ? "compound" : "main";
}

/** Mirror of roleTable.ts tableGoal. */
function tableGoal(goal) {
  if (goal === "fat_loss") return "hypertrophy";
  return goal === "hypertrophy" || goal === "strength" || goal === "running"
    ? goal
    : "general";
}

/** Mirror of roleTable.ts roleReps. */
function roleReps(goal, role, experience, highRepIsolation) {
  const g = tableGoal(goal);
  const beginner = toExperience(experience) === "beginner";
  let reps = ROLE_TABLE[g][role];
  if (role === "main" && beginner && reps.top !== undefined) {
    reps = { bottom: 8 };
  }
  if (g === "hypertrophy" && role === "isolation" && highRepIsolation) {
    reps = { bottom: 12, top: 20 };
  }
  const sets =
    role === "main"
      ? g === "strength" && !beginner
        ? 4
        : 3
      : beginner
        ? 2
        : 3;
  return { sets, ...reps };
}

/** Mirror of roleTable.ts roleRepsFor. */
function roleRepsFor(goal, exercise, experience) {
  return roleReps(
    goal,
    exerciseRole(exercise),
    experience,
    HIGH_REP_SET.has(exercise && exercise.exerciseId)
  );
}

module.exports = {
  HIGH_REP_EXERCISE_IDS,
  ISOLATION_EXERCISE_IDS,
  exerciseRole,
  roleReps,
  roleRepsFor,
  toExperience,
};
