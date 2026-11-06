/** Pure evidence mapping. Never infers fitness, race completion or clearance. */
"use strict";
const { createHash } = require("node:crypto");
const { isCalendarDate } = require("./dateUtils");
const record = value => value !== null && typeof value === "object" && !Array.isArray(value);
const owns = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
function canonical(value) {
  if (value instanceof Date) return ["date", String(value.getTime())];
  if (Array.isArray(value)) return ["array", value.map(canonical)];
  if (record(value)) return ["object", Object.keys(value).sort().map(key => [key, canonical(value[key])])];
  return [typeof value, typeof value === "number" ? String(value) : value];
}
function reconcileLegacyRunning(snapshot) {
  if (!record(snapshot)) throw Error("Invalid legacy snapshot");
  const holds = new Set(), evidence = new Set();
  const unknown = () => { holds.add("legacy_safety_review_required"); evidence.add("unsupported_legacy_facts"); };
  const recovery = () => { holds.add("recovery_evidence_required"); evidence.add("legacy_recovery_indicator"); };
  // Only these shape-checked primitive metadata fields are known to carry no
  // running restrictions. Unmapped structured data is preserved and held.
  const numbers = ["weekNumber", "fatigueScore", "updatedAt", "nextWorkoutOverride", "sessionMinutes", "plateauResponses", "programSchemaVersion"];
  const strings = ["goal", "currentPhase", "splitType", "primaryGoal", "templateId", "liftWeekKey"];
  const known = new Set([...numbers, ...strings, "runPlan", "runDays", "settings", "workouts", "weekHistory", "manualCompletions", "easeSnapshot", "deloadSnapshot", "easingBack", "recoveringMuscles", "raceWeek"]);
  for (const key of Object.keys(snapshot)) if (!known.has(key)) unknown();
  for (const key of numbers) if (owns(snapshot, key) && !Number.isFinite(snapshot[key])) unknown();
  for (const key of strings) if (owns(snapshot, key) && typeof snapshot[key] !== "string") unknown();
  // These are lift-history namespaces, not running capacity or restrictions.
  for (const key of ["workouts", "weekHistory"]) if (owns(snapshot, key) && !Array.isArray(snapshot[key])) unknown();
  if (owns(snapshot, "recoveringMuscles") && (!Array.isArray(snapshot.recoveringMuscles) || snapshot.recoveringMuscles.length)) unknown();
  if (owns(snapshot, "manualCompletions")) {
    if (!record(snapshot.manualCompletions)) unknown();
    else for (const [id, completion] of Object.entries(snapshot.manualCompletions)) {
      const matches = Array.isArray(snapshot.runDays) ? snapshot.runDays.filter(day => record(day) && day.id === id) : [];
      const at = completion?.completedAt;
      const validTime = (typeof at === "number" && Number.isFinite(at)) || (at instanceof Date && Number.isFinite(at.getTime())) ||
        (record(at) && Object.keys(at).every(key => ["seconds", "nanoseconds"].includes(key)) && Number.isSafeInteger(at.seconds) && Number.isInteger(at.nanoseconds) && at.nanoseconds >= 0 && at.nanoseconds < 1e9);
      const row = matches.length === 1 ? matches[0] : null;
      const identified = row && typeof row.templateId === "string" && row.templateId.length > 0 &&
        ["easy", "run_walk", "long", "tempo", "intervals", "race"].includes(row.type);
      if (!identified || !record(completion) || Object.keys(completion).some(key => key !== "completedAt") || !validTime) unknown();
      // Matched row is inspected below, including effective race overrides.
    }
  }
  if (owns(snapshot, "settings") && (!record(snapshot.settings) || Object.entries(snapshot.settings).some(([key, value]) =>
    !(["autoProgression", "smallPlates", "microloading"].includes(key) && typeof value === "boolean") && !(key === "loadUnit" && ["kg", "lb"].includes(value))))) unknown();
  if (["easeSnapshot", "deloadSnapshot", "easingBack"].some(key => owns(snapshot, key))) {
    holds.add("load_review_required"); evidence.add("legacy_reduced_load");
  }
  if (owns(snapshot, "raceWeek")) {
    if (["race", "after"].includes(snapshot.raceWeek)) recovery();
    else if (!["build", "taper"].includes(snapshot.raceWeek)) unknown();
  }
  if (owns(snapshot, "runPlan")) {
    const plan = snapshot.runPlan;
    const planKeys = ["mode", "stage", "stageWeekKey", "stageStartedWeek", "emptyRunWeekKey", "raceGoal", "totalWeeks", "currentWeek", "compressed", "belowFloor", "phase", "recoveryEndDate", "completedRaces", "leadInWeek"];
    if (!record(plan)) unknown();
    else {
      if (Object.keys(plan).some(key => !planKeys.includes(key)) || !["structured", "starter", "race_prep"].includes(plan.mode)) unknown();
      for (const key of ["stage", "totalWeeks", "currentWeek"]) if (owns(plan, key) && (!Number.isSafeInteger(plan[key]) || plan[key] < 0)) unknown();
      for (const key of ["stageWeekKey", "stageStartedWeek", "emptyRunWeekKey", "leadInWeek"]) if (owns(plan, key) && !isCalendarDate(plan[key])) unknown();
      for (const key of ["compressed", "belowFloor"]) if (owns(plan, key) && typeof plan[key] !== "boolean") unknown();
      if (plan.belowFloor === true || plan.compressed === true) { holds.add("load_review_required"); evidence.add("legacy_reduced_load"); }
      if (owns(plan, "phase") || owns(plan, "recoveryEndDate") || (owns(plan, "completedRaces") && (!Array.isArray(plan.completedRaces) || plan.completedRaces.length))) recovery();
      if (owns(plan, "raceGoal")) {
        const goal = plan.raceGoal;
        if (!record(goal) || Object.keys(goal).some(key => !["distance", "targetDate", "eventName"].includes(key)) ||
            !["5k", "10k", "half", "marathon"].includes(goal.distance) || !isCalendarDate(goal.targetDate) ||
            (owns(goal, "eventName") && typeof goal.eventName !== "string")) unknown();
      }
      evidence.add("legacy_prescriptions_retired");
    }
  }
  if (owns(snapshot, "runDays")) {
    if (!Array.isArray(snapshot.runDays)) unknown();
    else for (const day of snapshot.runDays) {
      // Retained as history only; none of these identities becomes a new plan.
      const allowed = ["id", "weekKey", "date", "dayIndex", "templateId", "type", "completed", "status", "userOverride", "movedFromDate", "movedToDate", "clashesWithLift"];
      if (!record(day) || Object.keys(day).some(key => !allowed.includes(key))) { unknown(); continue; }
      for (const key of ["id", "templateId", "type", "userOverride"]) if (owns(day, key) && typeof day[key] !== "string") unknown();
      for (const key of ["weekKey", "date", "movedFromDate", "movedToDate"]) if (owns(day, key) && !isCalendarDate(day[key])) unknown();
      if (owns(day, "dayIndex") && (!Number.isInteger(day.dayIndex) || day.dayIndex < 0 || day.dayIndex > 6)) unknown();
      for (const key of ["completed", "clashesWithLift"]) if (owns(day, key) && typeof day[key] !== "boolean") unknown();
      if (owns(day, "status") && !["planned", "skipped", "race_no_show", "completed_exact", "completed_modified", "completed_late"].includes(day.status)) unknown();
      // A race-type row is a reason to request evidence, not proof it happened.
      if (/race/i.test(day.type || "") || /race/i.test(day.templateId || "") || /race/i.test(day.userOverride || "")) recovery();
    }
  }
  return { version: 1, snapshotDigest: createHash("sha256").update(JSON.stringify(canonical(snapshot))).digest("hex"),
    evidence: [...evidence].sort(), holds: [...holds].sort() };
}
module.exports = { reconcileLegacyRunning };
