/**
 * Tests for `computeTrajectory` — the "on pace" line on the Food
 * hero card.
 *
 * Three behaviours to pin:
 *   1. Time-window suppression (before 9am, at/after 9pm).
 *   2. Guard: target <= 0 returns null (no ring to be ahead/behind of).
 *   3. Linear pace model: ±5% tolerance for "On pace", otherwise
 *      rounded to nearest 10 cal with a directional label.
 */
import { describe, it, expect } from "vitest";
import { computeTrajectory } from "../foodTrajectory";

// Reference midday so the linear-pace ratio is clean (12 / 24 = 0.5).
const midday = new Date(2026, 0, 1, 12, 0, 0);

describe("computeTrajectory — guards", () => {
  it("returns null when target is 0", () => {
    expect(computeTrajectory(500, 0, midday)).toBeNull();
  });

  it("returns null when target is negative", () => {
    expect(computeTrajectory(500, -100, midday)).toBeNull();
  });
});

describe("computeTrajectory — time-window suppression", () => {
  it("returns null at 8am (before the window opens)", () => {
    const earlyMorning = new Date(2026, 0, 1, 8, 30, 0);
    expect(computeTrajectory(0, 2000, earlyMorning)).toBeNull();
  });

  it("returns a label at 9am sharp (boundary inclusive)", () => {
    const nineAM = new Date(2026, 0, 1, 9, 0, 0);
    expect(computeTrajectory(0, 2000, nineAM)).not.toBeNull();
  });

  it("returns a label at 8:59pm (just inside the window)", () => {
    const lateEvening = new Date(2026, 0, 1, 20, 59, 0);
    expect(computeTrajectory(0, 2000, lateEvening)).not.toBeNull();
  });

  it("returns null at 9pm sharp (boundary exclusive)", () => {
    const ninePM = new Date(2026, 0, 1, 21, 0, 0);
    expect(computeTrajectory(0, 2000, ninePM)).toBeNull();
  });
});

describe("computeTrajectory — pace label", () => {
  it("'On pace' at exactly midday with consumed = target / 2", () => {
    /* 12h elapsed = 0.5 of 24h pace. consumed == target * 0.5 → 0%
       diff → within ±5% tolerance → "On pace". */
    expect(computeTrajectory(1000, 2000, midday)).toBe("On pace");
  });

  it("'On pace' within ±5% tolerance", () => {
    /* At midday expected = 1000, target = 2000. 5% of target = 100.
       So consumed 900..1100 stays "On pace". */
    expect(computeTrajectory(950, 2000, midday)).toBe("On pace");
    expect(computeTrajectory(1080, 2000, midday)).toBe("On pace");
  });

  it("'<N> ahead of pace' when consumed exceeds expected outside tolerance", () => {
    /* consumed 1500 - expected 1000 = +500 ahead. */
    expect(computeTrajectory(1500, 2000, midday)).toBe("500 ahead of pace");
  });

  it("'<N> behind of pace' when consumed lags expected outside tolerance", () => {
    /* consumed 500 - expected 1000 = -500 behind. */
    expect(computeTrajectory(500, 2000, midday)).toBe("500 behind pace");
  });

  it("rounds the magnitude to the nearest 10 calories", () => {
    /* consumed 1497 - expected 1000 = +497 → rounds to 500. */
    expect(computeTrajectory(1497, 2000, midday)).toBe("500 ahead of pace");
    /* consumed 1493 → diff 493 → rounds to 490. */
    expect(computeTrajectory(1493, 2000, midday)).toBe("490 ahead of pace");
  });

  it("formats the magnitude with a thousands separator", () => {
    /* 1750 ahead of pace — uses locale-aware toLocaleString so we
       just check the digits group correctly. */
    const result = computeTrajectory(2750, 2000, midday);
    expect(result).toMatch(/1,?750 ahead of pace/);
  });
});
