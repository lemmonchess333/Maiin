import { describe, expect, it } from "vitest";
import {
  MATERIAL_CLIMB_GAIN_PER_KM,
  MIN_DISTANCE_METERS,
  formatSecondsPerKm,
  gradeAdjustedPace,
} from "../gradeAdjustedPace";

describe("gradeAdjustedPace", () => {
  const hilly10k = {
    distanceMeters: 10_000,
    durationSeconds: 3_000, // 5:00/km raw
    elevationGainMeters: 300, // 30 m/km, avg loop grade 6%
  };

  it("returns null below the material-climb gate", () => {
    expect(
      gradeAdjustedPace({
        distanceMeters: 10_000,
        durationSeconds: 3_000,
        elevationGainMeters: (MATERIAL_CLIMB_GAIN_PER_KM - 1) * 10,
      })
    ).toBeNull();
  });

  it("returns null for runs under the minimum distance", () => {
    expect(
      gradeAdjustedPace({
        distanceMeters: MIN_DISTANCE_METERS - 1,
        durationSeconds: 300,
        elevationGainMeters: 50,
      })
    ).toBeNull();
  });

  it("returns null for zero / negative / non-finite inputs", () => {
    expect(
      gradeAdjustedPace({
        distanceMeters: 10_000,
        durationSeconds: 0,
        elevationGainMeters: 100,
      })
    ).toBeNull();
    expect(
      gradeAdjustedPace({
        distanceMeters: 10_000,
        durationSeconds: 3_000,
        elevationGainMeters: -5,
      })
    ).toBeNull();
    expect(
      gradeAdjustedPace({
        distanceMeters: NaN,
        durationSeconds: 3_000,
        elevationGainMeters: 100,
      })
    ).toBeNull();
    expect(
      gradeAdjustedPace({
        distanceMeters: 10_000,
        durationSeconds: Infinity,
        elevationGainMeters: 100,
      })
    ).toBeNull();
  });

  it("matches the Minetti golden value for a 6% symmetric loop", () => {
    // factor = (C(0.06) + C(−0.06)) / 2·C(0) ≈ 1.04619 → 300s / factor.
    const result = gradeAdjustedPace(hilly10k);
    expect(result).not.toBeNull();
    expect(result!.rawSecondsPerKm).toBeCloseTo(300, 5);
    expect(result!.gainPerKm).toBeCloseTo(30, 5);
    expect(result!.gapSecondsPerKm).toBeGreaterThan(286.2);
    expect(result!.gapSecondsPerKm).toBeLessThan(287.3);
  });

  it("never reports GAP slower than raw pace (display-only conservatism)", () => {
    for (const gain of [80, 150, 300, 600, 1200]) {
      const result = gradeAdjustedPace({
        distanceMeters: 10_000,
        durationSeconds: 3_600,
        elevationGainMeters: gain,
      });
      expect(result).not.toBeNull();
      expect(result!.gapSecondsPerKm).toBeLessThanOrEqual(
        result!.rawSecondsPerKm
      );
      expect(result!.gapSecondsPerKm).toBeGreaterThan(0);
    }
  });

  it("more climb ⇒ faster flat-equivalent pace (monotonic in gain)", () => {
    const gentle = gradeAdjustedPace({
      ...hilly10k,
      elevationGainMeters: 100,
    })!;
    const steep = gradeAdjustedPace({
      ...hilly10k,
      elevationGainMeters: 400,
    })!;
    expect(steep.gapSecondsPerKm).toBeLessThan(gentle.gapSecondsPerKm);
  });

  it("clamps absurd elevation instead of chasing it", () => {
    // 5000m of "gain" over 5km is sensor garbage — grade clamps at 30%,
    // so the result stays finite and bounded.
    const result = gradeAdjustedPace({
      distanceMeters: 5_000,
      durationSeconds: 2_400,
      elevationGainMeters: 5_000,
    });
    expect(result).not.toBeNull();
    expect(Number.isFinite(result!.gapSecondsPerKm)).toBe(true);
    // Even fully clamped, the adjustment can't exceed the 30%-grade
    // factor (≈2.09× — GAP bottoms out just under half the raw pace).
    expect(result!.gapSecondsPerKm).toBeGreaterThan(
      result!.rawSecondsPerKm * 0.45
    );
  });

  it("fires exactly at the gate boundary", () => {
    const atGate = gradeAdjustedPace({
      distanceMeters: 10_000,
      durationSeconds: 3_000,
      elevationGainMeters: MATERIAL_CLIMB_GAIN_PER_KM * 10,
    });
    expect(atGate).not.toBeNull();
  });
});

describe("formatSecondsPerKm", () => {
  it("formats with the app's floor convention", () => {
    expect(formatSecondsPerKm(286.75)).toBe("4:46");
    expect(formatSecondsPerKm(300)).toBe("5:00");
    expect(formatSecondsPerKm(359.999)).toBe("5:59");
  });

  it("falls back to placeholder on unusable input", () => {
    expect(formatSecondsPerKm(0)).toBe("--:--");
    expect(formatSecondsPerKm(-10)).toBe("--:--");
    expect(formatSecondsPerKm(NaN)).toBe("--:--");
  });
});
