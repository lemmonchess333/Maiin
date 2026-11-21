/**
 * Social at small numbers (App1 Q6). The owner, 18 November 2026, on
 * whether leagues, challenges and Spaces should wait for enough people:
 * "Show them, say filling up". Each is drawn from a person's first day,
 * however few people are in it, Join included, and a room that is still
 * small says so in plain words rather than showing a number that reads
 * as an empty room or keeping quiet about it.
 *
 * A room counts its people aloud from a floor, and under it says
 * FILLING_UP in the number's place:
 *
 *   challenge   its `participantCount` (kept by the server's participant
 *               triggers), from PEOPLE_COUNT_MIN_VISIBLE: "12 joined"
 *   Space       its members (a count the server answers), from
 *               `SPACE_MEMBER_COUNT_MIN_VISIBLE`: "12 members"
 *   league      the one room that cannot run small: the server makes no
 *               group under `GROUP_MIN`, so it says what it starts at, and
 *               from `LEAGUE_JOINED_MIN_VISIBLE` how many are in so far
 *               ("The league starts once 10 people have joined. 4 so
 *               far.", `lockedLine` in features/league/league.ts)
 *
 * Every number is one the server already counts. A count that is not known
 * yet, or could not be read, says nothing: "Filling up" is a claim about
 * the room, so it waits for the count as a figure would. Nothing is
 * estimated, and no activity is shown that did not happen (Strava shows a
 * club's real member count however small; Duolingo shows the leaderboard
 * before it opens, with what it takes to start).
 */

/** What a small room says in its count's place. */
export const FILLING_UP = "Filling up";

/** The fewest people a challenge counts aloud (Soc16): "1 joined" only
 *  says the room is empty. The league's joined count and the community
 *  goal's runners keep the same 3 under their own names. */
export const PEOPLE_COUNT_MIN_VISIBLE = 3;

/**
 * What a room says about how many are in it: the count from `floor`,
 * "fillingUp" under it, and null while the count is unknown (still being
 * read, a read that failed, or a field that is not a count).
 */
export function roomPeople(
  count: unknown,
  floor: number
): { count: number } | "fillingUp" | null {
  if (typeof count !== "number" || !Number.isFinite(count) || count < 0)
    return null;
  const whole = Math.floor(count);
  return whole >= floor ? { count: whole } : "fillingUp";
}
