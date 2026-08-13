/**
 * The route planner must open where the runner is standing.
 *
 * `RoutePlannerSheet.initialCenter` is documented as "Best-known current
 * position (e.g. the run page's GPS fix)". No caller passed it. So every
 * user got the fallback branch — `center: [-0.1276, 51.5072], zoom: 2`, a
 * whole-world view — and then a one-shot `getCurrentPosition` that has to
 * succeed before the map is usable. Under "Tap the map to drop points along
 * your route", at zoom 2, one tap is several hundred kilometres.
 *
 * Nothing caught it because `RoutePlannerSheet.test.tsx` passed
 * `initialCenter` in its own setup helper. The fixture supplied precisely
 * what production did not, so the component was verified in a configuration
 * no user ever saw — the same shape as the accept-path fixtures CLAUDE.md
 * records under "the tested copy does not prove the running copy".
 *
 * These assertions are therefore about the WIRING, not the component: the
 * position has to leave `Run.tsx`, cross `RouteSetupSection`, and arrive at
 * the sheet. Each hop is separately deletable while the others still
 * compile, and each hop is separately asserted.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
}
const read = (rel: string) =>
  stripComments(readFileSync(resolve(repoRoot, rel), "utf8"));

const run = read("src/pages/Run.tsx");
const section = read("src/components/run/RouteSetupSection.tsx");

describe("route planner — the position reaches the map", () => {
  it("Run.tsx hands its GPS fix to the route section", () => {
    expect(run).toMatch(/currentPosition=\{gps\.currentPoint\}/);
  });

  it("RouteSetupSection forwards it to the planner as initialCenter", () => {
    // The middle hop, and the one that can rot silently: the prop is
    // optional, so dropping this line compiles and every other test passes.
    expect(section).toMatch(/initialCenter=\{currentPosition\}/);
  });

  it("RouteSetupSection actually accepts the prop it forwards", () => {
    // Guards the guard. Forwarding an undeclared identifier would not
    // compile, but forwarding a prop that is declared and never supplied by
    // the parent would — which is exactly the state this fixes.
    expect(section).toMatch(/currentPosition\?:/);
    expect(section).toMatch(/currentPosition = null/);
  });
});

describe("route planner — dark is the default theme", () => {
  it("does not read an unloaded profile as light mode", () => {
    /* `!!profile?.darkMode` is false while the profile is still loading, so
       the planner could open on the LIGHT basemap inside a dark app. Dark is
       the default per CLAUDE.md — only an explicit `false` means light. */
    expect(section).toMatch(/darkMode=\{profile\?\.darkMode !== false\}/);
    expect(section).not.toMatch(/darkMode=\{!!profile\?\.darkMode\}/);
  });
});
