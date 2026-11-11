/**
 * The Food diary's drawings (DS4, DESIGN_GUIDE §14m rule 25): every row
 * without a photo gets one of ours, chosen from its name and bound to the
 * drawing it was cut from, and an empty day never reads "No … yet".
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { emptyDiaryLine, foodArtKindFor, foodArtUrl } from "../foodArt";
import { FOOD_ART, type FoodArtKind } from "../foodArt.data";

const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const repoFile = (path: string) => readFileSync(resolve(process.cwd(), path));

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

  it("serves the cut-out under the app's base path", () => {
    expect(foodArtUrl("bowl")).toMatch(/\/food-art\/bowl\.webp$/);
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
