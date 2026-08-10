/**
 * `isHardRun` — the shared "demanding run" predicate.
 *
 * The rest of this file tested the cross-discipline guidance narrative
 * (resolveHybridGuidance / fuelLineFor / the tone matrix). That narrative
 * was the Home "today" card, removed 2026-08-10 on the operator's call,
 * and its tests went with it rather than being left to test nothing.
 *
 * The predicate stays because it is genuinely shared: easierToday.ts and
 * the run surfaces both need the same answer to "was that a demanding
 * run?", and one definition is what stops them drifting.
 */
import { describe, it, expect } from "vitest";
import { isHardRun } from "../hybridGuidance";

describe("isHardRun (shared predicate)", () => {
  it("fires on long distance, long duration, or a quality template", () => {
    expect(isHardRun({ distance: 8000, duration: 0 })).toBe(true);
    expect(isHardRun({ distance: 0, duration: 2700 })).toBe(true);
    expect(
      isHardRun({ distance: 3000, duration: 1200, activityType: "tempo" })
    ).toBe(true);
    expect(
      isHardRun({ distance: 3000, duration: 1200, activityType: "intervals" })
    ).toBe(true);
  });

  it("stays quiet on an easy short run", () => {
    expect(
      isHardRun({ distance: 4000, duration: 1500, activityType: "free" })
    ).toBe(false);
    expect(isHardRun({ distance: 4000, duration: 1500 })).toBe(false);
  });
});
