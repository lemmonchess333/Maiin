/**
 * The member line, and the one moment capacity changes what you can do.
 *
 * Two things this holds that the old string did not. It never uses the
 * "N of M" shape, because the sheet that carried it also renders
 * "1 of 2 focusing this week" — the same shape meaning a subset of the
 * members doing something — and the two sat four lines apart. And the
 * count agrees with the card behind the sheet, which has always said
 * "2 members" for the circle whose sheet said "2 of 8 members".
 */
import { describe, it, expect } from "vitest";
import { isFull, memberLine } from "../circleCapacity";

describe("circle capacity", () => {
  it("counts members without a ratio", () => {
    expect(memberLine({ memberCount: 1, maxMembers: 8 })).toBe("1 member");
    expect(memberLine({ memberCount: 2, maxMembers: 8 })).toBe("2 members");
    expect(memberLine({ memberCount: 7, maxMembers: 8 })).toBe("7 members");
    for (let n = 1; n < 8; n++) {
      expect(memberLine({ memberCount: n, maxMembers: 8 })).not.toMatch(/ of /);
    }
  });

  it("says full in words, at capacity only", () => {
    expect(memberLine({ memberCount: 8, maxMembers: 8 })).toBe(
      "8 members · full"
    );
    expect(memberLine({ memberCount: 7, maxMembers: 8 })).not.toMatch(/full/);
  });

  it("treats an over-count as full rather than as room", () => {
    // memberCount is maintained by a transaction and should never exceed
    // the cap, but a `>` reading is the safe one: the alternative offers
    // an invite into a circle the server will refuse.
    expect(isFull({ memberCount: 9, maxMembers: 8 })).toBe(true);
    expect(memberLine({ memberCount: 9, maxMembers: 8 })).toBe(
      "9 members · full"
    );
  });

  it("reads the ceiling off the circle, not off a constant", () => {
    // maxMembers is persisted per circle (clamped to GOAL_SPACE_MAX_MEMBERS
    // on parse), and the server compares against the stored value.
    expect(isFull({ memberCount: 4, maxMembers: 4 })).toBe(true);
    expect(isFull({ memberCount: 4, maxMembers: 8 })).toBe(false);
  });
});
