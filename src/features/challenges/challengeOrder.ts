/** The month's rotating featured goal, by the id prefix its server
 *  definition stamps (functions/lib/challengeDefs.js). */
export function isFeaturedChallenge(challenge: { id: string }): boolean {
  return challenge.id.startsWith("featured-monthly-");
}

/** Put the rotating monthly goal first without rearranging the core goals. */
export function featuredChallengesFirst<T extends { id: string }>(
  challenges: readonly T[]
): T[] {
  return [
    ...challenges.filter(isFeaturedChallenge),
    ...challenges.filter((challenge) => !isFeaturedChallenge(challenge)),
  ];
}
