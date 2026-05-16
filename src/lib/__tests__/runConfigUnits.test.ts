/**
 * Pins the audio-cue regression that PR-0a fixed alongside the
 * km→m prefill conversion.
 *
 * Pre-PR-0a the Run.tsx audio-cue block did:
 *   const targetMeters = runConfig.target.value * 1000;
 *
 * That was "right by being doubly-wrong" — templateToPrefill
 * emitted km, the multiply converted to m. Once the prefill
 * was fixed to emit m directly, the multiply would have produced
 * 10_000_000m for a 10K target and broken every halfway/final-500
 * cue. The helper exists so this regression is testable without
 * mounting the Run page.
 */
import { describe, it, expect } from "vitest";
import { getDistanceTargetMeters } from "../runConfigUnits";

describe("getDistanceTargetMeters", () => {
  it("returns the value unchanged for a distance target", () => {
    // 10000m in, 10000m out — NOT 10_000_000.
    expect(getDistanceTargetMeters({ type: "distance", value: 10000 })).toBe(10000);
  });

  it("returns 0 for a pace target", () => {
    expect(getDistanceTargetMeters({ type: "pace", value: 270 })).toBe(0);
  });

  it("returns 0 for a time target", () => {
    expect(getDistanceTargetMeters({ type: "time", value: 1800 })).toBe(0);
  });

  it("returns 0 for type='none'", () => {
    expect(getDistanceTargetMeters({ type: "none" })).toBe(0);
  });

  it("returns 0 when value is omitted on a distance target", () => {
    // Defensive — type may be "distance" while value is still
    // being collected mid-edit; we never want to feed 0 as a
    // valid halfway threshold.
    expect(getDistanceTargetMeters({ type: "distance" })).toBe(0);
  });

  it("returns 0 for undefined / null targets", () => {
    expect(getDistanceTargetMeters(undefined)).toBe(0);
    expect(getDistanceTargetMeters(null)).toBe(0);
  });

  it("passes a 5km target through as 5000m", () => {
    // 5K race target via templateToPrefill emits 5000.
    expect(getDistanceTargetMeters({ type: "distance", value: 5000 })).toBe(5000);
  });

  it("passes a marathon target through as 42200m", () => {
    expect(getDistanceTargetMeters({ type: "distance", value: 42200 })).toBe(42200);
  });
});
