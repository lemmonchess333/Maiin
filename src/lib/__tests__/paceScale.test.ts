/**
 * The run's scales read in any colour vision (DS10 call 2, owner 22
 * November 2026). The route's pace on a run's detail and the live run's
 * pace bar are one light-to-dark scale (`THEME.pace`), and the heart-rate
 * zones sit on the same blue-to-yellow line (`THEME.hrZones`). Each
 * neighbouring step is 15 or more apart (CIEDE2000) in normal vision and
 * at deuteranopia and protanopia severity 100. The scale they replaced,
 * green to amber to coral, put fast against slow 7 apart for deuteranopia,
 * by colour alone, and its slow step was the running colour.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { THEME } from "@/lib/theme";
import { ROUTE_PACE_STEPS } from "@/components/run/routePace";
import { distance, contrast, type Vision } from "@/test/colourVision";

const VISIONS: Vision[] = ["normal", "deutan", "protan"];
const PACE = [THEME.pace.fast, THEME.pace.average, THEME.pace.slow];
const ZONES = [1, 2, 3, 4, 5].map((z) => THEME.hrZones[z as 1 | 2 | 3 | 4 | 5]);

function neighbours(steps: string[]) {
  return steps.slice(1).map((b, i) => [steps[i], b] as const);
}

describe("the pace scale", () => {
  it.each(VISIONS)("neighbouring steps are 15 or more apart (%s)", (v) => {
    for (const [a, b] of neighbours(PACE))
      expect(distance(a, b, v), `${a} / ${b}`).toBeGreaterThanOrEqual(15);
  });

  it("runs light to dark from fast to slow, through the amber data scales keep", () => {
    expect(THEME.pace.average).toBe(THEME.warning);
    const lum = PACE.map((c) => contrast(c, "#000000"));
    expect(lum[0]).toBeGreaterThan(lum[1]);
    expect(lum[1]).toBeGreaterThan(lum[2]);
  });

  it("uses no sport's colour and no red against green", () => {
    for (const c of PACE)
      expect([
        THEME.running,
        THEME.lifting,
        THEME.success,
        THEME.danger,
      ]).not.toContain(c);
  });

  it("the slow step reads on both maps' ground at 3:1", () => {
    expect(contrast(THEME.pace.slow, "#1B1B1F")).toBeGreaterThanOrEqual(3);
    expect(contrast(THEME.pace.slow, "#ECECEF")).toBeGreaterThanOrEqual(3);
  });

  it("is the route's colours and the live pace bar's", () => {
    expect(ROUTE_PACE_STEPS.map((s) => s.color)).toEqual(PACE);
    const bar = readFileSync(
      resolve(process.cwd(), "src/components/run/PaceZoneBar.tsx"),
      "utf8"
    );
    for (const step of ["fast", "average", "slow"])
      expect(bar).toContain(`THEME.pace.${step}`);
    // "Slow" is a word and a place on the bar, never the running coral.
    expect(bar).not.toMatch(/THEME\.(danger|running|success)/);
  });
});

describe("the heart-rate zones", () => {
  it.each(VISIONS)("neighbouring zones are 15 or more apart (%s)", (v) => {
    for (const [a, b] of neighbours(ZONES))
      expect(distance(a, b, v), `${a} / ${b}`).toBeGreaterThanOrEqual(15);
  });

  it("each zone's figure clears 3:1 on the run's dark sheet", () => {
    for (const c of ZONES)
      expect(contrast(c, THEME.bg), c).toBeGreaterThanOrEqual(3);
  });
});

describe("coral means running only", () => {
  it("an error is red, not the running coral", () => {
    expect(THEME.danger).not.toBe(THEME.running);
    expect(THEME.semantic.negative).toBe(THEME.danger);
    expect(
      distance(THEME.danger, THEME.running, "normal")
    ).toBeGreaterThanOrEqual(10);
  });

  it("the live run's behind chip is neutral", () => {
    const chip = readFileSync(
      resolve(process.cwd(), "src/components/run/GhostDeltaChip.tsx"),
      "utf8"
    );
    expect(chip).not.toMatch(/THEME\.(danger|running)/);
  });
});
