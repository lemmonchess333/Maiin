/**
 * Goal Spaces (GOALS-CORE-01) — pure shared contract.
 *
 * A Goal Space is a small, invite-only, goal-led social space — user-facing
 * name "Circle"; the private per-member side is a "Journey" ("Goals" in
 * user-facing copy). One schema serves every goal domain so race groups,
 * strength blocks and consistency resets never fork into separate systems.
 *
 * Locked decisions (plan-file row GsPb1, 2026-07-10):
 *   - naming: "Goals"/"Circle" user-facing, `GoalSpace` internal
 *   - entitlement: FREE at launch
 *   - moderation: invite-only, 2–8 members, NO public discovery, NO DMs,
 *     strict summary-only event allowlist, blocked pairs can never share a
 *     Circle, owner can remove members
 *   - launch templates: Strength Block, Race Journey, Consistency Reset
 *     (body_composition stays in the schema, gets NO launch template until
 *     a privacy review)
 *
 * Privacy contract (audit 2026-07-10, unchanged): raw photos, calories,
 * macros, bodyweight, GPS and workout loads never enter Circle documents.
 * Events are summary-only, from a closed kind allowlist, with one bounded
 * free-text note.
 *
 * Storage boundary (server-owned; clients cannot write any of it):
 *   users/{uid}/journeys/{spaceId}   owner-only membership pointer + private why
 *   goalSpaces/{spaceId}             safe shared metadata only
 *   goalSpaces/{spaceId}/members/{uid}   server-managed membership
 *   goalSpaces/{spaceId}/events/{eventId} allowlisted summary events
 *   goalSpaceInvites/{code}          server-only (clients never read invites)
 *
 * This module is PURE (no Firebase imports) so the same contract is unit-
 * testable and mirrorable by `functions/lib/goalSpaceModel.js` — keep the
 * two in sync (parity pinned by goalSpaceModel.parity.cross.test.ts).
 */

export type GoalSpaceType =
  | "race"
  | "strength_block"
  | "body_composition"
  | "nutrition_consistency"
  | "hybrid";

/** v1 is invite-only; "private" reserves a future solo->shared upgrade. */
export type GoalSpaceVisibility = "invite_only" | "private";

export type GoalSpaceRole = "owner" | "member";

/** Closed event allowlist — the ONLY kinds a Circle stream accepts. */
export const GOAL_SPACE_EVENT_KINDS = [
  "joined",
  "weekly_check_in",
  "session_completed",
  "milestone",
  "needs_support",
  "routine_shared",
] as const;

export type GoalSpaceEventKind = (typeof GOAL_SPACE_EVENT_KINDS)[number];

/** Hard capacity — locked (2–8 people; the owner counts). */
export const GOAL_SPACE_MAX_MEMBERS = 8;

/** Invite lifetime. 7 days: long enough to reach a friend who opens the
 *  app weekly, short enough that a leaked link goes stale. */
export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Bounded free-text limits (server enforces the same numbers). */
export const MAX_TITLE_LENGTH = 60;
export const MAX_EVENT_NOTE_LENGTH = 140;
export const MAX_WHY_LENGTH = 120;

export interface GoalSpace {
  id: string;
  type: GoalSpaceType;
  /** Bounded display title, e.g. "8-week strength block". */
  title: string;
  visibility: GoalSpaceVisibility;
  ownerId: string;
  /** Server-owned counter — clients can never write it. */
  memberCount: number;
  maxMembers: number;
  /** ISO timestamp. */
  createdAt: string;
  /** false = archived (owner left with no successor, or explicitly ended). */
  active: boolean;
}

export interface GoalSpaceMember {
  uid: string;
  role: GoalSpaceRole;
  /** Safe display projection — never a live join to the private profile. */
  displayName: string;
  photoURL: string | null;
  /** ISO timestamp. */
  joinedAt: string;
}

export interface GoalSpaceEvent {
  id: string;
  kind: GoalSpaceEventKind;
  authorUid: string;
  authorName: string;
  /** Bounded, optional, plain text. Never numbers-as-data: no calories,
   *  weights, loads or distances are parsed from or encoded in it. */
  note: string;
  /** ISO timestamp. */
  createdAt: string;
}

/** The private per-member side. Doc id == spaceId (one journey per
 *  membership) so membership listing is a plain subcollection read. */
export interface Journey {
  spaceId: string;
  type: GoalSpaceType;
  /** Private motivation — NEVER copied into shared documents. */
  why: string;
  role: GoalSpaceRole;
  /** ISO timestamp. */
  joinedAt: string;
}

/* ── Launch templates (locked: exactly these three) ─────────────────── */

export interface CircleTemplate {
  type: GoalSpaceType;
  /** User-facing template name shown in the create sheet. */
  label: string;
  /** Seed title, editable before create. */
  defaultTitle: string;
  /** One-line supportive description. */
  description: string;
}

export const CIRCLE_TEMPLATES: readonly CircleTemplate[] = [
  {
    type: "strength_block",
    label: "Strength Block",
    defaultTitle: "8-week strength block",
    description: "Train your block together — planned lifts, PR milestones.",
  },
  {
    type: "race",
    label: "Race Journey",
    defaultTitle: "Race day crew",
    description: "Prep for a race with people who'll keep you honest.",
  },
  {
    type: "nutrition_consistency",
    label: "Consistency Reset",
    defaultTitle: "Consistency reset",
    description: "Build the logging habit — check-ins, never calorie scores.",
  },
] as const;

/* ── Pure validators (mirrored server-side) ─────────────────────────── */

export function isGoalSpaceType(v: unknown): v is GoalSpaceType {
  return (
    v === "race" ||
    v === "strength_block" ||
    v === "body_composition" ||
    v === "nutrition_consistency" ||
    v === "hybrid"
  );
}

export function isGoalSpaceEventKind(v: unknown): v is GoalSpaceEventKind {
  return (
    typeof v === "string" &&
    (GOAL_SPACE_EVENT_KINDS as readonly string[]).includes(v)
  );
}

/** Trim, strip control chars, collapse inner whitespace runs, cap length.
 *  Returns "" for non-strings — callers treat "" as absent. */
export function cleanBoundedText(v: unknown, maxLength: number): string {
  if (typeof v !== "string") return "";
  return (
    v
      // eslint-disable-next-line no-control-regex -- deliberately stripping control chars
      .replace(/[\x00-\x1f\x7f]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, maxLength)
  );
}

/** A space accepts a new member iff active and under capacity. */
export function canAcceptMember(space: {
  active: boolean;
  memberCount: number;
  maxMembers: number;
}): boolean {
  return (
    space.active &&
    space.memberCount < Math.min(space.maxMembers, GOAL_SPACE_MAX_MEMBERS)
  );
}

/** Invite validity — pure so both sides agree on the expiry semantics.
 *  `expiresAtMs` is the stored epoch-ms; `nowMs` injected for testability. */
export function isInviteUsable(
  invite: { expiresAtMs: number; revoked?: boolean },
  nowMs: number
): boolean {
  return !invite.revoked && nowMs < invite.expiresAtMs;
}

/** Weekly check-in dedupe key — local Monday-anchored week of the given
 *  date, "YYYY-MM-DD" of that Monday. Matches the partner-streak mirror's
 *  Monday-week convention (NOT the Sunday getWeekKey). */
export function checkinWeekKey(d: Date): string {
  const day = d.getDay(); // 0=Sun..6=Sat
  const diffToMonday = day === 0 ? 6 : day - 1;
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  monday.setDate(monday.getDate() - diffToMonday);
  const y = monday.getFullYear();
  const m = String(monday.getMonth() + 1).padStart(2, "0");
  const dd = String(monday.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

/* ── Event display copy (shared so feed rows read consistently) ─────── */

export function eventKindLabel(kind: GoalSpaceEventKind): string {
  switch (kind) {
    case "joined":
      return "joined the circle";
    case "weekly_check_in":
      return "checked in for the week";
    case "session_completed":
      return "completed a planned session";
    case "milestone":
      return "hit a milestone";
    case "needs_support":
      return "would appreciate a nudge";
    case "routine_shared":
      return "shared a routine";
  }
}

export function goalSpaceTypeLabel(type: GoalSpaceType): string {
  switch (type) {
    case "race":
      return "Race";
    case "strength_block":
      return "Strength";
    case "body_composition":
      return "Body";
    case "nutrition_consistency":
      return "Consistency";
    case "hybrid":
      return "Hybrid";
  }
}
