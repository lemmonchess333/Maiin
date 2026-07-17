/**
 * SOCIAL-FOCUS-01 — pure presentation helpers for the Circle weekly
 * focus. The schema contract (enum, event fields, parse guards) lives
 * in goalSpaceTypes.ts; this module owns the user-facing labels, the
 * Circle-type-aware ordering, the timeline copy, and the chosen-focus
 * pulse count. No Firestore, no React — unit-tested directly.
 */

import {
  WEEKLY_FOCUS_OPTIONS,
  type GoalSpaceEvent,
  type GoalSpaceType,
  type WeeklyFocus,
} from "./goalSpaceTypes";

/** Locked user-facing labels — one calm intention each, no metrics. */
export const WEEKLY_FOCUS_LABELS: Record<WeeklyFocus, string> = {
  strength: "Lift with intention",
  running: "Follow my run plan",
  nutrition: "Keep food logging steady",
  progress: "Make one private progress check-in",
  recovery: "Protect recovery",
  balanced: "Keep the week balanced",
};

/** The focus a Circle type most plausibly leads with. Ordering only —
 *  every focus stays offered for every Circle type (a race-prep member
 *  may still protect recovery; nothing safe is prohibited). */
const TYPE_LEAD_FOCUS: Record<GoalSpaceType, WeeklyFocus> = {
  race: "running",
  strength_block: "strength",
  nutrition_consistency: "nutrition",
  body_composition: "progress",
  hybrid: "balanced",
};

/** All six focuses, with the Circle-type-relevant one first and the
 *  rest in canonical enum order. */
export function orderWeeklyFocus(type: GoalSpaceType): WeeklyFocus[] {
  const lead = TYPE_LEAD_FOCUS[type];
  return [lead, ...WEEKLY_FOCUS_OPTIONS.filter((f) => f !== lead)];
}

/**
 * Timeline copy for a check-in event, rendered after the member's name:
 * "…is focusing on running this week." A focus-less check-in (every
 * pre-focus event included) keeps the original copy.
 */
export function checkInTimelineCopy(weeklyFocus: WeeklyFocus | null): string {
  if (weeklyFocus === null) return "checked in for the week";
  if (weeklyFocus === "balanced") return "is keeping the week balanced";
  return `is focusing on ${weeklyFocus} this week`;
}

/**
 * Chosen-focus pulse count for one week: how many distinct members set
 * a focus. Counts, not rankings — there is deliberately no per-focus
 * breakdown, no ordering by member, and no streak memory.
 */
export function countWeeklyFocusSet(
  events: GoalSpaceEvent[],
  weekKey: string
): number {
  const uids = new Set<string>();
  for (const e of events) {
    if (
      e.kind === "weekly_check_in" &&
      e.weekKey === weekKey &&
      e.weeklyFocus
    ) {
      uids.add(e.uid);
    }
  }
  return uids.size;
}
