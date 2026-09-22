import { describe, it, expect } from "vitest";
import { dayFocusLabel } from "../liftDayLabel";

/**
 * The property the cells exist for: within one week, no two labels are
 * the same word.
 *
 * Asserting that directly is what makes this file worth having. A test
 * that only mapped names to expected strings would pass just as happily
 * on the category rule it replaces — "Full Body" three times is a
 * correct mapping and a useless cell.
 *
 * The rotations below are the real ones, lifted from
 * `src/features/program/templates.ts`.
 */
const FULL_BODY_3 = [
  "Full Body — Squat Focus",
  "Full Body — Posterior Focus",
  "Full Body — Deadlift Focus",
];

const PPL_X2 = [
  "Push — Chest Focus",
  "Pull — Lat Focus",
  "Legs — Squat Focus",
  "Push — Shoulder Focus",
  "Pull — Row Focus",
  "Legs — Deadlift Focus",
];

const UPPER_LOWER = ["Lower — Squat Focus", "Lower — Deadlift Focus"];

describe("a week's labels tell its days apart", () => {
  it.each([
    ["full body x3", FULL_BODY_3],
    ["push/pull/legs x2", PPL_X2],
    ["lower x2", UPPER_LOWER],
  ])("%s", (_name, week) => {
    const labels = week.map(dayFocusLabel);
    expect(new Set(labels).size).toBe(week.length);
  });

  it("is the rule the category could not satisfy", () => {
    /* The guard on the guard. Every rotation above shares a category
       across at least two of its days, so the old rule collapses them —
       if this ever stops holding, the tests above stop proving anything
       and should be re-fixtured rather than trusted. */
    const category = (n: string) => n.split(/\s+[—–-]\s+/)[0];
    for (const week of [FULL_BODY_3, PPL_X2, UPPER_LOWER]) {
      expect(new Set(week.map(category)).size).toBeLessThan(week.length);
    }
  });
});

describe("the label itself", () => {
  it("is the focus, without the noun every template repeats", () => {
    expect(dayFocusLabel("Full Body — Squat Focus")).toBe("Squat");
    expect(dayFocusLabel("Push — Shoulder Focus")).toBe("Shoulder");
    expect(dayFocusLabel("Pull — Lat Focus")).toBe("Lat");
  });

  it("fits the tightest cell the selector can lay out", () => {
    /* NOT "no longer than the category it replaces" — that was the first
       version of this test and it is false: "Push" becomes "Shoulder".
       The constraint that matters is absolute, because the cell is
       `flex-1 min-w-0` with `line-clamp-1` at `text-caption` (12px), and
       the tightest row is six days across 393px — about 61px per cell,
       roughly 9 characters at that size.

       So 9 is the budget, and the whole template library sits inside it
       ("Posterior" is the longest, and only in the 3-day rotation whose
       cells are twice as wide). A new template naming a day
       "Posterior Chain Focus" fails here rather than truncating on a
       phone. */
    for (const name of [...FULL_BODY_3, ...PPL_X2, ...UPPER_LOWER]) {
      expect(dayFocusLabel(name).length).toBeLessThanOrEqual(9);
    }
  });

  it("splits on a SPACED dash, so a hyphenated category survives", () => {
    /* `[—–-]` unspaced split "Upper-Lower" at its own hyphen and called
       the day "Upper". */
    expect(dayFocusLabel("Upper-Lower — Squat Focus")).toBe("Squat");
  });

  it("keeps a name that carries no separator", () => {
    // Custom and user-renamed days: there is no focus to find.
    expect(dayFocusLabel("Upper A")).toBe("Upper A");
    expect(dayFocusLabel("Full Body")).toBe("Full Body");
    expect(dayFocusLabel("  Leg Day  ")).toBe("Leg Day");
  });

  it("keeps the whole name rather than returning nothing", () => {
    // A trailing separator, or a focus that is only the dropped noun.
    expect(dayFocusLabel("Push — Focus")).toBe("Push — Focus");
    expect(dayFocusLabel("")).toBe("");
  });
});
