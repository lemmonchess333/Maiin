/**
 * Weekly leagues on the client (Soc15 call 3): the tiers, the order a
 * group ranks in and the size of its two zones, for the card's place and
 * the page's lines.
 *
 * The server decides all of it (functions/lib/leagueRules.js): it writes
 * each standing's points and settles the week. This is its copy of the
 * parts the app draws, so the line under the promotion zone sits where the
 * server will promote, and a place reads as the server will rank it;
 * __tests__/leagueRules.cross.test.ts pins the two equal.
 */

export const LEAGUE_TIERS = [
  "bronze",
  "silver",
  "gold",
  "platinum",
  "diamond",
] as const;

export type LeagueTier = (typeof LEAGUE_TIERS)[number];

/** The league opens, and no group is smaller, at this many people. */
export const GROUP_MIN = 10;

export function isLeagueTier(value: unknown): value is LeagueTier {
  return (
    typeof value === "string" &&
    (LEAGUE_TIERS as readonly string[]).includes(value)
  );
}

/** A stored tier, or Bronze for anything else. */
export function normaliseTier(value: unknown): LeagueTier {
  return isLeagueTier(value) ? value : "bronze";
}

/** "Bronze", "Silver" and so on. */
export function tierName(tier: LeagueTier): string {
  return tier.charAt(0).toUpperCase() + tier.slice(1);
}

/** A time as stored (a Firestore timestamp, a Date, ms or an ISO string),
 *  in ms; Infinity when there is none, so it ranks last among equals. */
export function reachedMillis(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value instanceof Date) return value.getTime();
  const ts = value as { toMillis?: () => number } | null | undefined;
  if (ts && typeof ts.toMillis === "function") return ts.toMillis();
  if (typeof value === "string") {
    const ms = Date.parse(value);
    if (Number.isFinite(ms)) return ms;
  }
  return Infinity;
}

export interface Rankable {
  uid: string;
  points: number;
  reachedAt?: unknown;
}

/** Standings in rank order, each with its 1-based `rank`: by points, then
 *  whoever reached them first, then the uid. */
export function rankStandings<T extends Rankable>(
  standings: readonly T[]
): (T & { rank: number })[] {
  return [...standings]
    .sort((a, b) => {
      const pa = Number(a.points) || 0;
      const pb = Number(b.points) || 0;
      if (pb !== pa) return pb - pa;
      const ra = reachedMillis(a.reachedAt);
      const rb = reachedMillis(b.reachedAt);
      if (ra !== rb) return ra < rb ? -1 : 1;
      return a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0;
    })
    .map((s, i) => ({ ...s, rank: i + 1 }));
}

/** How many at the top of a group of `n` move up. */
export function promotionCount(n: number): number {
  return n > 0 ? Math.ceil(n / 4) : 0;
}

/** How many at the bottom of a group of `n` move down. */
export function demotionCount(n: number): number {
  return n > 0 ? Math.floor(n / 4) : 0;
}

/** "1st", "2nd", "3rd", "4th", "11th", "22nd". */
export function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}
