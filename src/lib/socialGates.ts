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
 * count means (e.g. "active follows", "leaderboard cohort").
 * Keeping the meaning at the call site keeps this module dependency-free and
 * trivially testable.
 */

/**
 * Researched activation thresholds. A surface stays dormant (or shows an
 * aspirational placeholder) below its threshold and activates at-or-above it.
 */
export const SOCIAL_GATES = {
  /** Follow-graph "built" threshold. SOC-P1b softened this from a hard
   *  render gate to progress framing: the following list renders from the
   *  FIRST follow (hiding real activity behind "Follow 3+ to unlock" was
   *  a locked door in front of content that existed), and below this
   *  threshold the feed shows a "Following N of 3" progress row instead
   *  of the standard empty state. */
  FOLLOWING_FEED_MIN_FOLLOWS: 3,
  /** A vs-others leaderboard only renders for a cohort of ≥20 — small
   *  cohorts make rank meaningless and expose individuals. */
  LEADERBOARD_MIN_COHORT: 20,
  /** A challenge percentile line ("top 40% this month") shows only once the
   *  challenge has ≥50 participants; below that, personal progress only. */
  CHALLENGE_PERCENTILE_MIN_PARTICIPANTS: 50,
} as const;

/** True once the follow graph is "built" (≥3 follows). SOC-P1b: no longer
 *  a render gate — drives the progress-row vs standard-empty-state choice
 *  in FeedView. The list itself renders from the first follow. */
export function shouldShowFollowingFeed(activeFollowCount: number): boolean {
  return activeFollowCount >= SOCIAL_GATES.FOLLOWING_FEED_MIN_FOLLOWS;
}

/** SOC-P1b: the following ACTIVITY list renders from the FIRST follow.
 *  The old ≥3 hard gate hid real activity a user's first follows had
 *  already produced. 0 follows never reaches this predicate in practice
 *  (SoloFirstFeed owns that branch), but it answers honestly anyway. */
export function shouldRenderFollowingList(activeFollowCount: number): boolean {
  return activeFollowCount > 0;
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
 * global challenge → share-your-training → spaces row) instead of any
 * empty network feed.
 *
 * Solo = no active partner bonds. (The crew half of this predicate
 * retired with crews, 2026-07-20 — Spaces have no per-user membership
 * threshold.) Follows do NOT factor in here: a user who follows people
 * but has no partners still gets the curated layout (their following
 * feed activates separately via `shouldShowFollowingFeed`).
 */
export function isSoloUser(params: { partnerCount: number }): boolean {
  return params.partnerCount === 0;
}
