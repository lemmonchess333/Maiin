/**
 * Social at small numbers (App1 Q6, `src/lib/fillingUp.ts`): a room says
 * how many are in it from its floor, says it is filling up under it, and
 * says nothing while its count is not known.
 */
import { describe, expect, it } from "vitest";
import { FILLING_UP, PEOPLE_COUNT_MIN_VISIBLE, roomPeople } from "../fillingUp";
import { SPACE_MEMBER_COUNT_MIN_VISIBLE } from "@/features/spaces/spaceDefs";
import { LEAGUE_JOINED_MIN_VISIBLE } from "@/features/league/league";

describe("roomPeople", () => {
  it("counts from the floor and says filling up under it", () => {
    expect(roomPeople(3, 3)).toEqual({ count: 3 });
    expect(roomPeople(148, 3)).toEqual({ count: 148 });
    expect(roomPeople(2, 3)).toBe("fillingUp");
    expect(roomPeople(0, 3)).toBe("fillingUp");
    expect(roomPeople(4, 5)).toBe("fillingUp");
    expect(roomPeople(5, 5)).toEqual({ count: 5 });
  });

  it("says nothing for a count that is not known", () => {
    expect(roomPeople(null, 3)).toBeNull();
    expect(roomPeople(undefined, 3)).toBeNull();
    expect(roomPeople("12", 3)).toBeNull();
    expect(roomPeople(Number.NaN, 3)).toBeNull();
    expect(roomPeople(-1, 3)).toBeNull();
  });

  it("reads a fractional count as the people in it", () => {
    expect(roomPeople(3.7, 3)).toEqual({ count: 3 });
    expect(roomPeople(2.9, 3)).toBe("fillingUp");
  });
});

describe("the words and the floors", () => {
  it("say Filling up, and count a challenge and the league from 3 and a Space from 5", () => {
    expect(FILLING_UP).toBe("Filling up");
    expect(PEOPLE_COUNT_MIN_VISIBLE).toBe(3);
    expect(LEAGUE_JOINED_MIN_VISIBLE).toBe(3);
    expect(SPACE_MEMBER_COUNT_MIN_VISIBLE).toBe(5);
  });
});
