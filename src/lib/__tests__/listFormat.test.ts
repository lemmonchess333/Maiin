/**
 * Tests for `joinHumanList` — the Tropos house-style list joiner
 * used by the Food page's copy-yesterday button + toast.
 *
 * Pinning the four arity cases so a refactor of the comma/&
 * style doesn't quietly drift across the surfaces that share it.
 */
import { describe, it, expect } from "vitest";
import { joinHumanList } from "../listFormat";

describe("joinHumanList", () => {
  it("returns empty string for an empty array", () => {
    expect(joinHumanList([])).toBe("");
  });

  it("returns the lone item for a single-element array", () => {
    expect(joinHumanList(["Lunch"])).toBe("Lunch");
  });

  it("uses ' & ' (ampersand) between two items, not 'and'", () => {
    /* Tropos style — ampersand keeps toast bodies tight. */
    expect(joinHumanList(["Breakfast", "Lunch"])).toBe("Breakfast & Lunch");
  });

  it("uses comma + ' & ' for three items (no Oxford comma)", () => {
    expect(joinHumanList(["Breakfast", "Lunch", "Dinner"])).toBe(
      "Breakfast, Lunch & Dinner",
    );
  });

  it("uses commas + ' & ' for four or more items", () => {
    expect(
      joinHumanList(["Breakfast", "Lunch", "Snacks", "Dinner"]),
    ).toBe("Breakfast, Lunch, Snacks & Dinner");
  });

  it("preserves item strings verbatim (no trimming or casing)", () => {
    /* Defensive: the caller is responsible for casing — the
       formatter doesn't re-case or trim. */
    expect(joinHumanList(["  Breakfast  ", "lunch"])).toBe(
      "  Breakfast   & lunch",
    );
  });

  it("accepts a readonly array (compile-time guarantee)", () => {
    /* The signature is `readonly string[]`. This test exists for
       its type assertion — if someone changes the signature to
       `string[]` only, the next line fails to compile. */
    const items: readonly string[] = ["a", "b"];
    expect(joinHumanList(items)).toBe("a & b");
  });
});
