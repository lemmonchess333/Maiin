import { describe, it, expect } from "vitest";
import {
  platesPerSide,
  STANDARD_PLATES_KG,
  MICRO_PLATES_KG,
} from "../plateCalculator";

const WITH_MICRO = [...STANDARD_PLATES_KG, ...MICRO_PLATES_KG];

describe("platesPerSide", () => {
  it("loads a single plate per side (60 kg on a 20 kg bar → 20/side)", () => {
    const r = platesPerSide(60);
    expect(r.perSide).toEqual([20]);
    expect(r.achievable).toBe(60);
    expect(r.exact).toBe(true);
    expect(r.leftover).toBe(0);
  });

  it("loads a multi-plate side greedily (100 kg → 25+15/side)", () => {
    const r = platesPerSide(100);
    expect(r.perSide).toEqual([25, 15]);
    expect(r.achievable).toBe(100);
    expect(r.exact).toBe(true);
  });

  it("bar only at the bar weight (20 kg → no plates, exact)", () => {
    const r = platesPerSide(20);
    expect(r.perSide).toEqual([]);
    expect(r.achievable).toBe(20);
    expect(r.exact).toBe(true);
  });

  it("target below the bar → no plates, not exact", () => {
    const r = platesPerSide(15);
    expect(r.perSide).toEqual([]);
    expect(r.achievable).toBe(20);
    expect(r.exact).toBe(false);
  });

  it("reports nearest-below + leftover when the exact target isn't makeable (102.5, no micro)", () => {
    const r = platesPerSide(102.5);
    // (102.5 − 20)/2 = 41.25; standard tops out at 25+15 = 40/side → 100 total.
    expect(r.perSide).toEqual([25, 15]);
    expect(r.achievable).toBe(100);
    expect(r.exact).toBe(false);
    expect(r.leftover).toBe(2.5);
  });

  it("hits the exact target with micro plates enabled (102.5 → 25+15+1.25/side)", () => {
    const r = platesPerSide(102.5, 20, WITH_MICRO);
    expect(r.perSide).toEqual([25, 15, 1.25]);
    expect(r.achievable).toBe(102.5);
    expect(r.exact).toBe(true);
    expect(r.leftover).toBe(0);
  });

  it("honors a custom bar weight (a 15 kg bar)", () => {
    const r = platesPerSide(55, 15);
    // (55 − 15)/2 = 20/side
    expect(r.perSide).toEqual([20]);
    expect(r.achievable).toBe(55);
    expect(r.exact).toBe(true);
  });

  it("stacks repeats of the heaviest plate (180 kg → 25+25+25+5/side)", () => {
    const r = platesPerSide(180);
    // (180 − 20)/2 = 80/side → 25,25,25,5
    expect(r.perSide).toEqual([25, 25, 25, 5]);
    expect(r.achievable).toBe(180);
    expect(r.exact).toBe(true);
  });

  it("no float drift on a long greedy fill", () => {
    const r = platesPerSide(142.5, 20, WITH_MICRO);
    // (142.5 − 20)/2 = 61.25 → 25,25,10,1.25
    expect(r.perSide).toEqual([25, 25, 10, 1.25]);
    expect(r.achievable).toBe(142.5);
    expect(r.exact).toBe(true);
  });
});
