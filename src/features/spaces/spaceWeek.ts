/**
 * A Space's week in totals (Run27 call 11): "38 members trained this week:
 * 127 sessions, 412 km", figures that name no one.
 *
 * The server counts it (`spaces/{spaceId}/weeks/{weekKey}`,
 * functions/lib/spaceWeeks.js): how many members saved a counted session
 * that week, their sessions and their metres, each member's week counted
 * from their saved sessions as the league counts them. The app reads the
 * stored figures and never sums anything itself. While fewer than
 * SPACE_WEEK_MIN_MEMBERS members trained the server stores no figure, and
 * this reads that as nothing to show.
 */
import { SPACE_MEMBER_COUNT_MIN_VISIBLE } from "./spaceDefs";
import {
  distanceIn,
  distanceUnitLabel,
  type DistanceUnit,
} from "@/lib/distanceUnits";

/**
 * Tropos heuristic: the server's SPACE_WEEK_MIN_MEMBERS, the floor a
 * Space's member count already has (Spc1c), so no number of people below
 * it shows anywhere in a Space. spaceWeekTotals.cross.test.ts pins it to
 * functions/lib/spaceWeeks.js.
 */
export const SPACE_WEEK_MIN_MEMBERS = SPACE_MEMBER_COUNT_MIN_VISIBLE;

export interface SpaceWeek {
  members: number;
  sessions: number;
  meters: number;
}

const count = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.round(v) : null;

/** The stored week, or null when there is nothing to show: no document, a
 *  quiet week, a malformed one, or fewer members than the floor. */
export function parseSpaceWeek(data: unknown): SpaceWeek | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (d.quiet === true) return null;
  const members = count(d.members);
  const sessions = count(d.sessions);
  const meters = count(d.meters);
  if (members === null || sessions === null || meters === null) return null;
  if (members < SPACE_WEEK_MIN_MEMBERS || sessions === 0) return null;
  return { members, sessions, meters };
}

/**
 * The line a Space shows for its week, in the viewer's unit, the members
 * as its subject: "38 members trained this week: 127 sessions, 412 km",
 * and the sessions alone in a week with no run distance ("12 members
 * trained this week: 41 sessions").
 */
export function spaceWeekLine(
  week: SpaceWeek | null,
  unit: DistanceUnit
): string | null {
  if (!week) return null;
  const sessions = `${week.sessions.toLocaleString()} ${
    week.sessions === 1 ? "session" : "sessions"
  }`;
  const head = `${week.members.toLocaleString()} members trained this week: ${sessions}`;
  const distance = Math.round(distanceIn(week.meters, unit));
  return distance < 1
    ? head
    : `${head}, ${distance.toLocaleString()} ${distanceUnitLabel(unit)}`;
}
