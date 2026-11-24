/**
 * The finish's league line (Run30 call 2): when a session raised your
 * place, and when half the group has scored.
 */
import { describe, expect, it } from "vitest";
import { halfHaveScored, placeRise } from "../leagueRules";
import { riseLine } from "../league";

const T0 = Date.UTC(2026, 10, 23, 9);
const row = (uid: string, points: number, at = T0) => ({
  uid,
  points,
  reachedAt: at,
});

/** A group of ten, six of them scored, "me" 5th on 25 points. */
function group(mine: number, myAt = T0) {
  return [
    row("a", 100, T0 - 9),
    row("b", 75, T0 - 8),
    row("c", 50, T0 - 7),
    row("d", 40, T0 - 6),
    row("me", mine, myAt),
    row("e", 20, T0 - 5),
    row("f", 0),
    row("g", 0),
    row("h", 0),
    row("i", 0),
  ];
}

describe("halfHaveScored", () => {
  it("needs ceil(n / 2) above zero", () => {
    const of = (scored: number, n: number) =>
      Array.from({ length: n }, (_, i) => row(`u${i}`, i < scored ? 10 : 0));
    expect(halfHaveScored(of(5, 10))).toBe(true);
    expect(halfHaveScored(of(4, 10))).toBe(false);
    expect(halfHaveScored(of(6, 11))).toBe(true);
    expect(halfHaveScored(of(5, 11))).toBe(false);
    expect(halfHaveScored([])).toBe(false);
  });
});

describe("placeRise", () => {
  it("says the place a session raised you to, of the group", () => {
    expect(placeRise("me", group(25), group(60, T0 + 1))).toEqual({
      rank: 3,
      of: 10,
    });
    expect(riseLine(3, 10)).toBe("Up to 3rd of 10");
  });

  it("is null when the session kept your place", () => {
    expect(placeRise("me", group(25), group(30, T0 + 1))).toBeNull();
  });

  it("a tie that keeps your place is no rise: the points were reached last", () => {
    // 40 is d's, reached earlier, so d stays above.
    expect(placeRise("me", group(25), group(40, T0 + 1))).toBeNull();
    // One more point and you pass d.
    expect(placeRise("me", group(25), group(41, T0 + 1))).toEqual({
      rank: 4,
      of: 10,
    });
  });

  it("is null when your points went down or did not change", () => {
    expect(placeRise("me", group(60), group(25, T0 + 1))).toBeNull();
    expect(placeRise("me", group(25), group(25))).toBeNull();
  });

  it("is null until half the group has scored", () => {
    const before = group(0).map((s) =>
      ["c", "d", "e"].includes(s.uid) ? { ...s, points: 0 } : s
    );
    // a, b and me: 3 of 10 scored after the session.
    const after = before.map((s) =>
      s.uid === "me" ? row("me", 60, T0 + 1) : s
    );
    expect(placeRise("me", before, after)).toBeNull();
    // With two more scored, 5 of 10, the same session says its place.
    const five = (rows: typeof before) =>
      rows.map((s) => (["f", "g"].includes(s.uid) ? { ...s, points: 10 } : s));
    expect(placeRise("me", five(before), five(after))).toEqual({
      rank: 3,
      of: 10,
    });
  });

  it("a Monday's first finisher reads nothing", () => {
    const monday = Array.from({ length: 18 }, (_, i) => row(`u${i}`, 0));
    const after = monday.map((s) =>
      s.uid === "u7" ? row("u7", 33, T0 + 1) : s
    );
    expect(placeRise("u7", monday, after)).toBeNull();
  });

  it("is null when you are not in the group before or after", () => {
    const without = group(25).filter((s) => s.uid !== "me");
    expect(placeRise("me", without, group(60, T0 + 1))).toBeNull();
    expect(placeRise("me", group(25), without)).toBeNull();
  });

  it("is null when someone leaving moved you and the session did not", () => {
    // d leaves between the reads; your 30 would be 4th either way.
    const after = group(30, T0 + 1).filter((s) => s.uid !== "d");
    expect(placeRise("me", group(25), after)).toBeNull();
  });

  it("is null when you end where you started though the session moved you", () => {
    // Two others passed you since the finish read the group; the session
    // takes you back to 5th, where you were.
    const after = group(55, T0 + 1).map((s) =>
      s.uid === "f" || s.uid === "g" ? { ...s, points: 90 } : s
    );
    expect(placeRise("me", group(25), after)).toBeNull();
  });
});
