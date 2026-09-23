/**
 * Space — the back arrow over the hero sits on a chip of its own.
 *
 * Bare, a white arrow on a cover photo disappeared on light covers, and
 * people did not know they could leave the page. Over a photo the chip is
 * the dark scrim RunDetail's back button uses over its map; over the plain
 * tinted hero it is the page colour.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = readFileSync(join(process.cwd(), "src/pages/Space.tsx"), "utf8");

describe("Space hero back button", () => {
  it("draws a chip behind the arrow, dark over a photo", () => {
    const start = src.indexOf('aria-label="Back"');
    expect(start).toBeGreaterThan(-1);
    const button = src.slice(start, src.indexOf("</div>", start));
    expect(button).toContain("rounded-full");
    expect(button).toContain("style={photo ? { background: THEME.scrim }");
    expect(button).toContain("bg-background/80");
  });
});
