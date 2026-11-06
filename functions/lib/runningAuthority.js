"use strict";

const { isCalendarDate } = require("./dateUtils");

// Dormant protocol primitive. No callable, migration, or client writer uses it.
// All inputs except request MUST come from transaction-current server storage.
const SCHEMA_VERSION = 1;
class RunningAuthorityError extends Error {
  constructor(code) { super(code); this.code = code; }
}
function reject(code) { throw new RunningAuthorityError(code); }
function record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function owns(value, key) { return Object.prototype.hasOwnProperty.call(value, key); }
function identifier(value) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
}
function revision(value) { return Number.isSafeInteger(value) && value >= 0; }
function onlyKeys(value, keys) {
  return Object.keys(value).every(key => keys.includes(key));
}
function validGoal(value) { return value === null || identifier(value); }
function validatePlan(plan) {
  if (!record(plan) || !onlyKeys(plan, ["raceGoalId", "sessions"]) || !validGoal(plan.raceGoalId) || !Array.isArray(plan.sessions))
    reject("invalid-plan");
  const ids = new Set();
  const dates = new Set();
  for (const session of plan.sessions) {
    if (!record(session) || !onlyKeys(session, ["id", "date", "templateId", "minutes", "kind"]) || !identifier(session.id) || ids.has(session.id) ||
        !isCalendarDate(session.date) || dates.has(session.date) ||
        !identifier(session.templateId) ||
        !Number.isFinite(session.minutes) || session.minutes <= 0 ||
        !["easy", "run_walk"].includes(session.kind)) reject("invalid-plan");
    ids.add(session.id);
    dates.add(session.date);
  }
}
function validateState(state) {
  if (!record(state) || state.schemaVersion !== SCHEMA_VERSION)
    reject("unsupported-authority");
  if (!identifier(state.accountId) || !revision(state.revision) ||
      !Array.isArray(state.holds) || !state.holds.every(identifier) ||
      !record(state.constraints)) reject("invalid-authority");
  // The current programme may contain sessions outside adaptation's easy-only
  // vocabulary. Validate only its goal identity here; domain validation owns it.
  if (!record(state.plan) || !validGoal(state.plan.raceGoalId) || !Array.isArray(state.plan.sessions)) reject("invalid-authority");
}

/**
 * Pure decision for a FUTURE Admin transaction. This is not authorization or
 * clinical validation: a caller must authenticate the uid, check deletion,
 * read an immutable server-validated proposal and receipt, and write the result
 * atomically. Never call this with client-supplied state/proposal/receipt.
 *
 * Every authoritative input/hold change must increment revision. A receipt
 * lives in a separate Admin-only document keyed by idempotencyKey; retaining
 * only the last receipt would let delayed retries execute twice.
 */
function applyRunningProposal({ current, proposal, request, receipt = null, nowMs }) {
  if (!record(request) || !identifier(request.uid) ||
      !identifier(request.proposalId) || !identifier(request.idempotencyKey) ||
      !revision(request.expectedRevision) || request.accepted !== true)
    reject("invalid-acceptance");
  if (!Number.isSafeInteger(nowMs) || nowMs < 0) reject("invalid-clock");
  validateState(current);
  if (current.accountId !== request.uid) reject("wrong-account");
  if (receipt !== null) {
    if (!record(receipt) || receipt.accountId !== request.uid ||
        receipt.proposalId !== request.proposalId ||
        receipt.idempotencyKey !== request.idempotencyKey ||
        receipt.baseRevision !== request.expectedRevision ||
        !revision(receipt.appliedRevision) ||
        receipt.appliedRevision !== receipt.baseRevision + 1 ||
        receipt.appliedRevision > current.revision) reject("idempotency-conflict");
    return { outcome: "replayed", receipt };
  }
  if (!record(proposal) || proposal.id !== request.proposalId ||
      proposal.accountId !== request.uid) reject("unknown-proposal");
  if (proposal.baseRevision !== request.expectedRevision ||
      current.revision !== request.expectedRevision) reject("revision-conflict");
  if (!record(proposal.validation) || proposal.validation.policyVersion !== 1 ||
      proposal.validation.authorityRevision !== current.revision) reject("unvalidated-proposal");
  if (current.revision === Number.MAX_SAFE_INTEGER) reject("revision-exhausted");
  if (!Number.isSafeInteger(proposal.expiresAtMs) || proposal.expiresAtMs <= nowMs)
    reject("proposal-expired");
  if (current.holds.length > 0) reject("active-hold");
  if (owns(current, "migration") && (!record(current.migration) ||
      current.migration.version !== 1 || current.migration.status !== "complete"))
    reject("active-hold");
  validatePlan(proposal.plan);
  if (proposal.plan.raceGoalId !== current.plan.raceGoalId) reject("goal-conflict");
  // Patch one server-validated seven-day window. Unrelated weeks and plan
  // metadata never disappear when the bounded planner returns fewer sessions.
  if (!isCalendarDate(proposal.windowStart)) reject("invalid-window");
  if (typeof current.timeZone !== "string" || !current.timeZone) reject("invalid-authority");
  let today;
  try {
    const parts = new Intl.DateTimeFormat("en", {
      timeZone: current.timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    }).formatToParts(new Date(nowMs));
    const get = type => parts.find(part => part.type === type).value;
    today = `${get("year")}-${get("month")}-${get("day")}`;
  } catch { reject("invalid-authority"); }
  if (proposal.windowStart <= today) reject("window-not-future");
  const start = Date.parse(`${proposal.windowStart}T00:00:00Z`);
  const inWindow = session => {
    const date = Date.parse(`${session.date}T00:00:00Z`);
    return date >= start && date < start + 7 * 86400000;
  };
  const seen = new Set();
  for (const session of current.plan.sessions) {
    if (!record(session) || !identifier(session.id) || !isCalendarDate(session.date) ||
        seen.has(session.id)) reject("invalid-authority");
    seen.add(session.id);
  }
  if (owns(current, "manualCompletions") && !record(current.manualCompletions))
    reject("invalid-authority");
  const window = current.plan.sessions.filter(inWindow);
  if (window.some(session =>
      (owns(session, "protected") && session.protected !== false) ||
      (owns(session, "completed") && session.completed !== false) ||
      (owns(session, "status") && session.status !== "planned") ||
      owns(session, "movedFromDate") || owns(session, "movedToDate") ||
      owns(session, "userOverride") ||
      (current.manualCompletions && owns(current.manualCompletions, session.id))))
    reject("protected-entry");
  if (proposal.plan.sessions.some(session => !inWindow(session) ||
      !window.some(original => original.id === session.id && original.date === session.date)))
    reject("invalid-window");
  const sessions = [...current.plan.sessions.filter(session => !inWindow(session)),
    ...proposal.plan.sessions].sort((a, b) => a.date.localeCompare(b.date));
  const nextRevision = current.revision + 1;
  return {
    outcome: "applied",
    // No spread from request/proposal into the authority. Holds, constraints,
    // manual activity/history and recovery evidence survive unchanged.
    next: { ...current, revision: nextRevision, plan: { ...current.plan, sessions } },
    receipt: {
      accountId: request.uid, proposalId: proposal.id,
      idempotencyKey: request.idempotencyKey,
      baseRevision: current.revision, appliedRevision: nextRevision,
    },
  };
}
module.exports = { SCHEMA_VERSION, RunningAuthorityError, applyRunningProposal };
