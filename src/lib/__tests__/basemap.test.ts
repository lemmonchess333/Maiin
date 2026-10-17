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
 *  - the credit opens, then folds to its (i) five seconds after it shows
 *    (not after the map's `load`, which waits for every tile) or on a tap
 *    on the map, and a map torn down before the fold does not leave a
 *    timer or a listener reaching into it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve, relative } from "node:path";

const credit = vi.hoisted(() => ({
  made: [] as {
    options: unknown;
    fold: ReturnType<typeof vi.fn>;
    container: FakeElement;
  }[],
}));
/** The one part of MapLibre's control element the credit reads: its
 *  classes, which MapLibre sets to open it. This suite runs in node. */
interface FakeElement {
  classList: Pick<DOMTokenList, "add" | "contains">;
}
vi.mock("maplibre-gl", () => ({
  AttributionControl: class {
    options: unknown;
    _updateCompactMinimize = vi.fn();
    // MapLibre's control element, which it marks open with a class.
    _container: FakeElement = (() => {
      const names = new Set<string>();
      return {
        classList: {
          add: (...added: string[]) => added.forEach((n) => names.add(n)),
          contains: (name: string) => names.has(name),
        },
      };
    })();
    constructor(options: unknown) {
      this.options = options;
      credit.made.push({
        options,
        fold: this._updateCompactMinimize,
        container: this._container,
      });
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
    expect(
      builders.map((f) => relative(repoRoot, f).replaceAll("\\", "/")).sort()
    ).toEqual([
      "src/components/run/RoutePlannerSheet.tsx",
      "src/components/run/RunMap.tsx",
    ]);
  });

  it.each(
    builders.map((f) => [relative(repoRoot, f).replaceAll("\\", "/"), f])
  )("%s draws the basemap and adds its credit", (_name, file) => {
    const src = readFileSync(file, "utf8");
    expect(src).toMatch(/style:\s*basemapStyle\(/);
    expect(src).toMatch(/addBasemapCredit\(/);
  });

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

  it("start the live run's top corner below the status bar, on the chips' line", () => {
    expect(css).toMatch(
      /\.maplibregl-ctrl-top-right\s*>\s*\.maplibregl-ctrl-attrib\.maplibregl-compact\s*\{[^}]*margin:\s*calc\(var\(--map-overlay-top,/
    );
    // The variable the rule reads is the one the live run sets.
    expect(
      readFileSync(resolve(repoRoot, "src/pages/Run.tsx"), "utf8")
    ).toMatch(/"--map-overlay-top":/);
  });

  it("set the open credit as a caption, 16px lines", () => {
    expect(css).toMatch(
      /\.maplibregl-ctrl-attrib\.maplibregl-compact-show\s*\{[^}]*line-height:\s*16px;/
    );
  });

  it("ring the (i) for a keyboard's focus only, never a tap's", () => {
    expect(css).toMatch(
      /\.maplibregl-ctrl-attrib-button:focus:not\(:focus-visible\)\s*\{[^}]*box-shadow:\s*none;/
    );
    expect(css).toMatch(
      /\.maplibregl-ctrl-attrib-button:focus-visible\s*\{[^}]*box-shadow:/
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
    const on: Record<string, Listener[]> = {};
    return {
      addControl: vi.fn(),
      on: vi.fn((event: string, fn: Listener) => {
        (on[event] ??= []).push(fn);
      }),
      off: vi.fn((event: string, fn: Listener) => {
        on[event] = (on[event] ?? []).filter((f) => f !== fn);
      }),
      fire(event: string) {
        for (const fn of [...(on[event] ?? [])]) fn();
      },
      listening(event: string) {
        return (on[event] ?? []).length;
      },
    };
  }
  /** What MapLibre does once the style's source names its credit. */
  function showCredit(container: FakeElement) {
    container.classList.add("maplibregl-compact", "maplibregl-compact-show");
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

  it("keeps the credit open for five seconds once it shows, then folds it", () => {
    const map = fakeMap();
    addBasemapCredit(map as never, "bottom-left");
    const { fold, container } = credit.made[0];

    // The style arrives before its source has named a credit: nothing on
    // screen yet, so nothing to time.
    map.fire("styledata");
    vi.advanceTimersByTime(CREDIT_OPEN_MS * 2);
    expect(fold).not.toHaveBeenCalled();

    showCredit(container);
    map.fire("sourcedata");
    vi.advanceTimersByTime(CREDIT_OPEN_MS - 1);
    expect(fold).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fold).toHaveBeenCalledOnce();

    // One clock: later style and source events start no other.
    map.fire("sourcedata");
    vi.advanceTimersByTime(CREDIT_OPEN_MS * 2);
    expect(fold).toHaveBeenCalledOnce();
  });

  it("does not wait for the map's load, which waits for every tile", () => {
    const map = fakeMap();
    addBasemapCredit(map as never, "top-right");
    const { fold, container } = credit.made[0];
    showCredit(container);
    map.fire("sourcedata");
    // Tiles still coming in on a weak connection: no `load` yet.
    vi.advanceTimersByTime(CREDIT_OPEN_MS);
    expect(fold).toHaveBeenCalledOnce();
    expect(map.listening("load")).toBe(0);
  });

  it("folds the credit on a tap on the map", () => {
    const map = fakeMap();
    addBasemapCredit(map as never, "top-right");
    const { fold } = credit.made[0];
    map.fire("click");
    expect(fold).toHaveBeenCalledOnce();
  });

  it("a map removed before the fold leaves no timer or listener behind", () => {
    const map = fakeMap();
    const remove = addBasemapCredit(map as never, "bottom-left");
    const { fold, container } = credit.made[0];
    showCredit(container);
    map.fire("sourcedata");
    remove();
    vi.advanceTimersByTime(CREDIT_OPEN_MS * 2);
    expect(fold).not.toHaveBeenCalled();
    // And a credit that never showed is unsubscribed, not left waiting.
    const unshown = fakeMap();
    addBasemapCredit(unshown as never, "bottom-left")();
    for (const event of ["styledata", "sourcedata", "click"]) {
      expect(unshown.listening(event)).toBe(0);
    }
  });
});
