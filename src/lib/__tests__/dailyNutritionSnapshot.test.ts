import { describe, it, expect } from "vitest";
import {
  buildTargetSnapshot,
  snapshotSignature,
} from "../dailyNutritionSnapshot";

const target = { finalTarget: 2200, protein: 165, carbs: 240, fat: 70 };

describe("buildTargetSnapshot", () => {
  it("builds a rounded snapshot from a valid target", () => {
    expect(buildTargetSnapshot("2026-06-13", target)).toEqual({
      date: "2026-06-13",
      targetCalories: 2200,
      targetProtein: 165,
      targetCarbs: 240,
      targetFat: 70,
    });
  });

  it("rounds fractional macro targets", () => {
    const snap = buildTargetSnapshot("2026-06-13", {
      finalTarget: 2199.6,
      protein: 164.4,
      carbs: 240.5,
      fat: 69.2,
    });
    expect(snap).toMatchObject({
      targetCalories: 2200,
      targetProtein: 164,
      targetCarbs: 241,
      targetFat: 69,
    });
  });

  it("returns null when the calorie target is zero/unusable (profile not set up)", () => {
    expect(
      buildTargetSnapshot("2026-06-13", { ...target, finalTarget: 0 })
    ).toBeNull();
    expect(
      buildTargetSnapshot("2026-06-13", { ...target, finalTarget: NaN })
    ).toBeNull();
  });

  it("returns null without a date", () => {
    expect(buildTargetSnapshot("", target)).toBeNull();
  });

  it("clamps negative/garbage macro values to 0 (calorie target still drives validity)", () => {
    const snap = buildTargetSnapshot("2026-06-13", {
      finalTarget: 2000,
      protein: -5,
      carbs: NaN,
      fat: 60,
    });
    expect(snap).toMatchObject({
      targetCalories: 2000,
      targetProtein: 0,
      targetCarbs: 0,
      targetFat: 60,
    });
  });
});

describe("snapshotSignature", () => {
  it("changes when any target value changes", () => {
    const base = buildTargetSnapshot("2026-06-13", target)!;
    const sigBase = snapshotSignature(base);
    expect(snapshotSignature({ ...base, targetCarbs: 241 })).not.toBe(sigBase);
    expect(snapshotSignature({ ...base, targetProtein: 166 })).not.toBe(
      sigBase
    );
  });

  it("changes across days even with an identical target (one doc per day)", () => {
    const a = buildTargetSnapshot("2026-06-13", target)!;
    const b = buildTargetSnapshot("2026-06-14", target)!;
    expect(snapshotSignature(a)).not.toBe(snapshotSignature(b));
  });

  it("is stable for an unchanged same-day snapshot (no redundant write)", () => {
    const a = buildTargetSnapshot("2026-06-13", target)!;
    const b = buildTargetSnapshot("2026-06-13", { ...target });
    expect(snapshotSignature(a)).toBe(snapshotSignature(b!));
  });
});
