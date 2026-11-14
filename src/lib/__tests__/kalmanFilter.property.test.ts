/**
 * Property-based guard for the run's position filter
 * (`VelocityKalmanFilter`).
 *
 * A filter that keeps a velocity can run ahead of its fixes, by design: it
 * predicts. So the property that guarded the position-only filter (the
 * estimate never leaves the box of the fixes seen) does not hold for it,
 * and is replaced by the one that matters for a run's trace: the estimate
 * stays finite and near the latest fix, for any stream a runner can make.
 * "Near" is twice the fix's reported accuracy plus the farthest a runner
 * could have gone since the last fix at `MAX_PLAUSIBLE_SPEED_MPS`; across
 * the streams below it never went past 1.6 times that.
 *
 * Deterministic (seeded PRNG).
 */
import { describe, it, expect } from "vitest";
import {
  MAX_PLAUSIBLE_SPEED_MPS,
  VelocityKalmanFilter,
  haversine,
} from "../gps";
import { mulberry32 } from "@/test/prng";

const M_PER_DEG = (6_371_000 * Math.PI) / 180;
const T = 1_700_000_000_000;

describe("VelocityKalmanFilter (property-based)", () => {
  it("stays finite and near the latest fix for any stream a runner can make", () => {
    const rnd = mulberry32(801);
    for (let sim = 0; sim < 1500; sim++) {
      const kf = new VelocityKalmanFilter();
      const lat0 = -60 + rnd() * 120;
      const lon0 = -170 + rnd() * 340;
      const mPerLon = M_PER_DEG * Math.cos((lat0 * Math.PI) / 180);
      let x = 0;
      let y = 0;
      let t = T;
      let heading = rnd() * 2 * Math.PI;
      const steps = 3 + Math.floor(rnd() * 120);
      for (let s = 0; s < steps; s++) {
        // Up to 5 s between fixes, any speed up to the teleport limit, a
        // turn about one fix in three, the fix anywhere inside its accuracy.
        const dt = 0.5 + rnd() * 4.5;
        const speed = rnd() * MAX_PLAUSIBLE_SPEED_MPS;
        if (rnd() < 0.3) heading = rnd() * 2 * Math.PI;
        const accuracy = 3 + rnd() * 32;
        x += speed * dt * Math.cos(heading);
        y += speed * dt * Math.sin(heading);
        t += dt * 1000;
        const lat = lat0 + (y + (rnd() - 0.5) * 2 * accuracy) / M_PER_DEG;
        const lon = lon0 + (x + (rnd() - 0.5) * 2 * accuracy) / mPerLon;

        const out = kf.process(lat, lon, accuracy, t);
        expect(Number.isFinite(out.lat)).toBe(true);
        expect(Number.isFinite(out.lon)).toBe(true);
        expect(haversine(out.lat, out.lon, lat, lon)).toBeLessThanOrEqual(
          2 * (accuracy + MAX_PLAUSIBLE_SPEED_MPS * dt)
        );
      }
    }
  });

  it("the first reading is passed through unchanged (seed)", () => {
    const rnd = mulberry32(802);
    for (let i = 0; i < 1000; i++) {
      const kf = new VelocityKalmanFilter();
      const lat = 51 + (rnd() - 0.5) * 0.1;
      const lon = -0.1 + (rnd() - 0.5) * 0.1;
      const out = kf.process(lat, lon, 1 + rnd() * 50, T);
      expect(out).toEqual({ lat, lon });
    }
  });

  it("a constant-position stream stays pinned at that position", () => {
    const rnd = mulberry32(803);
    for (let i = 0; i < 1000; i++) {
      const kf = new VelocityKalmanFilter(1 + rnd() * 100);
      const lat = 51 + (rnd() - 0.5) * 0.1;
      const lon = -0.1 + (rnd() - 0.5) * 0.1;
      let t = T;
      for (let s = 0; s < 20; s++) {
        t += 200 + rnd() * 4000;
        const out = kf.process(lat, lon, 1 + rnd() * 50, t);
        expect(out.lat).toBeCloseTo(lat, 9);
        expect(out.lon).toBeCloseTo(lon, 9);
      }
    }
  });

  it("reset() re-seeds: the next reading is passed through unchanged again", () => {
    const kf = new VelocityKalmanFilter();
    kf.process(51.5, -0.1, 5, T);
    kf.process(51.5001, -0.1001, 5, T + 1000); // smoothed away from the seed
    kf.reset();
    const out = kf.process(40.0, -74.0, 8, T + 2000); // a different place
    expect(out).toEqual({ lat: 40.0, lon: -74.0 });
  });

  it("a fix taken in the same millisecond as the last moves nothing out of bounds", () => {
    const kf = new VelocityKalmanFilter();
    kf.process(51.5, -0.1, 5, T);
    kf.process(51.50003, -0.1, 5, T + 1000);
    const out = kf.process(51.50006, -0.1, 5, T + 1000);
    expect(Number.isFinite(out.lat)).toBe(true);
    expect(out.lat).toBeGreaterThan(51.5);
    expect(out.lat).toBeLessThanOrEqual(51.50006 + 1e-9);
  });
});
