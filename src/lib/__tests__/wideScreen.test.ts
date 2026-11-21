/**
 * The wide layouts are CSS (`wide` and `split` in index.css) with a script
 * copy of each query for the two places that must know (wideScreen.ts).
 * These keep the two the same, and keep each of the iPhone Duo's screens
 * on the layout DESIGN_GUIDE §14r gives it: the outer display
 * and half of Split View stay phones, the inner display standing up gets
 * one column, and open on its side two panes, even built with the iOS 27
 * SDK, which leaves the status bar its side.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { SPLIT_QUERY, WIDE_QUERY } from "@/lib/wideScreen";
import { IPHONE_DUO } from "@/test/iphoneDuo";

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(resolve(here, "../../index.css"), "utf8");

function variant(name: string): string {
  const m = css.match(
    new RegExp(`@custom-variant ${name} \\(@media (\\([^;]+\\))\\);`)
  );
  if (!m) throw new Error(`no @custom-variant ${name} in index.css`);
  return m[1];
}

/** The min-width a query asks for, and whether it asks for touch. */
function parse(query: string): { minWidth: number; touch: boolean } {
  const min = query.match(/\(min-width: (\d+)px\)/);
  if (!min) throw new Error(`no min-width in ${query}`);
  return {
    minWidth: Number(min[1]),
    touch: query.includes("(pointer: coarse)"),
  };
}

describe("the wide layouts", () => {
  it("script and CSS ask the same queries", () => {
    expect(variant("wide")).toBe(WIDE_QUERY);
    expect(variant("split")).toBe(SPLIT_QUERY);
  });

  it("only touch screens get them, so a desktop window keeps the phone's", () => {
    expect(parse(WIDE_QUERY).touch).toBe(true);
    expect(parse(SPLIT_QUERY).touch).toBe(true);
  });

  it("puts each of the Duo's screens on its layout", () => {
    const wide = parse(WIDE_QUERY).minWidth;
    const split = parse(SPLIT_QUERY).minWidth;
    // Phones: the outer display, and an app in half of Split View.
    expect(IPHONE_DUO.outer.width).toBeLessThan(wide);
    expect(IPHONE_DUO.splitHalf.width).toBeLessThan(wide);
    // Every iPhone before it, to the widest Pro Max.
    expect(440).toBeLessThan(wide);
    // Standing up: wide, one column.
    expect(IPHONE_DUO.innerPortrait.width).toBeGreaterThanOrEqual(wide);
    expect(IPHONE_DUO.innerPortrait.width).toBeLessThan(split);
    // Open on its side: two panes, with room to spare for a side column.
    expect(IPHONE_DUO.innerLandscape.width).toBeGreaterThanOrEqual(split);
    expect(IPHONE_DUO.innerSdk27.width - split).toBeGreaterThanOrEqual(50);
  });
});
