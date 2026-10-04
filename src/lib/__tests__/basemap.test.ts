/**
 * The basemap and its credit (src/lib/basemap.ts).
 *
 * Three things hold the move off CARTO together, and each can drift on its
 * own without anything else noticing:
 *  - the CSP in index.html must allow the one origin the styles load from,
 *    or every map is blank (in the iOS app too: the shell serves the same
 *    index.html);
 *  - every map built in src/ must add the credit, because the maps are
 *    built with `attributionControl: false` so the credit can be placed;
 *  - the credit opens, then folds to its (i), and a map torn down before
 *    the fold does not leave a timer reaching into it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve, relative } from "node:path";

const credit = vi.hoisted(() => ({
  made: [] as { options: unknown; fold: ReturnType<typeof vi.fn> }[],
}));
vi.mock("maplibre-gl", () => ({
  AttributionControl: class {
    options: unknown;
    _updateCompactMinimize = vi.fn();
    constructor(options: unknown) {
      this.options = options;
      credit.made.push({ options, fold: this._updateCompactMinimize });
    }
  },
}));

import {
  BASEMAP_ORIGIN,
  BASEMAP_STYLES,
  CREDIT_OPEN_MS,
  addBasemapCredit,
  basemapStyle,
} from "../basemap";

const repoRoot = resolve(__dirname, "../../..");
const indexHtml = readFileSync(resolve(repoRoot, "index.html"), "utf8");
const policy =
  indexHtml.match(
    /http-equiv="Content-Security-Policy"\s+content="([\s\S]*?)"/
  )?.[1] ?? "";
const directives = new Map(
  policy.split(";").map((part) => {
    const [name, ...sources] = part.trim().split(/\s+/);
    return [name, sources];
  })
);

describe("the basemap's origin and the CSP", () => {
  it("both styles load from the one basemap origin", () => {
    expect(BASEMAP_STYLES.light).toBe(
      "https://tiles.openfreemap.org/styles/positron"
    );
    expect(BASEMAP_STYLES.dark).toBe(
      "https://tiles.openfreemap.org/styles/dark"
    );
    expect(basemapStyle(true)).toBe(BASEMAP_STYLES.dark);
    expect(basemapStyle(false)).toBe(BASEMAP_STYLES.light);
  });

  it("allows the origin for fetches (style, TileJSON, tiles, glyphs, sprites)", () => {
    expect(directives.get("connect-src")).toContain(BASEMAP_ORIGIN);
  });

  it("allows the origin for images (sprite sheets, raster tiles)", () => {
    expect(directives.get("img-src")).toContain(BASEMAP_ORIGIN);
  });

  it("no longer allows CARTO anywhere in the policy", () => {
    expect(policy).toContain("connect-src");
    expect(policy).not.toMatch(/carto/i);
  });
});

/** Every non-test source file under src/. */
function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name !== "__tests__") sourceFiles(full, out);
    } else if (/\.(ts|tsx)$/.test(name) && !/\.test\./.test(name)) {
      out.push(full);
    }
  }
  return out;
}

describe("every map carries the credit", () => {
  const files = sourceFiles(resolve(repoRoot, "src"));
  const builders = files.filter((f) =>
    /new\s+maplibregl\.Map\s*\(/.test(readFileSync(f, "utf8"))
  );

  it("finds the maps (the scan reaches them)", () => {
    expect(builders.map((f) => relative(repoRoot, f)).sort()).toEqual([
      "src/components/run/RoutePlannerSheet.tsx",
      "src/components/run/RunMap.tsx",
    ]);
  });

  it.each(builders.map((f) => [relative(repoRoot, f), f]))(
    "%s draws the basemap and adds its credit",
    (_name, file) => {
      const src = readFileSync(file, "utf8");
      expect(src).toMatch(/style:\s*basemapStyle\(/);
      expect(src).toMatch(/addBasemapCredit\(/);
    }
  );

  it("no source file still names CARTO's hosts", () => {
    const named = files.filter((f) =>
      /cartocdn/i.test(readFileSync(f, "utf8"))
    );
    expect(named).toEqual([]);
  });
});

describe("the credit's styles", () => {
  const css = readFileSync(
    resolve(repoRoot, "src/lib/basemapCredit.css"),
    "utf8"
  ).replace(/\/\*[\s\S]*?\*\//g, "");

  it("load with every map that adds the credit", () => {
    expect(
      readFileSync(resolve(repoRoot, "src/lib/basemap.ts"), "utf8")
    ).toMatch(/^import "\.\/basemapCredit\.css";$/m);
  });

  it("give the (i) a 44px tap target: 24px drawn, 10px each side", () => {
    expect(css).toMatch(
      /\.maplibregl-ctrl-attrib-button::after\s*\{[^}]*inset:\s*-10px;/
    );
  });

  it("draw the dark credit in the fixed stage tokens, with no hex colour", () => {
    expect(css).toMatch(
      /\[data-map-theme="dark"\] \.maplibregl-ctrl-attrib\.maplibregl-compact\s*\{[^}]*hsl\(var\(--stage-raised\)/
    );
    expect(css.replace(/url\("[^"]*"\)/g, "")).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });
});

describe("addBasemapCredit", () => {
  type Listener = () => void;
  function fakeMap() {
    const once: Record<string, Listener[]> = {};
    return {
      addControl: vi.fn(),
      once: vi.fn((event: string, fn: Listener) => {
        (once[event] ??= []).push(fn);
      }),
      off: vi.fn((event: string, fn: Listener) => {
        once[event] = (once[event] ?? []).filter((f) => f !== fn);
      }),
      fire(event: string) {
        const listeners = once[event] ?? [];
        once[event] = [];
        for (const fn of listeners) fn();
      },
    };
  }

  beforeEach(() => {
    vi.useFakeTimers();
    credit.made.length = 0;
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("adds MapLibre's compact credit in the corner it is given", () => {
    const map = fakeMap();
    addBasemapCredit(map as never, "top-right");
    expect(credit.made).toHaveLength(1);
    expect(credit.made[0].options).toEqual({ compact: true });
    expect(map.addControl).toHaveBeenCalledWith(
      expect.objectContaining({ options: { compact: true } }),
      "top-right"
    );
  });

  it("keeps the credit open for five seconds after the map loads, then folds it", () => {
    const map = fakeMap();
    addBasemapCredit(map as never, "bottom-left");
    const { fold } = credit.made[0];

    // Before the map has loaded there is no credit on screen to time.
    vi.advanceTimersByTime(CREDIT_OPEN_MS * 2);
    expect(fold).not.toHaveBeenCalled();

    map.fire("load");
    vi.advanceTimersByTime(CREDIT_OPEN_MS - 1);
    expect(fold).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fold).toHaveBeenCalledOnce();
  });

  it("a map removed before the fold leaves no timer behind", () => {
    const map = fakeMap();
    const remove = addBasemapCredit(map as never, "bottom-left");
    const { fold } = credit.made[0];
    map.fire("load");
    remove();
    vi.advanceTimersByTime(CREDIT_OPEN_MS * 2);
    expect(fold).not.toHaveBeenCalled();
    // And a load that never came is unsubscribed, not left waiting.
    const unloaded = fakeMap();
    addBasemapCredit(unloaded as never, "bottom-left")();
    expect(unloaded.off).toHaveBeenCalledWith("load", expect.any(Function));
  });
});
