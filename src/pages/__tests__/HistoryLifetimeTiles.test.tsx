/**
 * History's Lifetime footer is three PEER tiles, and they must state their
 * unit in one place.
 *
 * They did not. The runs tile pushed `km` down into its caption ("km · 1
 * runs") while the lifting tile beside it carried `kg` inline on the
 * figure — so the same piece of information sat in two different positions
 * within one row of three, and the runs caption opened on a dangling unit
 * that only parsed if you read upward into the number above it. The
 * nutrition tile had no unit at all. Visible in the Analytics capture
 * frame; invisible to any per-tile reading, because each tile was
 * internally consistent.
 *
 * The lifting tile's unit was also `font-bold` (700) against an
 * `font-extrabold` (800) figure — the weight mixing DESIGN_GUIDE bars.
 * `text-xs font-medium` is what Home's weight tile already uses for
 * exactly this role.
 *
 * Written against the SOURCE rather than a render, following
 * `HistoryNutritionTargets.test.tsx`: History mounts charts, maps and
 * several Firestore hooks, and a full render test of it would be pinning
 * fixtures rather than this property. What has to hold is textual and
 * local — the shape of one 40-line section.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

/** Comments are not code — the fix left one naming the old caption, and
 *  matching raw source would flag it as the very thing it explains. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
}

const historyRaw = readFileSync(
  resolve(repoRoot, "src/pages/History.tsx"),
  "utf8"
);

/** The `<section id="analytics-lifetime">` block, comments removed. */
function lifetimeSection(): string {
  const start = historyRaw.indexOf('<section id="analytics-lifetime"');
  expect(
    start,
    "the lifetime section is gone — retarget this test"
  ).toBeGreaterThan(-1);
  const end = historyRaw.indexOf("</section>", start);
  expect(end, "unterminated lifetime section").toBeGreaterThan(start);
  return stripComments(historyRaw.slice(start, end));
}

describe("History — Lifetime tiles", () => {
  it("has three tiles, each with its unit on the figure", () => {
    const section = lifetimeSection();

    // Anchors the count, so a fourth tile added without a unit fails here
    // rather than silently passing the assertions below.
    const figures = section.match(/font-extrabold font-mono tabular-nums/g);
    expect(figures?.length, "expected three lifetime figures").toBe(3);

    const units = section.match(/<span className="text-xs font-medium/g);
    expect(
      units?.length,
      "every lifetime figure carries its unit inline — one span per tile"
    ).toBe(3);
  });

  it("keeps no unit in the caption line", () => {
    const section = lifetimeSection();
    // The captions are the `text-caption` paragraphs. None may open on a
    // unit token; that is the exact shape the runs tile had.
    const captions = [
      ...section.matchAll(/className="text-caption[^"]*"\s*>([\s\S]*?)<\/p>/g),
    ].map((m) => m[1].trim());
    expect(captions.length, "expected three lifetime captions").toBe(3);
    for (const caption of captions) {
      expect(
        caption,
        `a lifetime caption opens on a unit: ${JSON.stringify(caption)}`
      ).not.toMatch(/^(km|kg|t|lifted|kcal)\b/);
    }
  });

  it("never sets a unit at 700 beside an 800 figure", () => {
    const section = lifetimeSection();
    expect(
      section,
      "DESIGN_GUIDE: never mix 700 and 800 in the same visual tier"
    ).not.toMatch(/text-xs font-bold/);
  });
});
