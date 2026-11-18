/**
 * A Space's week in figures that name no one (Run27 call 11): the line the
 * page shows from the server's stored week, and nothing when the server
 * stored none.
 */
import { describe, expect, it } from "vitest";
import {
  SPACE_WEEK_MIN_MEMBERS,
  parseSpaceWeek,
  spaceWeekLine,
} from "../spaceWeek";
import { group } from "@/test/localeGrouping";

describe("reading a Space's week", () => {
  it("reads the server's figures", () => {
    expect(
      parseSpaceWeek({
        weekKey: "w",
        members: 38,
        sessions: 127,
        meters: 412000,
      })
    ).toEqual({ members: 38, sessions: 127, meters: 412000 });
  });

  it("reads nothing from a quiet week, a missing one or a malformed one", () => {
    expect(parseSpaceWeek({ weekKey: "w", quiet: true })).toBeNull();
    expect(parseSpaceWeek(undefined)).toBeNull();
    expect(
      parseSpaceWeek({ members: "38", sessions: 1, meters: 0 })
    ).toBeNull();
    expect(parseSpaceWeek({ members: -1, sessions: 1, meters: 0 })).toBeNull();
  });

  it(`shows nothing for fewer than ${SPACE_WEEK_MIN_MEMBERS} members, whatever the document says`, () => {
    expect(
      parseSpaceWeek({
        members: SPACE_WEEK_MIN_MEMBERS - 1,
        sessions: 9,
        meters: 30000,
      })
    ).toBeNull();
    expect(
      parseSpaceWeek({
        members: SPACE_WEEK_MIN_MEMBERS,
        sessions: 9,
        meters: 30000,
      })
    ).not.toBeNull();
  });
});

describe("the week's line", () => {
  const week = { members: 38, sessions: 127, meters: 412_300 };

  it("names the members and their sessions and distance, no one by name", () => {
    expect(spaceWeekLine(week, "km")).toBe(
      "38 members trained this week: 127 sessions, 412 km"
    );
  });

  it("reads in the viewer's unit", () => {
    expect(spaceWeekLine(week, "mi")).toBe(
      "38 members trained this week: 127 sessions, 256 mi"
    );
  });

  it("groups large figures as the viewer's locale does", () => {
    expect(
      spaceWeekLine({ members: 1204, sessions: 4180, meters: 18_250_000 }, "km")
    ).toBe(
      `${group(1204)} members trained this week: ${group(4180)} sessions, ${group(18250)} km`
    );
  });

  it("leaves the distance out of a week with no run distance", () => {
    expect(spaceWeekLine({ members: 12, sessions: 41, meters: 0 }, "km")).toBe(
      "12 members trained this week: 41 sessions"
    );
  });

  it("is nothing without a week", () => {
    expect(spaceWeekLine(null, "km")).toBeNull();
  });
});
