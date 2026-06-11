import { describe, it, expect } from "vitest";
import {
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
    expect(g.readiness).toBe("fresh");
    expect(g.line).toMatch(/rest day/i);
  });

  it("hard lift yesterday + run today → ease the run", () => {
    const g = resolveHybridGuidance("run", {
      ...NONE,
      anyLift: true,
      hardLift: true,
    });
    expect(g.readiness).toBe("ease");
    expect(g.line).toMatch(/run easy/i);
  });

  it("hard run yesterday + lift today → ease (heavy legs)", () => {
    const g = resolveHybridGuidance("lift", {
      ...NONE,
      anyRun: true,
      hardRun: true,
    });
    expect(g.readiness).toBe("ease");
    expect(g.line).toMatch(/heavy under the bar/i);
  });

  it("two hard sessions yesterday + both today → ease", () => {
    const g = resolveHybridGuidance("both", {
      anyLift: true,
      anyRun: true,
      hardLift: true,
      hardRun: true,
    });
    expect(g.readiness).toBe("ease");
  });

  it("nothing yesterday → fresh", () => {
    expect(resolveHybridGuidance("lift", NONE).readiness).toBe("fresh");
  });

  it("an easy session yesterday → steady (not ease, not fresh)", () => {
    const g = resolveHybridGuidance("run", { ...NONE, anyRun: true });
    expect(g.readiness).toBe("steady");
  });

  it("a hard lift yesterday but a lift day today does NOT force ease (same discipline)", () => {
    // Same-discipline back-to-back isn't auto-flagged here (the programme's own
    // periodisation owns lift-to-lift); only cross-discipline interference is.
    const g = resolveHybridGuidance("lift", {
      ...NONE,
      anyLift: true,
      hardLift: true,
    });
    expect(g.readiness).toBe("steady");
  });

  it("always carries a fuel line matching the day type", () => {
    expect(resolveHybridGuidance("run", NONE).fuelLine).toMatch(/carbs/i);
    expect(resolveHybridGuidance("lift", NONE).fuelLine).toMatch(/protein/i);
  });
});
