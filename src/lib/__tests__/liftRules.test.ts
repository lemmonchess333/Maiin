/**
 * The rules sheet (Lift4 (3)) says what the engine does, for this person.
 * Each number is read back against the engine's own constant, so a rule
 * changed in the code changes here or fails.
 */
import { describe, expect, it } from "vitest";
import { liftRules, liftRulesContext, type LiftRule } from "../liftRules";
import {
  AUTOMATIC_STEP_SHARE,
  BARBELL_STEP_KG,
  LOWERED_SHARE,
  MISSES_BEFORE_LOWERING,
  SMALL_PLATES_STEP_KG,
} from "@/features/program/loadSteps";
import {
  EASE_BACK_SHARE,
  LONG_BREAK_DAYS,
  LONG_BREAK_EASE_BACK_SHARE,
  WELCOME_BACK_DAYS,
} from "@/features/program/liftLayoff";
import { LIGHTER_WEEK_EVERY } from "@/features/program/weekPrescription";

const rule = (rules: LiftRule[], id: string) =>
  rules.find((r) => r.id === id)?.body ?? "";

const intermediate = liftRules({
  experience: "intermediate",
  liftDays: 3,
  smallPlates: false,
  racing: false,
});

describe("liftRules", () => {
  it("states the steps the engine takes", () => {
    expect(rule(intermediate, "steps")).toContain(`${BARBELL_STEP_KG} kg`);
    expect(rule(intermediate, "steps")).toContain(
      `${Math.round(AUTOMATIC_STEP_SHARE * 100)}%`
    );
    const small = liftRules({
      experience: "intermediate",
      liftDays: 3,
      smallPlates: true,
      racing: false,
    });
    expect(rule(small, "steps")).toContain(`${SMALL_PLATES_STEP_KG} kg`);
  });

  it("states the miss rule", () => {
    expect(MISSES_BEFORE_LOWERING).toBe(2);
    // A miss is the session's reps in total (sessionOutcome), so 8, 8 and
    // 6 against 3×8 is one. "Short on every set" read as each set falling
    // short, which is not the rule.
    expect(rule(intermediate, "misses")).toMatch(
      /^Fewer reps in total than planned, at the planned weight, is a miss/
    );
    expect(rule(intermediate, "misses")).not.toMatch(/every set/);
    expect(rule(intermediate, "misses")).toContain("Two misses in a row");
    expect(rule(intermediate, "misses")).toContain(
      `${Math.round(LOWERED_SHARE * 100)}% lighter`
    );
  });

  it("states who gets lighter weeks", () => {
    expect(rule(intermediate, "lighter")).toContain(
      `Every ${LIGHTER_WEEK_EVERY}th week you train is lighter`
    );
    expect(
      rule(
        liftRules({
          experience: "beginner",
          liftDays: 3,
          smallPlates: false,
          racing: false,
        }),
        "lighter"
      )
    ).toContain("schedules none while you're new to lifting");
    expect(
      rule(
        liftRules({
          experience: "advanced",
          liftDays: 2,
          smallPlates: false,
          racing: false,
        }),
        "lighter"
      )
    ).toContain("schedules none on two lift days a week");
    // Anyone can take one.
    for (const r of [intermediate]) {
      expect(rule(r, "lighter")).toContain("You can take one any time");
    }
  });

  it("follows the run plan's easier weeks, and names the race weeks, with a race", () => {
    const racing = liftRules({
      experience: "intermediate",
      liftDays: 3,
      smallPlates: false,
      racing: true,
    });
    expect(rule(racing, "lighter")).toContain("your run plan's easier weeks");
    expect(rule(racing, "race")).toContain(
      "The last two weeks before your race are lighter"
    );
    expect(rule(intermediate, "race")).toBe("");
  });

  it("states the return after a break", () => {
    const body = rule(intermediate, "return");
    expect(WELCOME_BACK_DAYS).toBe(14);
    expect(LONG_BREAK_DAYS).toBe(56);
    expect(body).toContain("After two weeks or more away");
    expect(body).toContain(`${Math.round(EASE_BACK_SHARE * 100)}% lighter`);
    expect(body).toContain(
      `${Math.round(LONG_BREAK_EASE_BACK_SHARE * 100)}% after more than eight weeks`
    );
  });

  it("carries the owner's line on a stuck lift", () => {
    const stuck = intermediate.find((r) => r.id === "stuck")!;
    expect(`${stuck.title} ${stuck.body}`).toBe(
      "Stuck on a lift? A variation often gets it moving."
    );
  });
});

describe("liftRulesContext", () => {
  it("reads the plan's days, plates and race", () => {
    expect(
      liftRulesContext(
        {
          workouts: [{}, {}, {}] as never,
          settings: { autoProgression: true, smallPlates: true },
          runPlan: { mode: "race_prep" },
        },
        "advanced"
      )
    ).toEqual({
      experience: "advanced",
      liftDays: 3,
      smallPlates: true,
      racing: true,
    });
    expect(liftRulesContext(null, undefined)).toEqual({
      experience: undefined,
      liftDays: 0,
      smallPlates: false,
      racing: false,
    });
  });
});
