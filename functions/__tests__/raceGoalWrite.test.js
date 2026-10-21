import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { wholeRaceGoal, raceIdentityIsStale } = require("../lib/raceGoalWrite");

const DELETE = Symbol("delete");

describe("wholeRaceGoal", () => {
  it("deletes each stored key the new goal leaves out", () => {
    expect(
      wholeRaceGoal(
        { distance: "10k", targetDate: "2026-12-20" },
        {
          distance: "marathon",
          targetDate: "2027-04-25",
          eventName: "London Marathon",
          eventSpaceId: "london-marathon",
          targetTimeS: 14400,
        },
        DELETE
      )
    ).toEqual({
      distance: "10k",
      targetDate: "2026-12-20",
      eventName: DELETE,
      eventSpaceId: DELETE,
      targetTimeS: DELETE,
    });
  });

  it("leaves the goal as sent when nothing was stored, or it is null", () => {
    const goal = { distance: "half", targetDate: "2026-11-01" };
    expect(wholeRaceGoal(goal, undefined, DELETE)).toEqual(goal);
    expect(wholeRaceGoal(null, goal, DELETE)).toBeNull();
  });
});

describe("raceIdentityIsStale", () => {
  const linked = { distance: "marathon", eventSpaceId: "london-marathon" };

  it("keeps a chip naming the goal's race", () => {
    expect(raceIdentityIsStale("london-marathon", linked)).toBe(false);
  });

  it("drops a chip once the goal names another race, none, or no goal", () => {
    expect(
      raceIdentityIsStale("london-marathon", {
        ...linked,
        eventSpaceId: "brighton-marathon",
      })
    ).toBe(true);
    expect(raceIdentityIsStale("london-marathon", { distance: "10k" })).toBe(
      true
    );
    expect(raceIdentityIsStale("london-marathon", null)).toBe(true);
    expect(raceIdentityIsStale("london-marathon", undefined)).toBe(true);
  });

  it("has nothing to drop when no chip is shown", () => {
    expect(raceIdentityIsStale(null, null)).toBe(false);
    expect(raceIdentityIsStale(undefined, linked)).toBe(false);
  });
});
