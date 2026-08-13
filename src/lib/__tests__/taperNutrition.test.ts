/**
 * taperNutrition — the one forward-looking calorie mover + adaptive-exclusion
 * window. Pure + local-date stable.
 */
import { describe, it, expect } from "vitest";
import {
  resolveTaper,
  isAdaptiveExcludedDate,
  isAdaptiveFrozen,
  CARB_LOAD_DAYS,
} from "../taperNutrition";
import { localDateString, addLocalDays } from "../dateHelpers";
import { makeProfile } from "@/test/nutritionFixtures";
import type { UserProfile } from "../auth";

const TODAY = new Date();
const dayKey = (offset: number) => localDateString(addLocalDays(TODAY, offset));

/** half-marathon taper = 2 weeks (14-day window). */
function raceProfile(daysToRace: number): UserProfile {
  return makeProfile({
    runMode: "race_prep",
    raceGoal: { distance: "half", targetDate: dayKey(daysToRace) },
  });
}

const BASE = 2500;

describe("resolveTaper — calorie override", () => {
  it("contracts calories during a taper week (5–10% below base)", () => {
    const t = resolveTaper(TODAY, raceProfile(6), BASE);
    expect(t).not.toBeNull();
    expect(t!.phase).toBe("taper");
    expect(t!.carbLoad).toBe(false);
    expect(t!.taperedCalories).toBeLessThan(BASE);
    expect(t!.taperedCalories).toBeGreaterThanOrEqual(Math.round(BASE * 0.9));
    expect(t!.annotation).toContain("Taper");
  });

  /**
   * NUTR-L5, on the path that skipped it.
   *
   * `calculateTDEE` and the adaptive learned path both run
   * `floorTargetCalories`, each under a comment saying a deficit "can never"
   * push the target below `min(maintenance, 1200)`. The taper is the THIRD
   * writer of the day's target and multiplied straight through — so it
   * could, and the user it reached is a plausible one rather than a corner
   * case: a small-framed cutter (maintenance ~1600, cut band −550 → 1050)
   * is clamped by the rate-derived floor to exactly 1200, and 1200 is
   * precisely where a further 10% bites.
   */
  it("never taper-cuts below the 1200 safety floor", () => {
    const atFloor = 1200;
    // Day 4 of a 14-day window — near the deepest cut, where an unfloored
    // taper landed at 1080.
    const t = resolveTaper(TODAY, raceProfile(4), atFloor)!;
    expect(t.phase).toBe("taper");
    expect(t.taperedCalories).toBe(atFloor);
  });

  it("floors across the WHOLE taper window, not just the deep end", () => {
    // The cut ramps 5%→10%, so a single day proves little on its own.
    for (let d = 0; d <= 14; d++) {
      const t = resolveTaper(TODAY, raceProfile(d), 1200);
      if (!t || t.carbLoad) continue;
      expect(t.taperedCalories, `day ${d}`).toBeGreaterThanOrEqual(1200);
    }
  });

  it("still contracts normally well above the floor", () => {
    // The control: flooring must not flatten the taper for everyone else,
    // which is what a floor applied against the wrong reference would do.
    const t = resolveTaper(TODAY, raceProfile(4), BASE)!;
    expect(t.taperedCalories).toBeLessThan(BASE);
  });

  it("cannot RAISE a target that already sits below the floor", () => {
    /* A `customCalorieTarget` the user set themselves — `tdee.ts` says in
       writing it leaves those alone. The floor is min(base, 1200), so the
       taper holds at their number rather than reducing further, and never
       pushes them UP to 1200 (which would be the app overriding an explicit
       choice in the other direction). */
    const t = resolveTaper(TODAY, raceProfile(4), 1000)!;
    expect(t.taperedCalories).toBe(1000);
  });

  it("contracts MORE as the race approaches (volume drop is proportional)", () => {
    const early = resolveTaper(TODAY, raceProfile(13), BASE)!.taperedCalories;
    const late = resolveTaper(TODAY, raceProfile(4), BASE)!.taperedCalories;
    expect(late).toBeLessThan(early); // deeper cut closer to the race
  });

  it("final days flip to carb-LOAD (calories bump back up, carbLoad flag)", () => {
    const t = resolveTaper(TODAY, raceProfile(CARB_LOAD_DAYS), BASE);
    expect(t!.carbLoad).toBe(true);
    expect(t!.taperedCalories).toBeGreaterThan(BASE);
    expect(t!.annotation).toContain("carb load");
  });

  it("race day is a carb-load (phase 'race')", () => {
    const t = resolveTaper(TODAY, raceProfile(0), BASE);
    expect(t!.phase).toBe("race");
    expect(t!.carbLoad).toBe(true);
  });

  it("no-op during base/build (race beyond the taper window)", () => {
    expect(resolveTaper(TODAY, raceProfile(40), BASE)).toBeNull();
  });

  it("no-op after the race has passed", () => {
    expect(resolveTaper(TODAY, raceProfile(-3), BASE)).toBeNull();
  });

  it("HARD gate: no-op for non-race / freeform / no-runMode profiles", () => {
    expect(resolveTaper(TODAY, makeProfile(), BASE)).toBeNull(); // no runMode
    expect(
      resolveTaper(TODAY, makeProfile({ runMode: "freeform" }), BASE)
    ).toBeNull();
    expect(
      resolveTaper(
        TODAY,
        makeProfile({ runMode: "race_prep", raceGoal: null }),
        BASE
      )
    ).toBeNull();
  });
});

describe("isAdaptiveExcludedDate — taper/race/post-race window", () => {
  const profile = raceProfile(6); // race 6 days out, taper started 8 days ago

  it("excludes taper, race, and ~1 week post-race dates", () => {
    expect(isAdaptiveExcludedDate(dayKey(-3), profile)).toBe(true); // mid-taper (3 days ago)
    expect(isAdaptiveExcludedDate(dayKey(6), profile)).toBe(true); // race day
    expect(isAdaptiveExcludedDate(dayKey(6 + 5), profile)).toBe(true); // 5 days post-race
  });

  it("does NOT exclude pre-taper dates or dates well after the post-race window", () => {
    expect(isAdaptiveExcludedDate(dayKey(-20), profile)).toBe(false); // pre-taper
    expect(isAdaptiveExcludedDate(dayKey(6 + 10), profile)).toBe(false); // >7d post-race
  });

  it("never excludes for a non-race profile", () => {
    expect(isAdaptiveExcludedDate(dayKey(0), makeProfile())).toBe(false);
  });
});

describe("isAdaptiveFrozen — today inside the window", () => {
  it("frozen during taper and just after the race; not frozen in base/build or long after", () => {
    expect(isAdaptiveFrozen(TODAY, raceProfile(6))).toBe(true); // taper
    expect(isAdaptiveFrozen(TODAY, raceProfile(-3))).toBe(true); // 3 days post-race
    expect(isAdaptiveFrozen(TODAY, raceProfile(40))).toBe(false); // base/build
    expect(isAdaptiveFrozen(TODAY, raceProfile(-20))).toBe(false); // long after
    expect(isAdaptiveFrozen(TODAY, makeProfile())).toBe(false); // no race
  });
});
