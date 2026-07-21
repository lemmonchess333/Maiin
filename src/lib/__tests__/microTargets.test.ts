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

  it("uses fixed sodium (mg) and sugar (g) references regardless of sex", () => {
    for (const sex of ["male", "female", undefined] as const) {
      const t = resolveMicroTargets(sex);
      const sodium = t.find((m) => m.key === "sodium")!;
      const sugar = t.find((m) => m.key === "sugar")!;
      expect(sodium.target).toBe(2300);
      expect(sodium.unit).toBe("mg");
      expect(sugar.target).toBe(50);
      expect(sugar.unit).toBe("g");
    }
  });
});
