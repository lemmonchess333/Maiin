import { wholeWeeksBetween } from "@/lib/dateHelpers";
import { raceEventDates } from "./raceDates";
import {
  resolveRaceEvent,
  type RaceEventOverrides,
} from "./raceEventOverrides";
import { spaceDef, type SpaceDef, type SpaceEventInfo } from "./spaceDefs";

/**
 * Plan groups (Soc15): the people on Tropos training for the same race.
 *
 * A race's group is everyone whose race goal is bound to its race space
 * (`raceGoal.eventSpaceId`) and whose race is still ahead. They share the
 * race's date, so they are all the same number of weeks out. The server
 * keeps the group's size in `raceCohorts/{spaceId}` (`count`, the viewer
 * included when they are in it) and names nobody in it
 * (functions/lib/raceCohorts.js).
 *
 * Only someone whose own goal is bound to a race sees anything, and only
 * while their race is ahead: Social's card in Together's This week, and a
 * line in the race space's hero. With fewer than two others in the group
 * the card says only "You're training for …" and the hero says nothing.
 */

/** The smallest group, the viewer included, whose size is shown. */
export const PLAN_GROUP_MIN_COUNT = 3;

export interface PlanGroupRace {
  def: SpaceDef;
  /** The race's event, with the server's date over the bundled one. */
  event: SpaceEventInfo;
  /** The viewer's race day: the day of a two-day race on their goal, or
   *  the race's own day. */
  raceDay: string;
  /** Whole weeks from the viewer's local today to the race day. */
  weeksToGo: number;
}

/**
 * The race the viewer's goal binds them to, while it is ahead, or null.
 *
 * A goal whose own race day has passed is last edition's, kept through its
 * recovery weeks: it is not training for the race's next date, so it shows
 * nothing even once that date is set. A goal bound to a space that is not a
 * race, or to none, shows nothing either.
 */
export function planGroupRace(
  raceGoal: { eventSpaceId?: string; targetDate?: string } | null | undefined,
  overrides: RaceEventOverrides,
  todayKey: string
): PlanGroupRace | null {
  const spaceId = raceGoal?.eventSpaceId;
  if (!spaceId) return null;
  const def = spaceDef(spaceId);
  if (!def || def.kind !== "race") return null;
  const event = resolveRaceEvent(def, overrides);
  if (!event) return null;
  const target = raceGoal?.targetDate;
  if (typeof target === "string" && target < todayKey) return null;
  const raceDay =
    typeof target === "string" && raceEventDates(event).includes(target)
      ? target
      : event.dateKey;
  if (raceDay < todayKey) return null;
  return {
    def,
    event,
    raceDay,
    weeksToGo: wholeWeeksBetween(todayKey, raceDay),
  };
}

/** A stored group size, or null for anything that is not a whole count. */
export function parseCohortCount(data: unknown): number | null {
  const count =
    data && typeof data === "object"
      ? (data as { count?: unknown }).count
      : undefined;
  return typeof count === "number" && Number.isInteger(count) && count >= 0
    ? count
    : null;
}

/** "9 weeks to go", "1 week to go", and "Race week" inside the last seven days. */
export function weeksToGoLine(weeksToGo: number): string {
  if (weeksToGo <= 0) return "Race week";
  return weeksToGo === 1 ? "1 week to go" : `${weeksToGo} weeks to go`;
}

/**
 * The Social card's sentence. `count` is the group's size with the viewer
 * in it; under PLAN_GROUP_MIN_COUNT, or unknown, the card speaks of the
 * viewer alone.
 */
export function planGroupCardLine(
  count: number | null,
  raceName: string
): string {
  if (count === null || count < PLAN_GROUP_MIN_COUNT)
    return `You're training for ${raceName}`;
  return `You and ${(count - 1).toLocaleString()} others are training for ${raceName}`;
}

/** The race space hero's line, or null when the group is too small to show. */
export function planGroupHeroLine(count: number | null): string | null {
  if (count === null || count < PLAN_GROUP_MIN_COUNT) return null;
  return `${count.toLocaleString()} people on Tropos are training for this race`;
}
