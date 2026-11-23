/**
 * The run's scales read in any colour vision (DS10 call 2). The route's
 * pace on a run's detail and the live run's pace bar are one
 * light-to-dark scale (`THEME.pace`), each neighbouring step 15 or more
 * apart (CIEDE2000) in normal vision and at deuteranopia and protanopia
 * severity 100. The heart-rate zones keep their scale with zone 5 off the
 * running coral and the error red.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { THEME } from "@/lib/theme";
import { ROUTE_PACE_STEPS } from "@/components/run/routePace";
import { distance, contrast, type Vision } from "@/test/colourVision";

const VISIONS: Vision[] = ["normal", "deutan", "protan"];
const PACE = [THEME.pace.fast, THEME.pace.average, THEME.pace.slow];
/** `a` laid over `b` at `alpha`, as a hex. */
function mix(a: string, b: string, alpha: number): string {
  const ch = (h: string, i: number) =>
    parseInt(h.slice(1 + 2 * i, 3 + 2 * i), 16);
  return (
    "#" +
    [0, 1, 2]
      .map((i) =>
        Math.round(ch(a, i) * alpha + ch(b, i) * (1 - alpha))
          .toString(16)
          .padStart(2, "0")
      )
      .join("")
  );
}

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

  it.each([
    ["light", "#FFFFFF", "#09090B"],
    ["dark", "#17171B", "#F4F4F6"],
  ])(
    "every step of the key reads on the %s card at 3:1, by its fill or its edge",
    (_theme, card, text) => {
      // The swatch's edge is the text colour at 50% (`ring-foreground/50`).
      const edge = mix(text, card, 0.5);
      for (const step of PACE)
        expect(
          Math.max(contrast(step, card), contrast(edge, card)),
          step
        ).toBeGreaterThanOrEqual(3);
      const legend = readFileSync(
        resolve(process.cwd(), "src/components/run/PaceLegend.tsx"),
        "utf8"
      );
      expect(legend).toContain("ring-1 ring-foreground/50");
    }
  );

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
  /* The zones keep their scale (teal, green, two ambers); only zone 5
     moves, since coral means running and the error red is THEME.danger. */
  const Z4 = THEME.warning;
  const Z5 = THEME.hrZoneMax;

  it("zone 5 is neither the running coral nor the error red", () => {
    expect(distance(Z5, THEME.running, "normal")).toBeGreaterThanOrEqual(15);
    expect(distance(Z5, THEME.danger, "normal")).toBeGreaterThanOrEqual(15);
  });

  it("zone 4 against zone 5 keeps at least what it had against coral", () => {
    // Zone 4's amber against coral measured 18.9 at deutan 100.
    expect(distance(Z4, Z5, "deutan")).toBeGreaterThanOrEqual(18.9);
    expect(distance(Z4, Z5, "protan")).toBeGreaterThanOrEqual(18.9);
    expect(distance(Z4, Z5, "normal")).toBeGreaterThanOrEqual(20);
  });

  it("zone 5 is no nearer another zone than main's two ambers are", () => {
    // Zones 3 and 4 measure 9.6 at deutan 100 on main, its weakest pair.
    for (const z of [THEME.teal, THEME.success, THEME.amberLight])
      for (const v of ["deutan", "protan"] as const)
        expect(distance(z, Z5, v)).toBeGreaterThanOrEqual(9.6);
  });

  it("zone 5's dot clears 3:1 on the stats pill", () => {
    // The pill is 4% white over the sheet's card.
    expect(
      contrast(Z5, mix("#ffffff", THEME.surface, 0.04))
    ).toBeGreaterThanOrEqual(3);
  });

  it("the zone is a dot beside its name, and the bpm keeps the stat colour", () => {
    const sheet = readFileSync(
      resolve(process.cwd(), "src/components/run/RunBottomSheet.tsx"),
      "utf8"
    );
    expect(sheet).toContain("background: zoneColour");
    expect(sheet).not.toMatch(/color:\s*(zoneColour|ZONE_COLOR)/);
  });

  it("the run sheet reads its zones from those tokens", () => {
    const sheet = readFileSync(
      resolve(process.cwd(), "src/components/run/RunBottomSheet.tsx"),
      "utf8"
    );
    for (const z of [
      "1: THEME.teal",
      "2: THEME.success",
      "3: THEME.amberLight",
      "4: THEME.warning",
      "5: THEME.hrZoneMax",
    ])
      expect(sheet).toContain(z);
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
