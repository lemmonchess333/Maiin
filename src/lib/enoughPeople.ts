/**
 * Social at small numbers (App1 Q6, owner, 13 November 2026): "Feed,
 * follows and Circles work with ten people; leagues, challenges and Spaces
 * stay quiet until there are enough people to fill them."
 *
 * ENOUGH is the league's own number, `GROUP_MIN` (10, leagueRules.ts, the
 * server's copy pinned by leagueRules.cross.test.ts): the fewest people the
 * server makes a group from, and so the code's measure of how many people a
 * shared room needs. The three rooms open together at it. A challenge's
 * board is a group racing one goal, as a league group is, and below ten
 * people training a Space is a handful of members. The Spaces directory's 5
 * (`SPACE_MEMBER_COUNT_MIN_VISIBLE`) stays what it was, the fewest members a
 * Space's card counts aloud: as an opening rule it would open Spaces with
 * fewer than ten people, and a Space's member count never falls when its
 * members stop training.
 *
 * WHO COUNTS. The app cannot count people, so it reads the counts the server
 * already keeps, each of distinct people who trained on Tropos lately, and
 * takes the largest (each one misses someone, so the largest is the closest
 * to the truth):
 *
 *   challenges/group-goal-{YYYY-MM-01}.collectiveRunners
 *       everyone with a run in that month's community goal, joined or not
 *       (functions/lib/communityGoal.js); this month's and last month's, so
 *       the rooms do not close on the 1st while this month's fills
 *   leagueStatus/current.joined
 *       people in the league who trained in the last 14 days
 *       (functions/lib/leagues.js); the one count that holds lifters
 *
 * WHY NOT EACH ROOM'S OWN COUNT. A room's own count (a challenge's
 * participants, a Space's members, the league's joined) grows only from
 * people who join it, and nobody can join a room they cannot see, so a room
 * kept back by its own count would stay hidden for good. Every weekly and
 * monthly challenge also starts a new edition at 0.
 *
 * WHAT A PERSON KEEPS. Someone in a room keeps their way to it whatever the
 * count (`roomShown`): the league once they joined, a challenge they joined
 * (its row and its finale), a Space they joined. A Circle is never held back:
 * Circles work with ten people. A quiet room draws nothing, not a card
 * saying it is coming.
 */
import { GROUP_MIN } from "@/features/league/leagueRules";

/** The community goal's challenge ids for the UTC month `now` is in and the
 *  month before (`group-goal-…` in functions/lib/challengeDefs.js). */
export function communityGoalIds(now: Date): [string, string] {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const id = (date: Date) => `group-goal-${date.toISOString().slice(0, 10)}`;
  return [id(new Date(Date.UTC(y, m, 1))), id(new Date(Date.UTC(y, m - 1, 1)))];
}

/** The largest of the server's counts of people training lately; anything
 *  that is not a count (a missing document, a bad field) counts as 0. */
export function peopleTrainingLately(counts: readonly unknown[]): number {
  let most = 0;
  for (const value of counts) {
    if (typeof value === "number" && Number.isInteger(value) && value > most)
      most = value;
  }
  return most;
}

/** Whether Tropos has enough people training for its shared rooms. */
export function hasEnoughPeople(people: number): boolean {
  return people >= GROUP_MIN;
}

/**
 * Whether a league, a challenge or a Space shows: always to someone in it,
 * and to anyone else only once there are enough people (`enough` is null
 * while the count is being read, and nothing is offered until it is known).
 */
export function roomShown(inIt: boolean, enough: boolean | null): boolean {
  return inIt || enough === true;
}
