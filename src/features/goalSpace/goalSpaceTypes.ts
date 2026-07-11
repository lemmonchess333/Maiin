/**
 * Goal Spaces (GOALS-CORE-01, slice 1) — the durable schema contract.
 *
 * One internal concept — a **Goal Space** — behind every shared goal:
 * a race cohort, an 8-week strength block, a nutrition-consistency
 * reset. User-facing naming (GsPb1 lock): "Goals" for the individual
 * journey, "Circle" for the shared space. This file is the contract
 * the rules, callables and UI all build against; get it wrong and the
 * migration cost lands on every future domain.
 *
 * Locked constraints (plan-file row GsPb1 + the audit's privacy
 * contract):
 *   - invite-only, max 8 members; NO public discovery, NO DMs
 *   - membership is server-owned (callables) — a client can never
 *     forge counts, another member's status, or event payloads
 *   - events are a strict six-kind allowlist, summary-only: raw
 *     photos, calories, macros, bodyweight, GPS and food diary data
 *     NEVER enter a Goal Space document (assertSafeEventPayload is
 *     the programmatic fence)
 *   - `Journey` (private intent) stays SEPARATE from `GoalSpace`
 *     (shared object): a member can run a block alone and invite a
 *     partner later without a data migration
 *   - profile.crewId is NOT reused — it's a single-membership legacy
 *     constraint; Goal Space membership is its own collection
 *   - free at launch — no entitlement gate in the schema
 *
 * Storage boundary (audit-recommended):
 *   users/{uid}/journeys/{journeyId}   owner-only private intent
 *   goalSpaces/{spaceId}               safe shared metadata only
 *   goalSpaces/{spaceId}/members/{uid} server-managed membership
 *   goalSpaces/{spaceId}/events/{id}   allowlisted summary events
 */

export type GoalSpaceType =
  | "race"
  | "strength_block"
  | "body_composition"
  | "nutrition_consistency"
  | "hybrid";

export type GoalSpaceVisibility = "invite_only" | "private";

/** The COMPLETE event allowlist. Adding a kind is a reviewed schema
 *  change, not a payload tweak. */
export const GOAL_SPACE_EVENT_KINDS = [
  "joined",
  "weekly_check_in",
  "session_completed",
  "milestone",
  "needs_support",
  "routine_shared",
] as const;

export type GoalSpaceEventKind = (typeof GOAL_SPACE_EVENT_KINDS)[number];

/** Locked: circles are 2–8 people. */
export const GOAL_SPACE_MAX_MEMBERS = 8;

/** Free-text bound for event notes and titles — short by design;
 *  a Circle is a support surface, not a chat room. */
export const GOAL_SPACE_TEXT_MAX = 200;

/** Launch templates (GsPb1): body_composition stays schema-only —
 *  private-first until a dedicated privacy review. */
export const LAUNCH_TEMPLATES: Array<{
  type: GoalSpaceType;
  label: string;
  description: string;
}> = [
  {
    type: "strength_block",
    label: "Strength Block",
    description: "A shared 4–12 week lifting focus with weekly check-ins.",
  },
  {
    type: "race",
    label: "Race Journey",
    description: "Training for the same event — plan consistency and support.",
  },
  {
    type: "nutrition_consistency",
    label: "Consistency Reset",
    description: "Support for logging consistently — never calories or meals.",
  },
];

export interface GoalSpace {
  id: string;
  type: GoalSpaceType;
  title: string;
  visibility: GoalSpaceVisibility;
  ownerId: string;
  /** Server-maintained; clients never write it. */
  memberCount: number;
  maxMembers: number;
  /** Optional finish line (race date / block end), YYYY-MM-DD. */
  targetDate: string | null;
  active: boolean;
  createdAt: number;
}

export interface GoalSpaceMember {
  uid: string;
  /** Safe display projection ONLY — never health data. */
  displayName: string;
  photoURL: string | null;
  role: "owner" | "member";
  joinedAt: number;
}

export interface GoalSpaceEvent {
  id: string;
  uid: string;
  kind: GoalSpaceEventKind;
  /** Bounded, optional note ("Would appreciate a nudge this week"). */
  text: string | null;
  /** Optional review-week key for weekly_check_in events. */
  weekKey: string | null;
  createdAt: number;
}

/** Private individual intent — owner-only, never shared as-is. */
export interface Journey {
  id: string;
  type: GoalSpaceType;
  title: string;
  /** The linked Circle, if the member invited anyone. */
  goalSpaceId: string | null;
  targetDate: string | null;
  createdAt: number;
}

// ── Privacy fence ────────────────────────────────────────────────

/** Field-name fragments that indicate raw health data. Any event
 *  payload containing one is rejected outright — the privacy contract
 *  is enforced in code, not just in review. */
const FORBIDDEN_FIELD_FRAGMENTS = [
  "calorie",
  "kcal",
  "macro",
  "protein",
  "carb",
  "fat",
  "weight",
  "bodyweight",
  "photo",
  "image",
  "url",
  "gps",
  "lat",
  "lng",
  "route",
  "location",
  "meal",
  "food",
];

const ALLOWED_EVENT_FIELDS = new Set([
  "id",
  "uid",
  "kind",
  "text",
  "weekKey",
  "createdAt",
]);

export interface EventPayloadCheck {
  ok: boolean;
  /** First violation, for logging — never user-facing. */
  reason?: string;
}

/**
 * The programmatic privacy fence: an event payload may contain ONLY
 * the allowlisted fields, a known kind, and bounded text. Anything
 * else — extra fields, forbidden field names, over-long notes —
 * is rejected before a write is attempted.
 */
export function checkEventPayload(
  payload: Record<string, unknown>
): EventPayloadCheck {
  for (const key of Object.keys(payload)) {
    if (!ALLOWED_EVENT_FIELDS.has(key)) {
      return { ok: false, reason: `unexpected field: ${key}` };
    }
    const lower = key.toLowerCase();
    if (FORBIDDEN_FIELD_FRAGMENTS.some((f) => lower.includes(f))) {
      return { ok: false, reason: `forbidden field: ${key}` };
    }
  }
  if (!GOAL_SPACE_EVENT_KINDS.includes(payload.kind as GoalSpaceEventKind)) {
    return { ok: false, reason: "unknown event kind" };
  }
  if (
    payload.text != null &&
    (typeof payload.text !== "string" ||
      payload.text.length > GOAL_SPACE_TEXT_MAX)
  ) {
    return { ok: false, reason: "text missing/over bound" };
  }
  return { ok: true };
}

// ── Boundary parse guards ────────────────────────────────────────

export function parseGoalSpace(data: unknown): GoalSpace | null {
  if (data == null || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  const typeValid =
    d.type === "race" ||
    d.type === "strength_block" ||
    d.type === "body_composition" ||
    d.type === "nutrition_consistency" ||
    d.type === "hybrid";
  if (
    typeof d.id !== "string" ||
    !typeValid ||
    typeof d.title !== "string" ||
    (d.visibility !== "invite_only" && d.visibility !== "private") ||
    typeof d.ownerId !== "string" ||
    typeof d.memberCount !== "number" ||
    typeof d.maxMembers !== "number" ||
    typeof d.active !== "boolean" ||
    typeof d.createdAt !== "number"
  ) {
    return null;
  }
  return {
    id: d.id,
    type: d.type as GoalSpaceType,
    title: d.title.slice(0, GOAL_SPACE_TEXT_MAX),
    visibility: d.visibility,
    ownerId: d.ownerId,
    memberCount: d.memberCount,
    maxMembers: Math.min(d.maxMembers, GOAL_SPACE_MAX_MEMBERS),
    targetDate: typeof d.targetDate === "string" ? d.targetDate : null,
    active: d.active,
    createdAt: d.createdAt,
  };
}

export function parseGoalSpaceEvent(data: unknown): GoalSpaceEvent | null {
  if (data == null || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (
    typeof d.id !== "string" ||
    typeof d.uid !== "string" ||
    !GOAL_SPACE_EVENT_KINDS.includes(d.kind as GoalSpaceEventKind) ||
    typeof d.createdAt !== "number"
  ) {
    return null;
  }
  return {
    id: d.id,
    uid: d.uid,
    kind: d.kind as GoalSpaceEventKind,
    text:
      typeof d.text === "string" ? d.text.slice(0, GOAL_SPACE_TEXT_MAX) : null,
    weekKey: typeof d.weekKey === "string" ? d.weekKey : null,
    createdAt: d.createdAt,
  };
}
