import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The cold-start CTA must land on the page that renders the field it names.
 *
 * `RacePredictionsCard` reads `profile.runFitness`, and when it is absent it
 * offers "Set a race time". That action pointed at `/settings/training` —
 * which holds the race GOAL (which race, what date), a different thing.
 * `RunFitnessSection` is the only writer of `runFitness` and it is rendered
 * by `/settings/run-plan` alone, so a user following the CTA could do
 * everything the page offered and come back to the same empty card.
 *
 * It was also the LAST live `/settings/training` href in the tree: every
 * other mention is a comment recording that the Set1.2 nested-settings IA
 * superseded that destination. One stray link outlived the migration
 * because nothing tied a destination to its content.
 *
 * So this resolves the link the way a user does — href → route → page
 * module → does that module render the section? — rather than asserting a
 * string. Move the section and this fails naming the page it moved to,
 * which is the failure that is actually useful.
 */
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../../..");
const read = (p: string) => readFileSync(resolve(repoRoot, p), "utf8");

/** The `href` of the card's cold-start action. */
function ctaHref(): string {
  const src = read("src/components/analytics/RacePredictionsCard.tsx");
  const m = /action=\{\{[\s\S]*?href:\s*"([^"]+)"/.exec(src);
  if (!m) throw new Error("no cold-start action href — retarget this test");
  return m[1];
}

/** `path="/x"` → the lazy component name → its import path, from App.tsx. */
function pageModuleForRoute(route: string): string {
  const app = read("src/App.tsx");
  const routeRe = new RegExp(
    `path="${route}"[\\s\\S]{0,400}?<([A-Z][A-Za-z0-9]*)\\s*/>`
  );
  const routeMatch = routeRe.exec(app);
  if (!routeMatch) throw new Error(`no route declares path="${route}"`);
  const component = routeMatch[1];
  const importRe = new RegExp(
    `const ${component} = lazyRetry\\(\\s*\\(\\) => import\\("([^"]+)"\\)`
  );
  const importMatch = importRe.exec(app);
  if (!importMatch) throw new Error(`no lazy import for <${component}>`);
  return importMatch[1].replace(/^@\//, "src/") + ".tsx";
}

describe("race predictions cold-start CTA", () => {
  it("lands on the page that renders RunFitnessSection", () => {
    const page = pageModuleForRoute(ctaHref());
    expect(read(page)).toContain("<RunFitnessSection");
  });

  it("no OTHER settings page renders it, so the destination is unambiguous", () => {
    // Without this the test above would pass for any page that happened to
    // render a second copy, and "the only writer" would be a claim rather
    // than a fact this file checks.
    for (const page of ["SettingsTraining", "SettingsProfile"]) {
      expect(
        read(`src/pages/settings/${page}.tsx`),
        `${page} now renders RunFitnessSection too — the CTA's destination ` +
          `is no longer the only one, so decide which is canonical.`
      ).not.toContain("<RunFitnessSection");
    }
  });

  it("resolves a real route rather than passing on a typo", () => {
    // `pageModuleForRoute` throws on an unknown path, so a CTA pointing at
    // a route that does not exist fails loudly instead of silently.
    expect(() => pageModuleForRoute("/settings/does-not-exist")).toThrow();
    expect(ctaHref()).toMatch(/^\/settings\//);
  });
});
