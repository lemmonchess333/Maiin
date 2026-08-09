/**
 * B2 (heat half) — heat pace adjustment.
 *
 * Pins: the Magnus dew point against known values, the published T+DP
 * band boundaries, the quiet threshold (cool weather says nothing), the
 * effort-only top band, and the display line's honest register — the
 * prescription is always stated as unchanged.
 */
import { describe, it, expect } from "vitest";
import {
  dewPointC,
  heatAdjustedPaceS,
  heatAdjustmentLine,
  heatPaceAdjustment,
} from "../heatAdjustment";

describe("dewPointC", () => {
  it("matches known Magnus values", () => {
    expect(dewPointC(30, 70)).toBeCloseTo(23.9, 1);
    expect(dewPointC(10, 50)).toBeCloseTo(0.0, 1);
    // Saturated air: dew point = temperature.
    expect(dewPointC(20, 100)).toBeCloseTo(20, 1);
  });
});

describe("heatPaceAdjustment", () => {
  it("cool weather is silent — no line, no caveat", () => {
    expect(heatPaceAdjustment({ temperature: 10, humidity: 50 })).toBeNull();
    expect(heatPaceAdjustment({ temperature: 15, humidity: 40 })).toBeNull();
  });

  it("reads the published bands (measured T+DP sums)", () => {
    // 24°C / 60% → dew point ≈ 15.8°C → T+DP ≈ 136°F → 3% band.
    const warm = heatPaceAdjustment({ temperature: 24, humidity: 60 })!;
    expect(warm.pct).toBe(0.03);
    expect(warm.effortOnly).toBe(false);
    expect(warm.dewPointC).toBe(16);
    // 32°C / 75% → dew point ≈ 27°C → T+DP ≈ 170°F → 8–10% territory.
    const hot = heatPaceAdjustment({ temperature: 32, humidity: 75 })!;
    expect(hot.pct).toBeGreaterThanOrEqual(0.08);
    expect(hot.effortOnly).toBe(false);
  });

  it("extreme heat flips to effort-only instead of fake precision", () => {
    // 38°C / 80% → T+DP ≈ 194°F.
    const extreme = heatPaceAdjustment({ temperature: 38, humidity: 80 })!;
    expect(extreme.effortOnly).toBe(true);
    expect(heatAdjustmentLine(extreme)).toMatch(/run by effort/i);
  });
});

describe("heatAdjustedPaceS + the display line", () => {
  const warm = heatPaceAdjustment({ temperature: 24, humidity: 60 })!;

  it("computes the equal-effort equivalent", () => {
    expect(heatAdjustedPaceS(300, warm)).toBe(309);
  });

  it("with a prescribed pace, shows the concrete equivalent AND that the plan is unchanged", () => {
    const line = heatAdjustmentLine(warm, 300);
    expect(line).toContain("5:00/km");
    expect(line).toContain("5:09/km");
    expect(line).toMatch(/paces are unchanged/i);
    expect(line).toMatch(/published heat curves/i);
  });

  it("without a pace, stays generic but still honest", () => {
    const line = heatAdjustmentLine(warm);
    expect(line).toMatch(/~3% slower/);
    expect(line).toMatch(/paces are unchanged/i);
  });

  it("register ban-list on every line variant", () => {
    for (const line of [
      heatAdjustmentLine(warm),
      heatAdjustmentLine(warm, 300),
      heatAdjustmentLine(
        heatPaceAdjustment({ temperature: 38, humidity: 80 })!
      ),
    ]) {
      expect(line).not.toMatch(/injur|risk|danger|guarantee|will you|promise/i);
    }
  });
});
