/**
 * One calorie unit, from one place.
 *
 * `CALORIE_UNIT` in `src/utils/formatNutrition.ts` described itself as the
 * standard label, "kcal everywhere". Nothing held that, and the app shipped
 * both words. Measured before this gate: 34 surfaces wrote the unit as a
 * literal, roughly half "cal" and half "kcal", and the split followed no
 * boundary a reader could learn —
 *
 *   Home        TodayEnergy "1,790 kcal logged" · DayPeekCard "1,790 cal"
 *   Food        the suggestion dropdown used both, three list sections apart
 *   Settings    "kcal/day target" beside an Analytics tile in "kcal/day"
 *
 * So the rule is the same one `runLabels` gets for distances: a unit is a
 * display decision, and display decisions come from one module. The payoff
 * beyond consistency is that the cal-versus-kcal question — a live one —
 * becomes one line of production code instead of 34 files. Tests that
 * assert a whole rendered sentence still quote the word, and should: they
 * are how you notice.
 *
 * WHAT IT MATCHES. A value — an interpolation's closing brace, or a digit —
 * followed within a couple of characters by `cal` or `kcal`. That is the
 * printed shape. It deliberately does NOT match the many places where those
 * letters are something else: `calories` and `calorie` as field and prop
 * names, `calc`, `local`, `canonical`, the Atwater factors in a comment
 * ("4 cal/g protein"), or a validation threshold quoted in prose
 * ("5000 cal absolute"). Comments are stripped first, so a docstring can
 * still quote a past rendering.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, globSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

/**
 * Files where a literal is not product copy.
 *
 * `src/pages/dev/` is the brand bake-off lab, which renders static mock
 * chrome to compare typefaces — it is not a product surface, and the
 * copy guards exclude it for the same reason.
 */
const NOT_PRODUCT = ["src/pages/dev/", "src/test/"];

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (s) => " ".repeat(s.length))
    .replace(/\/\/[^\n]*/g, (s) => " ".repeat(s.length));
}

/** A value, then the unit as its own word. */
const INLINE_UNIT = /(\}|\d)\s*(\{"\s"\})?\s*k?cal\b/;

interface Hit {
  site: string;
  line: string;
}

function scan(): Hit[] {
  const out: Hit[] = [];
  for (const rel of globSync("src/**/*.{ts,tsx}", { cwd: repoRoot })) {
    if (rel.includes("__tests__") || rel.includes(".test.")) continue;
    if (NOT_PRODUCT.some((p) => rel.startsWith(p))) continue;
    // The constant's own home.
    if (rel === "src/utils/formatNutrition.ts") continue;
    const src = stripComments(readFileSync(resolve(repoRoot, rel), "utf8"));
    src.split("\n").forEach((line, i) => {
      if (INLINE_UNIT.test(line))
        out.push({ site: `${rel}:${i + 1}`, line: line.trim() });
    });
  }
  return out;
}

describe("the calorie unit comes from CALORIE_UNIT", () => {
  it("the detector matches the printed shape and nothing else", () => {
    /* Positive control first. A gate that matches nothing reports a clean
       codebase, which is the failure this file exists to prevent. */
    expect(INLINE_UNIT.test("{item.cal} kcal")).toBe(true);
    expect(
      INLINE_UNIT.test("{dailyTotals.calories.toLocaleString()} cal")
    ).toBe(true);
    expect(INLINE_UNIT.test("`${Math.round(calories)} cal`")).toBe(true);
    expect(INLINE_UNIT.test("/ 2,200 kcal")).toBe(true);
    // The converted form is not an offender.
    expect(INLINE_UNIT.test("{item.cal} {CALORIE_UNIT}")).toBe(false);
    expect(INLINE_UNIT.test("`${n} ${CALORIE_UNIT}/day`")).toBe(false);
    // And the letters as part of something else stay quiet.
    expect(INLINE_UNIT.test("const totalCalories = 5;")).toBe(false);
    expect(INLINE_UNIT.test("calories: 540,")).toBe(false);
    expect(INLINE_UNIT.test("width: calc(100% - 4px)")).toBe(false);
    expect(INLINE_UNIT.test("aria-label={`Per-serving ${label}`}")).toBe(false);
  });

  it("no surface writes the calorie unit by hand", () => {
    const hits = scan().map((h) => `${h.site}  ${h.line.slice(0, 90)}`);
    expect(
      hits,
      `Render the calorie unit with CALORIE_UNIT from ` +
        `src/utils/formatNutrition.ts. A literal here is how the app came ` +
        `to show "cal" on one card and "kcal" on the next:\n  ` +
        hits.join("\n  ")
    ).toEqual([]);
  });

  it("every exclusion still names something real", () => {
    /* Otherwise an entry outlives what justified it and silently exempts
       whatever gets written there next. */
    for (const prefix of NOT_PRODUCT) {
      const files = globSync(`${prefix}**/*.{ts,tsx}`, { cwd: repoRoot });
      expect(files.length, `${prefix} matches no files`).toBeGreaterThan(0);
    }
  });
});
