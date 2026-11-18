/**
 * The feature map stays true to the app: every route is one App.tsx
 * serves, every source glob names files that exist, ids are unique and
 * the smoke set names real features. A map that rots selects nothing for
 * a change and reports a pass for screens it never opened.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import {
  FEATURES,
  NOT_DRIVEN,
  SHARED_SOURCES,
  SMOKE,
  type Feature,
  type Step,
} from "./featureMap";
import { globToRegExp } from "./select";

const ROOT = process.cwd();

function filesUnder(dir: string): string[] {
  const out: string[] = [];
  const visit = (abs: string) => {
    for (const name of readdirSync(abs)) {
      if (name === "node_modules" || name.startsWith(".")) continue;
      const p = join(abs, name);
      if (statSync(p).isDirectory()) visit(p);
      else out.push(relative(ROOT, p));
    }
  };
  visit(join(ROOT, dir));
  return out;
}

const SRC = filesUnder("src");
const ALL = [
  ...SRC,
  ...filesUnder("public"),
  "index.html",
  "vite.config.ts",
  "package-lock.json",
];

/** Every `path="..."` the router declares. */
const ROUTES = [
  ...readFileSync(join(ROOT, "src/App.tsx"), "utf8").matchAll(
    /path="([^"]+)"/g
  ),
].map((m) => m[1]);

describe("the verify feature map", () => {
  it("has between 25 and 40 features with unique ids", () => {
    const ids = FEATURES.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThanOrEqual(25);
    expect(ids.length).toBeLessThanOrEqual(40);
  });

  it.each(FEATURES.map((f) => [f.id, f] as const))(
    "%s: its route is one App.tsx serves",
    (_id, f: Feature) => {
      expect(ROUTES, `${f.route} is not a path= in src/App.tsx`).toContain(
        f.route
      );
    }
  );

  it.each(FEATURES.map((f) => [f.id, f] as const))(
    "%s: every source glob matches a file",
    (_id, f: Feature) => {
      expect(f.sources.length).toBeGreaterThan(0);
      for (const glob of f.sources) {
        const re = globToRegExp(glob);
        expect(
          ALL.some((file) => re.test(file)),
          `${glob} matches no file; the feature would never be chosen`
        ).toBe(true);
      }
    }
  );

  it.each(FEATURES.map((f) => [f.id, f] as const))(
    "%s: starts with a goto and checks something the person sees",
    (_id, f: Feature) => {
      expect("goto" in f.steps[0]).toBe(true);
      expect(f.steps.some((s: Step) => "see" in s)).toBe(true);
      expect(f.expected.length).toBeGreaterThan(20);
    }
  );

  it("never asserts an absence before something on the screen is seen", () => {
    for (const f of FEATURES) {
      f.steps.forEach((s, i) => {
        if (!("absent" in s)) return;
        const since = f.steps.slice(0, i);
        const lastGoto = since.map((x) => "goto" in x).lastIndexOf(true);
        expect(
          since.slice(lastGoto + 1).some((x) => "see" in x),
          `${f.id} step ${i + 1} asserts an absence with nothing seen first`
        ).toBe(true);
      });
    }
  });

  it("the smoke set names real features, and shared globs match files", () => {
    for (const id of SMOKE) expect(FEATURES.map((f) => f.id)).toContain(id);
    for (const glob of SHARED_SOURCES)
      expect(
        ALL.some((file) => globToRegExp(glob).test(file)),
        glob
      ).toBe(true);
  });

  it("drives every page, or says in NOT_DRIVEN why it cannot", () => {
    const pages = SRC.filter(
      (f) => /^src\/pages\/.*\.tsx$/.test(f) && !/__tests__/.test(f)
    );
    const exempt = Object.keys(NOT_DRIVEN);
    const missing = pages.filter(
      (p) =>
        !FEATURES.some((f) => f.sources.includes(p)) &&
        !exempt.some((g) => globToRegExp(g).test(p))
    );
    expect(
      missing,
      "a page no feature names: add a feature for it in " +
        "scripts/verify/featureMap.ts, or say in NOT_DRIVEN why not"
    ).toEqual([]);
    /* And no exemption for a page the map now drives, or one gone. */
    for (const glob of exempt) {
      const hits = pages.filter((p) => globToRegExp(glob).test(p));
      expect(hits.length, `${glob} names no page`).toBeGreaterThan(0);
      for (const p of hits)
        expect(
          FEATURES.some((f) => f.sources.includes(p)),
          `${p} is both driven and exempt`
        ).toBe(false);
    }
  });

  it("lists the app folders no feature names (printed, not a gate)", () => {
    const claimed = (file: string) =>
      [...FEATURES.flatMap((f) => f.sources), ...SHARED_SOURCES].some((g) =>
        globToRegExp(g).test(file)
      );
    const dirs = new Set(
      SRC.filter(
        (f) =>
          /\.(tsx?|css)$/.test(f) &&
          !/__tests__|\.test\./.test(f) &&
          !f.startsWith("src/test/") &&
          !claimed(f)
      ).map((f) => f.split("/").slice(0, 3).join("/"))
    );
    /* A change in one of these runs the smoke set (select.ts) and is
       named in the report as unmapped, so nothing is skipped in silence;
       this prints the list for whoever extends the map. The assertion is
       only that the scan saw the tree. */
    console.info(
      `[featureMap] src folders with files no feature names:\n` +
        [...dirs].sort().join("\n")
    );
    expect(SRC.length).toBeGreaterThan(1000);
  });
});
