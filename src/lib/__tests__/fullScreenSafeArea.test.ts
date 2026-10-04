/**
 * A full-screen layer clears the status bar, as pages do.
 *
 * Pages sit inside Layout, which pads its main column by `--safe-top` (the
 * iPhone's status bar, `env(safe-area-inset-top)` with index.css's iOS
 * fallback). A `fixed inset-0` layer is laid out against the viewport, not
 * that column, so it gets none of it: the workout session, its finish
 * screen, Social's people search and the food camera each put their title
 * or close button where the clock and battery are, found on the App Store
 * screenshot capture's iPhone safe areas. Each now pads by the same
 * `--safe-top`, on the layer or on the bar at its top.
 *
 * The rule here covers OPAQUE full-screen layers (an unalpha'd
 * `bg-background` or `bg-black`) that are not a centred dialog: the ones
 * whose first row of content would otherwise sit under the status bar.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const src = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function tsxFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory())
      return entry.name === "__tests__" ? [] : tsxFiles(path);
    return entry.name.endsWith(".tsx") ? [path] : [];
  });
}

const CLEARS_STATUS_BAR = /--safe-top|safe-area-pt|safe-area-inset-top/;

describe("full-screen layers clear the status bar", () => {
  it("pads every opaque full-screen layer by the safe area, on the layer or its top bar", () => {
    const layers: { where: string; clears: boolean }[] = [];
    for (const file of tsxFiles(src)) {
      const text = readFileSync(file, "utf8");
      for (const m of text.matchAll(
        /className="([^"]*\bfixed inset-0\b[^"]*)"/g
      )) {
        const cls = m[1];
        const opaque = /(^|\s)bg-(background|black)(\s|$)/.test(cls);
        const centred =
          /\bitems-center\b/.test(cls) && /\bjustify-center\b/.test(cls);
        if (!opaque || centred) continue;
        // The layer's own tag, its style and its first row of content.
        const start = m.index ?? 0;
        const window = text.slice(Math.max(0, start - 200), start + 900);
        const line = text.slice(0, start).split("\n").length;
        layers.push({
          where: `${relative(src, file)}:${line}`,
          clears: CLEARS_STATUS_BAR.test(window),
        });
      }
    }
    // Anchor: a scan that found nothing would pass whatever the layers did.
    expect(layers.length).toBeGreaterThanOrEqual(6);
    expect(layers.filter((l) => !l.clears).map((l) => l.where)).toEqual([]);
  });
});
