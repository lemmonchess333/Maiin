import { describe, it, expect } from "vitest";
import { resolveMicroTargets } from "../microTargets";

describe("resolveMicroTargets", () => {
  it("returns fiber (goal), sugar (limit), sodium (limit) in order", () => {
    const t = resolveMicroTargets("male");
    expect(t.map((m) => m.key)).toEqual(["fiber", "sugar", "sodium"]);
    expect(t.find((m) => m.key === "fiber")?.kind).toBe("goal");
    expect(t.find((m) => m.key === "sugar")?.kind).toBe("limit");
    expect(t.find((m) => m.key === "sodium")?.kind).toBe("limit");
  });

  it("varies fiber goal by sex, defaulting to 30 when unknown", () => {
    expect(
      resolveMicroTargets("male").find((m) => m.key === "fiber")?.target
    ).toBe(38);
    expect(
      resolveMicroTargets("female").find((m) => m.key === "fiber")?.target
    ).toBe(25);
    expect(
      resolveMicroTargets(undefined).find((m) => m.key === "fiber")?.target
    ).toBe(30);
  });

  it("uses a fixed sodium reference + a 2000-cal sugar fallback when no calorie target", () => {
    for (const sex of ["male", "female", undefined] as const) {
      const t = resolveMicroTargets(sex);
      const sodium = t.find((m) => m.key === "sodium")!;
      const sugar = t.find((m) => m.key === "sugar")!;
      expect(sodium.target).toBe(2300);
      expect(sodium.unit).toBe("mg");
      // 15% of the 2000-cal fallback ÷ 4 kcal/g = 75 g.
      expect(sugar.target).toBe(75);
      expect(sugar.unit).toBe("g");
    }
  });

  it("scales the sugar guide to 15% of the calorie target", () => {
    const sugarFor = (cals: number) =>
      resolveMicroTargets("male", cals).find((m) => m.key === "sugar")!.target;
    expect(sugarFor(2000)).toBe(75); // 300 kcal / 4
    expect(sugarFor(2200)).toBe(83); // 82.5 → 83
    expect(sugarFor(3400)).toBe(128); // 127.5 → 128
    // A missing / non-positive target falls back to the 2000-cal reference.
    expect(sugarFor(0)).toBe(75);
  });
});
