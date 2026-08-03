import { describe, it, expect } from "vitest";
import {
  isHardRun,
  resolveHybridGuidance,
  fuelLineFor,
  type YesterdayTraining,
} from "../hybridGuidance";

const NONE: YesterdayTraining = {
  anyLift: false,
  anyRun: false,
  hardLift: false,
  hardRun: false,
};

describe("fuelLineFor", () => {
  it("narrates carb periodisation by day type", () => {
    expect(fuelLineFor("run")).toMatch(/carbs/i);
    expect(fuelLineFor("both")).toMatch(/carbs/i);
    expect(fuelLineFor("lift")).toMatch(/protein/i);
    expect(fuelLineFor("rest")).toMatch(/rest day/i);
  });
});

describe("resolveHybridGuidance", () => {
  it("rest day → fresh, recovery framing", () => {
    const g = resolveHybridGuidance("rest", { ...NONE, anyLift: true });
    expect(g.tone).toBe("fresh");
    expect(g.line).toMatch(/rest day/i);
  });

  it("hard lift yesterday + run today → ease the run", () => {
    const g = resolveHybridGuidance("run", {
      ...NONE,
      anyLift: true,
      hardLift: true,
    });
    expect(g.tone).toBe("ease");
    expect(g.line).toMatch(/run easy/i);
  });

  it("hard run yesterday + lift today → ease (heavy legs)", () => {
    const g = resolveHybridGuidance("lift", {
      ...NONE,
      anyRun: true,
      hardRun: true,
    });
    expect(g.tone).toBe("ease");
    expect(g.line).toMatch(/heavy under the bar/i);
  });

  it("two hard sessions yesterday → the COMBINED line, on every training day type", () => {
    // Regression pin (PROGRAM-ADAPT-01 reliability fix): this branch
    // used to sit below the single-discipline checks and was
    // unreachable — the combined line could never render.
    const both: YesterdayTraining = {
      anyLift: true,
      anyRun: true,
      hardLift: true,
      hardRun: true,
    };
    for (const todayType of ["lift", "run", "both"] as const) {
      const g = resolveHybridGuidance(todayType, both);
      expect(g.tone).toBe("ease");
      expect(g.line).toMatch(/two hard sessions/i);
    }
  });

  it("HYBRID-GUIDANCE-01: nothing logged yesterday → neutral (never 'fresh legs')", () => {
    // No data is the ABSENCE of a signal, not proof of freshness.
    const g = resolveHybridGuidance("lift", NONE);
    expect(g.tone).toBe("steady");
    expect(g.line).not.toMatch(/fresh legs/i);
    expect(g.line).toMatch(/how you feel/i);
  });

  it("an easy session yesterday → steady (not ease, not fresh)", () => {
    const g = resolveHybridGuidance("run", { ...NONE, anyRun: true });
    expect(g.tone).toBe("steady");
  });

  it("a hard lift yesterday but a lift day today does NOT force ease (same discipline)", () => {
    // Same-discipline back-to-back isn't auto-flagged here (the programme's own
    // periodisation owns lift-to-lift); only cross-discipline interference is.
    const g = resolveHybridGuidance("lift", {
      ...NONE,
      anyLift: true,
      hardLift: true,
    });
    expect(g.tone).toBe("steady");
  });

  it("always carries a fuel line matching the day type", () => {
    expect(resolveHybridGuidance("run", NONE).fuelLine).toMatch(/carbs/i);
    expect(resolveHybridGuidance("lift", NONE).fuelLine).toMatch(/protein/i);
  });
});

describe("isHardRun (shared predicate)", () => {
  it("fires on long distance, long duration, or a quality template", () => {
    expect(isHardRun({ distance: 8000, duration: 0 })).toBe(true);
    expect(isHardRun({ distance: 0, duration: 2700 })).toBe(true);
    expect(
      isHardRun({ distance: 3000, duration: 1200, activityType: "tempo" })
    ).toBe(true);
    expect(
      isHardRun({ distance: 3000, duration: 1200, activityType: "intervals" })
    ).toBe(true);
  });

  it("stays quiet on an easy short run", () => {
    expect(
      isHardRun({ distance: 4000, duration: 1500, activityType: "free" })
    ).toBe(false);
    expect(isHardRun({ distance: 4000, duration: 1500 })).toBe(false);
  });
});
