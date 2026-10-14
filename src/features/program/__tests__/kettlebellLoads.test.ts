/**
 * Lift18: kettlebells keep their kg sizes, and an lb lifter reads a bell in
 * whole lb, as they are labelled where lb is the unit. A bell typed as it
 * reads stays the bell. Every other load reads to a tenth off the lb kit.
 */
import { describe, it, expect } from "vitest";
import { formatKitLoad, kitLoadIn, kitLoadToKg } from "../loadSteps";
import { lbToKg } from "@/lib/weightUnits";

const BELL = "kettlebell-swing";
const BAR = "bench-press";

describe("a kettlebell in lb", () => {
  it("reads in whole lb", () => {
    expect(kitLoadIn(16, "lbs", BELL)).toBe(35);
    expect(kitLoadIn(24, "lbs", BELL)).toBe(53);
    expect(formatKitLoad(32, "lbs", BELL)).toBe("71 lb");
  });

  it("typed as it reads, is the bell, not the lb it converts to", () => {
    expect(kitLoadToKg(35, "lbs", BELL)).toBe(16);
    expect(kitLoadToKg(53, "lbs", BELL)).toBe(24);
  });

  it("a number that names no bell is the exact kg it converts to", () => {
    expect(kitLoadToKg(25, "lbs", BELL)).toBeCloseTo(lbToKg(25), 6);
  });

  it("is the kg bell in kg", () => {
    expect(kitLoadIn(16, "kg", BELL)).toBe(16);
    expect(kitLoadToKg(16, "kg", BELL)).toBe(16);
  });
});

describe("everything else", () => {
  it("reads to a tenth off the lb kit, and converts exactly", () => {
    expect(kitLoadIn(16, "lbs", BAR)).toBe(35.3);
    expect(kitLoadIn(60, "lbs", undefined)).toBe(132.3);
    expect(kitLoadToKg(35, "lbs", BAR)).toBeCloseTo(lbToKg(35), 6);
  });
});
