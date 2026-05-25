/**
 * Cloud Function gate for v7 plan payloads.
 *
 * Mirrors `validatePlanOutput` in `src/features/program/planBuilder.ts`,
 * but lives in CommonJS so the CFs (`completeOnboarding`, `configurePlan`)
 * can require it without dragging in the TypeScript toolchain.
 *
 * Two callers, one contract:
 *   - Client preflight: planBuilder.validatePlanOutput runs the same
 *     checks before the network round-trip, giving a fast UX-level
 *     error.
 *   - Server authoritative: this module gates persistence — a
 *     malformed payload that slipped past (or bypassed) the client is
 *     rejected before any Firestore write.
 *
 * Pure: no firebase-functions / firebase-admin imports. The CF
 * wrapper translates the returned error list into an
 * `HttpsError("invalid-argument", ...)`. Testability is the same as
 * `helpers.js`: import with `createRequire`, no admin boot required.
 *
 * Keep in lockstep with planBuilder.validatePlanOutput — any new
 * check on one side must land on the other in the same commit, or
 * we ship a client surface that disagrees with the server gate.
 */

const VALID_WEEK_SCHEDULE_TYPES = new Set(["rest", "lift", "run", "both"]);

const VALID_RUN_STATUSES = new Set([
  "planned",
  "completed_exact",
  "completed_modified",
  "completed_late",
  "skipped",
  "race_no_show",
  "race_completed_unlinked",
  // NOTE: "moved", "missed", "freeform_extra" are intentionally NOT
  // valid statuses. "moved" lives in metadata (movedFromDate /
  // movedToDate), "missed" is derived from date + status, and
  // "freeform_extra" lives on the run doc itself via planMetadata.
]);

const VALID_RUN_MODES = new Set(["freeform", "structured", "race_prep"]);

/**
 * Validate a v7 plan payload. Returns an array of error strings —
 * empty array means valid. Callers throw HttpsError when non-empty.
 *
 * @param {object} args
 * @param {object} args.profileData - profile patch / full profile.
 *   Must include weekScheduleVersion + runMode (+ raceGoal when
 *   race_prep). For onboarding this is the full sanitised profile;
 *   for Configure Plan this is the partial profileUpdates patch.
 * @param {object} args.programState - the ProgramState document.
 *   Must include programSchemaVersion + runDays array.
 * @param {Array} args.weekSchedule - the 7-day type structure.
 *   Validated independently of profileData.weekSchedule because the
 *   server treats the explicit field as authoritative (the client
 *   may double-write it onto profileData for convenience).
 * @returns {string[]} errors - empty when valid.
 */
function validatePlanPayload({ profileData, programState, weekSchedule }) {
  const errors = [];

  // Shape gate — must be plain objects so subsequent field reads are
  // safe. null / array / string would each surface as a TypeError on
  // the very next access, which becomes an opaque 500 instead of an
  // actionable 400. Cheap to check, big win in operability.
  if (!profileData || typeof profileData !== "object" || Array.isArray(profileData)) {
    errors.push("profileData must be an object");
  }
  if (!programState || typeof programState !== "object" || Array.isArray(programState)) {
    errors.push("programState must be an object");
  }
  if (errors.length > 0) return errors;

  // weekSchedule structure
  if (!Array.isArray(weekSchedule)) {
    errors.push("weekSchedule must be an array");
  } else if (weekSchedule.length !== 7) {
    errors.push(`weekSchedule must have exactly 7 entries (got ${weekSchedule.length})`);
  } else {
    weekSchedule.forEach((d, i) => {
      if (!d || typeof d !== "object") {
        errors.push(`weekSchedule[${i}] must be an object`);
        return;
      }
      if (!VALID_WEEK_SCHEDULE_TYPES.has(d.type)) {
        errors.push(`weekSchedule[${i}].type = "${d.type}" is invalid`);
      }
      if (d.day !== i) {
        errors.push(`weekSchedule[${i}].day mismatch (expected ${i}, got ${d.day})`);
      }
    });
  }

  // runDays shape — the bulk of the validation surface. Every field
  // the in-app run flow reads off a ScheduledRunDay is pinned.
  const runDays = programState.runDays;
  if (runDays !== undefined && runDays !== null && !Array.isArray(runDays)) {
    errors.push("programState.runDays must be an array when present");
  } else {
    (runDays || []).forEach((rd, i) => {
      if (!rd || typeof rd !== "object") {
        errors.push(`runDays[${i}] must be an object`);
        return;
      }
      if (!rd.id) errors.push(`runDays[${i}].id missing`);
      if (!rd.date || typeof rd.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(rd.date)) {
        errors.push(`runDays[${i}].date invalid format (must be YYYY-MM-DD, got "${rd.date}")`);
      }
      if (!rd.weekKey) errors.push(`runDays[${i}].weekKey missing`);
      if (!rd.templateId) errors.push(`runDays[${i}].templateId missing`);
      if (!rd.status || !VALID_RUN_STATUSES.has(rd.status)) {
        errors.push(`runDays[${i}].status = "${rd.status}" is invalid`);
      }
      if (rd.userOverride !== undefined && typeof rd.userOverride !== "string") {
        errors.push(`runDays[${i}].userOverride must be string (template ID), not ${typeof rd.userOverride}`);
      }
      // No UTC-via-toISOString leakage. weekKey + date must be local
      // YYYY-MM-DD; a "T" indicates a full ISO timestamp slipped
      // through and would cause off-by-day errors for late-night PST
      // users (their wall-clock Tuesday becomes UTC Wednesday).
      if (typeof rd.date === "string" && rd.date.includes("T")) {
        errors.push(`runDays[${i}].date appears to be UTC ISO format (contains 'T')`);
      }
      if (typeof rd.weekKey === "string" && rd.weekKey.includes("T")) {
        errors.push(`runDays[${i}].weekKey appears to be UTC ISO format (contains 'T')`);
      }
    });
  }

  // runMode + raceGoal consistency
  if (profileData.runMode !== undefined && !VALID_RUN_MODES.has(profileData.runMode)) {
    errors.push(`profileData.runMode = "${profileData.runMode}" is invalid`);
  }
  if (profileData.runMode === "race_prep") {
    if (!profileData.raceGoal) {
      errors.push("race_prep mode requires profileData.raceGoal");
    }
    if (!programState.runPlan || !programState.runPlan.raceGoal) {
      errors.push("race_prep mode requires programState.runPlan.raceGoal");
    }
  }

  // Schema versions — present + numeric. The version fields are how
  // future migrations recognise old payloads; if we ship a CF that
  // accepts unversioned writes, those rows can never be safely
  // migrated without a full reverse-engineering pass.
  //
  // RP4d gap (deferred to v3 work, see docs/proposals/schema-
  // versioning.md): this validator does NOT yet cross-check declared
  // version against payload shape. A client declaring v2 but sending
  // v3-only fields, or declaring v3 while omitting v3-required
  // fields, is currently caught only by the per-field gates above.
  // Closing this gap is the first step of any v2→v3 work.
  if (typeof profileData.weekScheduleVersion !== "number" || profileData.weekScheduleVersion < 1) {
    errors.push("profileData.weekScheduleVersion required (number >= 1)");
  }
  if (typeof programState.programSchemaVersion !== "number" || programState.programSchemaVersion < 1) {
    errors.push("programState.programSchemaVersion required (number >= 1)");
  }

  return errors;
}

module.exports = {
  validatePlanPayload,
  VALID_WEEK_SCHEDULE_TYPES,
  VALID_RUN_STATUSES,
  VALID_RUN_MODES,
};
