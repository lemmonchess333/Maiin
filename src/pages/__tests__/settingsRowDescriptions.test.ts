/**
 * Settings row descriptions must fit on one line.
 *
 * `SettingsIndex` renders each description in a `truncate` paragraph, which
 * is the right treatment for a settings row — but truncation is only
 * invisible while the copy fits. One row did not: "Restore meals you
 * deleted in the last 24 hours" rendered as "…in the last 24 hou…" in the
 * settings capture, and it was also the only description written as a
 * sentence rather than a short label. The register and the overflow were
 * the same mistake.
 *
 * The budget is EVIDENCE, not a guess. 32 is the longest description that
 * a capture frame shows rendering whole — "Visibility, auto-post, GPS
 * zones" and "Meal, workout, streak reminders" both do, at the same size,
 * in the same column. 45 is the one that demonstrably did not. The bar sits
 * at the proven-good end rather than somewhere between them, because the
 * point is to catch the next full sentence before it ships, not to find the
 * exact pixel at which this font gives up.
 *
 * Characters are a proxy for width in a proportional face, so this can in
 * principle pass on a string that still overflows. That is acceptable: the
 * failure mode it exists for is a description written in the wrong
 * register, and those are long by a wide margin, not by two characters.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

/** Longest description proven to render whole in a capture frame. */
const BUDGET = 32;

function descriptions(): string[] {
  const src = readFileSync(
    resolve(repoRoot, "src/pages/SettingsIndex.tsx"),
    "utf8"
  );
  // Only the catalogue entries — `description:` appears once more as the
  // interface field declaration, which carries no string literal.
  return [...src.matchAll(/^\s*description: "([^"]*)",/gm)].map((m) => m[1]);
}

describe("Settings row descriptions", () => {
  it("reads the whole catalogue — the fixture this rests on", () => {
    // Without a floor here, a regex that stopped matching would leave the
    // assertion below passing over an empty list.
    const all = descriptions();
    expect(all.length).toBeGreaterThanOrEqual(13);
    expect(all).toContain("Name, photo, body metrics");
  });

  it("every one fits on a single line", () => {
    const overlong = descriptions()
      .filter((d) => d.length > BUDGET)
      .map((d) => `${d} (${d.length})`);
    expect(
      overlong,
      `Settings descriptions render in a \`truncate\` paragraph, so anything ` +
        `past ~${BUDGET} characters is cut mid-word. Write a short label ` +
        `like its neighbours, not a sentence — the row's title already ` +
        `carries the subject.`
    ).toEqual([]);
  });
});
