import { RUN_TEMPLATES } from "@/lib/workoutTemplates";

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const has = (value: Record<string, unknown>, key: string) => Object.prototype.hasOwnProperty.call(value, key);
function fail(code: string): never { throw Object.assign(new Error(code), { code }); }
/** Catalogue binding only. Authentication, holds, revision, review, date and
 * deletion checks belong to the enclosing server transaction. Never uses legacy. */
export function serverDomainLaunchSession(input: { authority: unknown; sessionId: unknown }) {
  const a = input.authority;
  if (!record(a) || !record(a.plan) || !Array.isArray(a.plan.sessions) || !record(a.constraints)) fail("invalid-authority");
  const matches = a.plan.sessions.filter(row => record(row) && row.id === input.sessionId);
  if (matches.length !== 1) fail("session-unavailable");
  const row = matches[0] as Record<string, unknown>;
  const allowed = ["id", "date", "templateId", "minutes", "kind", "completed", "protected", "status"];
  if (Object.keys(row).some(key => !allowed.includes(key)) ||
      (has(row, "completed") && row.completed !== false) || (has(row, "protected") && row.protected !== false) ||
      (has(row, "status") && row.status !== "planned") ||
      (record(a.manualCompletions) && has(a.manualCompletions, String(row.id)))) fail("session-protected");
  const template = RUN_TEMPLATES.find(candidate => candidate.id === row.templateId);
  if (!template || template.type !== "easy" || template.config.strides || template.config.targetDistanceKm || template.config.intervals || template.config.tempo)
    fail("unsupported-template");
  const kind = template.config.runWalk ? "run_walk" : "easy";
  if (row.kind !== kind || row.minutes !== template.estimatedDuration || !Number.isFinite(template.estimatedDuration) || template.estimatedDuration <= 0)
    fail("catalogue-mismatch");
  const capacity = a.constraints.capacity;
  const restrictions = a.constraints.restrictions;
  if (!record(capacity) || !record(restrictions) || typeof capacity.longestMinutes !== "number" || row.minutes > capacity.longestMinutes ||
      (restrictions.status === "specified" && (restrictions.noRunning || restrictions.unsupported ||
        (typeof restrictions.maxMinutes === "number" && row.minutes > restrictions.maxMinutes) ||
        (restrictions.runWalkOnly === true && kind !== "run_walk")))) fail("capacity-exceeded");
  return { id: row.id as string, date: row.date as string, templateId: template.id, minutes: template.estimatedDuration, kind };
}
