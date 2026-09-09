import { describe, it, expect } from "vitest";
import {
  splitWaterVolume,
  GLASS_ML,
  DEFAULT_TARGET_ML,
  WATER_PRESETS,
  clampMl,
  resolveConsumedMl,
  resolveTargetMl,
  waterProgress,
  formatWaterVolume,
} from "../waterUnits";

describe("clampMl", () => {
  it("rounds to whole ml and floors negatives/NaN at 0", () => {
    expect(clampMl(499.6)).toBe(500);
    expect(clampMl(-5)).toBe(0);
    expect(clampMl(NaN)).toBe(0);
    expect(clampMl(0)).toBe(0);
  });
});

describe("resolveConsumedMl — legacy migration", () => {
  it("prefers the ml field when present", () => {
    expect(resolveConsumedMl({ ml: 1250, glasses: 99 })).toBe(1250);
  });
  it("falls back to glasses × 250 for pre-migration docs", () => {
    expect(resolveConsumedMl({ glasses: 4 })).toBe(4 * GLASS_ML);
    expect(resolveConsumedMl({ glasses: 8 })).toBe(2000);
  });
  it("is 0 for an empty doc", () => {
    expect(resolveConsumedMl({})).toBe(0);
  });
});

describe("resolveTargetMl — fallback chain", () => {
  it("prefers a stored targetMl", () => {
    expect(resolveTargetMl({ targetMl: 2500 })).toBe(2500);
  });
  it("falls back to legacy targetGlasses × 250", () => {
    expect(resolveTargetMl({ targetGlasses: 8 })).toBe(2000);
  });
  it("falls back to profile targetWaterGlasses × 250", () => {
    expect(resolveTargetMl({ targetWaterGlasses: 10 })).toBe(2500);
  });
  it("defaults to 2 L when nothing is set", () => {
    expect(resolveTargetMl({})).toBe(DEFAULT_TARGET_ML);
    expect(resolveTargetMl({ targetWaterGlasses: 0 })).toBe(DEFAULT_TARGET_ML);
  });
});

describe("waterProgress", () => {
  it("clamps 0..1", () => {
    expect(waterProgress(0, 2000)).toBe(0);
    expect(waterProgress(1000, 2000)).toBe(0.5);
    expect(waterProgress(3000, 2000)).toBe(1); // over-target caps at full
    expect(waterProgress(500, 0)).toBe(0); // no target → no fill
  });
});

describe("formatWaterVolume", () => {
  it("reads ml under a litre, litres at/above", () => {
    expect(formatWaterVolume(250)).toBe("250 ml");
    expect(formatWaterVolume(750)).toBe("750 ml");
    expect(formatWaterVolume(1000)).toBe("1 L");
    expect(formatWaterVolume(1250)).toBe("1.25 L");
    expect(formatWaterVolume(2000)).toBe("2 L");
    expect(formatWaterVolume(2500)).toBe("2.5 L");
  });
});

describe("WATER_PRESETS", () => {
  it("carries the Glass / Bottle / Large containers", () => {
    expect(WATER_PRESETS.map((p) => p.ml)).toEqual([250, 500, 750]);
  });
});

describe("resolveTargetMl — corrupt values fall to the default, never to 0", () => {
  // Probe sweep 2026-08-05: Infinity passed `typeof === "number" && > 0`,
  // then clampMl collapsed it to 0 — short-circuiting the documented 2 L
  // fallback and zeroing the wave (waterProgress(x, 0) is 0). The sibling
  // resolveConsumedMl already checked finiteness; this was the asymmetry.
  it("non-finite targetMl falls through to the 2 L default", () => {
    expect(resolveTargetMl({ targetMl: Infinity })).toBe(2000);
    expect(resolveTargetMl({ targetMl: -Infinity })).toBe(2000);
    expect(resolveTargetMl({ targetMl: NaN })).toBe(2000);
  });

  it("non-finite legacy glasses fall through too", () => {
    expect(resolveTargetMl({ targetWaterGlasses: Infinity })).toBe(2000);
    expect(resolveTargetMl({ targetGlasses: NaN })).toBe(2000);
  });
});

describe("splitWaterVolume", () => {
  /* The card's hero numeral sets the value big and the unit small, so it
     needs the two apart. It used to do that with `formatLitresValue` + a
     hard-coded "L", which always divided by 1000 — a 750 ml day rendered
     "0.75 L", a leading zero and a decimal where every container label
     in the app says "750 ml". Deferring to `formatWaterVolume` keeps ONE
     rule about which unit a volume takes. */
  it("keeps sub-litre volumes in millilitres", () => {
    expect(splitWaterVolume(750)).toEqual({ value: "750", unit: "ml" });
    expect(splitWaterVolume(250)).toEqual({ value: "250", unit: "ml" });
  });

  it("crosses into litres at a litre, trimming trailing zeros", () => {
    expect(splitWaterVolume(1000)).toEqual({ value: "1", unit: "L" });
    expect(splitWaterVolume(4500)).toEqual({ value: "4.5", unit: "L" });
    expect(splitWaterVolume(1250)).toEqual({ value: "1.25", unit: "L" });
  });

  it("recombines into exactly what formatWaterVolume renders", () => {
    /* The contract that makes it safe to use one in place of the other:
       a split that drifted from the formatter would put a unit on the
       card that no container label agrees with. */
    for (const ml of [0, 1, 250, 999, 1000, 1001, 4500, 7250, 100000]) {
      const { value, unit } = splitWaterVolume(ml);
      expect(`${value} ${unit}`, `${ml} ml`).toBe(formatWaterVolume(ml));
    }
  });
});
