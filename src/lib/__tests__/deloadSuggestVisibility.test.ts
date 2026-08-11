/**
 * P1d pin 2 — "taper IS the deload; no double-deload".
 *
 * The Performance Index recommends a deload from training load and
 * recovery. A runner tapering into a race is ALREADY cutting load on
 * purpose, so the recommendation fires and the banner offered to cut
 * their lifting on top of it — the lock forbids exactly that, and the
 * guard was never wired.
 *
 * Two failure directions matter equally and both are covered here:
 *
 *   - under-guarding gives a tapering runner a second load cut, which
 *     is the reported hazard;
 *   - over-guarding silently removes deload suggestions from every
 *     race-prep runner for their whole block, which is worse and much
 *     harder to notice.
 *
 * The fixtures use a 16-week marathon because its phase boundaries are
 * already pinned by `taperCap.test.ts`: race=15, taper=12/13/14,
 * build/base below. Week numbers here are read from that same map rather
 * than recomputed, so this file tests the GUARD, not the phase maths.
 */
import { describe, it, expect } from "vitest";
import { shouldSuggestDeload } from "../deloadSuggestVisibility";

/** A 16-week marathon block — the phase map pinned in taperCap.test.ts. */
const MARATHON = { totalWeeks: 16, distance: "marathon" as const };

describe("shouldSuggestDeload", () => {
  it("suppresses the suggestion through the taper", () => {
    for (const currentWeek of [12, 13, 14]) {
      expect(
        shouldSuggestDeload({
          deloadRecommended: true,
          currentWeek,
          ...MARATHON,
        }),
        `taper week ${currentWeek} must not offer a second deload`
      ).toBe(false);
    }
  });

  it("suppresses it in race week too", () => {
    // Not the lock's letter (it names the taper) but its reason: race
    // week is the deepest part of the same wind-down, and "deload your
    // lifting" is the worst possible advice the week of a marathon.
    expect(
      shouldSuggestDeload({ deloadRecommended: true, currentWeek: 15, ...MARATHON })
    ).toBe(false);
  });

  it("STILL suggests during base and build — the over-guard direction", () => {
    // The control. Without it, a guard hardcoded to `false` would satisfy
    // every assertion above while quietly disabling the feature for all
    // race-prep runners.
    for (const currentWeek of [0, 5, 11]) {
      expect(
        shouldSuggestDeload({
          deloadRecommended: true,
          currentWeek,
          ...MARATHON,
        }),
        `week ${currentWeek} is normal training — the banner must still fire`
      ).toBe(true);
    }
  });

  it("leaves non-race users exactly as they were", () => {
    // Freeform runners and lift-only users have no race plan at all.
    // This is the majority case and the guard must be inert for it.
    expect(
      shouldSuggestDeload({
        deloadRecommended: true,
        currentWeek: undefined,
        totalWeeks: undefined,
        distance: undefined,
      })
    ).toBe(true);
  });

  it("never invents a suggestion the PI did not make", () => {
    // The guard may only ever SUBTRACT. If `deloadRecommended` is false
    // the answer is false in every phase, race plan or not.
    for (const currentWeek of [0, 11, 13, 15]) {
      expect(
        shouldSuggestDeload({
          deloadRecommended: false,
          currentWeek,
          ...MARATHON,
        })
      ).toBe(false);
    }
    expect(
      shouldSuggestDeload({
        deloadRecommended: false,
        currentWeek: undefined,
        totalWeeks: undefined,
        distance: undefined,
      })
    ).toBe(false);
  });

  it("tolerates a partial race plan without suppressing", () => {
    // Mid-regeneration a plan can carry some fields and not others.
    // Erring toward SHOWING is right: the recommendation is real, and a
    // half-written plan is not evidence of a taper.
    expect(
      shouldSuggestDeload({
        deloadRecommended: true,
        currentWeek: 13,
        totalWeeks: undefined,
        distance: "marathon",
      })
    ).toBe(true);
    expect(
      shouldSuggestDeload({
        deloadRecommended: true,
        currentWeek: 13,
        totalWeeks: 16,
        distance: undefined,
      })
    ).toBe(true);
  });
});
