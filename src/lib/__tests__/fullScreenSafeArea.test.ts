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
 * The same holds for a route App.tsx renders outside Layout: the run
 * screens, the legal pages Settings links to, the weekly recap and the
 * operator pages. Each pads its own top, and the second test keeps the list
 * of such routes complete, so a new one cannot miss it.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const src = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel: string) => readFileSync(join(src, rel), "utf8");

function tsxFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory())
      return entry.name === "__tests__" ? [] : tsxFiles(path);
    return entry.name.endsWith(".tsx") ? [path] : [];
  });
}

const CLEARS_STATUS_BAR = /--safe-top|safe-area-pt|safe-area-inset-top/;

/** Each route App.tsx renders outside Layout, and the file that pads it. */
const OUTSIDE_LAYOUT: Record<string, string> = {
  "/privacy": "pages/PrivacyPolicy.tsx",
  "/terms": "pages/TermsOfService.tsx",
  "/support": "pages/Support.tsx",
  "/review": "components/review/RecapStory.tsx",
  "/run": "pages/Run.tsx",
  "/run-summary": "pages/RunSummary.tsx",
  "/diagnostics": "pages/Diagnostics.tsx",
  "/admin/moderation": "pages/AdminModeration.tsx",
  // During setup, the account page renders in App.tsx's own padded <main>.
  "/settings/account": "App.tsx",
};

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

  it("pads every route rendered outside Layout", () => {
    const app = read("App.tsx");
    const start = app.indexOf("<Route element={<Layout />}>");
    expect(start, "App.tsx has no Layout route").toBeGreaterThan(-1);
    const end = app.indexOf("</Route>", start);
    const outside = app.slice(0, start) + app.slice(end);
    const paths = [...outside.matchAll(/path="([^"]+)"/g)]
      .map((m) => m[1])
      // The labs are not product surfaces; "/log" redirects; "*" is the
      // signed-out and setup fallback (Login and Onboarding pad already).
      .filter((p) => !p.startsWith("/dev/") && p !== "/log" && p !== "*");
    expect([...new Set(paths)].sort()).toEqual(
      Object.keys(OUTSIDE_LAYOUT).sort()
    );
    for (const [route, file] of Object.entries(OUTSIDE_LAYOUT)) {
      expect(read(file), `${route} (${file})`).toMatch(CLEARS_STATUS_BAR);
    }
  });

  it("starts the live run's map controls and banners below the status bar", () => {
    const run = read("pages/Run.tsx");
    // The root, whatever the phase.
    expect(run).toMatch(
      /className=\{`fixed inset-0 z-50 flex flex-col pt-\[var\(--safe-top\)\]/
    );
    // The tracking map is full-bleed; nothing on it sits at a bare top-N.
    const map = run.slice(
      run.indexOf('className="fixed inset-0 z-50 text-white"')
    );
    const layer = map.slice(0, map.indexOf("<RunBottomSheet"));
    expect(layer).toContain("--map-overlay-top");
    expect(layer).not.toMatch(/\babsolute\b[^"]*\btop-\d/);
    expect(read("components/run/RunMap.tsx")).toContain(
      "top-[var(--map-overlay-top,0.5rem)]"
    );
  });
});
