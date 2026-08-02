"use strict";

/**
 * Programme command boundary — validation core (packet 18, PR1).
 *
 * BACKGROUND — the defect this closes.
 * `users/{uid}/programState/current` is today a last-write-wins document.
 * `src/features/program/useProgram.ts` loads it with getDoc/getDocFromCache,
 * holds the snapshot in a React closure, and every writer rebuilds a whole new
 * ProgramState from that potentially-stale copy and `setDocGuarded`s it back.
 * Two devices / two tabs / a server reconciliation sweep therefore clobber one
 * another: completing a lift on one device can overwrite a scheduled recovery
 * reconciliation's runDays on another. The fix is to make one server
 * transaction the sole authority: the client sends a small, validated *intent*
 * (a command), never a whole document or a generic patch.
 *
 * THIS MODULE is the security-critical foundation of that boundary: a closed,
 * dependency-free validator for the client-facing command union. It is
 * deliberately INERT in this PR — nothing calls it yet. The reducer
 * (`applyProgramCommand`), the private server transition
 * (`assertServerProgramTransition` for configurePlan), the callable, the
 * client subscriber/outbox, and the Firestore-rules lock land in subsequent
 * PRs, in the release order fixed by the packet. Shipping the validator first,
 * inert, lets it be reviewed and unit-tested in isolation without touching any
 * live write path.
 *
 * WHY A CLOSED VALIDATOR. Once the callable exists it runs under the Admin SDK
 * and bypasses Firestore rules. If it accepted an arbitrary object it would
 * simply move the stale-overwrite (or worse, an injected-field) attack behind
 * elevated privilege. So this validator:
 *   - accepts ONLY the known discriminated command kinds (unknown kind →
 *     reject; `replaceProgramme` is a PRIVATE server transition and is
 *     rejected here by construction);
 *   - rejects extra/unknown keys at every object level (no arbitrary patch,
 *     no client-supplied ProgramState, no client-supplied exercise object);
 *   - bounds every primitive (id format, string length, numeric range, array
 *     length) so a valid command can't bloat or poison downstream state.
 *
 * Pure CommonJS, no firebase-functions / firebase-admin imports — unit-testable
 * exactly like validatePlanPayload.js / programStateSanitizer.js. The callable
 * wrapper maps a thrown `ProgramCommandError` to
 * `HttpsError("invalid-argument", …)` / `"failed-precondition"`.
 */

// Server mirror of the client progression engine (pinned by a parity
// cross-test). Used by the logExercise reducer.
const {
  applyProgression,
  dateStampUTC,
  PERFORMANCE_HISTORY_CAP,
} = require("./progressionEngine");
// Easing-block progression hold (pinned by a parity cross-test). The third
// branch of the logExercise reducer.
const { holdsProgression } = require("./progressionHold");
// Catalog name mirror + ProgramExercise builder (both pinned by cross-tests).
// Used by the addExercises / replaceExercise reducers to derive exercise fields
// server-side rather than trust a client-supplied exercise object.
const {
  getExerciseName,
  isCatalogExerciseId,
} = require("./exerciseCatalog");
const { buildProgramExercise } = require("./programExerciseBuilder");
// Calorie-engine mirror (pinned by a parity cross-test). Used by the
// completeWorkoutDay effect to compute the saved workout's totalCalories.
const { estimateLiftBurn } = require("./workoutBurn");
// Per-set record projection mirror (pinned by a parity cross-test). Used by
// the completeWorkoutDay effect to build the saved workout's sets.
const { projectWorkoutSets } = require("./workoutSetRecord");
// Race-template ids (pinned set-equal to the race-TYPE RUN_TEMPLATES entries by
// raceTemplateIds.cross.test.ts). Used by RUN-RACE-GUARD-01 below.
const { isRaceTemplateId } = require("./raceTemplateIds");
// Deload-transform mirror (pinned by a parity cross-test). Used by the
// applyDeloadWeek reducer (PROGRAM-DELOAD-01).
const {
  applyDeloadToWorkouts,
  prepareForDeloadWorkouts,
} = require("./deloadEngine");

const TIMED_EXERCISE_IDS = new Set([
  "plank",
  "superman-hold",
  "side-plank",
  "weighted-plank",
]);
function repUnitForExerciseId(exerciseId) {
  return TIMED_EXERCISE_IDS.has(exerciseId) ? "seconds" : undefined;
}

// 31-day receipt retention. Command receipts live at
// users/{uid}/programState/current/commandReceipts/{commandId} and make a
// retried offline / timed-out command idempotent. A bounded scheduled cleanup
// (later PR) deletes receipts past cleanupAfter; we do NOT rely on Firestore
// TTL unless an operator explicitly configures one for that collection.
const PROGRAM_COMMAND_RECEIPT_RETENTION_MS = 31 * 24 * 60 * 60 * 1000;

// Public client command kinds. `replaceProgramme` is intentionally ABSENT: it
// has no validated public payload and is a private server transition applied
// only by configurePlan after its own plan validation.
const CLIENT_COMMAND_KINDS = Object.freeze([
  "completeWorkoutDay",
  "skipWorkoutDay",
  "setNextWorkout",
  "logExercise",
  "removeExercise",
  "addExercises",
  "replaceExercise",
  "updateExercise",
  "reorderExercises",
  "setProgramSettings",
  "setProgramGoalMirror",
  "setManualRunCompletion",
  "transitionRunDay",
  "overrideRunDay",
  "applyDeloadWeek",
  "revertDeloadWeek",
  "restoreExercise",
  "clearNextWorkout",
  "restoreWorkoutDay",
  "dismissFellBehindPrompt",
  "endTrainingBlockKeepingFocus",
]);
const CLIENT_COMMAND_KIND_SET = new Set(CLIENT_COMMAND_KINDS);

// Kinds that must NEVER arrive over the client callable — they are server-only
// transitions. Listed explicitly so a probe gets a precise error rather than
// the generic "unsupported kind".
const PRIVATE_SERVER_KINDS = new Set(["replaceProgramme"]);

const PROGRAM_GOALS = new Set(["cut", "lean bulk", "recomp"]);
const SESSION_VARIANTS = new Set(["express45", "express30"]);

// Bounds. Generous but finite — a legitimate command is comfortably inside
// these; the point is to deny unbounded/poisonous payloads, not to police
// business rules (the reducer does that against real state).
const MAX_ID_LEN = 256; // exercise/instance/run-day/template identifiers
const MAX_COMPLETION_ID_LEN = 128;
const MIN_COMPLETION_ID_LEN = 8;
const MAX_SIGNATURE_LEN = 4000;
const MAX_DAY_INDEX = 30;
const MAX_WEEK_NUMBER = 1040; // ~20 years of weeks
const MAX_DURATION_MINUTES = 1440;
const MAX_SET_LOG_EXERCISES = 60;
const MAX_SETS_PER_EXERCISE = 60;
const MAX_WEIGHT = 100000;
const MAX_REPS = 10000;
const MAX_SETS_FIELD = 100;
const MAX_ADD_EXERCISES = 50;
const MAX_INSERT_AT = 500;
const MAX_ORDERED_IDS = 200;

const COMMAND_ID_RE = /^[A-Za-z0-9_-]{16,128}$/;
// Completion id doubles as a Firestore doc-id segment (programme-<id>). Packet
// 15's fallback id uses this bounded safe alphabet; allow a shorter floor than
// the opaque command id since it is generated once per session.
const SAFE_ID_RE = /^[A-Za-z0-9_-]+$/;

class ProgramCommandError extends Error {
  /**
   * @param {string} code - short machine code (also the message).
   * @param {"invalid-argument"|"failed-precondition"} [kind]
   *   maps to the HttpsError code the callable should surface.
   */
  constructor(code, kind) {
    super(code);
    this.name = "ProgramCommandError";
    this.code = code;
    this.httpsCode = kind === "failed-precondition"
      ? "failed-precondition"
      : "invalid-argument";
  }
}

function isProgramCommandError(error) {
  return error instanceof ProgramCommandError;
}

function invalidCommand(message) {
  throw new ProgramCommandError(message, "invalid-argument");
}

// ---------------------------------------------------------------------------
// Primitive validators
// ---------------------------------------------------------------------------

function isPlainObject(value) {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    // reject boxed types / class instances that could smuggle behaviour
    (Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null)
  );
}

/**
 * Enforce that `obj` has EXACTLY the allowed keys: every required key present,
 * and no key outside required∪optional. Rejecting extras is the core anti-
 * injection guarantee — a client cannot smuggle an unmodelled field.
 */
function assertKeys(obj, label, requiredKeys, optionalKeys) {
  if (!isPlainObject(obj)) {
    invalidCommand(`${label} must be an object.`);
  }
  const allowed = new Set([...requiredKeys, ...(optionalKeys || [])]);
  for (const key of Object.keys(obj)) {
    if (!allowed.has(key)) {
      invalidCommand(`${label} has an unexpected field "${key}".`);
    }
  }
  for (const key of requiredKeys) {
    if (!(key in obj)) {
      invalidCommand(`${label} is missing required field "${key}".`);
    }
  }
}

function assertString(value, label, maxLen, minLen) {
  if (typeof value !== "string") {
    invalidCommand(`${label} must be a string.`);
  }
  const floor = typeof minLen === "number" ? minLen : 1;
  if (value.length < floor || value.length > maxLen) {
    invalidCommand(`${label} has an invalid length.`);
  }
  return value;
}

function assertSafeId(value, label, maxLen, minLen) {
  assertString(value, label, maxLen, minLen);
  if (!SAFE_ID_RE.test(value)) {
    invalidCommand(`${label} contains unsupported characters.`);
  }
  return value;
}

function assertBoolean(value, label) {
  if (typeof value !== "boolean") {
    invalidCommand(`${label} must be a boolean.`);
  }
  return value;
}

function assertFiniteNumber(value, label, min, max) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    invalidCommand(`${label} must be a finite number.`);
  }
  if (value < min || value > max) {
    invalidCommand(`${label} is out of range.`);
  }
  return value;
}

function assertBoundedInt(value, label, min, max) {
  assertFiniteNumber(value, label, min, max);
  if (!Number.isInteger(value)) {
    invalidCommand(`${label} must be an integer.`);
  }
  return value;
}

// A plain YYYY-MM-DD calendar day. Deliberately NOT a timestamp: the only
// thing a client sends this for is "which local day is it for me", and a
// bounded date string can't carry a timezone the server would then have to
// reason about. Range-checked so a typo'd year can't put a training block
// thousands of weeks out.
const LOCAL_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function assertLocalDate(value, label) {
  if (typeof value !== "string" || !LOCAL_DATE_RE.test(value)) {
    invalidCommand(`${label} must be a YYYY-MM-DD date.`);
  }
  const [y, m, d] = value.split("-").map(Number);
  if (y < 2000 || y > 2200 || m < 1 || m > 12 || d < 1 || d > 31) {
    invalidCommand(`${label} is not a valid date.`);
  }
  return value;
}

function assertEnum(value, label, allowedSet) {
  if (typeof value !== "string" || !allowedSet.has(value)) {
    invalidCommand(`${label} is not a permitted value.`);
  }
  return value;
}

/**
 * Opaque command id. A stable gesture id (or packet-15 completion command id)
 * that must survive offline replay / timeout retry unchanged; it is the
 * idempotency key. Exported so the packet's later dispatcher/tests share one
 * definition.
 */
function assertCommandId(value) {
  if (typeof value !== "string" || !COMMAND_ID_RE.test(value)) {
    invalidCommand("Invalid command id.");
  }
  return value;
}

// ---------------------------------------------------------------------------
// Composite validators
// ---------------------------------------------------------------------------

// WorkoutDayPrecondition — dayIndex + expected week + server-recomputed day
// signature. A day index alone is unsafe after an offline delay: a rollover
// can shift which day an index points at. The reducer (later PR) recomputes
// the signature from current state and rejects failed-precondition on
// mismatch; here we only validate SHAPE + bounds.
function validatePrecondition(command, out) {
  out.dayIndex = assertBoundedInt(command.dayIndex, "dayIndex", 0, MAX_DAY_INDEX);
  out.expectedWeekNumber = assertBoundedInt(
    command.expectedWeekNumber,
    "expectedWeekNumber",
    1,
    MAX_WEEK_NUMBER
  );
  out.expectedDaySignature = assertString(
    command.expectedDaySignature,
    "expectedDaySignature",
    MAX_SIGNATURE_LEN
  );
}

const PRECONDITION_KEYS = ["dayIndex", "expectedWeekNumber", "expectedDaySignature"];

// D2: how a set was performed, and how hard it felt. Both are OPTIONAL so a
// pre-D2 client keeps validating, and both are bounded like every other
// primitive here — this validator runs under the Admin SDK and bypasses
// Firestore rules, so an unbounded field would be a hole rather than a
// convenience.
const SET_LOG_TYPES = new Set(["working", "warmup", "dropset", "failure"]);
const MAX_RPE = 10;

function validateSetLog(entry, label) {
  assertKeys(entry, label, ["weight", "reps", "completed"], ["type", "rpe"]);
  const out = {
    weight: assertFiniteNumber(entry.weight, `${label}.weight`, 0, MAX_WEIGHT),
    reps: assertBoundedInt(entry.reps, `${label}.reps`, 0, MAX_REPS),
    completed: assertBoolean(entry.completed, `${label}.completed`),
  };
  if ("type" in entry && entry.type !== undefined) {
    if (typeof entry.type !== "string" || !SET_LOG_TYPES.has(entry.type)) {
      invalidCommand(`${label}.type must be a known set type.`);
    }
    out.type = entry.type;
  }
  if ("rpe" in entry && entry.rpe !== undefined) {
    out.rpe = assertFiniteNumber(entry.rpe, `${label}.rpe`, 0, MAX_RPE);
  }
  return out;
}

function validateSetLogs(value) {
  if (!Array.isArray(value)) {
    invalidCommand("completion.setLogs must be an array.");
  }
  if (value.length > MAX_SET_LOG_EXERCISES) {
    invalidCommand("completion.setLogs has too many exercises.");
  }
  return value.map((exerciseSets, i) => {
    if (!Array.isArray(exerciseSets)) {
      invalidCommand(`completion.setLogs[${i}] must be an array.`);
    }
    if (exerciseSets.length > MAX_SETS_PER_EXERCISE) {
      invalidCommand(`completion.setLogs[${i}] has too many sets.`);
    }
    return exerciseSets.map((set, j) =>
      validateSetLog(set, `completion.setLogs[${i}][${j}]`)
    );
  });
}

function validateCompletion(value) {
  assertKeys(
    value,
    "completion",
    ["completionId", "durationMinutes", "setLogs"],
    ["sessionVariant"]
  );
  const out = {
    completionId: assertSafeId(
      value.completionId,
      "completion.completionId",
      MAX_COMPLETION_ID_LEN,
      MIN_COMPLETION_ID_LEN
    ),
    durationMinutes: assertFiniteNumber(
      value.durationMinutes,
      "completion.durationMinutes",
      0,
      MAX_DURATION_MINUTES
    ),
    setLogs: validateSetLogs(value.setLogs),
  };
  if ("sessionVariant" in value) {
    out.sessionVariant = assertEnum(
      value.sessionVariant,
      "completion.sessionVariant",
      SESSION_VARIANTS
    );
  }
  return out;
}

function validateExerciseInput(value, label) {
  assertKeys(value, label, ["exerciseId"], ["sets", "reps", "weight"]);
  const out = {
    exerciseId: assertString(value.exerciseId, `${label}.exerciseId`, MAX_ID_LEN),
  };
  if ("sets" in value) {
    out.sets = assertBoundedInt(value.sets, `${label}.sets`, 1, MAX_SETS_FIELD);
  }
  if ("reps" in value) {
    out.reps = assertBoundedInt(value.reps, `${label}.reps`, 0, MAX_REPS);
  }
  if ("weight" in value) {
    out.weight = assertFiniteNumber(value.weight, `${label}.weight`, 0, MAX_WEIGHT);
  }
  return out;
}

function validateExercisePatch(value) {
  assertKeys(value, "patch", [], ["sets", "reps", "weight"]);
  const out = {};
  if ("sets" in value) {
    out.sets = assertBoundedInt(value.sets, "patch.sets", 1, MAX_SETS_FIELD);
  }
  if ("reps" in value) {
    out.reps = assertBoundedInt(value.reps, "patch.reps", 0, MAX_REPS);
  }
  if ("weight" in value) {
    out.weight = assertFiniteNumber(value.weight, "patch.weight", 0, MAX_WEIGHT);
  }
  if (Object.keys(out).length === 0) {
    invalidCommand("patch must set at least one of sets/reps/weight.");
  }
  return out;
}

// ---------------------------------------------------------------------------
// Per-kind command validators — each returns a fresh, minimal command object
// containing ONLY the modelled fields (kind + commandId already set by caller).
// ---------------------------------------------------------------------------

const KIND_VALIDATORS = {
  completeWorkoutDay(command, out) {
    assertKeys(
      command,
      "completeWorkoutDay",
      ["kind", "commandId", "completion", ...PRECONDITION_KEYS],
      []
    );
    validatePrecondition(command, out);
    out.completion = validateCompletion(command.completion);
  },

  skipWorkoutDay(command, out) {
    assertKeys(command, "skipWorkoutDay", ["kind", "commandId", ...PRECONDITION_KEYS], []);
    validatePrecondition(command, out);
  },

  setNextWorkout(command, out) {
    assertKeys(command, "setNextWorkout", ["kind", "commandId", ...PRECONDITION_KEYS], []);
    validatePrecondition(command, out);
  },

  logExercise(command, out) {
    assertKeys(
      command,
      "logExercise",
      ["kind", "commandId", "exerciseInstanceId", "actual", ...PRECONDITION_KEYS],
      // `today` is the user's LOCAL calendar day, which the server cannot
      // derive (no timezone on programState). It feeds the easing-block hold
      // only. `actualRpe` is the client's optional RPE — the progression
      // engine already takes it; the command used to drop it, which silently
      // progressed a session the user had flagged as maximal.
      ["today", "actualRpe"]
    );
    validatePrecondition(command, out);
    out.exerciseInstanceId = assertString(
      command.exerciseInstanceId,
      "exerciseInstanceId",
      MAX_ID_LEN
    );
    out.actual = validateSetLog(command.actual, "actual");
    if ("today" in command) {
      out.today = assertLocalDate(command.today, "today");
    }
    if ("actualRpe" in command) {
      out.actualRpe = assertFiniteNumber(command.actualRpe, "actualRpe", 1, 10);
    }
  },

  removeExercise(command, out) {
    assertKeys(
      command,
      "removeExercise",
      ["kind", "commandId", "exerciseInstanceId", ...PRECONDITION_KEYS],
      []
    );
    validatePrecondition(command, out);
    out.exerciseInstanceId = assertString(
      command.exerciseInstanceId,
      "exerciseInstanceId",
      MAX_ID_LEN
    );
  },

  addExercises(command, out) {
    assertKeys(
      command,
      "addExercises",
      ["kind", "commandId", "exercises", ...PRECONDITION_KEYS],
      ["insertAt"]
    );
    validatePrecondition(command, out);
    if (!Array.isArray(command.exercises) || command.exercises.length === 0) {
      invalidCommand("addExercises.exercises must be a non-empty array.");
    }
    if (command.exercises.length > MAX_ADD_EXERCISES) {
      invalidCommand("addExercises.exercises has too many entries.");
    }
    out.exercises = command.exercises.map((exercise, i) =>
      validateExerciseInput(exercise, `exercises[${i}]`)
    );
    if ("insertAt" in command) {
      out.insertAt = assertBoundedInt(command.insertAt, "insertAt", 0, MAX_INSERT_AT);
    }
  },

  replaceExercise(command, out) {
    assertKeys(
      command,
      "replaceExercise",
      ["kind", "commandId", "oldInstanceId", "replacementExerciseId", ...PRECONDITION_KEYS],
      ["replacementWeight"]
    );
    validatePrecondition(command, out);
    out.oldInstanceId = assertString(command.oldInstanceId, "oldInstanceId", MAX_ID_LEN);
    out.replacementExerciseId = assertString(
      command.replacementExerciseId,
      "replacementExerciseId",
      MAX_ID_LEN
    );
    // Cold-start load for the replacement, calibrated CLIENT-side. See the
    // note on the reducer for why this one value is accepted from the client
    // when an exercise object never is.
    if ("replacementWeight" in command) {
      out.replacementWeight = assertFiniteNumber(
        command.replacementWeight,
        "replacementWeight",
        0,
        MAX_WEIGHT
      );
    }
  },

  /**
   * One-tap undo of the last removal (P6).
   *
   * Carries no payload beyond the precondition: WHAT to restore is server
   * state (`lastRemovedExercise`), not a client claim. That is the whole point
   * — the client cannot reconstruct the removed exercise's history and load, so
   * letting it try would be both a fidelity bug and a hole.
   */
  restoreExercise(command, out) {
    assertKeys(command, "restoreExercise", ["kind", "commandId", ...PRECONDITION_KEYS], []);
    validatePrecondition(command, out);
  },

  updateExercise(command, out) {
    assertKeys(
      command,
      "updateExercise",
      ["kind", "commandId", "exerciseInstanceId", "patch", ...PRECONDITION_KEYS],
      []
    );
    validatePrecondition(command, out);
    out.exerciseInstanceId = assertString(
      command.exerciseInstanceId,
      "exerciseInstanceId",
      MAX_ID_LEN
    );
    out.patch = validateExercisePatch(command.patch);
  },

  reorderExercises(command, out) {
    assertKeys(
      command,
      "reorderExercises",
      ["kind", "commandId", "orderedInstanceIds", ...PRECONDITION_KEYS],
      []
    );
    validatePrecondition(command, out);
    const ids = command.orderedInstanceIds;
    if (!Array.isArray(ids) || ids.length === 0) {
      invalidCommand("orderedInstanceIds must be a non-empty array.");
    }
    if (ids.length > MAX_ORDERED_IDS) {
      invalidCommand("orderedInstanceIds has too many entries.");
    }
    const seen = new Set();
    out.orderedInstanceIds = ids.map((id, i) => {
      const value = assertString(id, `orderedInstanceIds[${i}]`, MAX_ID_LEN);
      if (seen.has(value)) {
        invalidCommand("orderedInstanceIds contains a duplicate id.");
      }
      seen.add(value);
      return value;
    });
  },

  /**
   * Drop the next-workout override (P6).
   *
   * A separate kind rather than a nullable `dayIndex` on `setNextWorkout`,
   * because `dayIndex` is part of the day PRECONDITION there — it identifies
   * the day whose signature is being checked. A clear is not scoped to a day
   * at all, so it takes no precondition, exactly like `setProgramSettings`.
   *
   * It exists so `setNextWorkout` can migrate WHOLE. Leaving the clear as a
   * direct write would put set and reset of one field on two different write
   * paths, which is the mixed-mode hazard the boundary exists to remove.
   */
  clearNextWorkout(command, out) {
    assertKeys(command, "clearNextWorkout", ["kind", "commandId"], []);
    void out;
  },

  // SESSION-RESTORE-01 (lift half). Carries the day precondition and nothing
  // else — WHAT to restore is "this day's skip", which the reducer reads from
  // its own state. Paired deliberately with skipWorkoutDay: leaving the set on
  // the boundary and the reset on a document write is the mixed-mode hazard
  // the boundary exists to remove, and it is the same argument that brought
  // clearNextWorkout in.
  restoreWorkoutDay(command, out) {
    assertKeys(
      command,
      "restoreWorkoutDay",
      ["kind", "commandId", ...PRECONDITION_KEYS],
      []
    );
    validatePrecondition(command, out);
  },

  // Run9 Slice DE. A state-level flag, so no day precondition — same shape as
  // clearNextWorkout.
  dismissFellBehindPrompt(command, out) {
    assertKeys(command, "dismissFellBehindPrompt", ["kind", "commandId"], []);
    void out;
  },

  // Blk: the review's "keep this focus, no block" outcome — end the block and
  // leave the prescription exactly as the block left it.
  //
  // This is the ONLY one of the three block writers that can cross the
  // boundary today. `startTrainingBlock` and `releaseTrainingBlock` both run
  // `represcribeWorkouts`, which needs the goal-prescription engine
  // (goalProfileFor's profile table, assignDayRoles, repDeltaForRole,
  // repFloorFor, repRangeMaxFor, prescribedRepCeiling, usesUndulation,
  // scaleLoadForReps) mirrored server-side — none of which exists here. That
  // is its own arc, and it cannot be dodged by sending the represcribed
  // workouts: a client-supplied workouts array is exactly the whole-document
  // write the boundary exists to refuse.
  endTrainingBlockKeepingFocus(command, out) {
    assertKeys(
      command,
      "endTrainingBlockKeepingFocus",
      ["kind", "commandId"],
      []
    );
    void out;
  },

  setProgramSettings(command, out) {
    assertKeys(command, "setProgramSettings", ["kind", "commandId", "settings"], []);
    assertKeys(command.settings, "settings", ["autoProgression", "microloading"], []);
    out.settings = {
      autoProgression: assertBoolean(
        command.settings.autoProgression,
        "settings.autoProgression"
      ),
      microloading: assertBoolean(
        command.settings.microloading,
        "settings.microloading"
      ),
    };
  },

  setProgramGoalMirror(command, out) {
    assertKeys(command, "setProgramGoalMirror", ["kind", "commandId", "goal"], []);
    out.goal = assertEnum(command.goal, "goal", PROGRAM_GOALS);
  },

  setManualRunCompletion(command, out) {
    assertKeys(
      command,
      "setManualRunCompletion",
      ["kind", "commandId", "runDayId", "completed"],
      []
    );
    out.runDayId = assertString(command.runDayId, "runDayId", MAX_ID_LEN);
    out.completed = assertBoolean(command.completed, "completed");
  },

  transitionRunDay(command, out) {
    assertKeys(command, "transitionRunDay", ["kind", "commandId", "runDayId", "to"], []);
    out.runDayId = assertString(command.runDayId, "runDayId", MAX_ID_LEN);
    // The two USER-initiated run-day transitions: skip a planned run, and
    // restore a skipped / race_no_show one (SESSION-RESTORE-01 — a skip is a
    // reversible decision). Every other transition is engine- or
    // server-driven and stays out of the client's reach; which of these two
    // is legal from the CURRENT status is still the transition table's call,
    // not this enum's.
    out.to = assertEnum(command.to, "to", new Set(["skipped", "planned"]));
  },

  overrideRunDay(command, out) {
    assertKeys(
      command,
      "overrideRunDay",
      ["kind", "commandId", "runDayId", "templateId"],
      []
    );
    out.runDayId = assertString(command.runDayId, "runDayId", MAX_ID_LEN);
    out.templateId = assertString(command.templateId, "templateId", MAX_ID_LEN);
  },

  // PROGRAM-DELOAD-01 — week-level commands. No day signature: the deload
  // applies to (or reverts across) the WHOLE active week, so the only
  // precondition is the week cursor itself. The reducer enforces the
  // semantic guards (not-already-deloaded / snapshot-present).
  applyDeloadWeek(command, out) {
    assertKeys(
      command,
      "applyDeloadWeek",
      ["kind", "commandId", "expectedWeekNumber"],
      []
    );
    out.expectedWeekNumber = assertBoundedInt(
      command.expectedWeekNumber,
      "expectedWeekNumber",
      1,
      MAX_WEEK_NUMBER
    );
  },

  revertDeloadWeek(command, out) {
    assertKeys(
      command,
      "revertDeloadWeek",
      ["kind", "commandId", "expectedWeekNumber"],
      []
    );
    out.expectedWeekNumber = assertBoundedInt(
      command.expectedWeekNumber,
      "expectedWeekNumber",
      1,
      MAX_WEEK_NUMBER
    );
  },
};

/**
 * Validate a client-supplied programme command. Returns a fresh, minimal
 * command object containing only modelled fields — never the caller's object.
 * Throws ProgramCommandError on any deviation.
 *
 * @param {unknown} command
 * @returns {object} validated command
 */
function assertClientProgramCommand(command) {
  if (!isPlainObject(command)) {
    invalidCommand("A programme command object is required.");
  }
  if (typeof command.kind !== "string") {
    invalidCommand("Command kind is required.");
  }
  if (PRIVATE_SERVER_KINDS.has(command.kind)) {
    invalidCommand(`"${command.kind}" is not a client command.`);
  }
  if (!CLIENT_COMMAND_KIND_SET.has(command.kind)) {
    invalidCommand(`Unsupported programme command "${command.kind}".`);
  }

  const commandId = assertCommandId(command.commandId);
  const out = { kind: command.kind, commandId };
  KIND_VALIDATORS[command.kind](command, out);
  return out;
}

/**
 * Build the durable idempotency receipt written alongside state in the same
 * transaction. Holds only kind + timestamps — never the command payload.
 *
 * @param {{ command: { kind: string }, now: number }} args
 */
function makeCommandReceipt({ command, now }) {
  if (!command || typeof command.kind !== "string") {
    invalidCommand("A receipt requires a command with a kind.");
  }
  if (typeof now !== "number" || !Number.isFinite(now)) {
    invalidCommand("A receipt requires a finite timestamp.");
  }
  return {
    kind: command.kind,
    appliedAt: now,
    cleanupAfter: now + PROGRAM_COMMAND_RECEIPT_RETENTION_MS,
  };
}

// ===========================================================================
// Reducer (packet 18, PR2)
// ===========================================================================
//
// The pure, deterministic core the (future) applyProgramCommand callable runs
// inside its Firestore transaction: `applyProgramCommand({ state, profile,
// command, now }) -> { state, effects }`. It reads transaction-current state,
// applies exactly one validated command, and returns the next state — so two
// concurrent commands, each retried against the LATEST committed state, both
// survive instead of the last client snapshot winning.
//
// SCOPE OF THIS PR. Ten of the fourteen command kinds are implemented here —
// every kind that is a pure state transform. The four GENERATION-dependent
// kinds (`completeWorkoutDay`'s workout effect, `logExercise`'s progression
// engine, and `addExercises`/`replaceExercise`'s catalog build) are staged
// into the next PR, where they pair with the callable that injects admin
// `Timestamp`, the progression engine, and the exercise catalog. Until then
// they throw a clear staged error. The reducer is INERT: nothing calls it yet.
//
// DETERMINISM. `normalizeForReducer` applies only value defaults + a deep-safe
// per-slice immutable update — it NEVER invents `instanceId`s. Per the packet,
// `ensureProgramState` persists exercise identities before any identity command
// runs, so the reducer resolves commands against EXISTING ids and rejects
// `failed-precondition` when a targeted id is absent. Regenerating ids here
// would make the same command produce a different document on each retry.
//
// MIRRORS. The run-day transition table + status helpers below mirror the
// client (`programTypes.ts` LEGAL_TRANSITIONS / `scheduledRunStatus.ts`). They
// are pinned in lockstep by a parity test
// (src/features/program/__tests__/programCommands.cross.test.ts) that imports
// both copies and asserts they agree — the sanctioned mitigation for the
// tested-copy-vs-running-copy rule.

// Mirror of programTypes.ts LEGAL_TRANSITIONS (run-day status machine).
const LEGAL_RUN_TRANSITIONS = Object.freeze({
  planned: ["skipped", "race_no_show"],
  race_no_show: ["planned"],
  skipped: ["planned"],
  completed_exact: [],
  completed_modified: [],
  completed_late: [],
});

function transitionStatus(from, to) {
  const allowed = LEGAL_RUN_TRANSITIONS[from];
  return Array.isArray(allowed) && allowed.includes(to);
}

// Mirror of scheduledRunStatus.ts getScheduledRunStatus (legacy-completed-aware).
function getScheduledRunStatus(rd) {
  if (rd && rd.status) return rd.status;
  return rd && rd.completed ? "completed_exact" : "planned";
}

// Mirror of scheduledRunStatus.ts isScheduledRunEditable — only planned edits.
function isScheduledRunEditable(status) {
  return status === "planned";
}

/**
 * RUN-RACE-GUARD-01 — mirror of `isScheduledRaceRunDay` (workoutTemplates.ts).
 *
 * This arrived WITH the run-day migration, not before it: both client writers
 * being migrated here (`markManualComplete`, `overrideRunDay`) carried this
 * guard and the reducers did not, so the boundary would have been strictly
 * weaker than the writer it replaced. The whole point of the boundary is that
 * the server is the authority, and an authority missing a rule its callers
 * enforce is the tested-copy-vs-running-copy defect in its purest form.
 *
 * What it protects: a race's identity is immutable. Swapping a race's template
 * to an easy run, or manually ticking it complete, ERASES the race — the slot
 * stops being a race and the recovery/no-show machinery downstream never sees
 * one. A race completes exactly one way: a logged run reconciled by
 * `raceDayCompletion`.
 *
 * `type === "race"` is the load-bearing half; the template-id check is the
 * back-stop for legacy slots written before `type` existed. Deliberately NOT
 * `templateId === "race"` — that literal is the bug PR #1775 fixed, and
 * `raceTemplateIds.js` exists so no server module has to re-learn it.
 */
function isRaceRunDay(rd) {
  if (!rd || typeof rd !== "object") return false;
  return rd.type === "race" || isRaceTemplateId(rd.templateId);
}

function failedPrecondition(message) {
  throw new ProgramCommandError(message, "failed-precondition");
}

// Deterministic normalize: default settings/weekHistory + skipped flag only.
// Mirrors the NON-identity parts of client normalizeProgramState; deliberately
// does NOT run normalizeExercise (no instanceId / movementCategory synthesis).
function normalizeForReducer(state) {
  if (!isPlainObject(state)) {
    failedPrecondition("Your programme is not ready. Refresh and try again.");
  }
  const workouts = Array.isArray(state.workouts) ? state.workouts : [];
  return {
    ...state,
    settings: isPlainObject(state.settings)
      ? state.settings
      : { autoProgression: true, microloading: true },
    weekHistory: Array.isArray(state.weekHistory) ? state.weekHistory : [],
    workouts: workouts.map((day) => ({ ...day, skipped: day.skipped ?? false })),
  };
}

// Signature contract shared with the client precondition: dayName joined with
// each exercise instanceId by "|". A rollover that shifts which day an index
// points at changes the signature, so a stale offline command is rejected.
function workoutDaySignature(day) {
  const exercises = day && Array.isArray(day.exercises) ? day.exercises : [];
  return [day && day.dayName, ...exercises.map((ex) => ex && ex.instanceId)].join(
    "|"
  );
}

// Enforce the WorkoutDayPrecondition against transaction-current state BEFORE
// any mutation. Current week + server-recomputed day signature must match.
function requireWorkoutDay(state, command) {
  if (state.weekNumber !== command.expectedWeekNumber) {
    failedPrecondition(
      "Your training week changed since you started. Refresh and try again."
    );
  }
  const day = state.workouts[command.dayIndex];
  if (!day) {
    failedPrecondition("That workout day is no longer available.");
  }
  if (workoutDaySignature(day) !== command.expectedDaySignature) {
    failedPrecondition(
      "This workout changed since you started. Refresh and try again."
    );
  }
  return day;
}

function mapWorkoutDay(state, dayIndex, updater) {
  return {
    ...state,
    workouts: state.workouts.map((day, i) =>
      i === dayIndex ? updater(day) : day
    ),
  };
}

function findRunDayIndex(state, runDayId) {
  const runDays = Array.isArray(state.runDays) ? state.runDays : [];
  return runDays.findIndex((rd) => rd && rd.id === runDayId);
}

function mapRunDay(state, index, updater) {
  return {
    ...state,
    runDays: state.runDays.map((rd, i) => (i === index ? updater(rd) : rd)),
  };
}

// --- individual command transforms -----------------------------------------

function skipWorkoutDay(state, command) {
  requireWorkoutDay(state, command);
  return mapWorkoutDay(state, command.dayIndex, (day) => ({
    ...day,
    skipped: true,
  }));
}

function restoreWorkoutDay(state, command) {
  const day = requireWorkoutDay(state, command);
  // Never reopen a finished session. This is a real guard, not an
  // idempotency case: the client refuses it too, and a completed day that
  // came back as plannable would double-count on every downstream consumer
  // that reads `completed`.
  if (day.completed) {
    failedPrecondition("A completed session can't be restored.");
  }
  // Not skipped: nothing to reverse. Idempotent no-op rather than a
  // rejection, so a replayed or duplicated restore is harmless — the same
  // call setManualRunCompletion makes for an absent map key.
  if (!day.skipped) return state;
  return mapWorkoutDay(state, command.dayIndex, (d) => ({
    ...d,
    skipped: false,
  }));
}

function setNextWorkout(state, command) {
  requireWorkoutDay(state, command);
  return { ...state, nextWorkoutOverride: command.dayIndex };
}

function removeExercise(state, command, now) {
  const day = requireWorkoutDay(state, command);
  const idx = day.exercises.findIndex(
    (ex) => ex && ex.instanceId === command.exerciseInstanceId
  );
  if (idx === -1) {
    failedPrecondition("That exercise is no longer in this workout.");
  }
  const next = mapWorkoutDay(state, command.dayIndex, (d) => ({
    ...d,
    exercises: d.exercises.filter((_, i) => i !== idx),
  }));
  // SOFT delete (P6). The exercise is stashed verbatim — history, load,
  // prescription — so `restoreExercise` can put back exactly what was there.
  //
  // This is what unblocked migrating the remove that offers an undo. The
  // client's undo re-inserted the whole object; the boundary's `addExercises`
  // rebuilds from the catalog and can restore neither the logged history nor
  // the calibrated load, so a hard delete would have made undo lossy. And
  // migrating the remove while leaving its undo a direct write would have kept
  // exactly the mixed-mode clobbering the boundary exists to remove.
  //
  // ONE slot, overwritten by the next removal — the shape the v8 evaluation
  // argues for over an immutable version store: "a single-slot lastEngineChange
  // + one-tap undo". A history of removals is a different feature and nobody
  // asked for it.
  return {
    ...next,
    lastRemovedExercise: {
      dayIndex: command.dayIndex,
      index: idx,
      exercise: day.exercises[idx],
      removedAt: now,
    },
  };
}

/**
 * How long an undo stays offerable. The affordance is a transient toast, so
 * seconds is the real window; a day is generous headroom for a command that
 * was queued offline and replayed later. Past it, restoring an exercise the
 * user has long forgotten removing would be a surprise rather than an undo.
 */
const RESTORE_WINDOW_MS = 24 * 60 * 60 * 1000;

function restoreExercise(state, command, now) {
  const slot = state.lastRemovedExercise;
  if (!slot || !slot.exercise) {
    failedPrecondition("There is nothing to restore.");
  }
  if (typeof slot.removedAt !== "number" || now - slot.removedAt > RESTORE_WINDOW_MS) {
    failedPrecondition("That removal is too old to undo.");
  }
  if (slot.dayIndex !== command.dayIndex) {
    failedPrecondition("That removal was from a different workout.");
  }
  const day = requireWorkoutDay(state, command);
  // Already back — a replayed restore whose receipt was lost, or a manual
  // re-add. Idempotent rather than a duplicate row.
  if (day.exercises.some((ex) => ex && ex.instanceId === slot.exercise.instanceId)) {
    const { lastRemovedExercise: _drop, ...rest } = state;
    return rest;
  }
  const next = mapWorkoutDay(state, command.dayIndex, (d) => {
    const exercises = d.exercises.slice();
    // Clamp: the day may have shrunk since. Same rule the client's undo used.
    exercises.splice(Math.min(slot.index, exercises.length), 0, slot.exercise);
    return { ...d, exercises };
  });
  const { lastRemovedExercise: _used, ...rest } = next;
  return rest;
}

function updateExercise(state, command) {
  const day = requireWorkoutDay(state, command);
  const idx = day.exercises.findIndex(
    (ex) => ex && ex.instanceId === command.exerciseInstanceId
  );
  if (idx === -1) {
    failedPrecondition("That exercise is no longer in this workout.");
  }
  // patch is already bounded to { sets?, reps?, weight? } by the validator.
  return mapWorkoutDay(state, command.dayIndex, (d) => ({
    ...d,
    exercises: d.exercises.map((ex, i) =>
      i === idx ? { ...ex, ...command.patch } : ex
    ),
  }));
}

function reorderExercises(state, command) {
  const day = requireWorkoutDay(state, command);
  const current = day.exercises;
  const target = command.orderedInstanceIds; // already unique (validator)
  const byId = new Map(
    current.map((ex) => [ex && ex.instanceId, ex]).filter(([id]) => id != null)
  );
  if (target.length !== current.length || byId.size !== current.length) {
    // length mismatch, or a duplicate/absent instanceId in current state
    failedPrecondition(
      "This workout changed since you started. Refresh and try again."
    );
  }
  for (const id of target) {
    if (!byId.has(id)) {
      failedPrecondition(
        "This workout changed since you started. Refresh and try again."
      );
    }
  }
  const reordered = target.map((id) => byId.get(id));
  return mapWorkoutDay(state, command.dayIndex, (d) => ({
    ...d,
    exercises: reordered,
  }));
}

function setManualRunCompletion(state, command, now) {
  const idx = findRunDayIndex(state, command.runDayId);
  if (idx === -1) {
    failedPrecondition("That scheduled run is no longer available.");
  }
  const map = isPlainObject(state.manualCompletions)
    ? state.manualCompletions
    : {};

  if (command.completed) {
    // RUN-RACE-GUARD-01. Only on the mark path: UNMARKING a race is the
    // repair for a slot that was ticked before this guard existed, so
    // refusing that too would strand exactly the documents the guard is
    // meant to protect.
    if (isRaceRunDay(state.runDays[idx])) {
      failedPrecondition(
        "A race completes by logging the run, not by marking it done."
      );
    }
    let next = state;
    // Two-step reversal: a skipped slot returns to planned first (Q2 P20),
    // gated by the same legal-transition table.
    if (getScheduledRunStatus(state.runDays[idx]) === "skipped") {
      if (!transitionStatus("skipped", "planned")) {
        failedPrecondition("That run can't be marked complete.");
      }
      next = mapRunDay(state, idx, (rd) => ({
        ...rd,
        status: "planned",
        completed: false,
      }));
    }
    return {
      ...next,
      manualCompletions: { ...map, [command.runDayId]: { completedAt: now } },
    };
  }

  // Unmark: drop the map key if present; an absent key is an idempotent no-op.
  if (!(command.runDayId in map)) {
    return state;
  }
  const nextMap = { ...map };
  delete nextMap[command.runDayId];
  return { ...state, manualCompletions: nextMap };
}

function transitionRunDay(state, command) {
  const idx = findRunDayIndex(state, command.runDayId);
  if (idx === -1) {
    failedPrecondition("That scheduled run is no longer available.");
  }
  const from = getScheduledRunStatus(state.runDays[idx]);
  if (!transitionStatus(from, command.to)) {
    failedPrecondition(
      command.to === "planned"
        ? "That run can't be restored from its current state."
        : "That run can't be skipped from its current state."
    );
  }
  // `completed` is a legacy mirror of `status`, and the migration's rule is
  // "status wins — after this step the two can't disagree". Both transitions
  // this command permits land on a non-completed status, so writing the
  // mirror keeps the invariant enforced AT THE WRITE rather than relying on
  // read-time repair. For `skipped` it is a no-op (the only legal `from` is
  // `planned`); for `planned` it is the restore path's explicit reset, and
  // matches what `setManualRunCompletion` already does on its own
  // skipped → planned step.
  return mapRunDay(state, idx, (rd) => ({
    ...rd,
    status: command.to,
    completed: false,
  }));
}

function overrideRunDay(state, command) {
  const idx = findRunDayIndex(state, command.runDayId);
  if (idx === -1) {
    failedPrecondition("That scheduled run is no longer available.");
  }
  // RUN-RACE-GUARD-01: an override is precisely the erasure this guards —
  // swap the race for an easy run, complete it as an ordinary run, and the
  // race is gone. Checked BEFORE the editability gate so a planned race
  // reports the real reason rather than passing the weaker test.
  if (isRaceRunDay(state.runDays[idx])) {
    failedPrecondition("A race can't be swapped for another session.");
  }
  if (!isScheduledRunEditable(getScheduledRunStatus(state.runDays[idx]))) {
    failedPrecondition("That run can no longer be changed.");
  }
  return mapRunDay(state, idx, (rd) => ({
    ...rd,
    templateId: command.templateId,
    userOverride: command.templateId,
  }));
}

// ---------------------------------------------------------------------------
// PROGRAM-DELOAD-01 — user-invoked deload week (apply / revert).
//
// applyDeloadWeek eases the WHOLE active week via the mirrored transform
// (−1 set floor 2, weight ×0.85 → nearest 2.5 kg), sets currentPhase
// "deload" and clears acute fatigue — exactly what the automatic week-4
// path (client advanceWeek) does. Semantic idempotency: a week already in
// "deload" phase rejects, so a second Apply (new commandId) can never
// compound to ×0.85². The pre-deload state is stashed in
// `deloadSnapshot` for the undo path.
//
// revertDeloadWeek restores the stash — valid only while the week cursor
// still matches the snapshot's, so a stale snapshot from a previous week
// is inert (advanceWeek doesn't know about it and doesn't need to). The
// snapshot restore rewinds the in-programState workouts wholesale; the
// client offers Undo only in the immediate post-apply toast window, and
// saved workout RECORDS (users/{uid}/workouts) are never touched.
// ---------------------------------------------------------------------------

function requireWeekCursor(state, command) {
  if (state.weekNumber !== command.expectedWeekNumber) {
    failedPrecondition(
      "Your training week changed since you started. Refresh and try again."
    );
  }
}

function applyDeloadWeekCommand(state, profile, command, now) {
  requireWeekCursor(state, command);
  if (state.currentPhase === "deload") {
    failedPrecondition("This week is already a deload week.");
  }
  return {
    ...state,
    deloadSnapshot: {
      weekNumber: state.weekNumber,
      workouts: state.workouts,
      currentPhase: state.currentPhase,
      fatigueScore: state.fatigueScore,
      appliedAt: now,
    },
    // Backlog #8: the recipe follows training age. An absent/unknown
    // experience falls back to the novice recipe — the pre-#8 behaviour.
    //
    // `prepareForDeloadWorkouts` FIRST, exactly as the client's automatic
    // week-4 path does (`applyDeload(prepareForDeload(workouts))`). Without
    // it this command cut load/reps with nothing to restore from, so meso
    // exit never undid the cut and the user stayed permanently lighter. The
    // deloadSnapshot below does not cover that: its weekNumber guard makes it
    // inert once the week rolls, which is precisely when the restore is due.
    workouts: applyDeloadToWorkouts(
      prepareForDeloadWorkouts(state.workouts),
      profile && profile.experience
    ),
    currentPhase: "deload",
    fatigueScore: 0,
  };
}

function revertDeloadWeekCommand(state, command) {
  requireWeekCursor(state, command);
  const snap = state.deloadSnapshot;
  if (
    !isPlainObject(snap) ||
    snap.weekNumber !== state.weekNumber ||
    !Array.isArray(snap.workouts)
  ) {
    failedPrecondition("There is no deload to undo for this week.");
  }
  // tx.set replaces the whole doc, so omitting the key deletes it.
  const next = {
    ...state,
    workouts: snap.workouts,
    currentPhase: snap.currentPhase,
    fatigueScore: snap.fatigueScore,
  };
  delete next.deloadSnapshot;
  return next;
}

function logExercise(state, command, now) {
  const day = requireWorkoutDay(state, command);
  const idx = day.exercises.findIndex(
    (ex) => ex && ex.instanceId === command.exerciseInstanceId
  );
  if (idx === -1) {
    failedPrecondition("That exercise is no longer in this workout.");
  }
  const exercise = day.exercises[idx];
  const settings = isPlainObject(state.settings)
    ? state.settings
    : { autoProgression: true, microloading: true };

  // Mirrors useProgram.logExercise — all THREE of its branches. The held one
  // arrived with the boundary migration: the client had it and this reducer
  // did not, so the server would have progressed a returning lifter straight
  // through the window designed to hold them. See lib/progressionHold.js.
  let updatedExercise;
  if (holdsProgression(state.trainingBlock, command.today)) {
    // Blk2: an "easing back in" block holds LOAD, but still records the
    // session — the sessions happened and the user should see them. This is
    // what separates the hold from the autoProgression:false branch below,
    // which writes no history at all.
    const history = [
      ...(Array.isArray(exercise.performanceHistory)
        ? exercise.performanceHistory
        : []),
      {
        // UTC stamp, as everywhere else on the server. The field is
        // informational and not week-bucketed — progressionEngine.js makes
        // the same call and documents it.
        date: dateStampUTC(now),
        weight: command.actual.weight,
        repsCompleted: command.actual.reps,
        repsTarget: exercise.reps,
      },
    ].slice(-PERFORMANCE_HISTORY_CAP);
    updatedExercise = {
      ...exercise,
      lastAttemptedWeight: command.actual.weight,
      lastPerformance: {
        sets: exercise.sets,
        reps: command.actual.reps,
        weight: command.actual.weight,
        completed: command.actual.reps >= exercise.reps,
      },
      performanceHistory: history,
    };
  } else if (settings.autoProgression) {
    updatedExercise = applyProgression(
      exercise,
      command.actual.reps,
      command.actual.weight,
      state.goal,
      settings.microloading,
      command.actualRpe,
      now
    );
  } else {
    updatedExercise = {
      ...exercise,
      lastAttemptedWeight: command.actual.weight,
      lastPerformance: {
        sets: exercise.sets,
        reps: command.actual.reps,
        weight: command.actual.weight,
        completed: command.actual.reps >= exercise.reps,
      },
    };
  }

  return mapWorkoutDay(state, command.dayIndex, (d) => ({
    ...d,
    exercises: d.exercises.map((ex, i) => (i === idx ? updatedExercise : ex)),
  }));
}

// Build the exercise catalog lookup + validation for add/replace. Rejects an
// unknown id as invalid-argument (the id comes from the catalog picker; an
// unknown one is a malformed/forged command, not stale state).
function resolveCatalogExercise(exerciseId, label) {
  if (!isCatalogExerciseId(exerciseId)) {
    invalidCommand(`Unknown ${label} exercise "${exerciseId}".`);
  }
  return getExerciseName(exerciseId);
}

function addExercises(state, command) {
  const day = requireWorkoutDay(state, command);
  // Deterministic instance ids derived from the commandId — a retry with the
  // same commandId produces the same ids (and is short-circuited by the receipt
  // anyway), so the reducer stays pure.
  const built = command.exercises.map((input, i) => {
    const repUnit = repUnitForExerciseId(input.exerciseId);
    return buildProgramExercise({
      name: resolveCatalogExercise(input.exerciseId, "added"),
      exerciseId: input.exerciseId,
      instanceId: `cmd-${command.commandId}-${i}`,
      // Match the client add default (3×10×0) when a field is omitted.
      sets: input.sets ?? 3,
      reps: input.reps ?? (repUnit === "seconds" ? 30 : 10),
      weight: input.weight ?? 0,
      ...(repUnit !== undefined ? { repUnit } : {}),
    });
  });

  const exercises = day.exercises.slice();
  const at =
    command.insertAt == null
      ? exercises.length
      : Math.min(command.insertAt, exercises.length);
  exercises.splice(at, 0, ...built);

  return mapWorkoutDay(state, command.dayIndex, (d) => ({ ...d, exercises }));
}

function replaceExercise(state, command) {
  const day = requireWorkoutDay(state, command);
  const idx = day.exercises.findIndex(
    (ex) => ex && ex.instanceId === command.oldInstanceId
  );
  if (idx === -1) {
    failedPrecondition("That exercise is no longer in this workout.");
  }
  const name = resolveCatalogExercise(
    command.replacementExerciseId,
    "replacement"
  );
  const old = day.exercises[idx];
  const replacementRepUnit = repUnitForExerciseId(
    command.replacementExerciseId
  );
  const unitChanged =
    (old.repUnit === "seconds") !== (replacementRepUnit === "seconds");
  const replacementReps = unitChanged
    ? replacementRepUnit === "seconds"
      ? 30
      : 10
    : old.reps;
  /* Mirror the client replaceExercise's identity/unit boundary: carry the
     role-level prescription, re-infer the category, mint a new instance, and
     reset a reps↔seconds transition.

     ── Why the LOAD arrives from the client ─────────────────────────────
     This reducer used to hard-code `weight: 0`, because it has no profile
     calibration context. That was safe and it was also a regression waiting
     to happen: the client seeds the replacement from
     `weightAfterExerciseSwap(old, newId, loadContextFrom(profile))`, so
     routing the swap through this boundary would have silently downgraded
     every replacement to uncalibrated — undoing load-seeding work done
     elsewhere in this arc.

     Two ways to fix it. Mirror `startingLoads.ts` here (it would be the 15th
     TS↔JS mirror, and it carries the variation bank's loadFactor table plus
     the per-category seed table — data actively edited twice in this arc
     alone, so a high-drift mirror by construction). Or accept the calibrated
     number as a bounded scalar. This takes the second.

     That is consistent with the boundary's stance rather than an exception to
     it. What the validator refuses is a client-supplied EXERCISE OBJECT — the
     name, the category, the identity — because those must be derived from the
     catalog server-side, and they still are. A bounded non-negative number is
     the same shape as the weight already accepted on `logExercise` and
     `updateExercise.patch`. The failure mode if a client sends a silly value
     is a bad starting weight in that user's own programme, which the
     progression engine corrects within a session or two — the module that
     computes it says exactly that about erring light.

     `?? 0` keeps the old behaviour for a caller that omits it, so nothing
     that does not opt in changes. */
  const replacement = buildProgramExercise({
    name,
    exerciseId: command.replacementExerciseId,
    instanceId: `cmd-${command.commandId}`,
    sets: old.sets,
    reps: replacementReps,
    // NOT the old exercise's load — carrying kilograms across an arbitrary
    // catalog replacement is unsafe (bench → front squat, deadlift → glute
    // bridge). This is the calibrated seed for the TARGET movement, or 0 when
    // the caller did not supply one.
    weight: command.replacementWeight ?? 0,
    baseReps: unitChanged ? replacementReps : old.baseReps,
    progressionType: old.progressionType,
    ...(!unitChanged && old.repRangeMax !== undefined
      ? { repRangeMax: old.repRangeMax }
      : {}),
    ...(replacementRepUnit !== undefined
      ? { repUnit: replacementRepUnit }
      : {}),
    ...(old.baseSets !== undefined ? { baseSets: old.baseSets } : {}),
    ...(old.restSeconds !== undefined ? { restSeconds: old.restSeconds } : {}),
    ...(old.isAccessory !== undefined ? { isAccessory: old.isAccessory } : {}),
  });

  return mapWorkoutDay(state, command.dayIndex, (d) => ({
    ...d,
    exercises: d.exercises.map((ex, i) => (i === idx ? replacement : ex)),
  }));
}

// Local calendar date for the saved workout, in the user's timezone. The
// client uses localDateString() (device-local); the server has no device tz, so
// it formats `now` in profile.timezone (IANA), falling back to UTC when the
// timezone is absent/invalid. Deterministic given (now, timezone).
function localDateInZone(now, timezone) {
  const tz = typeof timezone === "string" && timezone ? timezone : "UTC";
  const opts = {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  };
  try {
    // en-CA renders as YYYY-MM-DD.
    return new Intl.DateTimeFormat("en-CA", { timeZone: tz, ...opts }).format(
      new Date(now)
    );
  } catch (_e) {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "UTC",
      ...opts,
    }).format(new Date(now));
  }
}

// completeWorkoutDay: marks the day complete + produces a server-derived
// workout record (effects.workout) reproducing packet 15's shape. Mirrors
// useProgram.completeWorkoutDay. The effect intentionally OMITS `createdAt` —
// the callable injects `admin.firestore.Timestamp.now()` at write time (the
// reducer stays pure). The callable writes it to
// users/{uid}/workouts/programme-<completionId> in the same transaction.
function completeWorkoutDayWithEffect(state, profile, command, now) {
  const day = requireWorkoutDay(state, command);

  // State: mark ONLY this day complete (force skipped:false); clear a matching
  // nextWorkoutOverride. Other days untouched.
  let nextState = mapWorkoutDay(state, command.dayIndex, (d) => ({
    ...d,
    completed: true,
    skipped: false,
  }));
  if (nextState.nextWorkoutOverride === command.dayIndex) {
    nextState = { ...nextState };
    delete nextState.nextWorkoutOverride;
  }

  // Workout record — built from validated setLogs, falling back to planned
  // data per exercise (mirror of the client builder).
  const setLogs = command.completion.setLogs;
  const exercises = day.exercises.map((ex, exIndex) => {
    const logs = setLogs ? setLogs[exIndex] : undefined;
    const plannedWeight = ex.lastAttemptedWeight || ex.weight;
    const plannedReps =
      ex.lastPerformance && ex.lastPerformance.reps != null
        ? ex.lastPerformance.reps
        : ex.reps;
    // D2: shared projection, mirroring the client's. Was a third independent
    // copy of the same filter-then-renumber logic.
    const sets = logs
      ? projectWorkoutSets(logs, {
          sets: ex.sets,
          reps: ex.reps,
          weightKg: ex.weight,
        })
      : projectWorkoutSets(undefined, {
          sets: ex.sets,
          reps: plannedReps,
          weightKg: plannedWeight,
        });
    return {
      exerciseId: ex.exerciseId,
      exerciseName: ex.name,
      category: ex.movementCategory,
      ...(ex.repUnit !== undefined ? { repUnit: ex.repUnit } : {}),
      sets,
      caloriesBurned: 0,
    };
  });

  const tonnage = exercises.reduce(
    (t, ex) =>
      t +
      (ex.repUnit === "seconds"
        ? 0
        : ex.sets.reduce((s, set) => s + set.weightKg * set.reps, 0)),
    0
  );
  const completedSetCount = exercises.reduce((c, ex) => c + ex.sets.length, 0);
  const bodyweightKg = (profile && profile.weightKg) || 0;
  const durationMinutes =
    command.completion.durationMinutes && command.completion.durationMinutes > 0
      ? command.completion.durationMinutes
      : 0;
  const effectiveDurationMin =
    durationMinutes > 0 ? durationMinutes : completedSetCount * 3;
  const totalCalories = estimateLiftBurn({
    durationMinutes,
    tonnageKg: tonnage,
    bodyweightKg,
    completedSetCount,
  });

  const workout = {
    date: localDateInZone(now, profile && profile.timezone),
    exercises,
    totalCalories,
    durationMinutes: effectiveDurationMin,
    notes: `${day.dayName} — Programme Week ${state.weekNumber}`,
    source: "programme",
    completionId: command.completion.completionId,
    ...(command.completion.sessionVariant !== undefined
      ? { sessionVariant: command.completion.sessionVariant }
      : {}),
  };

  return { state: nextState, effects: { workout } };
}

/**
 * Apply exactly one validated command to programme state. Pure + deterministic:
 * same (state, command, now) always yields the same result.
 *
 * @param {{ state: object, profile?: object, command: unknown, now: number }} args
 * @returns {{ state: object, effects: object }}
 */
function applyProgramCommand({ state, profile, command, now }) {
  if (typeof now !== "number" || !Number.isFinite(now)) {
    invalidCommand("A finite timestamp is required.");
  }
  const validated = assertClientProgramCommand(command);
  const current = normalizeForReducer(state);

  // completeWorkoutDay is the only command that produces an effect (the saved
  // workout record); handle it separately so the rest stay effect-free.
  if (validated.kind === "completeWorkoutDay") {
    const result = completeWorkoutDayWithEffect(
      current,
      profile || {},
      validated,
      now
    );
    return {
      state: { ...result.state, updatedAt: now },
      effects: result.effects,
    };
  }

  let next;
  switch (validated.kind) {
    case "skipWorkoutDay":
      next = skipWorkoutDay(current, validated);
      break;
    case "setNextWorkout":
      next = setNextWorkout(current, validated);
      break;
    case "removeExercise":
      next = removeExercise(current, validated, now);
      break;
    case "restoreExercise":
      next = restoreExercise(current, validated, now);
      break;
    case "updateExercise":
      next = updateExercise(current, validated);
      break;
    case "reorderExercises":
      next = reorderExercises(current, validated);
      break;
    case "logExercise":
      next = logExercise(current, validated, now);
      break;
    case "addExercises":
      next = addExercises(current, validated);
      break;
    case "replaceExercise":
      next = replaceExercise(current, validated);
      break;
    case "restoreWorkoutDay":
      next = restoreWorkoutDay(current, validated);
      break;
    case "dismissFellBehindPrompt": {
      // Delete, never set undefined — Firestore rejects undefined, and every
      // reader treats an absent field as "no prompt". Absent already: no-op.
      const { pendingFellBehindPrompt: _dismissed, ...withoutPrompt } = current;
      next = withoutPrompt;
      break;
    }
    case "endTrainingBlockKeepingFocus": {
      if (!isPlainObject(current.trainingBlock)) {
        failedPrecondition("There is no active training block.");
      }
      // Delete rather than set undefined, as with every other clear here.
      // `primaryGoal` is deliberately untouched: keeping the focus IS the
      // outcome, so the block's focus stays the programme's focus.
      const { trainingBlock: _ended, ...withoutBlock } = current;
      next = withoutBlock;
      break;
    }
    case "clearNextWorkout": {
      // Delete rather than set undefined: Firestore rejects undefined, and the
      // readers all treat an absent field as "follow programme order".
      const { nextWorkoutOverride: _cleared, ...withoutOverride } = current;
      next = withoutOverride;
      break;
    }
    case "setProgramSettings":
      next = { ...current, settings: { ...validated.settings } };
      break;
    case "setProgramGoalMirror":
      next = { ...current, goal: validated.goal };
      break;
    case "setManualRunCompletion":
      next = setManualRunCompletion(current, validated, now);
      break;
    case "transitionRunDay":
      next = transitionRunDay(current, validated);
      break;
    case "overrideRunDay":
      next = overrideRunDay(current, validated);
      break;
    case "applyDeloadWeek":
      next = applyDeloadWeekCommand(current, profile || {}, validated, now);
      break;
    case "revertDeloadWeek":
      next = revertDeloadWeekCommand(current, validated);
      break;
    default:
      invalidCommand(`Unsupported programme command "${validated.kind}".`);
  }

  return { state: { ...next, updatedAt: now }, effects: {} };
}

module.exports = {
  RESTORE_WINDOW_MS,
  assertClientProgramCommand,
  assertCommandId,
  applyProgramCommand,
  makeCommandReceipt,
  workoutDaySignature,
  transitionStatus,
  getScheduledRunStatus,
  isScheduledRunEditable,
  isProgramCommandError,
  ProgramCommandError,
  PROGRAM_COMMAND_RECEIPT_RETENTION_MS,
  CLIENT_COMMAND_KINDS,
};
