import { describe, it, expect } from "vitest";
import { dayFocusLabel, liftDayLine, liftDayTitle } from "../liftDayLabel";

/**
 * The property the cells exist for: within one week, no two labels are
 * the same word.
 *
 * Asserting that directly is what makes this file worth having. A test
 * that only mapped names to expected strings would pass just as happily
 * on the category rule it replaces — "Full Body" three times is a
 * correct mapping and a useless cell.
 *
 * The rotations below are the real ones, the generator's day names
 * (`src/features/program/programEngine.ts`).
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

describe("liftDayTitle — Home's Today card", () => {
  it("splits every real rotation day into its category and focus", () => {
    // The card sets the category as the eyebrow and the focus as the
    // title, so no title can break at the dash ("Pull —" over "Lat Focus").
    for (const name of [...FULL_BODY_3, ...PPL_X2]) {
      const { category, title } = liftDayTitle(name);
      expect(category).not.toBeNull();
      expect(title).not.toMatch(/[—–]/);
      expect(`${category} — ${title}`.toLowerCase()).toBe(name.toLowerCase());
    }
  });

  it("keeps the noun a title can afford, lower-cased", () => {
    expect(liftDayTitle("Pull — Lat Focus")).toEqual({
      category: "Pull",
      title: "Lat focus",
    });
    expect(liftDayTitle("Upper-Lower — Squat Focus")).toEqual({
      category: "Upper-Lower",
      title: "Squat focus",
    });
  });

  it("gives a custom or renamed day no category", () => {
    expect(liftDayTitle("Upper A")).toEqual({
      category: null,
      title: "Upper A",
    });
    expect(liftDayTitle("  Leg Day  ")).toEqual({
      category: null,
      title: "Leg Day",
    });
  });

  it("keeps the whole name when either half would be empty", () => {
    expect(liftDayTitle("Push — ")).toEqual({
      category: null,
      title: "Push —",
    });
    expect(liftDayTitle("")).toEqual({ category: null, title: "" });
  });

  it("divides at the first separator and keeps the rest as typed", () => {
    // A routine's own name can carry more than one dash. Only the first
    // divides it; after that it is the lifter's wording, dashes and all.
    expect(liftDayTitle("Push — Pull — Legs")).toEqual({
      category: "Push",
      title: "Pull — Legs",
    });
    expect(liftDayTitle("Mon - Upper - Heavy")).toEqual({
      category: "Mon",
      title: "Upper - Heavy",
    });
  });
});

describe("liftDayLine — the day on one line", () => {
  it("joins the category and the focus the way the screens say it", () => {
    expect(liftDayLine("Pull — Lat Focus")).toBe("Pull · Lat focus");
    expect(liftDayLine("Full Body — Squat Focus")).toBe(
      "Full Body · Squat focus"
    );
  });

  it("leaves a routine's own name as it is", () => {
    expect(liftDayLine("Upper A")).toBe("Upper A");
    expect(liftDayLine("Upper-Lower day")).toBe("Upper-Lower day");
  });

  it("loses none of a name with two separators", () => {
    expect(liftDayLine("Push — Pull — Legs")).toBe("Push · Pull — Legs");
    expect(liftDayLine("Mon - Upper - Heavy")).toBe("Mon · Upper - Heavy");
  });
});
