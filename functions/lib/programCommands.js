"use strict";

/**
 * Programme command boundary â€” validation core (packet 18, PR1).
 *
 * BACKGROUND â€” the defect this closes.
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
 * deliberately INERT in this PR â€” nothing calls it yet. The reducer
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
 *   - accepts ONLY the known discriminated command kinds (unknown kind â†’
 *     reject; `replaceProgramme` is a PRIVATE server transition and is
 *     rejected here by construction);
 *   - rejects extra/unknown keys at every object level (no arbitrary patch,
 *     no client-supplied ProgramState, no client-supplied exercise object);
 *   - bounds every primitive (id format, string length, numeric range, array
 *     length) so a valid command can't bloat or poison downstream state.
 *
 * Pure CommonJS, no firebase-functions / firebase-admin imports â€” unit-testable
 * exactly like validatePlanPayload.js / programStateSanitizer.js. The callable
 * wrapper maps a thrown `ProgramCommandError` to
 * `HttpsError("invalid-argument", â€¦)` / `"failed-precondition"`.
 */

// Server mirror of the client progression engine (pinned by a parity
// cross-test). Used by the logExercise reducer.
const { applyProgression } = require("./progressionEngine");
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
// Deload-transform mirror (pinned by a parity cross-test). Used by the
// applyDeloadWeek reducer (PROGRAM-DELOAD-01).
const { applyDeloadToWorkouts } = require("./deloadEngine");

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
]);
const CLIENT_COMMAND_KIND_SET = new Set(CLIENT_COMMAND_KINDS);

// Kinds that must NEVER arrive over the client callable â€” they are server-only
// transitions. Listed explicitly so a probe gets a precise error rather than
// the generic "unsupported kind".
const PRIVATE_SERVER_KINDS = new Set(["replaceProgramme"]);

const PROGRAM_GOALS = new Set(["cut", "lean bulk", "recomp"]);
const SESSION_VARIANTS = new Set(["express45", "express30"]);

// Bounds. Generous but finite â€” a legitimate command is comfortably inside
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
 * and no key outside requiredâˆªoptional. Rejecting extras is the core anti-
 * injection guarantee â€” a client cannot smuggle an unmodelled field.
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

// WorkoutDayPrecondition â€” dayIndex + expected week + server-recomputed day
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
// Per-kind command validators â€” each returns a fresh, minimal command object
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
    out.exerciseInstanceId = assertStringçı¶‰Ëkºwµçq”¡•ÑM¡•‘Õ±•‘IÕ¹MÑ…ÑÕÌ¡ÍÑ…Ñ”¹ÉÕ¹…åÍm¥‘át¤¤¤ì(€€€™…¥±•‘AÉ•½¹‘¥Ñ¥½¸ ‰Q¡…ĞÉÕ¸…¸¹¼±½¹•È‰”¡…¹•¸ˆ¤ì(€ô(€É•ÑÕÉ¸µ…ÁIÕ¹…ä¡ÍÑ…Ñ”°¥‘à°€¡É¤€ôø€¡ì(€€€€¸¸¹É°(€€€Ñ•µÁ±…Ñ•%è½µµ…¹¹Ñ•µÁ±…Ñ•%°(€€€ÕÍ•É=Ù•ÉÉ¥‘”è½µµ…¹¹Ñ•µÁ±…Ñ•%°(€ô¤¤ì)ô((¼¼€´´´´´´´´´´´´´´´´´´´´´´´´´´´´´´´´´´´´´´´´´´´´´´´´´´´´´´´´´´´´´´´´´´´´´´´´´´´(¼¼AI=I4µ1=´ÀÄƒŠPÕÍ•Èµ¥¹Ù½­•‘•±½…İ••¬€¡…ÁÁ±ä€¼É•Ù•ÉĞ¤¸(¼¼(¼¼…ÁÁ±å•±½…‘]••¬•…Í•ÌÑ¡”]!=1…Ñ¥Ù”İ••¬Ù¥„Ñ¡”µ¥ÉÉ½É•ÑÉ…¹Í™½É´(¼¼€£Š"HÄÍ•Ğ™±½½È€È°İ•¥¡Ğƒ\À¸àÔƒŠH¹•…É•ÍĞ€È¸Ô­œ¤°Í•ÑÌÕÉÉ•¹ÑA¡…Í”(¼¼€‰‘•±½…ˆ…¹±•…ÉÌ…ÕÑ”™…Ñ¥Õ”ƒŠP•á…Ñ±äİ¡…ĞÑ¡”…ÕÑ½µ…Ñ¥Œİ••¬´Ğ(¼¼Á…Ñ €¡±¥•¹Ğ…‘Ù…¹•]••¬¤‘½•Ì¸M•µ…¹Ñ¥Œ¥‘•µÁ½Ñ•¹äè„İ••¬…±É•…‘ä¥¸(¼¼€‰‘•±½…ˆÁ¡…Í”É•©•ÑÌ°Í¼„Í•½¹ÁÁ±ä€¡¹•Ü½µµ…¹‘%¤…¸¹•Ù•È(¼¼½µÁ½Õ¹Ñ¼ƒ\À¸à×
È¸Q¡”ÁÉ”µ‘•±½…ÍÑ…Ñ”¥ÌÍÑ…Í¡•¥¸(¼¼‘•±½…‘M¹…ÁÍ¡½Ñ€™½ÈÑ¡”Õ¹‘¼Á…Ñ ¸(¼¼(¼¼É•Ù•ÉÑ•±½…‘]••¬É•ÍÑ½É•ÌÑ¡”ÍÑ…Í ƒŠPÙ…±¥½¹±äİ¡¥±”Ñ¡”İ••¬ÕÉÍ½È(¼¼ÍÑ¥±°µ…Ñ¡•ÌÑ¡”Í¹…ÁÍ¡½ĞÌ°Í¼„ÍÑ…±”Í¹…ÁÍ¡½Ğ™É½´„ÁÉ•Ù¥½ÕÌİ••¬(¼¼¥Ì¥¹•ÉĞ€¡…‘Ù…¹•]••¬‘½•Í¸Ğ­¹½Ü…‰½ÕĞ¥Ğ…¹‘½•Í¸Ğ¹••Ñ¼¤¸Q¡”(¼¼Í¹…ÁÍ¡½ĞÉ•ÍÑ½É”É•İ¥¹‘ÌÑ¡”¥¸µÁÉ½É…µMÑ…Ñ”İ½É­½ÕÑÌİ¡½±•Í…±”ìÑ¡”(¼¼±¥•¹Ğ½™™•ÉÌU¹‘¼½¹±ä¥¸Ñ¡”¥µµ•‘¥…Ñ”Á½ÍĞµ…ÁÁ±äÑ½…ÍĞİ¥¹‘½Ü°…¹(¼¼Í…Ù•İ½É­½ÕĞI=IL€¡ÕÍ•ÉÌ½íÕ¥‘ô½İ½É­½ÕÑÌ¤…É”¹•Ù•ÈÑ½Õ¡•¸(¼¼€´´´´´´´´´´´´´´´´´´´´´´´´´´´´´´´´´´´´´´´´´´´´´´´´´´´´´´´´´´´´´´´´´´´´´´´´´´´()™Õ¹Ñ¥½¸É•ÅÕ¥É•]••­ÕÉÍ½È¡ÍÑ…Ñ”°½µµ…¹¤ì(€¥˜€¡ÍÑ…Ñ”¹İ••­9Õµ‰•È€„ôô½µµ…¹¹•áÁ•Ñ•‘]••­9Õµ‰•È¤ì(€€€™…¥±•‘AÉ•½¹‘¥Ñ¥½¸ (€€€€€€‰e½ÕÈÑÉ…¥¹¥¹œİ••¬¡…¹•Í¥¹”å½ÔÍÑ…ÉÑ•¸I•™É•Í …¹ÑÉä……¥¸¸ˆ(€€€€¤ì(€ô)ô()™Õ¹Ñ¥½¸…ÁÁ±å•±½…‘]••­½µµ…¹¡ÍÑ…Ñ”°ÁÉ½™¥±”°½µµ…¹°¹½Ü¤ì(€É•ÅÕ¥É•]••­ÕÉÍ½È¡ÍÑ…Ñ”°½µµ…¹¤ì(€¥˜€¡ÍÑ…Ñ”¹ÕÉÉ•¹ÑA¡…Í”€ôôô€‰‘•±½…ˆ¤ì(€€€™…¥±•‘AÉ•½¹‘¥Ñ¥½¸ ‰Q¡¥Ìİ••¬¥Ì…±É•…‘ä„‘•±½…İ••¬¸ˆ¤ì(€ô(€É•ÑÕÉ¸ì(€€€€¸¸¹ÍÑ…Ñ”°(€€€‘•±½…‘M¹…ÁÍ¡½Ğèì(€€€€€İ••­9Õµ‰•ÈèÍÑ…Ñ”¹İ••­9Õµ‰•È°(€€€€€İ½É­½ÕÑÌèÍÑ…Ñ”¹İ½É­½ÕÑÌ°(€€€€€ÕÉÉ•¹ÑA¡…Í”èÍÑ…Ñ”¹ÕÉÉ•¹ÑA¡…Í”°(€€€€€™…Ñ¥Õ•M½É”èÍÑ…Ñ”¹™…Ñ¥Õ•M½É”°(€€€€€…ÁÁ±¥•‘Ğè¹½Ü°(€€€ô°(€€€€¼¼	…­±½œ€ŒàèÑ¡”É•¥Á”™½±±½İÌÑÉ…¥¹¥¹œ…”¸¸…‰Í•¹Ğ½Õ¹­¹½İ¸(€€€€¼¼•áÁ•É¥•¹”™…±±Ì‰…¬Ñ¼Ñ¡”¹½Ù¥”É•¥Á”ƒŠPÑ¡”ÁÉ”´Œà‰•¡…Ù¥½ÕÈ¸(€€€İ½É­½ÕÑÌè…ÁÁ±å•±½…‘Q½]½É­½ÕÑÌ¡ÍÑ…Ñ”¹İ½É­½ÕÑÌ°ÁÉ½™¥±”€˜˜ÁÉ½™¥±”¹•áÁ•É¥•¹”¤°(€€€ÕÉÉ•¹ÑA¡…Í”è€‰‘•±½…ˆ°(€€€™…Ñ¥Õ•M½É”è€À°(€ôì)ô()™Õ¹Ñ¥½¸É•Ù•ÉÑ•±½…‘]••­½µµ…¹¡ÍÑ…Ñ”°½µµ…¹¤ì(€É•ÅÕ¥É•]••­ÕÉÍ½È¡ÍÑ…Ñ”°½µµ…¹¤ì(€½¹ÍĞÍ¹…À€ôÍÑ…Ñ”¹‘•±½…‘M¹…ÁÍ¡½Ğì(€¥˜€ (€€€€…¥ÍA±…¥¹=‰©•Ğ¡Í¹…À¤ñğ(€€€Í¹…À¹İ••­9Õµ‰•È€„ôôÍÑ…Ñ”¹İ••­9Õµ‰•Èñğ(€€€€…ÉÉ…ä¹¥ÍÉÉ…ä¡Í¹…À¹İ½É­½ÕÑÌ¤(€€¤ì(€€€™…¥±•‘AÉ•½¹‘¥Ñ¥½¸ ‰Q¡•É”¥Ì¹¼‘•±½…Ñ¼Õ¹‘¼™½ÈÑ¡¥Ìİ••¬¸ˆ¤ì(€ô(€€¼¼Ñà¹Í•ĞÉ•Á±…•ÌÑ¡”İ¡½±”‘½Œ°Í¼½µ¥ÑÑ¥¹œÑ¡”­•ä‘•±•Ñ•Ì¥Ğ¸(€½¹ÍĞ¹•áĞ€ôì(€€€€¸¸¹ÍÑ…Ñ”°(€€€İ½É­½ÕÑÌèÍ¹…À¹İ½É­½ÕÑÌ°(€€€ÕÉÉ•¹ÑA¡…Í”èÍ¹…À¹ÕÉÉ•¹ÑA¡…Í”°(€€€™…Ñ¥Õ•M½É”èÍ¹…À¹™…Ñ¥Õ•M½É”°(€ôì(€‘•±•Ñ”¹•áĞ¹‘•±½…‘M¹…ÁÍ¡½Ğì(€É•ÑÕÉ¸¹•áĞì)ô()™Õ¹Ñ¥½¸±½á•É¥Í”¡ÍÑ…Ñ”°½µµ…¹°¹½Ü¤ì(€½¹ÍĞ‘…ä€ôÉ•ÅÕ¥É•]½É­½ÕÑ…ä¡ÍÑ…Ñ”°½µµ…¹¤ì(€½¹ÍĞ¥‘à€ô‘…ä¹•á•É¥Í•Ì¹™¥¹‘%¹‘•à (€€€€¡•à¤€ôø•à€˜˜•à¹¥¹ÍÑ…¹•%€ôôô½µµ…¹¹•á•É¥Í•%¹ÍÑ…¹•%(€€¤ì(€¥˜€¡¥‘à€ôôô€´Ä¤ì(€€€™…¥±•‘AÉ•½¹‘¥Ñ¥½¸ ‰Q¡…Ğ•á•É¥Í”¥Ì¹¼±½¹•È¥¸Ñ¡¥Ìİ½É­½ÕĞ¸ˆ¤ì(€ô(€½¹ÍĞ•á•É¥Í”€ô‘…ä¹•á•É¥Í•Ím¥‘átì(€½¹ÍĞÍ•ÑÑ¥¹Ì€ô¥ÍA±…¥¹=‰©•Ğ¡ÍÑ…Ñ”¹Í•ÑÑ¥¹Ì¤(€€€€üÍÑ…Ñ”¹Í•ÑÑ¥¹Ì(€€€€èì…ÕÑ½AÉ½É•ÍÍ¥½¸èÑÉÕ”°µ¥É½±½…‘¥¹œèÑÉÕ”ôì((€€¼¼5¥ÉÉ½ÉÌÕÍ•AÉ½É…´¹±½á•É¥Í”¸Q¡”±¥•¹Ğ…±Í¼…•ÁÑÌ…¸½ÁÑ¥½¹…°IAì(€€¼¼Ñ¡”½µµ…¹Õ¹¥½¸‘•±¥‰•É…Ñ•±ä½µ¥ÑÌ¥Ğ°Í¼Ñ¡”Í•ÉÙ•È…±İ…åÌÁÉ½É•ÍÍ•Ì(€€¼¼İ¥Ñ¡½ÕĞ…¸IA¡½±€¡…ÑÕ…±IÁ”€ôôôÕ¹‘•™¥¹•¤¸(€±•ĞÕÁ‘…Ñ•‘á•É¥Í”ì(€¥˜€¡Í•ÑÑ¥¹Ì¹…ÕÑ½AÉ½É•ÍÍ¥½¸¤ì(€€€ÕÁ‘…Ñ•‘á•É¥Í”€ô…ÁÁ±åAÉ½É•ÍÍ¥½¸ (€€€€€•á•É¥Í”°(€€€€€½µµ…¹¹…ÑÕ…°¹É•ÁÌ°(€€€€€½µµ…¹¹…ÑÕ…°¹İ•¥¡Ğ°(€€€€€ÍÑ…Ñ”¹½…°°(€€€€€Í•ÑÑ¥¹Ì¹µ¥É½±½…‘¥¹œ°(€€€€€Õ¹‘•™¥¹•°(€€€€€¹½Ü(€€€€¤ì(€ô•±Í”ì(€€€ÕÁ‘…Ñ•‘á•É¥Í”€ôì(€€€€€€¸¸¹•á•É¥Í”°(€€€€€±…ÍÑÑÑ•µÁÑ•‘]•¥¡Ğè½µµ…¹¹…ÑÕ…°¹İ•¥¡Ğ°(€€€€€±…ÍÑA•É™½Éµ…¹”èì(€€€€€€€Í•ÑÌè•á•É¥Í”¹Í•ÑÌ°(€€€€€€€É•ÁÌè½µµ…¹¹…ÑÕ…°¹É•ÁÌ°(€€€€€€€İ•¥¡Ğè½µµ…¹¹…ÑÕ…°¹İ•¥¡Ğ°(€€€€€€€½µÁ±•Ñ•è½µµ…¹¹…ÑÕ…°¹É•ÁÌ€øô•á•É¥Í”¹É•ÁÌ°(€€€€€ô°(€€€ôì(€ô((€É•ÑÕÉ¸µ…Á]½É­½ÕÑ…ä¡ÍÑ…Ñ”°½µµ…¹¹‘…å%¹‘•à°€¡¤€ôø€¡ì(€€€€¸¸¹°(€€€•á•É¥Í•Ìè¹•á•É¥Í•Ì¹µ…À ¡•à°¤¤€ôø€¡¤€ôôô¥‘à€üÕÁ‘…Ñ•‘á•É¥Í”€è•à¤¤°(€ô¤¤ì)ô((¼¼	Õ¥±Ñ¡”•á•É¥Í”…Ñ…±½œ±½½­ÕÀ€¬Ù…±¥‘…Ñ¥½¸™½È…‘½É•Á±…”¸I•©•ÑÌ…¸(¼¼Õ¹­¹½İ¸¥…Ì¥¹Ù…±¥µ…ÉÕµ•¹Ğ€¡Ñ¡”¥½µ•Ì™É½´Ñ¡”…Ñ…±½œÁ¥­•Èì…¸(¼¼Õ¹­¹½İ¸½¹”¥Ì„µ…±™½Éµ•½™½É•½µµ…¹°¹½ĞÍÑ…±”ÍÑ…Ñ”¤¸)™Õ¹Ñ¥½¸É•Í½±Ù•…Ñ…±½á•É¥Í”¡•á•É¥Í•%°±…‰•°¤ì(€¥˜€ …¥Í…Ñ…±½á•É¥Í•%¡•á•É¥Í•%¤¤ì(€€€¥¹Ù…±¥‘½µµ…¹¡U¹­¹½İ¸€‘í±…‰•±ô•á•É¥Í”€ˆ‘í•á•É¥Í•%‘ôˆ¹€¤ì(€ô(€É•ÑÕÉ¸•Ñá•É¥Í•9…µ”¡•á•É¥Í•%¤ì)ô()™Õ¹Ñ¥½¸…‘‘á•É¥Í•Ì¡ÍÑ…Ñ”°½µµ…¹¤ì(€½¹ÍĞ‘…ä€ôÉ•ÅÕ¥É•]½É­½ÕÑ…ä¡ÍÑ…Ñ”°½µµ…¹¤ì(€€¼¼•Ñ•Éµ¥¹¥ÍÑ¥Œ¥¹ÍÑ…¹”¥‘Ì‘•É¥Ù•™É½´Ñ¡”½µµ…¹‘%ƒŠP„É•ÑÉäİ¥Ñ Ñ¡”(€€¼¼Í…µ”½µµ…¹‘%ÁÉ½‘Õ•ÌÑ¡”Í…µ”¥‘Ì€¡…¹¥ÌÍ¡½ÉĞµ¥ÉÕ¥Ñ•‰äÑ¡”É••¥ÁĞ(€€¼¼…¹åİ…ä¤°Í¼Ñ¡”É•‘Õ•ÈÍÑ…åÌÁÕÉ”¸(€½¹ÍĞ‰Õ¥±Ğ€ô½µµ…¹¹•á•É¥Í•Ì¹µ…À ¡¥¹ÁÕĞ°¤¤€ôøì(€€€½¹ÍĞÉ•ÁU¹¥Ğ€ôÉ•ÁU¹¥Ñ½Éá•É¥Í•%¡¥¹ÁÕĞ¹•á•É¥Í•%¤ì(€€€É•ÑÕÉ¸‰Õ¥±‘AÉ½É…µá•É¥Í”¡ì(€€€€€¹…µ”èÉ•Í½±Ù•…Ñ…±½á•É¥Í”¡¥¹ÁÕĞ¹•á•É¥Í•%°€‰…‘‘•ˆ¤°(€€€€€•á•É¥Í•%è¥¹ÁÕĞ¹•á•É¥Í•%°(€€€€€¥¹ÍÑ…¹•%èµ´‘í½µµ…¹¹½µµ…¹‘%‘ô´‘í¥õ€°(€€€€€€¼¼5…Ñ Ñ¡”±¥•¹Ğ…‘‘•™…Õ±Ğ€ Ï\ÄÃ\À¤İ¡•¸„™¥•±¥Ì½µ¥ÑÑ•¸(€€€€€Í•ÑÌè¥¹ÁÕĞ¹Í•ÑÌ€üü€Ì°(€€€€€É•ÁÌè¥¹ÁÕĞ¹É•ÁÌ€üü€¡É•ÁU¹¥Ğ€ôôô€‰Í•½¹‘Ìˆ€ü€ÌÀ€è€ÄÀ¤°(€€€€€İ•¥¡Ğè¥¹ÁÕĞ¹İ•¥¡Ğ€üü€À°(€€€€€€¸¸¸¡É•ÁU¹¥Ğ€„ôôÕ¹‘•™¥¹•€üìÉ•ÁU¹¥Ğô€èíô¤°(€€€ô¤ì(€ô¤ì((€½¹ÍĞ•á•É¥Í•Ì€ô‘…ä¹•á•É¥Í•Ì¹Í±¥” ¤ì(€½¹ÍĞ…Ğ€ô(€€€½µµ…¹¹¥¹Í•ÉÑĞ€ôô¹Õ±°(€€€€€€ü•á•É¥Í•Ì¹±•¹Ñ (€€€€€€è5…Ñ ¹µ¥¸¡½µµ…¹¹¥¹Í•ÉÑĞ°•á•É¥Í•Ì¹±•¹Ñ ¤ì(€•á•É¥Í•Ì¹ÍÁ±¥”¡…Ğ°€À°€¸¸¹‰Õ¥±Ğ¤ì((€É•ÑÕÉ¸µ…Á]½É­½ÕÑ…ä¡ÍÑ…Ñ”°½µµ…¹¹‘…å%¹‘•à°€¡¤€ôø€¡ì€¸¸¹°•á•É¥Í•Ìô¤¤ì)ô()™Õ¹Ñ¥½¸É•Á±…•á•É¥Í”¡ÍÑ…Ñ”°½µµ…¹¤ì(€½¹ÍĞ‘…ä€ôÉ•ÅÕ¥É•]½É­½ÕÑ…ä¡ÍÑ…Ñ”°½µµ…¹¤ì(€½¹ÍĞ¥‘à€ô‘…ä¹•á•É¥Í•Ì¹™¥¹‘%¹‘•à (€€€€¡•à¤€ôø•à€˜˜•à¹¥¹ÍÑ…¹•%€ôôô½µµ…¹¹½±‘%¹ÍÑ…¹•%(€€¤ì(€¥˜€¡¥‘à€ôôô€´Ä¤ì(€€€™…¥±•‘AÉ•½¹‘¥Ñ¥½¸ ‰Q¡…Ğ•á•É¥Í”¥Ì¹¼±½¹•È¥¸Ñ¡¥Ìİ½É­½ÕĞ¸ˆ¤ì(€ô(€½¹ÍĞ¹…µ”€ôÉ•Í½±Ù•…Ñ…±½á•É¥Í” (€€€½µµ…¹¹É•Á±…•µ•¹Ñá•É¥Í•%°(€€€€‰É•Á±…•µ•¹Ğˆ(€€¤ì(€½¹ÍĞ½±€ô‘…ä¹•á•É¥Í•Ím¥‘átì(€½¹ÍĞÉ•Á±…•µ•¹ÑI•ÁU¹¥Ğ€ôÉ•ÁU¹¥Ñ½Éá•É¥Í•% (€€€½µµ…¹¹É•Á±…•µ•¹Ñá•É¥Í•%(€€¤ì(€½¹ÍĞÕ¹¥Ñ¡…¹•€ô(€€€€¡½±¹É•ÁU¹¥Ğ€ôôô€‰Í•½¹‘Ìˆ¤€„ôô€¡É•Á±…•µ•¹ÑI•ÁU¹¥Ğ€ôôô€‰Í•½¹‘Ìˆ¤ì(€½¹ÍĞÉ•Á±…•µ•¹ÑI•ÁÌ€ôÕ¹¥Ñ¡…¹•(€€€€üÉ•Á±…•µ•¹ÑI•ÁU¹¥Ğ€ôôô€‰Í•½¹‘Ìˆ(€€€€€€ü€ÌÀ(€€€€€€è€ÄÀ(€€€€è½±¹É•ÁÌì(€€¼¼5¥ÉÉ½ÈÑ¡”±¥•¹ĞÉ•Á±…•á•É¥Í”Ì¥‘•¹Ñ¥Ñä½Õ¹¥Ğ‰½Õ¹‘…Éäè…ÉÉäÑ¡”(€€¼¼É½±”µ±•Ù•°ÁÉ•ÍÉ¥ÁÑ¥½¸°É”µ¥¹™•ÈÑ¡”…Ñ•½Éä°µ¥¹Ğ„¹•Ü¥¹ÍÑ…¹”°…¹(€€¼¼É•Í•Ğ„É•ÁÏŠQÍ•½¹‘ÌÑÉ…¹Í¥Ñ¥½¸¸Q¡¥ÌÍ•ÉÙ•È½Áä¡…Ì¹¼ÑÉÕÍÑ•ÁÉ½™¥±”(€€¼¼…±¥‰É…Ñ¥½¸½¹Ñ•áĞ°Í¼¥Ğ‘•±¥‰•É…Ñ•±ä±•…Ù•ÌÑ¡”¹•Ü±½……Ğ€À¸(€½¹ÍĞÉ•Á±…•µ•¹Ğ€ô‰Õ¥±‘AÉ½É…µá•É¥Í”¡ì(€€€¹…µ”°(€€€•á•É¥Í•%è½µµ…¹¹É•Á±…•µ•¹Ñá•É¥Í•%°(€€€¥¹ÍÑ…¹•%èµ´‘í½µµ…¹¹½µµ…¹‘%‘õ€°(€€€Í•ÑÌè½±¹Í•ÑÌ°(€€€É•ÁÌèÉ•Á±…•µ•¹ÑI•ÁÌ°(€€€€¼¼9¼ÑÉÕÍÑ•Ñ…É•ĞµÍÁ•¥™¥Œ…±¥‰É…Ñ¥½¸•á¥ÍÑÌ¥¸Ñ¡¥ÌÉ•‘Õ•È¸…ÉÉå¥¹œ(€€€€¼¼­¥±½É…µÌ…É½ÍÌ…¸…É‰¥ÑÉ…Éä…Ñ…±½œÉ•Á±…•µ•¹Ğ¥ÌÕ¹Í…™”€¡‰•¹ ƒŠH(€€€€¼¼™É½¹ĞÍÅÕ…Ğ°‘•…‘±¥™ĞƒŠH±ÕÑ”‰É¥‘”¤°Í¼Ñ¡”¹•Üµ½Ù•µ•¹ĞÍÑ…ÉÑÌ(€€€€¼¼•áÁ±¥¥Ñ±äÕ¹…±¥‰É…Ñ•É…Ñ¡•ÈÑ¡…¸¥¹¡•É¥Ñ¥¹œ„±¥”¸(€€€İ•¥¡Ğè€À°(€€€‰…Í•I•ÁÌèÕ¹¥Ñ¡…¹•€üÉ•Á±…•µ•¹ÑI•ÁÌ€è½±¹‰…Í•I•ÁÌ°(€€€ÁÉ½É•ÍÍ¥½¹QåÁ”è½±¹ÁÉ½É•ÍÍ¥½¹QåÁ”°(€€€€¸¸¸ …Õ¹¥Ñ¡…¹•€˜˜½±¹É•ÁI…¹•5…à€„ôôÕ¹‘•™¥¹•(€€€€€€üìÉ•ÁI…¹•5…àè½±¹É•ÁI…¹•5…àô(€€€€€€èíô¤°(€€€€¸¸¸¡É•Á±…•µ•¹ÑI•ÁU¹¥Ğ€„ôôÕ¹‘•™¥¹•(€€€€€€üìÉ•ÁU¹¥ĞèÉ•Á±…•µ•¹ÑI•ÁU¹¥Ğô(€€€€€€èíô¤°(€€€€¸¸¸¡½±¹‰…Í•M•ÑÌ€„ôôÕ¹‘•™¥¹•€üì‰…Í•M•ÑÌè½±¹‰…Í•M•ÑÌô€èíô¤°(€€€€¸¸¸¡½±¹É•ÍÑM•½¹‘Ì€„ôôÕ¹‘•™¥¹•€üìÉ•ÍÑM•½¹‘Ìè½±¹É•ÍÑM•½¹‘Ìô€èíô¤°(€€€€¸¸¸¡½±¹¥Í•ÍÍ½Éä€„ôôÕ¹‘•™¥¹•€üì¥Í•ÍÍ½Éäè½±¹¥Í•ÍÍ½Éäô€èíô¤°(€ô¤ì((€É•ÑÕÉ¸µ…Á]½É­½ÕÑ…ä¡ÍÑ…Ñ”°½µµ…¹¹‘…å%¹‘•à°€¡¤€ôø€¡ì(€€€€¸¸¹°(€€€•á•É¥Í•Ìè¹•á•É¥Í•Ì¹µ…À ¡•à°¤¤€ôø€¡¤€ôôô¥‘à€üÉ•Á±…•µ•¹Ğ€è•à¤¤°(€ô¤¤ì)ô((¼¼1½…°…±•¹‘…È‘…Ñ”™½ÈÑ¡”Í…Ù•İ½É­½ÕĞ°¥¸Ñ¡”ÕÍ•ÈÌÑ¥µ•é½¹”¸Q¡”(¼¼±¥•¹ĞÕÍ•Ì±½…±…Ñ•MÑÉ¥¹œ ¤€¡‘•Ù¥”µ±½…°¤ìÑ¡”Í•ÉÙ•È¡…Ì¹¼‘•Ù¥”Ñè°Í¼(¼¼¥Ğ™½Éµ…ÑÌ¹½İ€¥¸ÁÉ½™¥±”¹Ñ¥µ•é½¹”€¡%9¤°™…±±¥¹œ‰…¬Ñ¼UQİ¡•¸Ñ¡”(¼¼Ñ¥µ•é½¹”¥Ì…‰Í•¹Ğ½¥¹Ù…±¥¸•Ñ•Éµ¥¹¥ÍÑ¥Œ¥Ù•¸€¡¹½Ü°Ñ¥µ•é½¹”¤¸)™Õ¹Ñ¥½¸±½…±…Ñ•%¹i½¹”¡¹½Ü°Ñ¥µ•é½¹”¤ì(€½¹ÍĞÑè€ôÑåÁ•½˜Ñ¥µ•é½¹”€ôôô€‰ÍÑÉ¥¹œˆ€˜˜Ñ¥µ•é½¹”€üÑ¥µ•é½¹”€è€‰UQˆì(€½¹ÍĞ½ÁÑÌ€ôì(€€€å•…Èè€‰¹Õµ•É¥Œˆ°(€€€µ½¹Ñ è€ˆÈµ‘¥¥Ğˆ°(€€€‘…äè€ˆÈµ‘¥¥Ğˆ°(€ôì(€ÑÉäì(€€€€¼¼•¸µÉ•¹‘•ÉÌ…Ìeeedµ54µ¸(€€€É•ÑÕÉ¸¹•Ü%¹Ñ°¹…Ñ•Q¥µ•½Éµ…Ğ ‰•¸µˆ°ìÑ¥µ•i½¹”èÑè°€¸¸¹½ÁÑÌô¤¹™½Éµ…Ğ (€€€€€¹•Ü…Ñ”¡¹½Ü¤(€€€€¤ì(€ô…Ñ €¡}”¤ì(€€€É•ÑÕÉ¸¹•Ü%¹Ñ°¹…Ñ•Q¥µ•½Éµ…Ğ ‰•¸µˆ°ì(€€€€€Ñ¥µ•i½¹”è€‰UQˆ°(€€€€€€¸¸¹½ÁÑÌ°(€€€ô¤¹™½Éµ…Ğ¡¹•Ü…Ñ”¡¹½Ü¤¤ì(€ô)ô((¼¼½µÁ±•Ñ•]½É­½ÕÑ…äèµ…É­ÌÑ¡”‘…ä½µÁ±•Ñ”€¬ÁÉ½‘Õ•Ì„Í•ÉÙ•Èµ‘•É¥Ù•(¼¼İ½É­½ÕĞÉ•½É€¡•™™•ÑÌ¹İ½É­½ÕĞ¤É•ÁÉ½‘Õ¥¹œÁ…­•Ğ€ÄÔÌÍ¡…Á”¸5¥ÉÉ½ÉÌ(¼¼ÕÍ•AÉ½É…´¹½µÁ±•Ñ•]½É­½ÕÑ…ä¸Q¡”•™™•Ğ¥¹Ñ•¹Ñ¥½¹…±±ä=5%QLÉ•…Ñ•‘Ñ€ƒŠP(¼¼Ñ¡”…±±…‰±”¥¹©•ÑÌ…‘µ¥¸¹™¥É•ÍÑ½É”¹Q¥µ•ÍÑ…µÀ¹¹½Ü ¥€…ĞİÉ¥Ñ”Ñ¥µ”€¡Ñ¡”(¼¼É•‘Õ•ÈÍÑ…åÌÁÕÉ”¤¸Q¡”…±±…‰±”İÉ¥Ñ•Ì¥ĞÑ¼(¼¼ÕÍ•ÉÌ½íÕ¥‘ô½İ½É­½ÕÑÌ½ÁÉ½É…µµ”´ñ½µÁ±•Ñ¥½¹%ø¥¸Ñ¡”Í…µ”ÑÉ…¹Í…Ñ¥½¸¸)™Õ¹Ñ¥½¸½µÁ±•Ñ•]½É­½ÕÑ…å]¥Ñ¡™™•Ğ¡ÍÑ…Ñ”°ÁÉ½™¥±”°½µµ…¹°¹½Ü¤ì(€½¹ÍĞ‘…ä€ôÉ•ÅÕ¥É•]½É­½ÕÑ…ä¡ÍÑ…Ñ”°½µµ…¹¤ì((€€¼¼MÑ…Ñ”èµ…É¬=91dÑ¡¥Ì‘…ä½µÁ±•Ñ”€¡™½É”Í­¥ÁÁ•é™…±Í”¤ì±•…È„µ…Ñ¡¥¹œ(€€¼¼¹•áÑ]½É­½ÕÑ=Ù•ÉÉ¥‘”¸=Ñ¡•È‘…åÌÕ¹Ñ½Õ¡•¸(€±•Ğ¹•áÑMÑ…Ñ”€ôµ…Á]½É­½ÕÑ…ä¡ÍÑ…Ñ”°½µµ…¹¹‘…å%¹‘•à°€¡¤€ôø€¡ì(€€€€¸¸¹°(€€€½µÁ±•Ñ•èÑÉÕ”°(€€€Í­¥ÁÁ•è™…±Í”°(€ô¤¤ì(€¥˜€¡¹•áÑMÑ…Ñ”¹¹•áÑ]½É­½ÕÑ=Ù•ÉÉ¥‘”€ôôô½µµ…¹¹‘…å%¹‘•à¤ì(€€€¹•áÑMÑ…Ñ”€ôì€¸¸¹¹•áÑMÑ…Ñ”ôì(€€€‘•±•Ñ”¹•áÑMÑ…Ñ”¹¹•áÑ]½É­½ÕÑ=Ù•ÉÉ¥‘”ì(€ô((€€¼¼]½É­½ÕĞÉ•½ÉƒŠP‰Õ¥±Ğ™É½´Ù…±¥‘…Ñ•Í•Ñ1½Ì°™…±±¥¹œ‰…¬Ñ¼Á±…¹¹•(€€¼¼‘…Ñ„Á•È•á•É¥Í”€¡µ¥ÉÉ½È½˜Ñ¡”±¥•¹Ğ‰Õ¥±‘•È¤¸(€½¹ÍĞÍ•Ñ1½Ì€ô½µµ…¹¹½µÁ±•Ñ¥½¸¹Í•Ñ1½Ìì(€½¹ÍĞ•á•É¥Í•Ì€ô‘…ä¹•á•É¥Í•Ì¹µ…À ¡•à°•á%¹‘•à¤€ôøì(€€€½¹ÍĞ±½Ì€ôÍ•Ñ1½Ì€üÍ•Ñ1½Ím•á%¹‘•át€èÕ¹‘•™¥¹•ì(€€€½¹ÍĞÁ±…¹¹•‘]•¥¡Ğ€ô•à¹±…ÍÑÑÑ•µÁÑ•‘]•¥¡Ğñğ•à¹İ•¥¡Ğì(€€€½¹ÍĞÁ±…¹¹•‘I•ÁÌ€ô(€€€€€•à¹±…ÍÑA•É™½Éµ…¹”€˜˜•à¹±…ÍÑA•É™½Éµ…¹”¹É•ÁÌ€„ô¹Õ±°(€€€€€€€€ü•à¹±…ÍÑA•É™½Éµ…¹”¹É•ÁÌ(€€€€€€€€è•à¹É•ÁÌì(€€€½¹ÍĞÍ•ÑÌ€ô±½Ì(€€€€€€ü±½Ì(€€€€€€€€€€¹™¥±Ñ•È ¡°¤€ôø°¹½µÁ±•Ñ•¤(€€€€€€€€€€¹µ…À ¡°°¤¤€ôø€¡ìÍ•Ñ9Õµ‰•Èè¤€¬€Ä°É•ÁÌè°¹É•ÁÌ°İ•¥¡Ñ-œè°¹İ•¥¡Ğô¤¤(€€€€€€èÉÉ…ä¹™É½´¡ì±•¹Ñ è•à¹Í•ÑÌô°€¡|°¤¤€ôø€¡ì(€€€€€€€€€Í•Ñ9Õµ‰•Èè¤€¬€Ä°(€€€€€€€€€É•ÁÌèÁ±…¹¹•‘I•ÁÌ°(€€€€€€€€€İ•¥¡Ñ-œèÁ±…¹¹•‘]•¥¡Ğ°(€€€€€€€ô¤¤ì(€€€É•ÑÕÉ¸ì(€€€€€•á•É¥Í•%è•à¹•á•É¥Í•%°(€€€€€•á•É¥Í•9…µ”è•à¹¹…µ”°(€€€€€…Ñ•½Éäè•à¹µ½Ù•µ•¹Ñ…Ñ•½Éä°(€€€€€€¸¸¸¡•à¹É•ÁU¹¥Ğ€„ôôÕ¹‘•™¥¹•€üìÉ•ÁU¹¥Ğè•à¹É•ÁU¹¥Ğô€èíô¤°(€€€€€Í•ÑÌ°(€€€€€…±½É¥•Í	ÕÉ¹•è€À°(€€€ôì(€ô¤ì((€½¹ÍĞÑ½¹¹…”€ô•á•É¥Í•Ì¹É•‘Õ” (€€€€¡Ğ°•à¤€ôø(€€€€€Ğ€¬(€€€€€€¡•à¹É•ÁU¹¥Ğ€ôôô€‰Í•½¹‘Ìˆ(€€€€€€€€ü€À(€€€€€€€€è•à¹Í•ÑÌ¹É•‘Õ” ¡Ì°Í•Ğ¤€ôøÌ€¬Í•Ğ¹İ•¥¡Ñ-œ€¨Í•Ğ¹É•ÁÌ°€À¤¤°(€€€€À(€€¤ì(€½¹ÍĞ½µÁ±•Ñ•‘M•Ñ½Õ¹Ğ€ô•á•É¥Í•Ì¹É•‘Õ” ¡Œ°•à¤€ôøŒ€¬•à¹Í•ÑÌ¹±•¹Ñ °€À¤ì(€½¹ÍĞ‰½‘åİ•¥¡Ñ-œ€ô€¡ÁÉ½™¥±”€˜˜ÁÉ½™¥±”¹İ•¥¡Ñ-œ¤ñğ€Àì(€½¹ÍĞ‘ÕÉ…Ñ¥½¹5¥¹ÕÑ•Ì€ô(€€€½µµ…¹¹½µÁ±•Ñ¥½¸¹‘ÕÉ…Ñ¥½¹5¥¹ÕÑ•Ì€˜˜½µµ…¹¹½µÁ±•Ñ¥½¸¹‘ÕÉ…Ñ¥½¹5¥¹ÕÑ•Ì€ø€À(€€€€€€ü½µµ…¹¹½µÁ±•Ñ¥½¸¹‘ÕÉ…Ñ¥½¹5¥¹ÕÑ•Ì(€€€€€€è€Àì(€½¹ÍĞ•™™•Ñ¥Ù•ÕÉ…Ñ¥½¹5¥¸€ô(€€€‘ÕÉ…Ñ¥½¹5¥¹ÕÑ•Ì€ø€À€ü‘ÕÉ…Ñ¥½¹5¥¹ÕÑ•Ì€è½µÁ±•Ñ•‘M•Ñ½Õ¹Ğ€¨€Ìì(€½¹ÍĞÑ½Ñ…±…±½É¥•Ì€ô•ÍÑ¥µ…Ñ•1¥™Ñ	ÕÉ¸¡ì(€€€‘ÕÉ…Ñ¥½¹5¥¹ÕÑ•Ì°(€€€Ñ½¹¹…•-œèÑ½¹¹…”°(€€€‰½‘åİ•¥¡Ñ-œ°(€€€½µÁ±•Ñ•‘M•Ñ½Õ¹Ğ°(€ô¤ì((€½¹ÍĞİ½É­½ÕĞ€ôì(€€€‘…Ñ”è±½…±…Ñ•%¹i½¹”¡¹½Ü°ÁÉ½™¥±”€˜˜ÁÉ½™¥±”¹Ñ¥µ•é½¹”¤°(€€€•á•É¥Í•Ì°(€€€Ñ½Ñ…±…±½É¥•Ì°(€€€‘ÕÉ…Ñ¥½¹5¥¹ÕÑ•Ìè•™™•Ñ¥Ù•ÕÉ…Ñ¥½¹5¥¸°(€€€¹½Ñ•Ìè€‘í‘…ä¹‘…å9…µ•ôƒŠPAÉ½É…µµ”]••¬€‘íÍÑ…Ñ”¹İ••­9Õµ‰•Éõ€°(€€€Í½ÕÉ”è€‰ÁÉ½É…µµ”ˆ°(€€€½µÁ±•Ñ¥½¹%è½µµ…¹¹½µÁ±•Ñ¥½¸¹½µÁ±•Ñ¥½¹%°(€€€€¸¸¸¡½µµ…¹¹½µÁ±•Ñ¥½¸¹Í•ÍÍ¥½¹Y…É¥…¹Ğ€„ôôÕ¹‘•™¥¹•(€€€€€€üìÍ•ÍÍ¥½¹Y…É¥…¹Ğè½µµ…¹¹½µÁ±•Ñ¥½¸¹Í•ÍÍ¥½¹Y…É¥…¹Ğô(€€€€€€èíô¤°(€ôì((€É•ÑÕÉ¸ìÍÑ…Ñ”è¹•áÑMÑ…Ñ”°•™™•ÑÌèìİ½É­½ÕĞôôì)ô((¼¨¨(€¨ÁÁ±ä•á…Ñ±ä½¹”Ù…±¥‘…Ñ•½µµ…¹Ñ¼ÁÉ½É…µµ”ÍÑ…Ñ”¸AÕÉ”€¬‘•Ñ•Éµ¥¹¥ÍÑ¥Œè(€¨Í…µ”€¡ÍÑ…Ñ”°½µµ…¹°¹½Ü¤…±İ…åÌå¥•±‘ÌÑ¡”Í…µ”É•ÍÕ±Ğ¸(€¨(€¨Á…É…´íìÍÑ…Ñ”è½‰©•Ğ°ÁÉ½™¥±”üè½‰©•Ğ°½µµ…¹èÕ¹­¹½İ¸°¹½Üè¹Õµ‰•Èõô…ÉÌ(€¨É•ÑÕÉ¹ÌíìÍÑ…Ñ”è½‰©•Ğ°•™™•ÑÌè½‰©•Ğõô(€¨¼)™Õ¹Ñ¥½¸…ÁÁ±åAÉ½É…µ½µµ…¹¡ìÍÑ…Ñ”°ÁÉ½™¥±”°½µµ…¹°¹½Üô¤ì(€¥˜€¡ÑåÁ•½˜¹½Ü€„ôô€‰¹Õµ‰•Èˆñğ€…9Õµ‰•È¹¥Í¥¹¥Ñ”¡¹½Ü¤¤ì(€€€¥¹Ù…±¥‘½µµ…¹ ‰™¥¹¥Ñ”Ñ¥µ•ÍÑ…µÀ¥ÌÉ•ÅÕ¥É•¸ˆ¤ì(€ô(€½¹ÍĞÙ…±¥‘…Ñ•€ô…ÍÍ•ÉÑ±¥•¹ÑAÉ½É…µ½µµ…¹¡½µµ…¹¤ì(€½¹ÍĞÕÉÉ•¹Ğ€ô¹½Éµ…±¥é•½ÉI•‘Õ•È¡ÍÑ…Ñ”¤ì((€€¼¼½µÁ±•Ñ•]½É­½ÕÑ…ä¥ÌÑ¡”½¹±ä½µµ…¹Ñ¡…ĞÁÉ½‘Õ•Ì…¸•™™•Ğ€¡Ñ¡”Í…Ù•(€€¼¼İ½É­½ÕĞÉ•½É¤ì¡…¹‘±”¥ĞÍ•Á…É…Ñ•±äÍ¼Ñ¡”É•ÍĞÍÑ…ä•™™•Ğµ™É•”¸(€¥˜€¡Ù…±¥‘…Ñ•¹­¥¹€ôôô€‰½µÁ±•Ñ•]½É­½ÕÑ…äˆ¤ì(€€€½¹ÍĞÉ•ÍÕ±Ğ€ô½µÁ±•Ñ•]½É­½ÕÑ…å]¥Ñ¡™™•Ğ (€€€€€ÕÉÉ•¹Ğ°(€€€€€ÁÉ½™¥±”ñğíô°(€€€€€Ù…±¥‘…Ñ•°(€€€€€¹½Ü(€€€€¤ì(€€€É•ÑÕÉ¸ì(€€€€€ÍÑ…Ñ”èì€¸¸¹É•ÍÕ±Ğ¹ÍÑ…Ñ”°ÕÁ‘…Ñ•‘Ğè¹½Üô°(€€€€€•™™•ÑÌèÉ•ÍÕ±Ğ¹•™™•ÑÌ°(€€€ôì(€ô((€±•Ğ¹•áĞì(€Íİ¥Ñ €¡Ù…±¥‘…Ñ•¹­¥¹¤ì(€€€…Í”€‰Í­¥Á]½É­½ÕÑ…äˆè(€€€€€¹•áĞ€ôÍ­¥Á]½É­½ÕÑ…ä¡ÕÉÉ•¹Ğ°Ù…±¥‘…Ñ•¤ì(€€€€€‰É•…¬ì(€€€…Í”€‰Í•Ñ9•áÑ]½É­½ÕĞˆè(€€€€€¹•áĞ€ôÍ•Ñ9•áÑ]½É­½ÕĞ¡ÕÉÉ•¹Ğ°Ù…±¥‘…Ñ•¤ì(€€€€€‰É•…¬ì(€€€…Í”€‰É•µ½Ù•á•É¥Í”ˆè(€€€€€¹•áĞ€ôÉ•µ½Ù•á•É¥Í”¡ÕÉÉ•¹Ğ°Ù…±¥‘…Ñ•¤ì(€€€€€‰É•…¬ì(€€€…Í”€‰ÕÁ‘…Ñ•á•É¥Í”ˆè(€€€€€¹•áĞ€ôÕÁ‘…Ñ•á•É¥Í”¡ÕÉÉ•¹Ğ°Ù…±¥‘…Ñ•¤ì(€€€€€‰É•…¬ì(€€€…Í”€‰É•½É‘•Éá•É¥Í•Ìˆè(€€€€€¹•áĞ€ôÉ•½É‘•Éá•É¥Í•Ì¡ÕÉÉ•¹Ğ°Ù…±¥‘…Ñ•¤ì(€€€€€‰É•…¬ì(€€€…Í”€‰±½á•É¥Í”ˆè(€€€€€¹•áĞ€ô±½á•É¥Í”¡ÕÉÉ•¹Ğ°Ù…±¥‘…Ñ•°¹½Ü¤ì(€€€€€‰É•…¬ì(€€€…Í”€‰…‘‘á•É¥Í•Ìˆè(€€€€€¹•áĞ€ô…‘‘á•É¥Í•Ì¡ÕÉÉ•¹Ğ°Ù…±¥‘…Ñ•¤ì(€€€€€‰É•…¬ì(€€€…Í”€‰É•Á±…•á•É¥Í”ˆè(€€€€€¹•áĞ€ôÉ•Á±…•á•É¥Í”¡ÕÉÉ•¹Ğ°Ù…±¥‘…Ñ•¤ì(€€€€€‰É•…¬ì(€€€…Í”€‰Í•ÑAÉ½É…µM•ÑÑ¥¹Ìˆè(€€€€€¹•áĞ€ôì€¸¸¹ÕÉÉ•¹Ğ°Í•ÑÑ¥¹Ìèì€¸¸¹Ù…±¥‘…Ñ•¹Í•ÑÑ¥¹Ìôôì(€€€€€‰É•…¬ì(€€€…Í”€‰Í•ÑAÉ½É…µ½…±5¥ÉÉ½Èˆè(€€€€€¹•áĞ€ôì€¸¸¹ÕÉÉ•¹Ğ°½…°èÙ…±¥‘…Ñ•¹½…°ôì(€€€€€‰É•…¬ì(€€€…Í”€‰Í•Ñ5…¹Õ…±IÕ¹½µÁ±•Ñ¥½¸ˆè(€€€€€¹•áĞ€ôÍ•Ñ5…¹Õ…±IÕ¹½µÁ±•Ñ¥½¸¡ÕÉÉ•¹Ğ°Ù…±¥‘…Ñ•°¹½Ü¤ì(€€€€€‰É•…¬ì(€€€…Í”€‰ÑÉ…¹Í¥Ñ¥½¹IÕ¹…äˆè(€€€€€¹•áĞ€ôÑÉ…¹Í¥Ñ¥½¹IÕ¹…ä¡ÕÉÉ•¹Ğ°Ù…±¥‘…Ñ•¤ì(€€€€€‰É•…¬ì(€€€…Í”€‰½Ù•ÉÉ¥‘•IÕ¹…äˆè(€€€€€¹•áĞ€ô½Ù•ÉÉ¥‘•IÕ¹…ä¡ÕÉÉ•¹Ğ°Ù…±¥‘…Ñ•¤ì(€€€€€‰É•…¬ì(€€€…Í”€‰…ÁÁ±å•±½…‘]••¬ˆè(€€€€€¹•áĞ€ô…ÁÁ±å•±½…‘]••­½µµ…¹¡ÕÉÉ•¹Ğ°ÁÉ½™¥±”ñğíô°Ù…±¥‘…Ñ•°¹½Ü¤ì(€€€€€‰É•…¬ì(€€€…Í”€‰É•Ù•ÉÑ•±½…‘]••¬ˆè(€€€€€¹•áĞ€ôÉ•Ù•ÉÑ•±½…‘]••­½µµ…¹¡ÕÉÉ•¹Ğ°Ù…±¥‘…Ñ•¤ì(€€€€€‰É•…¬ì(€€€‘•™…Õ±Ğè(€€€€€¥¹Ù…±¥‘½µµ…¹¡U¹ÍÕÁÁ½ÉÑ•ÁÉ½É…µµ”½µµ…¹€ˆ‘íÙ…±¥‘…Ñ•¹­¥¹‘ôˆ¹€¤ì(€ô((€É•ÑÕÉ¸ìÍÑ…Ñ”èì€¸¸¹¹•áĞ°ÕÁ‘…Ñ•‘Ğè¹½Üô°•™™•ÑÌèíôôì)ô()µ½‘Õ±”¹•áÁ½ÉÑÌ€ôì(€…ÍÍ•ÉÑ±¥•¹ÑAÉ½É…µ½µµ…¹°(€…ÍÍ•ÉÑ½µµ…¹‘%°(€…ÁÁ±åAÉ½É…µ½µµ…¹°(€µ…­•½µµ…¹‘I••¥ÁĞ°(€İ½É­½ÕÑ…åM¥¹…ÑÕÉ”°(€ÑÉ…¹Í¥Ñ¥½¹MÑ…ÑÕÌ°(€•ÑM¡•‘Õ±•‘IÕ¹MÑ…ÑÕÌ°(€¥ÍM¡•‘Õ±•‘IÕ¹‘¥Ñ…‰±”°(€¥ÍAÉ½É…µ½µµ…¹‘ÉÉ½È°(€AÉ½É…µ½µµ…¹‘ÉÉ½È°(€AI=I5}=559}I%AQ}IQ9Q%=9}5L°(€1%9Q}=559}-%9L°)ôì