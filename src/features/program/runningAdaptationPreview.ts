/** Review-only contract. Not imported by app writers: activation requires a
 * server-authoritative revision/hold check and legacy-client protection.
 * No symptoms, body location, logged workout or negative screen grants clearance.
 */
export interface AdaptationSession {
  id: string;
  date: string;
  minutes: number;
  kind: "easy" | "run_walk" | "quality" | "long";
}

export interface AdaptationReview {
  accountId: string;
  revision: number;
  symptoms: "none" | "during_or_after" | "daily_activities" | "concerning" | "unknown";
  capacity: { confirmed: boolean; afterEffectsReviewed: boolean; daysPerWeek: number; longestMinutes: number };
  restrictions:
    | { status: "none" | "unknown" }
    | { status: "specified"; source: "clinician"; noRunning: boolean; maxMinutes?: number; maxDays?: number; easyOnly?: boolean; runWalkOnly?: boolean; unsupported?: boolean };
  /** Independent reasons. Applying a proposal can never clear these. */
  holds: readonly string[];
  current: readonly AdaptationSession[];
  proposed: readonly AdaptationSession[];
  /** Exact preserved goal identity, not a claim of race readiness. */
  raceGoalId: string | null;
}

type Blocker = "review_symptoms" | "review_capacity" | "review_restrictions" | "running_paused" | "invalid_draft" | "exceeds_limits";
export type AdaptationPreview =
  | { status: "blocked"; reason: Blocker; alternative: "pause_or_review" }
  | {
      status: "preview";
      accountId: string;
      revision: number;
      before: AdaptationSession[];
      after: AdaptationSession[];
      days: { before: number; after: number };
      longestMinutes: { before: number; after: number };
      removedIds: string[];
      changedIds: string[];
      raceGoalId: string | null;
      raceImpact: "review_required" | "no_race_goal";
      applyAvailable: false;
    };

const days = (sessions: readonly AdaptationSession[]) => new Set(sessions.map((s) => s.date)).size;
const longest = (sessions: readonly AdaptationSession[]) => Math.max(0, ...sessions.map((s) => s.minutes));
const positive = (n: number) => Number.isFinite(n) && n > 0;
const validDays = (n: number) => Number.isInteger(n) && n >= 1 && n <= 7;
function validSessions(sessions: readonly AdaptationSession[]): boolean {
  return new Set(sessions.map((s) => s.id)).size === sessions.length && sessions.every((s) => {
    const parsed = new Date(`${s.date}T00:00:00Z`);
    return !!s.id && positive(s.minutes) && ["easy", "run_walk", "quality", "long"].includes(s.kind)
      && /^\d{4}-\d{2}-\d{2}$/.test(s.date) && Number.isFinite(parsed.getTime())
      && parsed.toISOString().slice(0, 10) === s.date;
  });
}

/** Evaluate one actual, bounded seven-day draft supplied by a planner. This
 * function neither creates rehabilitation prescriptions nor changes schedules.
 * It deliberately refuses additions, increases, and silently rescheduled runs.
 */
export function previewRunningAdaptation(review: AdaptationReview): AdaptationPreview {
  const blocked = (reason: Blocker): AdaptationPreview => ({ status: "blocked", reason, alternative: "pause_or_review" });
  const r = review.restrictions;
  if (review.holds.length || (r.status === "specified" && r.noRunning)) return blocked("running_paused");
  if (["daily_activities", "concerning", "unknown"].includes(review.symptoms)) return blocked("review_symptoms");
  if (r.status === "unknown" || (r.status === "specified" && (r.source !== "clinician" || r.unsupported ||
    (r.maxMinutes !== undefined && !positive(r.maxMinutes)) ||
    (r.maxDays !== undefined && !validDays(r.maxDays))))) return blocked("review_restrictions");
  // A checkbox that guidance exists is not enough: require a representable limit.
  if (review.symptoms === "during_or_after" && (r.status !== "specified" ||
    !(r.maxMinutes || r.maxDays || r.easyOnly || r.runWalkOnly))) return blocked("review_restrictions");
  const c = review.capacity;
  if (!c.confirmed || !c.afterEffectsReviewed || !validDays(c.daysPerWeek) || !positive(c.longestMinutes)) return blocked("review_capacity");
  if (!review.accountId || !Number.isSafeInteger(review.revision) || review.revision < 0 || !review.current.length || !review.proposed.length ||
    !validSessions(review.current) || !validSessions(review.proposed)) return blocked("invalid_draft");
  const dates = review.current.map((s) => Date.parse(`${s.date}T00:00:00Z`));
  if (Math.max(...dates) - Math.min(...dates) >= 7 * 86400000) return blocked("invalid_draft");
  const originals = new Map(review.current.map((s) => [s.id, s]));
  if (review.proposed.some((s) => {
    const old = originals.get(s.id);
    return !old || old.date !== s.date || s.minutes > old.minutes ||
      (old.kind !== s.kind && s.kind !== "easy" && s.kind !== "run_walk");
  })) return blocked("invalid_draft");
  const maxMinutes = Math.min(c.longestMinutes, r.status === "specified" ? r.maxMinutes ?? Infinity : Infinity);
  const maxDays = Math.min(c.daysPerWeek, r.status === "specified" ? r.maxDays ?? 7 : 7);
  if (longest(review.proposed) > maxMinutes || days(review.proposed) > maxDays ||
    (r.status === "specified" && review.proposed.some((s) =>
      (r.easyOnly && s.kind !== "easy" && s.kind !== "run_walk") || (r.runWalkOnly && s.kind !== "run_walk")))) return blocked("exceeds_limits");
  return {
    status: "preview", accountId: review.accountId, revision: review.revision,
    before: review.current.map((s) => ({ ...s })), after: review.proposed.map((s) => ({ ...s })),
    days: { before: days(review.current), after: days(review.proposed) },
    longestMinutes: { before: longest(review.current), after: longest(review.proposed) },
    removedIds: review.current.filter((s) => !review.proposed.some((p) => p.id === s.id)).map((s) => s.id),
    changedIds: review.proposed.filter((s) => { const old = originals.get(s.id)!; return s.minutes !== old.minutes || s.kind !== old.kind; }).map((s) => s.id),
    raceGoalId: review.raceGoalId, raceImpact: review.raceGoalId ? "review_required" : "no_race_goal",
    applyAvailable: false,
  };
}
