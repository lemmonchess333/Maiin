/**
 * The heat line before a run, Pgm8 (E8).
 *
 * Pins: the Magnus dew point against known values; on a hot day, one line
 * saying to run by feel with no number in it (no %, no equivalent pace,
 * no dew point); nothing below hot; and where hot starts, which is the
 * published T+DP rule of thumb's 3% band, a temperature-plus-dew-point
 * sum over 130°F. The sums quoted below were measured with `dewPointC`.
 */
import { describe, it, expect } from "vitest";
import { dewPointC, heatLine } from "../heatAdjustment";

describe("dewPointC", () => {
  it("matches known Magnus values", () => {
    expect(dewPointC(30, 70)).toBeCloseTo(23.9, 1);
    expect(dewPointC(10, 50)).toBeCloseTo(0.0, 1);
    // Saturated air: dew point = temperature.
    expect(dewPointC(20, 100)).toBeCloseTo(20, 1);
  });
});

/** Hot days, from the lowest hot band to past the end of the table. */
const HOT_DAYS = [
  { temperature: 24, humidity: 60 }, // 135.6°F, the 3% band
  { temperature: 38, humidity: 10 }, // 134.4°F, hot and dry
  { temperature: 29, humidity: 40 }, // 141.5°F, the 4.5% band
  { temperature: 32, humidity: 75 }, // 170.2°F, the 10% band
  { temperature: 38, humidity: 80 }, // 193.5°F, past the table
];

describe("heatLine", () => {
  it("on a hot day, says to run by feel, with no number in it", () => {
    for (const day of HOT_DAYS) {
      const line = heatLine(day);
      expect(line, JSON.stringify(day)).toMatch(/run by feel/i);
      // No %, no equivalent pace, no dew point: nothing gives
      // training-pace slopes, and the race-pace evidence is weak.
      expect(line, JSON.stringify(day)).not.toMatch(/\d/);
    }
  });

  it("is the same one line on every hot day", () => {
    const lines = new Set(HOT_DAYS.map((day) => heatLine(day)));
    expect([...lines]).toEqual(["Hot today: run by feel, not by pace"]);
  });

  it("says nothing below hot, however warm the day reads", () => {
    expect(heatLine({ temperature: 10, humidity: 50 })).toBeNull(); // 82.1°F
    expect(heatLine({ temperature: 15, humidity: 40 })).toBeNull(); // 93.7°F
    expect(heatLine({ temperature: 22, humidity: 40 })).toBeNull(); // 117.6°F, 1%
    expect(heatLine({ temperature: 30, humidity: 20 })).toBeNull(); // 126.3°F, 2%
  });

  it("starts at the 3% band, a sum over 130°F", () => {
    /* Saturated air keeps the dew point at the temperature, so the sum is
       3.6 × T + 64 and the boundary is exact whatever Magnus's constants. */
    expect(heatLine({ temperature: 18.3, humidity: 100 })).toBeNull(); // 129.9°F
    expect(heatLine({ temperature: 18.4, humidity: 100 })).not.toBeNull(); // 130.2°F
    // A day either side of it: 25°C at 43% humidity, then 44%.
    expect(heatLine({ temperature: 25, humidity: 43 })).toBeNull(); // 129.8°F
    expect(heatLine({ temperature: 25, humidity: 44 })).not.toBeNull(); // 130.4°F
  });

  it("claims nothing beyond running by feel", () => {
    for (const day of HOT_DAYS) {
      expect(heatLine(day)).not.toMatch(
        /injur|risk|danger|safe|guarantee|promise|hydrat|water|slower/i
      );
    }
  });
});
