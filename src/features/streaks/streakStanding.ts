/**
 * What the streak's count stands against (DS5 rule 46, DESIGN_GUIDE
 * §14n): the person's longest streak, and the next tier with how far off
 * it is. The streak's sheet shows both; 8 of the 15 reference streak
 * screens showed one or the other, and Tropos's sheet showed neither.
 *
 * The tiers are the streak badges, 3 days to 365 (`threshold` in
 * `badges.ts`, which the server awards against): each has a name and its
 * own art, and a new account meets the first at three days. First Step's
 * threshold of 1 is a first log, not a tier. The next tier follows the
 * current streak, not the badges still to earn: someone whose longest ran
 * 40 days and who is 5 days into a new one is 2 days from Week Warrior,
 * which they already hold, and the sheet says so rather than pointing
 * them 55 days away.
 */
import { BADGE_DEFINITIONS, type BadgeDef } from "./badges";

/** The streak badges, shortest first. */
export const STREAK_TIERS: readonly BadgeDef[] = BADGE_DEFINITIONS.filter(
  (badge) => typeof badge.threshold === "number" && badge.threshold > 1
).sort((a, b) => (a.threshold ?? 0) - (b.threshold ?? 0));

export interface NextStreakTier {
  badge: BadgeDef;
  /** The tier's length, in days. */
  days: number;
  /** Days from the current streak to it, at least 1. */
  toGo: number;
  /** The person already holds its badge, from an earlier streak. */
  earned: boolean;
}

export interface StreakStanding {
  /** The longest streak, never shorter than the current one. */
  longest: number;
  /** The current streak is the longest (and is under way). */
  isLongest: boolean;
  /** The next tier above the current streak; none past the last. */
  next: NextStreakTier | null;
  /** The last tier, once the current streak has reached it; else none. */
  lastTier: { badge: BadgeDef; earned: boolean } | null;
}

function days(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : 0;
}

export function streakStanding(
  currentStreak: unknown,
  longestStreak: unknown,
  earnedBadgeIds: ReadonlySet<string>
): StreakStanding {
  const current = days(currentStreak);
  const longest = Math.max(current, days(longestStreak));
  const tier = STREAK_TIERS.find((t) => (t.threshold ?? 0) > current);
  const last = STREAK_TIERS[STREAK_TIERS.length - 1];
  return {
    longest,
    isLongest: current > 0 && current >= longest,
    next: tier
      ? {
          badge: tier,
          days: tier.threshold ?? 0,
          toGo: (tier.threshold ?? 0) - current,
          earned: earnedBadgeIds.has(tier.id),
        }
      : null,
    lastTier:
      !tier && last
        ? { badge: last, earned: earnedBadgeIds.has(last.id) }
        : null,
  };
}

function daysOf(n: number): string {
  return `${n} ${n === 1 ? "day" : "days"}`;
}

/** The band's words, shown and read as one sentence. */
export function standingLines(
  standing: StreakStanding,
  current: number
): { title: string; progress: string | null; best: string | null } {
  const { longest, isLongest, next, lastTier } = standing;
  const best = isLongest
    ? "This is your longest"
    : longest > 0
      ? `Longest ${daysOf(longest)}, ${daysOf(longest - current + 1)} to pass it`
      : null;
  if (next && !next.earned)
    return {
      title: `${next.badge.name} in ${daysOf(next.toGo)}`,
      progress: `${current} of ${daysOf(next.days)}`,
      best,
    };
  if (next)
    // Held from a longer streak: the badge is not what lies ahead, the
    // length is.
    return {
      title: `${daysOf(next.toGo)} to a ${next.days}-day streak`,
      progress: `${current} of ${daysOf(next.days)} · ${next.badge.name} already earned`,
      best,
    };
  return {
    title: lastTier?.badge.name ?? "",
    progress: lastTier?.earned ? "Already earned" : null,
    best,
  };
}
