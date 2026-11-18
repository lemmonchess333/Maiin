/**
 * Searching Spaces by name (Run27 call 11): every word of the query found
 * in a Space's name or its race's city, whatever the case, the accents or
 * the apostrophes, run over the app's own list of Spaces.
 */
import { describe, expect, it } from "vitest";
import { SPACE_DEFS, spaceDef, type SpaceDef } from "../spaceDefs";
import {
  SPACE_SEARCH_MIN_LENGTH,
  searchKey,
  searchSpaces,
  spaceMatches,
} from "../spaceSearch";

const names = (defs: SpaceDef[]) => defs.map((d) => d.name);

describe("finding a Space by name", () => {
  it("finds Brighton Marathon for “brighton”, in any case", () => {
    const brighton = spaceDef("brighton-marathon")!;
    expect(brighton.name).toBe("Brighton Marathon");
    for (const query of ["brighton", "BRIGHTON", "Brighton", "bright"]) {
      expect(names(searchSpaces(SPACE_DEFS, query)), query).toContain(
        "Brighton Marathon"
      );
    }
  });

  it("finds a word anywhere in the name, not only at its start", () => {
    expect(names(searchSpaces(SPACE_DEFS, "marathon"))).toEqual(
      expect.arrayContaining(["Brighton Marathon", "London Marathon"])
    );
    expect(spaceMatches(spaceDef("brighton-marathon")!, "rathon")).toBe(true);
  });

  it("needs every word, in any order", () => {
    expect(names(searchSpaces(SPACE_DEFS, "marathon brighton"))).toEqual([
      "Brighton Marathon",
      "Brighton Half Marathon",
    ]);
    expect(searchSpaces(SPACE_DEFS, "brighton lifters")).toEqual([]);
  });

  it("ignores apostrophes and accents", () => {
    expect(names(searchSpaces(SPACE_DEFS, "womens"))).toContain(
      "Women's Running"
    );
    expect(names(searchSpaces(SPACE_DEFS, "women’s"))).toContain(
      "Women's Running"
    );
    expect(searchKey("Zürich Marathon")).toBe("zurich marathon");
  });

  it("finds a race by its city", () => {
    const greatNorth = spaceDef("great-north-run")!;
    const city = greatNorth.event!.city;
    expect(spaceMatches(greatNorth, city.toLowerCase())).toBe(true);
  });

  it("puts names that start with the query first, then the directory's order", () => {
    const defs = [
      spaceDef("london-marathon")!,
      spaceDef("runners")!,
      spaceDef("trail-running")!,
    ];
    // "Runners" starts with "run"; the others only hold it.
    expect(names(searchSpaces(defs, "run"))).toEqual([
      "Runners",
      "Trail Running",
    ]);
  });

  it(`finds nothing for a query under ${SPACE_SEARCH_MIN_LENGTH} letters, or only spaces and marks`, () => {
    expect(searchSpaces(SPACE_DEFS, "")).toEqual([]);
    expect(searchSpaces(SPACE_DEFS, "b")).toEqual([]);
    expect(searchSpaces(SPACE_DEFS, "   ")).toEqual([]);
    expect(searchSpaces(SPACE_DEFS, "’ -")).toEqual([]);
  });
});
