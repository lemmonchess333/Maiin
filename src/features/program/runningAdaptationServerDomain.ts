import { planRunningAdaptation, type AdaptationPlanEntry, type AdaptationSelection } from "./runningAdaptationPlanner";
import type { AdaptationReview } from "./runningAdaptationPreview";

function fail(code: string): never { throw Object.assign(new Error(code), { code }); }
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function id(value: unknown): value is string { return typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value); }
function date(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value;
}
function keys(value: Record<string, unknown>, allowed: string[]) { return Object.keys(value).every((key) => allowed.includes(key)); }
function positive(value: unknown): value is number { return typeof value === "number" && Number.isFinite(value) && value > 0; }
function days(value: unknown): value is number { return positive(value) && Number.isInteger(value) && value <= 7; }
const has = (value: Record<string, unknown>, key: string) => Object.prototype.hasOwnProperty.call(value, key);

/** Server domain boundary. The transaction wrapper supplies canonical authority
 * and server time; clients may supply only explicit selections and windowStart.
 * Built into the functions artifact by scripts/build-running-adaptation-domain.mjs.
 * No client proposal, clinical evidence or validation marker is accepted here.
 */
export function serverDomainPlan(input: {
  authority: unknown; windowStart: unknown; selections: unknown; nowMs: unknown;
}) {
  const a = input.authority;
  if (!record(a) || a.schemaVersion !== 1 || !id(a.accountId) || !Number.isSafeInteger(a.revision) || (a.revision as number) < 0 ||
    !record(a.plan) || !(a.plan.raceGoalId === null || id(a.plan.raceGoalId)) || !Array.isArray(a.plan.sessions) ||
    !Array.isArray(a.holds) || !a.holds.every(id) || !record(a.constraints) ||
    typeof a.timeZone !== "string" || !a.timeZone) fail("invalid-authority");
  if (a.holds.length) fail("active-hold");
  if (!Number.isSafeInteger(input.nowMs) || (input.nowMs as number) < 0 || !date(input.windowStart)) fail("invalid-window");
  let today: string;
  try {
    const parts = new Intl.DateTimeFormat("en", { timeZone: a.timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(input.nowMs as number));
    const get = (type: string) => parts.find((p) => p.type === type)!.value;
    today = `${get("year")}-${get("month")}-${get("day")}`;
  } catch { fail("invalid-authority"); }
  if (input.windowStart <= today) fail("window-not-future");
  const c = a.constraints;
  if (!keys(c, ["symptoms", "capacity", "restrictions", "reviewConfirmation", "confirmedEasyPaceSecondsPerKm"])) fail("unsupported-constraints");
  const confirmation = c.reviewConfirmation;
  if (!record(confirmation) || !keys(confirmation, ["version", "confirmed", "authorityRevision", "raceGoalId"]) || confirmation.version !== 1 || confirmation.confirmed !== true ||
    confirmation.authorityRevision !== a.revision || confirmation.raceGoalId !== a.plan.raceGoalId) fail("review-required");
  if (!["none", "during_or_after", "daily_activities", "concerning", "unknown"].includes(c.symptoms as string)) fail("review-required");
  const capacity = c.capacity;
  if (!record(capacity) || !keys(capacity, ["confirmed", "afterEffectsReviewed", "daysPerWeek", "longestMinutes"]) ||
    capacity.confirmed !== true || capacity.afterEffectsReviewed !== true || !days(capacity.daysPerWeek) || !positive(capacity.longestMinutes)) fail("review-required");
  const r = c.restrictions;
  if (!record(r)) fail("review-required");
  if (r.status === "none" || r.status === "unknown") {
    if (!keys(r, ["status"])) fail("unsupported-restrictions");
  } else if (r.status === "specified") {
    if (!keys(r, ["status", "source", "noRunning", "maxMinutes", "maxDays", "easyOnly", "runWalkOnly", "unsupported"]) ||
      r.source !== "clinician" || typeof r.noRunning !== "boolean" ||
      (has(r, "maxMinutes") && !positive(r.maxMinutes)) || (has(r, "maxDays") && !days(r.maxDays)) ||
      ["easyOnly", "runWalkOnly", "unsupported"].some((key) => has(r, key) && typeof r[key] !== "boolean")) fail("unsupported-restrictions");
  } else fail("review-required");
  if (has(c, "confirmedEasyPaceSecondsPerKm") && !positive(c.confirmedEasyPaceSecondsPerKm)) fail("review-required");
  if (has(a, "manualCompletions") && !record(a.manualCompletions)) fail("invalid-authority");
  const current: AdaptationPlanEntry[] = [];
  const seen = new Set<string>();
  const start = Date.parse(`${input.windowStart}T00:00:00Z`);
  for (const session of a.plan.sessions) {
    if (!record(session) || !id(session.id) || seen.has(session.id) || !date(session.date)) fail("invalid-authority");
    seen.add(session.id);
    const when = Date.parse(`${session.date}T00:00:00Z`);
    if (when < start || when >= start + 7 * 86400000) continue;
    if (!id(session.templateId)) fail("invalid-authority");
    if ((has(session, "protected") && session.protected !== false) || (has(session, "completed") && session.completed !== false) ||
      (has(session, "status") && session.status !== "planned") || has(session, "movedFromDate") || has(session, "movedToDate") || has(session, "userOverride") ||
      (record(a.manualCompletions) && has(a.manualCompletions, session.id))) fail("protected-entry");
    current.push({ id: session.id, date: session.date, templateId: session.templateId, protected: false });
  }
  if (!Array.isArray(input.selections) || !input.selections.length || input.selections.length > 7) fail("invalid-selection");
  const selections: AdaptationSelection[] = [];
  const selectedDates = new Set<string>();
  for (const s of input.selections) {
    if (!record(s) || !keys(s, ["sessionId", "maxMinutes", "format"]) || !id(s.sessionId) || !positive(s.maxMinutes) || !record(s.format)) fail("invalid-selection");
    const original = current.find((entry) => entry.id === s.sessionId);
    if (!original || selectedDates.has(original.date)) fail("invalid-selection");
    selectedDates.add(original.date);
    if (s.format.kind === "easy" && keys(s.format, ["kind"])) selections.push({ sessionId: s.sessionId, maxMinutes: s.maxMinutes, format: { kind: "easy" } });
    else if (s.format.kind === "run_walk" && keys(s.format, ["kind", "templateId"]) && id(s.format.templateId)) selections.push({ sessionId: s.sessionId, maxMinutes: s.maxMinutes, format: { kind: "run_walk", templateId: s.format.templateId } });
    else fail("invalid-selection");
  }
  const review: Omit<AdaptationReview, "current" | "proposed"> = {
    accountId: a.accountId, revision: a.revision as number, raceGoalId: a.plan.raceGoalId,
    symptoms: c.symptoms as AdaptationReview["symptoms"],
    capacity: { confirmed: true, afterEffectsReviewed: true, daysPerWeek: capacity.daysPerWeek, longestMinutes: capacity.longestMinutes },
    restrictions: r as unknown as AdaptationReview["restrictions"], holds: a.holds,
  };
  const result = planRunningAdaptation({ review, current, selections, windowStart: input.windowStart,
    confirmedEasyPaceSecondsPerKm: c.confirmedEasyPaceSecondsPerKm as number | undefined });
  if (result.status !== "evaluated") fail(result.reason);
  if (result.preview.status !== "preview") fail(result.preview.reason);
  // A canonical duration/type that disagrees with its template is not permission
  // to increase it. Require reconciliation instead of trusting a catalogue estimate.
  for (const before of result.preview.before) {
    const canonical = a.plan.sessions.find((session) => record(session) && session.id === before.id);
    if (!record(canonical) || canonical.minutes !== before.minutes || canonical.kind !== before.kind) fail("invalid-authority");
  }
  return { preview: result.preview, plan: { raceGoalId: a.plan.raceGoalId, sessions: result.proposed } };
}

export { serverDomainLaunchSession } from "./runningLaunchServerDomain";
