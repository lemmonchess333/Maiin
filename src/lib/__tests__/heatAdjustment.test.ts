/**
 * The heat line before a run, Pgm8 (E8).
 *
 * Pins: the Magnus dew point against known values; on a hot day, one line
 * saying to run by feel with no number in it (no %, no equivalent pace,
 * no dew point); nothing below hot; and where hot starts, which is the
 * published T+DP rule of thumb's 3% band, a temperature-plus-dew-point
 * sum over 130°F. The sums quoted below were measured with `dewPointC`.
 * Then the hot day's actions, which keep E8's no-number rule: which
 * sessions a hot day offers as an easy run, the swap's words in the
 * session's own minutes, and the summary's by-feel line.
 */
import { describe, it, expect } from "vitest";
import {
  dewPointC,
  heatLine,
  heatSwapLine,
  isHotDay,
  isQualitySession,
  HEAT_SWAP_START,
  HEAT_SWAP_SWITCH,
  HEAT_VERDICT_LINE,
} from "../heatAdjustment";

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

describe("isHotDay", () => {
  it("is the heat line's own test: hot exactly where the line shows", () => {
    for (const day of HOT_DAYS) expect(isHotDay(day)).toBe(true);
    for (const day of [
      { temperature: 10, humidity: 50 },
      { temperature: 22, humidity: 40 },
      { temperature: 30, humidity: 20 },
    ])
      expect(isHotDay(day)).toBe(false);
  });

  it("starts where the line starts, a T+DP sum over 130°F", () => {
    // Saturated air: the sum is 3.6 × T + 64 whatever Magnus's constants.
    expect(isHotDay({ temperature: 18.3, humidity: 100 })).toBe(false); // 129.9°F
    expect(isHotDay({ temperature: 18.4, humidity: 100 })).toBe(true); // 130.2°F
    expect(isHotDay({ temperature: 25, humidity: 43 })).toBe(false); // 129.8°F
    expect(isHotDay({ temperature: 25, humidity: 44 })).toBe(true); // 130.4°F
  });

  it("is not hot when there is no weather to read, or it can't be read", () => {
    expect(isHotDay(null)).toBe(false);
    expect(isHotDay(undefined)).toBe(false);
    expect(isHotDay({ temperature: Number.NaN, humidity: 70 })).toBe(false);
    expect(isHotDay({ temperature: 32, humidity: Number.NaN })).toBe(false);
  });
});

describe("isQualitySession", () => {
  it("is a tempo or an interval session, which a hot day offers to swap", () => {
    expect(isQualitySession("tempo")).toBe(true);
    expect(isQualitySession("intervals")).toBe(true);
  });

  it("is no other run: an easy or long run is easy already, a race is the race", () => {
    for (const type of ["easy", "long", "race", "freerun", "guided", null]) {
      expect(isQualitySession(type)).toBe(false);
    }
  });
});

describe("the hot day's words", () => {
  it("offers the swap in the session's own minutes, with no pace and no %", () => {
    expect(heatSwapLine(45)).toBe("Or run easy for the same 45 min.");
    expect(heatSwapLine(37.6)).toBe("Or run easy for the same 38 min.");
    expect(heatSwapLine(45)).not.toMatch(/%|\/km|\/mi|\d:\d\d|slower/);
  });

  it("names the swap's buttons as a verb and its object, short", () => {
    for (const label of [HEAT_SWAP_START, HEAT_SWAP_SWITCH]) {
      expect(label.length).toBeLessThanOrEqual(20);
      expect(label.split(" ").length).toBeLessThanOrEqual(3);
    }
  });

  it("reads a hot day's run by feel afterwards, with no number in it", () => {
    expect(HEAT_VERDICT_LINE).toMatch(/by feel/);
    expect(HEAT_VERDICT_LINE).not.toMatch(/\d/);
    expect(HEAT_VERDICT_LINE).not.toMatch(
      /injur|risk|danger|safe|slow|miss|fail|bad/i
    );
  });
});
