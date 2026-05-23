/**
 * Tests for `shoeDatabase.ts` — the curated shoe list + searchShoes
 * typeahead helper used by the My Shoes settings card.
 *
 * Two surfaces to pin:
 *   1. SHOE_DATABASE consistency — every entry has a positive
 *      recommendedMaxKm, and the brands covered match the eight
 *      dominant run brands documented in the module header.
 *   2. searchShoes contract — case-insensitive substring match on
 *      name AND brand, capped at maxResults, returns [] on empty
 *      input.
 */
import { describe, it, expect } from "vitest";
import { SHOE_DATABASE, searchShoes } from "../shoeDatabase";

describe("SHOE_DATABASE — invariants", () => {
  it("is non-empty", () => {
    expect(SHOE_DATABASE.length).toBeGreaterThan(0);
  });

  it("every entry has a positive recommendedMaxKm", () => {
    /* Used as the default value when the user picks a known model;
       a zero/negative would silently break the "X km until
       retirement" subtraction downstream. */
    for (const shoe of SHOE_DATABASE) {
      expect(shoe.recommendedMaxKm).toBeGreaterThan(0);
    }
  });

  it("every entry has a non-empty name + brand", () => {
    for (const shoe of SHOE_DATABASE) {
      expect(shoe.name.length).toBeGreaterThan(0);
      expect(shoe.brand.length).toBeGreaterThan(0);
    }
  });

  it("covers the eight dominant run brands per the module header", () => {
    const brands = new Set(SHOE_DATABASE.map((s) => s.brand));
    for (const brand of [
      "Nike",
      "Adidas",
      "Asics",
      "Hoka",
      "Saucony",
      "New Balance",
      "On",
      "Brooks",
    ]) {
      expect(brands.has(brand)).toBe(true);
    }
  });
});

describe("searchShoes — empty input", () => {
  it("returns [] for an empty string", () => {
    expect(searchShoes("")).toEqual([]);
  });

  it("returns [] for whitespace-only input", () => {
    expect(searchShoes("   ")).toEqual([]);
  });
});

describe("searchShoes — case-insensitive matching", () => {
  it("matches a brand name regardless of case", () => {
    const upper = searchShoes("NIKE");
    const lower = searchShoes("nike");
    const mixed = searchShoes("NiKe");
    expect(upper.length).toBeGreaterThan(0);
    expect(lower.length).toBe(upper.length);
    expect(mixed.length).toBe(upper.length);
  });

  it("matches a model name substring (not just exact)", () => {
    /* "vapor" should find the Vaporfly without typing the full
       name. Tests the substring-not-prefix contract. */
    const results = searchShoes("vapor");
    expect(results.some((s) => s.name === "Vaporfly 3")).toBe(true);
  });
});

describe("searchShoes — capping", () => {
  it("respects the default cap (6)", () => {
    /* A common-brand search hits many entries; the panel needs
       a tight cap to stay usable on small screens. */
    const results = searchShoes("nike");
    expect(results.length).toBeLessThanOrEqual(6);
  });

  it("respects a custom maxResults cap", () => {
    expect(searchShoes("nike", 2).length).toBeLessThanOrEqual(2);
    expect(searchShoes("nike", 3).length).toBeLessThanOrEqual(3);
  });
});

describe("searchShoes — no matches", () => {
  it("returns [] for a query that matches nothing", () => {
    expect(searchShoes("not-a-real-shoe-brand-xyz")).toEqual([]);
  });
});
