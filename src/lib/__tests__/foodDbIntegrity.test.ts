/**
 * Data-integrity guards on the built-in food table.
 *
 * `nlFoodParser`'s `FOOD_DB` is 201 hand-authored rows of calories, protein,
 * carbs, fat and a serving string. `nlFoodParser.test.ts` covers the PARSER
 * thoroughly — quantities, units, compound "X with Y", fuzzy matching — and
 * nothing at all checks the TABLE. A mistyped macro there is silent: the parse
 * succeeds, the diary row looks ordinary, and the number is simply wrong every
 * time anyone logs that food.
 *
 * It does not stop at the diary either, which is what makes this worth a test
 * rather than a review. Logged intake is the input to `adaptiveTdee`'s
 * estimator, so a wrong calorie figure on a common food biases the LEARNED
 * maintenance TDEE, and the adaptive target follows it. A typo in this table
 * ends up in the user's calorie goal.
 *
 * Two invariants, both derived from the data rather than asserted at it:
 *
 *   1. every row's macros reconcile with its calories under Atwater
 *      (4/4/9 kcal per gram of protein/carb/fat);
 *   2. every row whose portion is measurable in mass or volume says so in its
 *      serving string, since that is what `parseServingGrams` scales against.
 *
 * Both have documented exceptions, and BOTH exception sets are enumerated
 * rather than tolerated by a loose threshold — an allow-list fails when a new
 * row joins it, a percentage band silently absorbs the next typo.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { parseFoodText } from "@/lib/nlFoodParser";

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCE = readFileSync(resolve(HERE, "../nlFoodParser.ts"), "utf8");

interface Row {
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  serving: string;
}

/**
 * Read the table out of the source.
 *
 * `FOOD_DB` is module-private and exporting it purely for a test would widen
 * the module's surface for no runtime reason, so this parses the literal. The
 * count assertion below is what keeps that honest: if the shape ever changes
 * enough that rows stop matching, the row count collapses and the suite fails
 * loudly rather than silently checking nothing — which is the failure mode a
 * regex-based fixture is actually prone to.
 */
function readFoodDb(): Row[] {
  const start = SOURCE.indexOf("const FOOD_DB");
  // A plain throw, not `expect` — this runs at module scope, where a failed
  // matcher aborts collection and vitest reports "no tests" instead of naming
  // the problem. Renaming or moving the table should say so.
  if (start < 0) {
    throw new Error(
      "FOOD_DB literal not found in nlFoodParser.ts — was it renamed or moved? " +
        "This fixture reads the table out of the source; update it alongside."
    );
  }
  const body = SOURCE.slice(start, SOURCE.indexOf("\n};", start));

  const re =
    /"?([a-z0-9 '&+-]+)"?:\s*\{\s*calories:\s*([\d.]+),\s*protein:\s*([\d.]+),\s*carbs:\s*([\d.]+),\s*fat:\s*([\d.]+),\s*serving:\s*"([^"]+)"/g;
  const rows: Row[] = [];
  for (let m = re.exec(body); m !== null; m = re.exec(body)) {
    rows.push({
      // Unquoted keys (`beer:`) let the character class swallow the source
      // indentation, while quoted ones (`"chicken breast":`) do not — so the
      // names arrive inconsistently padded and must be trimmed before any
      // set comparison. Found by this file's own name-based assertions.
      name: m[1].trim(),
      calories: Number(m[2]),
      protein: Number(m[3]),
      carbs: Number(m[4]),
      fat: Number(m[5]),
      serving: m[6],
    });
  }
  return rows;
}

const ROWS = readFoodDb();

/**
 * Rows where the macro triple legitimately under-counts the calories, because
 * ethanol carries ~7 kcal/g and is not protein, carbohydrate or fat. Nothing
 * else in the table may miss its calories this way.
 */
const ALCOHOL = new Set(["wine", "beer"]);

/**
 * Rows served as a composite item, where a gram weight would be a fiction —
 * "1 sandwich", "1 slice" of pizza, "1 bowl" of ramen. `parseFoodText`
 * deliberately falls back to one-serving macros for a mass-prefixed input on
 * these (documented at the `multiplier` branch), which is right: "200 g
 * sandwich" has no defensible answer. Every OTHER row must be scalable.
 */
const COMPOSITE_SERVINGS = new Set([
  "omelette",
  "wrap",
  "sandwich",
  "burger",
  "pizza",
  "burrito",
  "taco",
  "tacos",
  "quesadilla",
  "nachos",
  "sushi",
  "curry",
  "stir fry",
  "kebab",
  "ramen",
  "pho",
  "pie",
  "fish and chips",
]);

describe("FOOD_DB — the fixture reads the real table", () => {
  it("finds every row", () => {
    /* Guards the regex, not the data. A silently-empty scan would make every
       assertion below vacuously true — the exact shape of tautology this
       codebase keeps finding in its own tests. */
    expect(ROWS.length).toBe(201);
    expect(ROWS.map((r) => r.name)).toContain("chicken breast");
    expect(ROWS.find((r) => r.name === "chicken breast")).toMatchObject({
      calories: 165,
      protein: 31,
    });
  });
});

describe("FOOD_DB — macros reconcile with calories", () => {
  it("holds for every row that is not alcohol", () => {
    /* Atwater: 4 kcal/g protein and carbohydrate, 9 kcal/g fat. Real entries
       drift a little — fibre is counted in carbs but yields ~2 kcal/g, and the
       figures are rounded to whole grams — so the tolerance is the looser of
       25 kcal and 20%, which is wide enough for honest rounding and far too
       tight to hide a transposed digit. */
    const offenders = ROWS.filter((r) => {
      if (ALCOHOL.has(r.name)) return false;
      const atwater = r.protein * 4 + r.carbs * 4 + r.fat * 9;
      const diff = Math.abs(atwater - r.calories);
      return diff > 25 && diff / Math.max(1, r.calories) > 0.2;
    });
    expect(
      offenders.map(
        (r) =>
          `${r.name}: stated ${r.calories}, macros give ${r.protein * 4 + r.carbs * 4 + r.fat * 9}`
      )
    ).toEqual([]);
  });

  it("and the alcohol exceptions are exactly the two known ones", () => {
    /* Stated as an equality so a third under-counting row cannot be waved
       through as "probably a drink". Both fail Atwater by a lot, which is the
       ethanol, and both are listed deliberately. */
    const undercounted = ROWS.filter((r) => {
      const atwater = r.protein * 4 + r.carbs * 4 + r.fat * 9;
      return (
        r.calories - atwater > 25 && (r.calories - atwater) / r.calories > 0.2
      );
    });
    expect(new Set(undercounted.map((r) => r.name))).toEqual(ALCOHOL);
  });
});

describe("FOOD_DB — portions are scalable where a portion means anything", () => {
  /* Ask the PARSER, by running it — not a lookalike regex.
   *
   * This predicate used to be its own pattern, and it was looser than the
   * thing it claimed to certify: it accepted "1 medium (118 g)",
   * "1 cup (240 ml)" and "1 slice, 30g", none of which the parser can read
   * (it wants the count in parentheses with no space before the unit). A row
   * added in any of those perfectly natural shapes would have passed here and
   * then silently returned ONE SERVING's macros for every mass the user
   * typed — the exact failure this test exists to prevent. No current row is
   * affected; the gap was latent.
   *
   * Rather than re-implement the rule more accurately, this now drives
   * `parseFoodText` and asks the question behaviourally: does DOUBLING the
   * typed amount double the calories? An unscalable row falls back to
   * one-serving macros for both probes, so the two come out equal and it is
   * caught. Both a mass and a volume probe are tried, so the check needs no
   * knowledge of which unit a row uses — and a wrong guess would fail
   * loudly rather than certify silently.
   */
  /* A 20x spread, not 2x, because integer rounding defeats a small ratio on
     low-calorie rows: tea is 2 kcal per 240 ml cup, so 200 ml -> 2 and
     400 ml -> 3, which is real scaling that a "did it double?" check reads
     as failure. Against 100 vs 2000 the same row goes 1 -> 17. A strict
     increase is then the honest assertion — an unscalable row returns the
     identical one-serving macros for both probes. */
  const scalesWithAmount = (name: string): boolean =>
    (["g", "ml"] as const).some((unit) => {
      const small = parseFoodText(`100${unit} ${name}`)[0];
      const large = parseFoodText(`2000${unit} ${name}`)[0];
      if (!small || !large) return false;
      return large.calories > small.calories;
    });

  /* Exempt ONLY rows that are zero-calorie per serving, and only because the
     fallback is provably harmless there rather than merely small: the
     one-serving macros are 0, so scaling them by any amount is still 0. The
     check cannot measure such a row and there is nothing to measure.
     `creatine` (0 kcal, "1 scoop (5g)") is the whole list today. */
  const isZeroCalorie = (name: string): boolean =>
    (parseFoodText(`100g ${name}`)[0]?.calories ?? 0) === 0;

  const hasMassOrVolume = (_serving: string, name: string) =>
    scalesWithAmount(name) || isZeroCalorie(name);

  it("every non-composite row carries a gram or millilitre count", () => {
    /* This is what `parseServingGrams` scales "200g chicken" against. A row
       without it silently returns ONE SERVING's macros for any mass the user
       types — the parser documents that fallback, and this keeps it confined
       to the rows where it is the right answer. */
    const unscalable = ROWS.filter(
      (r) =>
        !COMPOSITE_SERVINGS.has(r.name) && !hasMassOrVolume(r.serving, r.name)
    );
    expect(unscalable.map((r) => `${r.name} → "${r.serving}"`)).toEqual([]);
  });

  it("and the composite list is not stale", () => {
    /* The other direction: if a composite row later gains a real gram weight,
       it should leave the list rather than sit there granting an exemption it
       no longer needs. */
    const stillComposite = ROWS.filter(
      (r) =>
        COMPOSITE_SERVINGS.has(r.name) && !hasMassOrVolume(r.serving, r.name)
    );
    expect(stillComposite).toHaveLength(COMPOSITE_SERVINGS.size);
    // 91% of the table is mass- or volume-scalable.
    expect(ROWS.length - COMPOSITE_SERVINGS.size).toBe(183);
  });
});
