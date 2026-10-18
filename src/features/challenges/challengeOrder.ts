/** Put the rotating monthly goal first without rearranging the core goals. */
export function featuredChallengesFirst<T extends { id: string }>(
  challenges: readonly T[]
): T[] {
  const isFeatured = (challenge: T) =>
    challenge.id.startsWith("featured-monthly-");
  return [
    ...challenges.filter(isFeatured),
    ...challenges.filter((challenge) => !isFeatured(challenge)),
  ];
}
