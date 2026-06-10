/**
 * Social density gates (SOCIAL S4).
 *
 * Network features only earn their place on the Social tab once there's
 * enough density behind them — otherwise they render as empty shells, which
 * the S4 audit identified as "the empty states are the page". Every
 * threshold the spec researched lives HERE, in one module, so they're
 * tunable without hunting call sites and pinned by unit tests.
 *
 * The functions are pure predicates over counts — the CALLER decides what a
 * count means (e.g. "active follows", "crew members", "leaderboard cohort").
 * Keeping the meaning at the call site keeps this module dependency-free and
 * trivially testable.
 */

/**
 * Researched activation thresholds. A surface stays dormant (or shows an
 * aspirational placeholder) below its threshold and activates at-or-above it.
 */
export const SOCIAL_GATES = {
  /** Following feed needs ≥3 active accounts before it's worth rendering —
   *  below that it's a near-empty list that reads as broken. */
  FOLLOWING_FEED_MIN_FOLLOWS: 3,
  /** A crew surface (member list, crew feed, crew leaderboard) activates at
   *  ≥3 members; below that the user sees the aspirational invite row. */
  CREW_ACTIVATION_MIN_MEMBERS: 3,
  /** A vs-others leaderboard only renders for a cohort of ≥20 — small
   *  cohorts make rank meaningless and expose individuals. */
  LEADERBOARD_MIN_COHORT: 20,
  /** A challenge percentile line ("top 40% this month") shows only once the
   *  challenge has ≥50 participants; below that, personal progress only. */
  CHALLENGE_PERCENTILE_MIN_PARTICIPANTS: 50,
} as const;

/** Following feed is worth rendering once the user follows ≥3 active accounts. */
export function shouldShowFollowingFeed(activeFollowCount: number): boolean {
  return activeFollowCount >= SOCIAL_GATES.FOLLOWING_FEED_MIN_FOLLOWS;
}

/**
 * True once the user's crew has enough members to show real crew surfaces;
 * false means render the single aspirational invite row instead.
 * `crewMemberCount` is the member count of the user's crew (0 when not in one).
 */
export function shouldShowCrewSurface(crewMemberCount: number): boolean {
  return crewMemberCount >= SOCIAL_GATES.CREW_ACTIVATION_MIN_MEMBERS;
}

/**
 * A vs-others leaderboard renders only for a cohort of ≥20. When this is
 * true the leaderboard must STILL be percentile / neighbourhood-framed (the
 * threshold gates visibility; the framing is a separate, always-on rule).
 */
export function shouldShowLeaderboard(cohortSize: number): boolean {
  return cohortSize >= SOCIAL_GATES.LEADERBOARD_MIN_COHORT;
}

/**
 * The challenge percentile line shows only once a challenge has ≥50
 * participants. Below that, show personal progress against the target only.
 */
export function shouldShowChallengePercentile(
  participantCount: number
): boolean {
  return participantCount >= SOCIAL_GATES.CHALLENGE_PERCENTILE_MIN_PARTICIPANTS;
}

/**
 * A "solo" user gets the solo-first curated layout (PartnerStreak hero →
 * global challenge → share-your-training → aspirational crew row) instead of
 * any empty network feed.
 *
 * Solo = no active partner bonds AND no ACTIVATED crew. The spec's "0 crew
 * members" maps to "crew not activated" because a sub-threshold crew (<3
 * members) only ever shows the aspirational row anyway — there is no rich
 * crew surface to fall back to, so such a user is still solo for layout
 * purposes. Follows do NOT factor in here: a user who follows people but has
 * no partners/crew still gets the curated layout (their following feed
 * activates separately via `shouldShowFollowingFeed`).
 */
export function isSoloUser(params: {
  partnerCount: number;
  crewMemberCount: number;
}): boolean {
  return (
    params.partnerCount === 0 && !shouldShowCrewSurface(params.crewMemberCount)
  );
}
