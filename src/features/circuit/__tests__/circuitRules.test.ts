import { describe, expect, it } from "vitest";
import {
  CIRCUIT_MET,
  CIRCUIT_MIN_SECONDS,
  circuitBurn,
  circuitCounts,
} from "../circuitRules";

describe("the 7-minute rule (Circ1 (6), (A), (K))", () => {
  it("saves a circuit from 420 seconds, not at 419", () => {
    expect(CIRCUIT_MIN_SECONDS).toBe(420);
    expect(circuitCounts(419)).toBe(false);
    expect(circuitCounts(420)).toBe(true);
    expect(circuitCounts(0)).toBe(false);
    expect(circuitCounts(Number.NaN)).toBe(false);
  });
});

describe("circuitBurn: the 2024 Compendium's circuit METs (Circ1 (J))", () => {
  it("uses 5.0 for Easy, 6.0 for Right or unrated, 7.5 for Hard", () => {
    expect(CIRCUIT_MET).toEqual({ easy: 5.0, right: 6.0, hard: 7.5 });
  });

  it("is MET × kg × minutes / 60", () => {
    const minutes = 20;
    const kg = 80;
    for (const effort of ["easy", "right", "hard"] as const)
      expect(
        circuitBurn({ activeSeconds: minutes * 60, bodyweightKg: kg, effort })
      ).toBe(Math.round((minutes * kg * CIRCUIT_MET[effort]) / 60));
    expect(circuitBurn({ activeSeconds: minutes * 60, bodyweightKg: kg })).toBe(
      160
    );
    expect(
      circuitBurn({
        activeSeconds: minutes * 60,
        bodyweightKg: kg,
        effort: "hard",
      })
    ).toBe(200);
  });

  it("is more than the 4.5 MET a zero-tonnage lift gets", () => {
    const easy = circuitBurn({
      activeSeconds: 600,
      bodyweightKg: 70,
      effort: "easy",
    });
    expect(easy).toBeGreaterThan(Math.round((4.5 * 70 * 10) / 60));
  });

  it("is 0 without a body weight or a clock", () => {
    expect(circuitBurn({ activeSeconds: 1200, bodyweightKg: 0 })).toBe(0);
    expect(circuitBurn({ activeSeconds: 0, bodyweightKg: 70 })).toBe(0);
  });
});
