/**
 * `isHardRun` — the one definition of a long or hard run for the lifting
 * side (Pgm7 A5, 2026-10-07): the run plan's types decide, and a run with
 * no planned type counts as long from 75 minutes.
 */
import { describe, it, expect } from "vitest";
import { isHardRun, UNTYPED_LONG_RUN_SECONDS } from "../hybridGuidance";
import { HARD_RUN_TYPES } from "@/features/program/programTypes";

describe("isHardRun", () => {
  it.each(["long", "tempo", "intervals", "race"])(
    "counts a %s run, however short",
    (activityType) => {
      expect(isHardRun({ duration: 20 * 60, activityType })).toBe(true);
    }
  );

  it("never counts an easy run, however long or far", () => {
    expect(isHardRun({ duration: 110 * 60, activityType: "easy" })).toBe(false);
  });

  it("judges a typed run by the run plan's own list", () => {
    for (const type of ["easy", "tempo", "intervals", "long", "race"]) {
      expect(isHardRun({ duration: 30 * 60, activityType: type })).toBe(
        HARD_RUN_TYPES.has(type)
      );
    }
  });

  it.each([undefined, "freerun", "treadmill", "manual", "guided"])(
    "counts an untyped run (%s) as long from 75 minutes",
    (activityType) => {
      expect(
        isHardRun({ duration: UNTYPED_LONG_RUN_SECONDS - 1, activityType })
      ).toBe(false);
      expect(
        isHardRun({ duration: UNTYPED_LONG_RUN_SECONDS, activityType })
      ).toBe(true);
    }
  );

  it("doesn't count an easy 50-minute run, which the old 8 km / 45 minute test did", () => {
    expect(isHardRun({ duration: 50 * 60, activityType: "easy" })).toBe(false);
    expect(isHardRun({ duration: 50 * 60, activityType: "freerun" })).toBe(
      false
    );
  });
});
