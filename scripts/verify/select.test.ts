import { describe, expect, it } from "vitest";
import { FEATURES, SMOKE } from "./featureMap";
import { globToRegExp, reachesApp, selectFeatures } from "./select";

const ids = (files: string[]) =>
  selectFeatures(files).features.map((f) => f.id);

describe("globToRegExp", () => {
  it("matches a double star at any depth, including none", () => {
    const re = globToRegExp("src/components/home/**");
    expect(re.test("src/components/home/WeekStrip.tsx")).toBe(true);
    expect(re.test("src/components/home/deep/x.ts")).toBe(true);
    expect(re.test("src/components/homework/x.ts")).toBe(false);
    expect(globToRegExp("src/**/x.ts").test("src/x.ts")).toBe(true);
  });

  it("keeps a single star inside one folder and reads braces", () => {
    expect(globToRegExp("src/*.tsx").test("src/App.tsx")).toBe(true);
    expect(globToRegExp("src/*.tsx").test("src/pages/Home.tsx")).toBe(false);
    const re = globToRegExp("src/{App,main}.tsx");
    expect(re.test("src/main.tsx")).toBe(true);
    expect(re.test("src/Main.tsx")).toBe(false);
  });

  it("treats dots and other regex characters as themselves", () => {
    expect(globToRegExp("index.html").test("indexXhtml")).toBe(false);
  });
});

describe("selectFeatures", () => {
  it("chooses the features whose sources a change touches", () => {
    expect(ids(["src/pages/League.tsx"])).toEqual(["league"]);
    expect(ids(["src/components/home/WeekStrip.tsx"])).toEqual(
      expect.arrayContaining(["home", "home-week"])
    );
    expect(ids(["src/pages/League.tsx"])).not.toContain("home");
  });

  it("names why each feature was chosen", () => {
    const s = selectFeatures(["src/pages/League.tsx", "README.md"]);
    expect(s.because.league).toEqual(["src/pages/League.tsx"]);
    expect(s.unmapped).toEqual([]);
    expect(s.smoke).toBe(false);
  });

  it("runs the smoke set for shared code, without calling it unmapped", () => {
    const s = selectFeatures(["src/components/ui/Button.tsx"]);
    expect(s.features.map((f) => f.id)).toEqual(
      FEATURES.filter((f) => SMOKE.includes(f.id)).map((f) => f.id)
    );
    expect(s.smoke).toBe(true);
    expect(s.unmapped).toEqual([]);
  });

  it("runs the smoke set for app code no feature names, and reports it", () => {
    const file = "src/lib/someNewHelperNoFeatureNames.ts";
    const s = selectFeatures([file]);
    expect(s.smoke).toBe(true);
    expect(s.unmapped).toEqual([file]);
    expect(s.features.map((f) => f.id)).toEqual(
      expect.arrayContaining([...SMOKE])
    );
  });

  it("chooses nothing for tests, docs, specs, CI and other scripts", () => {
    expect(
      ids([
        "src/lib/__tests__/trainingWeek.test.ts",
        "src/components/home/WeekStrip.test.tsx",
        "src/test/journeyScreens.ts",
        "docs/agents/capture-rig.md",
        "e2e/screenshots/home.screens.capture.spec.ts",
        ".github/workflows/ci.yml",
        "scripts/seed-rich-user.ts",
        "functions/index.js",
        "CLAUDE.md",
      ])
    ).toEqual([]);
  });

  it("chooses the whole map for a change to the verify skill itself", () => {
    expect(ids(["scripts/verify/drive.ts"])).toHaveLength(FEATURES.length);
    expect(ids([".github/workflows/verify-app.yml"])).toHaveLength(
      FEATURES.length
    );
  });

  it("keeps the map's order and lists each feature once", () => {
    const got = ids([
      "src/pages/Upgrade.tsx",
      "src/pages/Login.tsx",
      "src/pages/Login.tsx",
    ]);
    expect(got).toEqual(["welcome", "sign-in-form", "sign-up-form", "upgrade"]);
  });
});

describe("reachesApp", () => {
  it("is true for app code and shared build inputs", () => {
    expect(reachesApp("src/pages/Home.tsx")).toBe(true);
    expect(reachesApp("index.html")).toBe(true);
    expect(reachesApp("public/sw.js")).toBe(true);
  });
  it("is false for tests and test helpers", () => {
    expect(reachesApp("src/pages/__tests__/Home.test.tsx")).toBe(false);
    expect(reachesApp("src/lib/foo.spec.ts")).toBe(false);
    expect(reachesApp("src/test/setup.ts")).toBe(false);
  });
});
