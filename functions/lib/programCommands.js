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

function validateSetLog(entry, label) {
  assertKeys(entry, label, ["weight", "reps", "completed"], []);
  return {
    weight: assertFiniteNumber(entry.weight, `${label}.weight`, 0, MAX_WEIGHT),
    reps: assertBoundedInt(entry.reps, `${label}.reps`, 0, MAX_REPS),
    completed: assertBoolean(entry.completed, `${label}.completed`),
  };
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
      []
    );
    validatePrecondition(command, out);
    out.exerciseInstanceId = assertString(
      command.exerciseInstanceId,
      "exerciseInstanceId",
      MAX_ID_LEN
    );
    out.actual = validateSetLog(command.actual, "actual");
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
      []
    );
    validatePrecondition(command, out);
    out.oldInstanceId = assertString(command.oldInstanceId, "oldInstanceId", MAX_ID_LEN);
    out.replacementExerciseId = assertString(
      command.replacementExerciseId,
      "replacementExerciseId",
      MAX_ID_LEN
    );
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
    // Only the "skipped" client transition is permitted here; all other run-day
    // transitions are engine/server-driven through the legal transition table.
    out.to = assertEnum(command.to, "to", new Set(["skipped"]));
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

module.exports = {
  assertClientProgramCommand,
  assertCommandId,
  makeCommandReceipt,
  isProgramCommandError,
  ProgramCommandError,
  PROGRAM_COMMAND_RECEIPT_RETENTION_MS,
  CLIENT_COMMAND_KINDS,
};
