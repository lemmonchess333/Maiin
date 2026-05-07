import { describe, it, expect } from "vitest";
import {
  canExportGpx,
  canShowFullSummary,
  canShowRetrySave,
  canShowShare,
  isInvalidRun,
  isOutdoorGpsRun,
  requiresManualDistance,
} from "../guards";

/* Pure-function guards — straightforward to pin. The `isInvalidRun`
 * thresholds are the ones the user explicitly approved (100m / 30s
 * outdoor, 50m treadmill); changing them should require a test
 * update so the contract is visible. */

describe("isOutdoorGpsRun", () => {
  it("treats treadmill as the only non-GPS mode", () => {
    expect(isOutdoorGpsRun("treadmill")).toBe(false);
    expect(isOutdoorGpsRun("freerun")).toBe(true);
    expect(isOutdoorGpsRun("guided")).toBe(true);
    expect(isOutdoorGpsRun("intervals")).toBe(true);
    expect(isOutdoorGpsRun(null)).toBe(true);
    expect(isOutdoorGpsRun(undefined)).toBe(true);
  });
});

describe("requiresManualDistance", () => {
  it("only treadmill takes manual entry", () => {
    expect(requiresManualDistance("treadmill")).toBe(true);
    expect(requiresManualDistance("freerun")).toBe(false);
  });
});

describe("isInvalidRun", () => {
  it("flags outdoor runs under 100m as invalid", () => {
    expect(isInvalidRun({ distanceMeters: 50, elapsedSeconds: 600, activityType: "freerun" })).toBe(true);
    expect(isInvalidRun({ distanceMeters: 99, elapsedSeconds: 600, activityType: "freerun" })).toBe(true);
    expect(isInvalidRun({ distanceMeters: 100, elapsedSeconds: 600, activityType: "freerun" })).toBe(false);
  });

  it("flags outdoor runs under 30s as invalid even if distance is somehow plausible", () => {
    expect(isInvalidRun({ distanceMeters: 200, elapsedSeconds: 14, activityType: "freerun" })).toBe(true);
    expect(isInvalidRun({ distanceMeters: 200, elapsedSeconds: 30, activityType: "freerun" })).toBe(false);
  });

  it("catches the 0.00km / 14s screenshot case the user reported", () => {
    expect(isInvalidRun({ distanceMeters: 0, elapsedSeconds: 14, activityType: "freerun" })).toBe(true);
  });

  it("uses a 50m floor for treadmill (manual entry, less paranoid)", () => {
    expect(isInvalidRun({ distanceMeters: 40, elapsedSeconds: 600, activityType: "treadmill" })).toBe(true);
    expect(isInvalidRun({ distanceMeters: 50, elapsedSeconds: 600, activityType: "treadmill" })).toBe(false);
  });

  it("does NOT apply the elapsed-time floor to treadmill runs", () => {
    /* A user might log a brisk 5-minute treadmill warmup as 800m / 5min;
       outdoor-style elapsed gating would falsely flag a sprint session. */
    expect(isInvalidRun({ distanceMeters: 800, elapsedSeconds: 5, activityType: "treadmill" })).toBe(false);
  });
});

describe("canShowFullSummary", () => {
  it("hides the full summary for invalid runs unless the user saved anyway", () => {
    expect(canShowFullSummary({ isInvalid: true, saved: false })).toBe(false);
    expect(canShowFullSummary({ isInvalid: true, saved: true })).toBe(true);
    expect(canShowFullSummary({ isInvalid: false, saved: false })).toBe(true);
  });
});

describe("canShowShare", () => {
  it("never offers share for an invalid run", () => {
    expect(canShowShare({ isInvalid: true })).toBe(false);
    expect(canShowShare({ isInvalid: false })).toBe(true);
  });
});

describe("canExportGpx", () => {
  it("hides GPX export for treadmill runs regardless of validity (no track to export)", () => {
    expect(canExportGpx({ isInvalid: false, activityType: "treadmill" })).toBe(false);
    expect(canExportGpx({ isInvalid: true, activityType: "treadmill" })).toBe(false);
  });

  it("hides GPX export for invalid outdoor runs", () => {
    expect(canExportGpx({ isInvalid: true, activityType: "freerun" })).toBe(false);
  });

  it("offers GPX export for valid outdoor runs", () => {
    expect(canExportGpx({ isInvalid: false, activityType: "freerun" })).toBe(true);
    expect(canExportGpx({ isInvalid: false, activityType: "guided" })).toBe(true);
  });
});

describe("canShowRetrySave", () => {
  it("only surfaces the retry affordance in the error state", () => {
    expect(canShowRetrySave({ status: "error" })).toBe(true);
    expect(canShowRetrySave({ status: "idle" })).toBe(false);
    expect(canShowRetrySave({ status: "saving" })).toBe(false);
    expect(canShowRetrySave({ status: "saved" })).toBe(false);
  });
});
