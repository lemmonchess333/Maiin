import { describe, it, expect } from "vitest";
import { rpeNudgeDirection, rpeNudgeTarget } from "../rpeNudge";
import { formatKitLoad } from "../loadSteps";
import { lbToKg } from "@/lib/weightUnits";

describe("rpeNudgeDirection", () => {
  it("steps up at RPE <= 6.5, down at RPE >= 9.5, and stays put in between", () => {
    expect(rpeNudgeDirection(6)).toBe(1);
    expect(rpeNudgeDirection(6.5)).toBe(1);
    expect(rpeNudgeDirection(7)).toBe(0);
    expect(rpeNudgeDirection(8)).toBe(0);
    expect(rpeNudgeDirection(9)).toBe(0);
    expect(rpeNudgeDirection(9.5)).toBe(-1);
    expect(rpeNudgeDirection(10)).toBe(-1);
  });

  it("returns 0 for missing or non-finite RPE", () => {
    expect(rpeNudgeDirection(undefined)).toBe(0);
    expect(rpeNudgeDirection(null)).toBe(0);
    expect(rpeNudgeDirection(Number.NaN)).toBe(0);
  });
});

describe("rpeNudgeTarget", () => {
  it("steps barbells in kg with standard and small plates", () => {
    expect(rpeNudgeTarget(60, 6, "bench-press", "kg")).toBe(62.5);
    expect(rpeNudgeTarget(60, 9.5, "bench-press", "kg")).toBe(57.5);
    expect(rpeNudgeTarget(60, 6, "bench-press", "kg", true)).toBe(61.25);
    expect(rpeNudgeTarget(60, 10, "bench-press", "kg", true)).toBe(58.75);
  });

  it("steps barbells in lbs without double-converting units", () => {
    const startKg = lbToKg(135);
    const upKg = rpeNudgeTarget(startKg, 6.5, "bench-press", "lbs");
    expect(upKg).not.toBeNull();
    expect(formatKitLoad(upKg!, "lbs", "bench-press")).toBe("140 lb");

    const downKg = rpeNudgeTarget(startKg, 9.5, "bench-press", "lbs");
    expect(downKg).not.toBeNull();
    expect(formatKitLoad(downKg!, "lbs", "bench-press")).toBe("130 lb");

    const smallUpKg = rpeNudgeTarget(startKg, 6, "bench-press", "lbs", true);
    expect(smallUpKg).not.toBeNull();
    expect(formatKitLoad(smallUpKg!, "lbs", "bench-press")).toBe("137.5 lb");
  });

  it("steps dumbbells on the kg and lb racks", () => {
    expect(rpeNudgeTarget(10, 6, "db-bench", "kg")).toBe(12.5);
    expect(rpeNudgeTarget(10, 10, "db-bench", "kg")).toBe(9);

    const dbUpLb = rpeNudgeTarget(lbToKg(25), 6, "db-bench", "lbs");
    expect(dbUpLb).not.toBeNull();
    expect(formatKitLoad(dbUpLb!, "lbs", "db-bench")).toBe("30 lb");

    const dbDownLb = rpeNudgeTarget(lbToKg(15), 9.5, "db-bench", "lbs");
    expect(dbDownLb).not.toBeNull();
    expect(formatKitLoad(dbDownLb!, "lbs", "db-bench")).toBe("12 lb");
  });

  it("steps kettlebells on the metric bell ladder in both kg and lbs", () => {
    expect(rpeNudgeTarget(16, 6, "kettlebell-swing", "kg")).toBe(18);
    expect(rpeNudgeTarget(16, 10, "kettlebell-swing", "kg")).toBe(14);

    const kbUpInLb = rpeNudgeTarget(16, 6, "kettlebell-swing", "lbs");
    expect(kbUpInLb).toBe(18);
    expect(formatKitLoad(kbUpInLb!, "lbs", "kettlebell-swing")).toBe("40 lb");

    const kbDownInLb = rpeNudgeTarget(16, 9.5, "kettlebell-swing", "lbs");
    expect(kbDownInLb).toBe(14);
    expect(formatKitLoad(kbDownInLb!, "lbs", "kettlebell-swing")).toBe("31 lb");
  });

  it("returns null for unloaded, on-target, or minimum-rung sets", () => {
    expect(rpeNudgeTarget(0, 6, "bench-press", "kg")).toBeNull();
    expect(rpeNudgeTarget(-5, 6, "bench-press", "kg")).toBeNull();
    expect(rpeNudgeTarget(60, 8, "bench-press", "kg")).toBeNull();
    expect(rpeNudgeTarget(2.5, 10, "bench-press", "kg")).toBeNull();
    expect(rpeNudgeTarget(4, 10, "kettlebell-swing", "kg")).toBeNull();
    expect(rpeNudgeTarget(lbToKg(3), 10, "db-bench", "lbs")).toBeNull();
  });
});
