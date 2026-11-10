/**
 * Weekly leagues in the app (Soc15 call 3): the documents the server
 * writes, read defensively, and what the card and the page say from them.
 *
 * The server owns every league document (functions/lib/leagues.js); the
 * app writes none. What it reads:
 *
 *   leagueStatus/current            how many have joined and trained in the
 *                                   last 14 days, and whether this week has
 *                                   groups (any signed-in person)
 *   leagueMembers/{uid}             the person's tier and this week's group
 *   leagueGroups/{id}/standings     the group's rows (its members only)
 *   users/{uid}/leagueResults       how each settled week went (the owner)
 */
import {
  addLocalDays,
  localDateString,
  parseLocalDate,
} from "@/lib/dateHelpers";
import { formatDayMonthLong } from "@/utils/formatters";
import {
  GROUP_MIN,
  isLeagueTier,
  normaliseTier,
  rankStandings,
  tierName,
  type LeagueTier,
} from "./leagueRules";

export interface LeagueStatus {
  /** People who joined and trained in the last 14 days. */
  joined: number;
  /** How many the league opens at. */
  needed: number;
  /** Whether this week has groups. */
  open: boolean;
  weekKey: string | null;
}

export interface LeagueMembership {
  tier: LeagueTier;
  groupId: string | null;
  weekKey: string | null;
}

export interface LeagueStanding {
  uid: string;
  /** The first word of their public name; null when they have none. */
  name: string | null;
  photo?: string;
  tier: LeagueTier;
  points: number;
  done: number;
  planned: number;
  reachedAt: unknown;
}

export type RankedStanding = LeagueStanding & { rank: number };

export type LeagueOutcome = "up" | "stay" | "down";

export interface LeagueResult {
  weekKey: string;
  tier: LeagueTier;
  newTier: LeagueTier;
  rank: number;
  of: number;
  points: number;
  outcome: LeagueOutcome;
}

const WEEK_KEY = /^\d{4}-\d{2}-\d{2}$/;

const count = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : 0;

const weekKeyOrNull = (value: unknown): string | null =>
  typeof value === "string" && WEEK_KEY.test(value) ? value : null;

export function parseStatus(data: unknown): LeagueStatus | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  return {
    joined: count(d.joined),
    needed: count(d.needed) || GROUP_MIN,
    open: d.open === true,
    weekKey: weekKeyOrNull(d.weekKey),
  };
}

export function parseMembership(data: unknown): LeagueMembership | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  return {
    tier: normaliseTier(d.tier),
    groupId: typeof d.groupId === "string" && d.groupId ? d.groupId : null,
    weekKey: weekKeyOrNull(d.weekKey),
  };
}

export function parseStanding(id: string, data: unknown): LeagueStanding {
  const d = (data && typeof data === "object" ? data : {}) as Record<
    string,
    unknown
  >;
  const name = typeof d.name === "string" && d.name.trim() ? d.name : null;
  const photo = typeof d.photo === "string" && d.photo ? d.photo : undefined;
  return {
    uid: id,
    name,
    ...(photo ? { photo } : {}),
    tier: normaliseTier(d.tier),
    points: count(d.points),
    done: count(d.done),
    planned: count(d.planned),
    reachedAt: d.reachedAt,
  };
}

export function parseResult(id: string, data: unknown): LeagueResult | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  const weekKey = weekKeyOrNull(d.weekKey) ?? weekKeyOrNull(id);
  const outcome = d.outcome;
  if (
    !weekKey ||
    !isLeagueTier(d.newTier) ||
    (outcome !== "up" && outcome !== "stay" && outcome !== "down")
  )
    return null;
  return {
    weekKey,
    tier: normaliseTier(d.tier),
    newTier: d.newTier,
    rank: count(d.rank),
    of: count(d.of),
    points: count(d.points),
    outcome,
  };
}

/** What the Social card shows. */
export type LeagueCardState =
  | { kind: "notJoined"; joined: number | null; needed: number; open: boolean }
  | { kind: "locked"; joined: number; needed: number }
  | { kind: "waiting"; tier: LeagueTier }
  | {
      kind: "inGroup";
      tier: LeagueTier;
      weekKey: string;
      me: RankedStanding;
      ranked: RankedStanding[];
    };

export function leagueCardState({
  uid,
  optedIn,
  status,
  member,
  standings,
}: {
  uid: string;
  optedIn: boolean;
  status: LeagueStatus | null;
  member: LeagueMembership | null;
  standings: readonly LeagueStanding[];
}): LeagueCardState {
  const needed = status?.needed ?? GROUP_MIN;
  if (!optedIn) {
    return {
      kind: "notJoined",
      joined: status ? status.joined : null,
      needed,
      open: status?.open ?? false,
    };
  }
  if (member?.groupId && member.weekKey) {
    const ranked = rankStandings(standings);
    const me = ranked.find((s) => s.uid === uid);
    if (me) {
      return {
        kind: "inGroup",
        tier: member.tier,
        weekKey: member.weekKey,
        me,
        ranked,
      };
    }
  }
  if (status?.open) return { kind: "waiting", tier: member?.tier ?? "bronze" };
  return { kind: "locked", joined: status?.joined ?? 0, needed };
}

/** The locked league's line: how many have joined, or when it opens. */
export function lockedLine(joined: number, needed: number): string {
  if (joined >= needed)
    return `Leagues start on Monday. ${joined} people have joined.`;
  if (!showsJoinedCount(joined))
    return `Leagues open when ${needed} people have joined.`;
  return `Leagues open when ${needed} people have joined. ${joined} so far.`;
}

/** The fewest people joined that the waiting league counts aloud (Soc16):
 *  "1 so far" only says the room is empty. */
export const LEAGUE_JOINED_MIN_VISIBLE = 3;

/** Whether the waiting league says how many have joined, and draws its
 *  bar of them. */
export function showsJoinedCount(joined: number): boolean {
  return joined >= LEAGUE_JOINED_MIN_VISIBLE;
}

/** "3 of 4 sessions". */
export function sessionsLine(done: number, planned: number): string {
  return `${done} of ${planned} ${planned === 1 ? "session" : "sessions"}`;
}

/** "75 points", "1 point". */
export function pointsLine(points: number): string {
  return `${points} ${points === 1 ? "point" : "points"}`;
}

/** When the member's week ends where they are: the local midnight that
 *  starts the Monday after its own. */
export function leagueWeekEnd(weekKey: string): Date {
  return addLocalDays(parseLocalDate(weekKey), 7);
}

/** The card's short line: "Ends Sunday", or "Ends tonight" on the day. */
export function endsLine(weekKey: string, now: Date = new Date()): string {
  const sunday = localDateString(addLocalDays(parseLocalDate(weekKey), 6));
  return localDateString(now) === sunday ? "Ends tonight" : "Ends Sunday";
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** The page's countdown: "Ends in 2 days 4 h", "Ends in 5 h 12 min",
 *  "Ends in 9 min". */
export function countdownLine(weekKey: string, now: Date = new Date()): string {
  const left = leagueWeekEnd(weekKey).getTime() - now.getTime();
  if (left <= 0) return "Week over. Results on Monday.";
  const days = Math.floor(left / DAY);
  const hours = Math.floor((left % DAY) / HOUR);
  const minutes = Math.floor((left % HOUR) / 60_000);
  if (days >= 1)
    return `Ends in ${days} ${days === 1 ? "day" : "days"} ${hours} h`;
  if (hours >= 1) return `Ends in ${hours} h ${minutes} min`;
  return `Ends in ${Math.max(1, minutes)} min`;
}

/** "Week of 26 October". */
export function weekOfLine(weekKey: string): string {
  return `Week of ${formatDayMonthLong(parseLocalDate(weekKey))}`;
}

/** The reveal's headline, as the Monday notification words it
 *  (leagueRules.resultMessage on the server). */
export function resultTitle(
  result: Pick<LeagueResult, "outcome" | "newTier">
): string {
  const name = tierName(result.newTier);
  if (result.outcome === "up") return `You moved up to ${name}`;
  if (result.outcome === "down") return `You moved down to ${name}`;
  return `You stayed in ${name}`;
}
