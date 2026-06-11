import { describe, it, expect } from "vitest";
import {
  maxHrFromAge,
  hrZones,
  zoneForHr,
  zoneDistribution,
  ZONE_NAMES,
} from "../hrZones";

describe("maxHrFromAge — Tanaka 208 − 0.7·age", () => {
  it("computes a sensible max for a typical age", () => {
    expect(maxHrFromAge(30)).toBe(187); // 208 − 21 = 187
    expect(maxHrFromAge(40)).toBe(180); // 208 − 28 = 180
    expect(maxHrFromAge(20)).toBe(194); // 208 − 14 = 194
  });

  it("returns 0 for nonsensical ages (guards the divide-by/render)", () => {
    expect(maxHrFromAge(0)).toBe(0);
    expect(maxHrFromAge(-5)).toBe(0);
    expect(maxHrFromAge(200)).toBe(0);
    expect(maxHrFromAge(NaN)).toBe(0);
    expect(maxHrFromAge(Infinity)).toBe(0);
  });
});

describe("hrZones — five bands for a max HR", () => {
  it("returns five named zones with ascending bpm bands", () => {
    const z = hrZones(200);
    expect(z).toHaveLength(5);
    expect(z.map((b) => b.zone)).toEqual([1, 2, 3, 4, 5]);
    expect(z.map((b) => b.name)).toEqual([
      ZONE_NAMES[1],
      ZONE_NAMES[2],
      ZONE_NAMES[3],
      ZONE_NAMES[4],
      ZONE_NAMES[5],
    ]);
    // 50–60 / 60–70 / … / 90–100 % of 200
    expect(z[0]).toMatchObject({ minBpm: 100, maxBpm: 120 });
    expect(z[3]).toMatchObject({ minBpm: 160, maxBpm: 180 });
    expect(z[4]).toMatchObject({ minBpm: 180, maxBpm: 200 });
  });

  it("returns [] for an invalid max HR", () => {
    expect(hrZones(0)).toEqual([]);
    expect(hrZones(-10)).toEqual([]);
    expect(hrZones(NaN)).toEqual([]);
  });
});

describe("zoneForHr — bucket a single reading", () => {
  it("buckets by %HRmax with inclusive-lower boundaries", () => {
    const max = 200;
    expect(zoneForHr(90, max)).toBe(0); // 45% — below Z1
    expect(zoneForHr(100, max)).toBe(1); // 50% — Z1 floor
    expect(zoneForHr(119, max)).toBe(1);
    expect(zoneForHr(120, max)).toBe(2); // 60% — Z2 floor
    expect(zoneForHr(140, max)).toBe(3); // 70%
    expect(zoneForHr(160, max)).toBe(4); // 80%
    expect(zoneForHr(180, max)).toBe(5); // 90%
  });

  it("reads Z5 (not 'off the top') above the estimated max", () => {
    expect(zoneForHr(210, 200)).toBe(5);
  });

  it("returns 0 for invalid inputs", () => {
    expect(zoneForHr(0, 200)).toBe(0);
    expect(zoneForHr(150, 0)).toBe(0);
    expect(zoneForHr(NaN, 200)).toBe(0);
  });
});

describe("zoneDistribution — post-run breakdown", () => {
  it("excludes below-Z1 samples from the denominator", () => {
    // 2 below-Z1 (90), 2 in Z2 (120,130), 2 in Z3 (140,150)
    const dist = zoneDistribution([90, 90, 120, 130, 140, 150], 200);
    const z2 = dist.find((d) => d.zone === 2)!;
    const z3 = dist.find((d) => d.zone === 3)!;
    expect(z2.samples).toBe(2);
    expect(z3.samples).toBe(2);
    // denominator is 4 in-zone samples, not 6
    expect(z2.pct).toBeCloseTo(0.5);
    expect(z3.pct).toBeCloseTo(0.5);
  });

  it("returns all-zero shares when no in-zone samples", () => {
    const dist = zoneDistribution([80, 90], 200); // all below Z1
    expect(dist.every((d) => d.samples === 0 && d.pct === 0)).toBe(true);
  });

  it("returns all-zero shares for an invalid max HR", () => {
    const dist = zoneDistribution([150, 160], 0);
    expect(dist.every((d) => d.samples === 0 && d.pct === 0)).toBe(true);
    expect(dist).toHaveLength(5);
  });
});
