/**
 * The race a race plan names: its name, and its place in the race
 * catalogue (`raceGoal.eventSpaceId`, which binds the goal to that race's
 * Space and counts it in the race's plan group, `raceCohorts`). Both belong
 * to one distance, the one the race is run over.
 *
 * Choosing another distance in Run plan kept both: an Ultra 50K plan was
 * saved named "Bournemouth Half Marathon" (owner's recording, 23 November
 * 2026). The catalogue binding was already cleared by any distance edit;
 * the name was not. A distance that is not the race's own now takes the
 * race off the plan, name and binding, and says so. The date stays as the
 * plan's target date, since it is the day the person has in mind. Going
 * back to the race's distance puts the race back, its binding only while
 * the date is still the race's.
 */
import type { RaceDistance } from "@/features/program/programTypes";
import { raceDistanceInSentence } from "@/lib/runProgrammeViewModel";

export interface RaceLink {
  /** The race's name as typed or picked; "" for none. */
  name: string;
  /** The catalogue race it is bound to; "" for none. */
  spaceId: string;
  /** The distance the name and the binding belong to. */
  distance: RaceDistance;
}

/** A race taken off the plan by a distance change, kept so the notice can
 *  name it and a return to its distance can put it back. */
export interface DroppedRace extends RaceLink {
  /** The target date when it was taken off. */
  date: string;
}

export interface RaceLinkState {
  link: RaceLink;
  dropped: DroppedRace | null;
}

/** The race link after the Distance control moves to `next`. */
export function raceLinkAfterDistance(
  state: RaceLinkState,
  next: RaceDistance,
  date: string
): RaceLinkState {
  const { link, dropped } = state;
  // Back on a dropped race's distance with nothing named since: it returns,
  // bound again only on the date it was bound for.
  if (dropped && next === dropped.distance && !link.name.trim())
    return {
      link: {
        name: dropped.name,
        spaceId: date === dropped.date ? dropped.spaceId : "",
        distance: next,
      },
      dropped: null,
    };
  if (next === link.distance) return state;
  // No race named or bound: the distance is the plan's alone.
  if (!link.name.trim() && !link.spaceId)
    return { link: { ...link, distance: next }, dropped };
  return {
    link: { name: "", spaceId: "", distance: next },
    dropped: { ...link, date },
  };
}

/**
 * What the plan says once a race is taken off it, until the person names
 * another or goes back: the race, its distance, and the one thing they may
 * need to change. Null when there is nothing to say (no name was taken).
 *
 * Owner's words, approved 28 November 2026.
 */
export function droppedRaceNotice(dropped: DroppedRace | null): string | null {
  const name = dropped?.name.trim();
  if (!dropped || !name) return null;
  return `${name} is a ${raceDistanceInSentence(dropped.distance)}, so it’s no longer this plan’s race. Check the date below.`;
}
