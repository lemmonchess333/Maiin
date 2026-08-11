/**
 * A serving added in the same save as an edit carries the edit.
 *
 * The Edit-servings sheet saves up to four axes at once: serving count, meal
 * slot, food name, and per-serving macros. Food.tsx applied the last three by
 * `editMeal`-ing every doc already in the group, then duplicated the group's
 * last doc to cover a count increase — from `editingGroup.meals`, the
 * snapshot captured when the sheet OPENED and never refreshed.
 *
 * So the duplicate carried none of the edit that had just been applied to its
 * siblings:
 *
 *   2 servings at 200 kcal, set to 300 kcal AND stepped to 4 servings
 *   → 300, 300, 200, 200 — the day is 200 kcal light, with no error shown
 *
 * The rename axis is worse than an arithmetic error: the new docs keep the
 * OLD foodName, so they group as a SEPARATE row from the ones they were meant
 * to join, and the user watches their food split in two.
 *
 * Why it survived: only the SHEET had tests. The apply path was an inline
 * closure inside a 2000-line page component, so nothing could reach it. The
 * derivation is now a pure function, which is the whole reason these
 * assertions can exist.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { duplicatedServingPayload } from "../servingEdit";
import type { ServingSource, ServingEditChanges } from "../servingEdit";

/** One doc of a 2-serving group, as it stood before the edit. */
const SOURCE: ServingSource = {
  foodName: "Porridge",
  items: [{ name: "oats" }],
  totalCalories: 200,
  totalProtein: 8,
  totalCarbs: 30,
  totalFat: 4,
  meal: "breakfast",
};

const NO_CHANGES: ServingEditChanges = {
  targetMeal: null,
  targetName: null,
  targetMacros: null,
};

describe("duplicatedServingPayload", () => {
  it("carries a macro edit made in the same save", () => {
    // The headline case. Pre-fix this returned 200.
    const out = duplicatedServingPayload(SOURCE, {
      ...NO_CHANGES,
      targetMacros: { totalCalories: 300 },
    });
    expect(out.totalCalories).toBe(300);
  });

  it("carries a rename made in the same save", () => {
    /* Not just cosmetic: the timeline groups by foodName, so a duplicate
       under the old name renders as its own row and the user's single food
       appears twice. */
    const out = duplicatedServingPayload(SOURCE, {
      ...NO_CHANGES,
      targetName: "Overnight oats",
    });
    expect(out.foodName).toBe("Overnight oats");
  });

  it("carries a slot move made in the same save", () => {
    const out = duplicatedServingPayload(SOURCE, {
      ...NO_CHANGES,
      targetMeal: "snack",
    });
    expect(out.meal).toBe("snack");
  });

  it("applies all four axes at once", () => {
    // The sheet permits every axis in one Save, so the combination is a real
    // path, not a synthetic one.
    const out = duplicatedServingPayload(SOURCE, {
      targetMeal: "lunch",
      targetName: "Oats + whey",
      targetMacros: {
        totalCalories: 340,
        totalProtein: 28,
        totalCarbs: 32,
        totalFat: 6,
      },
    });
    expect(out).toEqual({
      foodName: "Oats + whey",
      items: SOURCE.items,
      totalCalories: 340,
      totalProtein: 28,
      totalCarbs: 32,
      totalFat: 6,
      meal: "lunch",
    });
  });

  it("overrides per dimension — an untouched macro keeps the source value", () => {
    /* The sheet only emits a dimension that actually CHANGED, so a
       spread-everything implementation would zero the other three. Editing
       protein alone must leave calories where they were. */
    const out = duplicatedServingPayload(SOURCE, {
      ...NO_CHANGES,
      targetMacros: { totalProtein: 20 },
    });
    expect(out.totalProtein).toBe(20);
    expect(out.totalCalories).toBe(200);
    expect(out.totalCarbs).toBe(30);
    expect(out.totalFat).toBe(4);
  });

  it("accepts a macro override of zero", () => {
    /* `?? ` not `||`: a genuine 0 g fat is a legitimate edit, and a truthiness
       fallback would silently restore the source's 4 g. */
    const out = duplicatedServingPayload(SOURCE, {
      ...NO_CHANGES,
      targetMacros: { totalFat: 0 },
    });
    expect(out.totalFat).toBe(0);
  });

  it("is a faithful clone when nothing else changed", () => {
    // The plain count-step path, which was already correct and must stay so.
    expect(duplicatedServingPayload(SOURCE, NO_CHANGES)).toEqual({
      foodName: "Porridge",
      items: SOURCE.items,
      totalCalories: 200,
      totalProtein: 8,
      totalCarbs: 30,
      totalFat: 4,
      meal: "breakfast",
    });
  });

  it("coerces missing or malformed source numbers to 0", () => {
    // Legacy docs predate some of these fields; Firestore rejects undefined,
    // so the payload must never carry one.
    const out = duplicatedServingPayload(
      { foodName: "Mystery" } as ServingSource,
      NO_CHANGES
    );
    expect(out).toEqual({
      foodName: "Mystery",
      items: [],
      totalCalories: 0,
      totalProtein: 0,
      totalCarbs: 0,
      totalFat: 0,
    });
    expect(Object.values(out).every((v) => v !== undefined)).toBe(true);
  });

  it("omits `meal` entirely rather than writing undefined", () => {
    /* An unslotted food has no meal key at all. Writing `meal: undefined`
       would be rejected by Firestore — the guarded wrappers strip it, but the
       payload should not depend on that. */
    const out = duplicatedServingPayload(
      { ...SOURCE, meal: undefined },
      NO_CHANGES
    );
    expect("meal" in out).toBe(false);
  });
});

describe("Food.tsx uses it, and passes the changes through", () => {
  /* The pure function being right and the page CALLING it are different
     claims — and this whole bug is what the second one failing looks like.
     Twice already in this arc a fix's logic was well covered while its wiring
     was not, so the wiring gets its own pin.

     Source-level because the apply path is a closure inside a 2000-line page
     that mounts Firestore subscriptions, a camera surface and a barcode
     scanner; standing all that up in jsdom to assert one argument is a worse
     trade than reading the file. */
  const SOURCE = readFileSync(
    new URL("../../pages/Food.tsx", import.meta.url),
    "utf8"
  );

  it("builds the duplicate through the shared helper", () => {
    expect(SOURCE).toContain("duplicatedServingPayload(source, {");
  });

  it("hands it all three change axes, unmodified", () => {
    /* Dropping any one silently restores that axis's half of the bug — the
       macro half is the loud one, the rename half splits the row.

       Shorthand is required, not merely the names being present. The first
       version of this test used `toContain("targetMacros")`, which a mutation
       to `targetMacros: null` satisfied happily — a check that reads like a
       check and passes for the wrong reason, the exact failure this arc keeps
       finding in other people's tests. Caught here by mutating the call site
       rather than by re-reading the assertion. */
    expect(SOURCE).toMatch(
      /duplicatedServingPayload\(\s*source,\s*\{\s*targetMeal,\s*targetName,\s*targetMacros,?\s*\}\s*\)/
    );
  });

  it("no longer spreads the pre-edit source into the written doc", () => {
    // The shape that caused it: cloning `source.totalCalories` et al directly
    // into addDocGuarded, bypassing the edit entirely.
    expect(SOURCE).not.toMatch(/totalCalories:\s*safeNum\(source\.totalCalories\)/);
    expect(SOURCE).not.toMatch(/foodName:\s*source\.foodName/);
  });
});
