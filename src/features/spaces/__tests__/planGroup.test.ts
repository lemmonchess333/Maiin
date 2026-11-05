/**
 * Plan groups (Soc15): which race the viewer's goal puts them in, how many
 * weeks they have to go, and the words the card and the hero say.
 *
 * Every date is derived from the clock (CI also runs this at +90 days, in
 * Kiritimati, Midway and Auckland). The weeks are counted between local
 * dates, so a clock change inside the span (Auckland moves its clocks
 * twice a year, and any 30 weeks holds at least one move) cannot cost a
 * week.
 */
import { describe, expect, it } from "vitest";
import { addLocalDays, localDateString } from "@/lib/dateHelpers";
import {
  PLAN_GROUP_MIN_COUNT,
  parseCohortCount,
  planGroupCardLine,
  planGroupHeroLine,
  planGroupRace,
  weeksToGoLine,
} from "../planGroup";

const MANCHESTER = "manchester-marathon";
const LONDON = "london-marathon";

const today = () => localDateString();
/** A local date key `days` from today. */
const inDays = (days: number) =>
  localDateString(addLocalDays(new Date(), days));

/** The race catalogue's date for Manchester moved to `days` from today. */
const manchesterIn = (days: number) => ({
  [MANCHESTER]: { dateKey: inDays(days) },
});

const goal = (days: number, spaceId = MANCHESTER) => ({
  distance: "marathon",
  targetDate: inDays(days),
  eventSpaceId: spaceId,
});

describe("planGroupRace", () => {
  it("is the race the goal is bound to, with the weeks to go", () => {
    const race = planGroupRace(goal(63), manchesterIn(63), today());
    expect(race).toMatchObject({
      def: { id: MANCHESTER, name: "Manchester Marathon" },
      raceDay: inDays(63),
      weeksToGo: 9,
    });
  });

  it("counts whole weeks across a clock change, from the viewer's own today", () => {
    // 30 weeks always spans one of Auckland's clock changes.
    expect(
      planGroupRace(goal(210), manchesterIn(210), today())?.weeksToGo
    ).toBe(30);
    expect(planGroupRace(goal(69), manchesterIn(69), today())?.weeksToGo).toBe(
      9
    );
    expect(planGroupRace(goal(70), manchesterIn(70), today())?.weeksToGo).toBe(
      10
    );
    expect(planGroupRace(goal(6), manchesterIn(6), today())?.weeksToGo).toBe(0);
    expect(planGroupRace(goal(0), manchesterIn(0), today())?.weeksToGo).toBe(0);
  });

  it("is nothing once the race has passed", () => {
    expect(planGroupRace(goal(-1), manchesterIn(-1), today())).toBeNull();
  });

  it("is nothing for last edition's goal, even once the race has a new date", () => {
    // Bound through its recovery weeks, after the catalogue moved on.
    expect(planGroupRace(goal(-20), manchesterIn(300), today())).toBeNull();
  });

  it("is nothing without a goal bound to a race space", () => {
    expect(planGroupRace(null, {}, today())).toBeNull();
    expect(planGroupRace(undefined, {}, today())).toBeNull();
    expect(
      planGroupRace({ targetDate: inDays(30) }, manchesterIn(30), today())
    ).toBeNull();
    // An interest space is no race.
    expect(planGroupRace(goal(30, "runners"), {}, today())).toBeNull();
    expect(planGroupRace(goal(30, "no-such-space"), {}, today())).toBeNull();
  });

  it("takes the viewer's own day of a two-day race", () => {
    const overrides = {
      [LONDON]: { dateKey: inDays(64), dateKeys: [inDays(63), inDays(64)] },
    };
    expect(planGroupRace(goal(63, LONDON), overrides, today())?.raceDay).toBe(
      inDays(63)
    );
    expect(planGroupRace(goal(64, LONDON), overrides, today())?.raceDay).toBe(
      inDays(64)
    );
  });

  it("follows the race's date when the catalogue moved it after the goal was set", () => {
    // Still training for this race; the race is when the race is.
    expect(planGroupRace(goal(63), manchesterIn(70), today())).toMatchObject({
      raceDay: inDays(70),
      weeksToGo: 10,
    });
    // Moved into the past: nothing.
    expect(planGroupRace(goal(63), manchesterIn(-3), today())).toBeNull();
  });
});

describe("the words", () => {
  it("the card at a count of 1, 2, 3 and 12", () => {
    const name = "Manchester Marathon";
    expect(planGroupCardLine(1, name)).toBe(
      "You're training for Manchester Marathon"
    );
    expect(planGroupCardLine(2, name)).toBe(
      "You're training for Manchester Marathon"
    );
    expect(planGroupCardLine(3, name)).toBe(
      "You and 2 others are training for Manchester Marathon"
    );
    expect(planGroupCardLine(12, name)).toBe(
      "You and 11 others are training for Manchester Marathon"
    );
    expect(planGroupCardLine(null, name)).toBe(
      "You're training for Manchester Marathon"
    );
    expect(PLAN_GROUP_MIN_COUNT).toBe(3);
  });

  it("the hero in the third person, and nothing under three", () => {
    expect(planGroupHeroLine(12)).toBe(
      "12 people on Tropos are training for this race"
    );
    expect(planGroupHeroLine(3)).toBe(
      "3 people on Tropos are training for this race"
    );
    expect(planGroupHeroLine(2)).toBeNull();
    expect(planGroupHeroLine(1)).toBeNull();
    expect(planGroupHeroLine(null)).toBeNull();
  });

  it("the weeks to go", () => {
    expect(weeksToGoLine(9)).toBe("9 weeks to go");
    expect(weeksToGoLine(1)).toBe("1 week to go");
    expect(weeksToGoLine(0)).toBe("Race week");
  });
});

describe("parseCohortCount", () => {
  it("keeps a whole count and refuses anything else", () => {
    expect(parseCohortCount({ count: 12 })).toBe(12);
    expect(parseCohortCount({ count: 0 })).toBe(0);
    expect(parseCohortCount({ count: -1 })).toBeNull();
    expect(parseCohortCount({ count: 2.5 })).toBeNull();
    expect(parseCohortCount({ count: "12" })).toBeNull();
    expect(parseCohortCount({})).toBeNull();
    expect(parseCohortCount(undefined)).toBeNull();
  });
});
