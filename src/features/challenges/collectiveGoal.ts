import type { Challenge } from "./useChallenges";

/** The community goal's fields, as the server keeps them on its doc. */
export type CollectiveGoalSource = Pick<
  Challenge,
  "collectiveTarget" | "collectiveMeters" | "collectiveRunners"
>;

/**
 * The community goal's total, in kilometres: every saved run in the
 * goal's month, joined or not, added up by the server
 * (functions/lib/communityGoal.js) and kept on the challenge doc in whole
 * metres. Not a sum of the loaded board, which holds only the people who
 * joined, and only the top of them.
 */
export function collectiveTotal(
  challenge?: Pick<CollectiveGoalSource, "collectiveMeters"> | null
): number {
  const meters = Number(challenge?.collectiveMeters);
  return Number.isFinite(meters) && meters > 0 ? meters / 1000 : 0;
}

/** The fewest runners the community goal counts aloud (Soc16): "1 runner"
 *  only says the room is empty, while the total still moves. */
export const COLLECTIVE_RUNNERS_MIN_VISIBLE = 3;

/** How many people have a run in the community goal's total. */
export function collectiveRunners(
  challenge?: Pick<CollectiveGoalSource, "collectiveRunners"> | null
): number {
  const runners = Number(challenge?.collectiveRunners);
  return Number.isInteger(runners) && runners > 0 ? runners : 0;
}

/**
 * Whether Together shows the community goal: only once it has a target
 * and someone has run towards it. "0 of 1,000 km" over an empty bar says
 * nobody is here, which is the opposite of what the card is for, so a
 * goal nobody has added to yet is not shown at all.
 */
export function showsCollectiveGoal(
  challenge?: CollectiveGoalSource | null
): boolean {
  return (
    (challenge?.collectiveTarget ?? 0) > 0 && collectiveTotal(challenge) > 0
  );
}
