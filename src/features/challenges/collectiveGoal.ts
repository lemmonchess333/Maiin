import type { ChallengeParticipant } from "./useChallenges";

/**
 * The community goal's running total: every loaded participant's figure,
 * added up. The board is the top of the leaderboard the page has loaded,
 * so this is the figure the card shows, not a server count.
 */
export function collectiveTotal(
  leaderboard: readonly Pick<ChallengeParticipant, "currentValue">[] = []
): number {
  return leaderboard.reduce((sum, p) => sum + (p.currentValue || 0), 0);
}

/**
 * Whether Together shows the community goal: only once it has a target
 * and someone has moved it. "0 of 1,000 km" over an empty bar says
 * nobody is here, which is the opposite of what the card is for, so a
 * goal nobody has added to yet is not shown at all.
 */
export function showsCollectiveGoal(
  target: number | undefined,
  leaderboard: readonly Pick<ChallengeParticipant, "currentValue">[] = []
): boolean {
  return (target ?? 0) > 0 && collectiveTotal(leaderboard) > 0;
}
