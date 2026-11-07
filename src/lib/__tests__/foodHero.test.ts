/**
 * Food's hero words and the diary rows' drawings (DS4, DESIGN_GUIDE §14m).
 * The figure reads what was eaten against the target, the first use gives
 * its first step with a number (rule 41), and every row without a photo
 * gets one of our drawings, bound to the drawing it was cut from.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  emptyDiaryLine,
  foodArtKindFor,
  foodHeroFigure,
  foodHeroLine,
} from "../foodHero";
import { FOOD_ART, type FoodArtKind } from "../foodArt.data";
import { group as groupedNumber } from "@/test/localeGrouping";

const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const repoFile = (path: string) => readFileSync(resolve(process.cwd(), path));

describe("foodHeroFigure", () => {
  it("reads what was eaten against the target", () => {
    expect(
      foodHeroFigure({ consumed: 1240, target: 2350, mode: "eaten" })
    ).toEqual({ value: 1240, caption: `of ${groupedNumber(2350)} kcal` });
  });

  it("starts a day at zero, not at the whole target", () => {
    expect(
      foodHeroFigure({ consumed: 0, target: 2350, mode: "eaten" }).value
    ).toBe(0);
  });

  it("reads what is left in the left mode", () => {
    expect(
      foodHeroFigure({ consumed: 1240, target: 2350, mode: "left" })
    ).toEqual({ value: 1110, caption: `left of ${groupedNumber(2350)} kcal` });
  });

  it("past the target, says how far in numbers and nothing else", () => {
    expect(
      foodHeroFigure({ consumed: 2600, target: 2350, mode: "left" })
    ).toEqual({ value: 250, caption: `over ${groupedNumber(2350)} kcal` });
    expect(
      foodHeroFigure({ consumed: 2600, target: 2350, mode: "eaten" })
    ).toEqual({ value: 2600, caption: `of ${groupedNumber(2350)} kcal` });
  });

  it("with no target, reads what was logged", () => {
    expect(foodHeroFigure({ consumed: 300, target: 0, mode: "left" })).toEqual({
      value: 300,
      caption: "kcal logged",
    });
  });
});

describe("foodHeroLine", () => {
  const base = {
    isToday: true,
    beforeJoined: false,
    hasAnyMeal: false,
    isNew: true,
    target: 2350,
  };

  it("gives a first use its first step and the number it fills", () => {
    expect(foodHeroLine(base)).toBe(
      `Log your first meal to start today's ${groupedNumber(2350)} kcal.`
    );
  });

  it("does not call a returning person's next meal their first", () => {
    expect(foodHeroLine({ ...base, isNew: false })).toBe(
      `Log a meal to start today's ${groupedNumber(2350)} kcal.`
    );
  });

  it("says nothing once a meal is in the diary, or on another day", () => {
    expect(foodHeroLine({ ...base, hasAnyMeal: true })).toBeNull();
    expect(foodHeroLine({ ...base, isToday: false })).toBeNull();
    expect(foodHeroLine({ ...base, beforeJoined: true })).toBeNull();
  });

  it("never heads with 'No … yet', and carries one number (rules 35, 41)", () => {
    const line = foodHeroLine(base) ?? "";
    expect(line).not.toMatch(/^No\b|\byet\b/);
    expect(line.match(/\d[\d,.\s]*\d|\d/g)).toHaveLength(1);
  });
});

describe("emptyDiaryLine", () => {
  it("never heads the diary with 'No … yet'", () => {
    for (const line of [emptyDiaryLine(true), emptyDiaryLine(false)])
      expect(line).not.toMatch(/^No\b|\byet\b/);
  });
});

describe("foodArtKindFor", () => {
  it.each<[string, FoodArtKind]>([
    ["Oats & berries", "bowl"],
    ["Greek yogurt", "bowl"],
    ["Chicken & rice", "grains"],
    ["Salmon & veg", "protein"],
    ["Chicken salad", "salad"],
    ["Egg sandwich", "bread"],
    ["Scrambled eggs", "eggs"],
    ["Flat white", "drink"],
    ["Protein shake", "drink"],
    ["Protein bar", "sweet"],
    ["Banana", "fruit"],
    ["Fish and chips", "grains"],
    ["Steak", "protein"],
    ["Quick add", "plate"],
  ])("%s gets the %s drawing", (name, kind) => {
    expect(foodArtKindFor([name])).toBe(kind);
  });

  it("matches whole words only", () => {
    expect(foodArtKindFor(["Steak"])).not.toBe("drink");
    expect(foodArtKindFor(["Pancakes"])).toBe("bread");
  });

  it("falls back to the items' names, then the plate", () => {
    expect(foodArtKindFor(["Lunch", "Tuna"])).toBe("protein");
    expect(foodArtKindFor([])).toBe("plate");
  });
});

const kinds = Object.keys(FOOD_ART) as FoodArtKind[];

describe("food art cut-outs", () => {
  it.each(kinds)("%s is cut from its drawing", (kind) => {
    const art = FOOD_ART[kind];
    expect(art.source).toBe(`docs/food-art/${kind}.jpg`);
    expect(
      sha(repoFile(art.source)),
      `${art.source} changed: re-run npm run art:food`
    ).toBe(art.sourceSha256);
    expect(sha(repoFile(`public/${art.src}`))).toBe(art.sha256);
  });

  it("records how each drawing was made", () => {
    const provenance = JSON.parse(
      repoFile("docs/food-art/provenance.json").toString()
    ) as { art: Record<string, { sha256: string; prompt: string }> };
    for (const kind of kinds) {
      expect(provenance.art[kind]?.sha256).toBe(FOOD_ART[kind].sourceSha256);
      expect(provenance.art[kind]?.prompt.length).toBeGreaterThan(100);
    }
  });
});
