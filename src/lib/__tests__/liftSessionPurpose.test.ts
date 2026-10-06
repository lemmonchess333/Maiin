/**
 * A lift day's "Why this session". Each sentence restates an engine rule,
 * so the tests below pin the words to the rule as well as to the
 * branches: a focus that changed its reps or sets, a lighter week that
 * moved in the cycle, or a hold that stopped holding would leave the copy
 * describing a plan the user does not have.
 */
import { describe, expect, it } from "vitest";
import {
  CYCLE,
  FOCUS_PURPOSE,
  HOLD,
  LAST_FULL_WEEK,
  LIGHTER_WEEK,
  liftSessionPurpose,
  type LiftPurposeProgramme,
} from "../liftSessionPurpose";
import { goalProfileFor } from "@/features/program/programEngine";
import { generateWeekPrescription } from "@/features/program/weekPrescription";
import { volumeLandmark } from "@/features/program/volumeModel";
import { EASING_HOLD_WEEKS } from "@/features/program/trainingBlock";
import { buildPlan } from "@/features/program/planBuilder";
import { applySessionProgression } from "@/features/program/sessionCompletion";
import type {
  ActiveTrainingBlock,
  BlockPace,
  PrimaryGoal,
} from "@/features/program/programTypes";

const DAY = { isCustom: false };
const TODAY = "2026-10-05";

function block(
  overrides: Partial<ActiveTrainingBlock> = {}
): ActiveTrainingBlock {
  return {
    id: "2026-10-05-1",
    owned: true,
    focus: "strength",
    pace: "full",
    durationWeeks: 8,
    startDate: "2026-10-05",
    goalBefore: "hypertrophy",
    amnestyWeeksLeft: 0,
    weeklyLiftTarget: 3,
    anchorExerciseIds: [],
    why: "",
    createdAt: 1,
    schemaVersion: 1,
    ...overrides,
  };
}

/** A three-day plan: with an intermediate's level, the calendar brings
 *  it lighter weeks (`lighterWeeksScheduled`). */
const THREE_DAYS = [{}, {}, {}] as LiftPurposeProgramme["workouts"];

function purpose(programme: LiftPurposeProgramme, date = TODAY) {
  return liftSessionPurpose(
    { workouts: THREE_DAYS, ...programme },
    DAY,
    date,
    "intermediate"
  );
}

describe("liftSessionPurpose", () => {
  it("says nothing without a programme, a day, or a week it can place", () => {
    expect(liftSessionPurpose(null, DAY, TODAY)).toBeNull();
    expect(liftSessionPurpose(undefined, DAY, TODAY)).toBeNull();
    expect(liftSessionPurpose({ weekNumber: 1 }, null, TODAY)).toBeNull();
    expect(purpose({})).toBeNull();
    expect(purpose({ weekNumber: 0 })).toBeNull();
    expect(purpose({ weekNumber: 1.5 })).toBeNull();
    expect(purpose({ weekNumber: Number.NaN })).toBeNull();
  });

  it("names the focus and where the week sits", () => {
    expect(
      purpose({
        weekNumber: 1,
        currentPhase: "progression",
        primaryGoal: "strength",
      })
    ).toBe(
      "This session is built for strength: heavier main lifts for lower reps. Your plan builds for three weeks, then a lighter week follows."
    );
  });

  it.each(Object.keys(FOCUS_PURPOSE) as PrimaryGoal[])(
    "describes the %s focus",
    (goal) => {
      expect(purpose({ weekNumber: 2, primaryGoal: goal })).toBe(
        `${FOCUS_PURPOSE[goal]} ${CYCLE}`
      );
    }
  );

  it("reads a programme with no stored focus as the general one the engine built", () => {
    /* `goalProfileFor(undefined)` is the general profile, so that is the
       prescription such a programme carries. */
    expect(goalProfileFor(undefined)).toEqual(goalProfileFor("general"));
    expect(purpose({ weekNumber: 1 })).toBe(
      `${FOCUS_PURPOSE.general} ${CYCLE}`
    );
  });

  it("calls the week before a planned lighter one the last full week", () => {
    for (const weekNumber of [3, 7, 51]) {
      const text = purpose({ weekNumber, primaryGoal: "hypertrophy" });
      expect(text, `week ${weekNumber}`).toContain(LAST_FULL_WEEK);
      expect(text, `week ${weekNumber}`).not.toContain(CYCLE);
    }
  });

  it("says nothing of a cycle when the calendar brings no lighter weeks", () => {
    // A beginner, an unknown level, or a plan of two days (Lift4 (9)).
    const programme = { weekNumber: 3, primaryGoal: "strength" as const };
    for (const [experience, workouts] of [
      ["beginner", THREE_DAYS],
      [undefined, THREE_DAYS],
      ["intermediate", [{}, {}]],
    ] as const) {
      expect(
        liftSessionPurpose(
          { ...programme, workouts } as LiftPurposeProgramme,
          DAY,
          TODAY,
          experience
        )
      ).toBe(FOCUS_PURPOSE.strength);
    }
  });

  it("describes a lighter week only when the lighter recipe was applied", () => {
    /* The calendar's fourth week, after a week with no training in it, is
       an ordinary week: advanceWeek withheld the recipe and left the phase
       at "progression". */
    expect(purpose({ weekNumber: 4, currentPhase: "progression" })).toBe(
      FOCUS_PURPOSE.general
    );
    expect(purpose({ weekNumber: 4, currentPhase: "deload" })).toBe(
      LIGHTER_WEEK
    );
  });

  it("drops the focus in a lighter week, whenever it falls", () => {
    /* A lighter week the user applied, or one escalated by two regressing
       sessions, can land in any week of the cycle. */
    for (const weekNumber of [1, 2, 3, 4]) {
      expect(
        purpose({ weekNumber, currentPhase: "deload", primaryGoal: "strength" })
      ).toBe(LIGHTER_WEEK);
    }
  });

  it("leaves the focus off a day the user built themselves", () => {
    const custom = { isCustom: true };
    expect(
      liftSessionPurpose(
        { weekNumber: 1, primaryGoal: "strength", workouts: THREE_DAYS },
        custom,
        TODAY,
        "intermediate"
      )
    ).toBe(CYCLE);
    expect(
      liftSessionPurpose(
        { weekNumber: 3, workouts: THREE_DAYS },
        custom,
        TODAY,
        "intermediate"
      )
    ).toBe(LAST_FULL_WEEK);
    expect(
      liftSessionPurpose(
        { weekNumber: 4, currentPhase: "progression", workouts: THREE_DAYS },
        custom,
        TODAY,
        "intermediate"
      )
    ).toBeNull();
    expect(
      liftSessionPurpose(
        { weekNumber: 4, currentPhase: "deload", workouts: THREE_DAYS },
        custom,
        TODAY,
        "intermediate"
      )
    ).toBe(LIGHTER_WEEK);
  });

  it("explains a block's focus while the block owns the plan", () => {
    const programme = {
      weekNumber: 1,
      primaryGoal: "hypertrophy" as const,
      trainingBlock: block({ focus: "strength" }),
    };
    expect(purpose(programme)).toBe(`${FOCUS_PURPOSE.strength} ${CYCLE}`);
    // Outside its window the block owns nothing yet, or any longer.
    expect(purpose(programme, "2026-10-04")).toBe(
      `${FOCUS_PURPOSE.hypertrophy} ${CYCLE}`
    );
    expect(purpose(programme, "2026-11-30")).toBe(
      `${FOCUS_PURPOSE.hypertrophy} ${CYCLE}`
    );
    // A block adopted at deploy never owned the prescription.
    expect(
      purpose({ ...programme, trainingBlock: block({ owned: false }) })
    ).toBe(`${FOCUS_PURPOSE.hypertrophy} ${CYCLE}`);
  });

  it("says the weights hold in an easing block's first weeks, and only then", () => {
    const programme = {
      weekNumber: 1,
      primaryGoal: "general" as const,
      trainingBlock: block({ pace: "easing", focus: "general" }),
    };
    expect(purpose(programme, "2026-10-05")).toBe(
      `${FOCUS_PURPOSE.general} ${CYCLE} ${HOLD}`
    );
    expect(purpose(programme, "2026-10-18")).toContain(HOLD);
    expect(purpose(programme, "2026-10-19")).not.toContain(HOLD);
    expect(purpose(programme, "2026-10-04")).not.toContain(HOLD);
    for (const pace of ["full", "lighter"] as BlockPace[]) {
      expect(
        purpose({ ...programme, trainingBlock: block({ pace }) })
      ).not.toContain(HOLD);
    }
    expect(
      purpose({ ...programme, currentPhase: "deload" }, "2026-10-05")
    ).toBe(`${LIGHTER_WEEK} ${HOLD}`);
  });
});

describe("the words match the engine", () => {
  it("has a sentence for every focus", () => {
    expect(Object.keys(FOCUS_PURPOSE).sort()).toEqual(
      ["fat_loss", "general", "hypertrophy", "running", "strength"].sort()
    );
  });

  it("gives a strength focus heavier main lifts for lower reps", () => {
    const strength = goalProfileFor("strength");
    for (const goal of ["hypertrophy", "fat_loss", "general"] as const)
      expect(strength.mainReps, goal).toBeLessThan(
        goalProfileFor(goal).mainReps
      );
  });

  it("gives building muscle higher reps and the most weekly sets", () => {
    const muscle = volumeLandmark("hypertrophy");
    expect(goalProfileFor("hypertrophy").mainReps).toBeGreaterThan(
      goalProfileFor("strength").mainReps
    );
    for (const goal of ["strength", "general", "running"]) {
      expect(muscle.low, goal).toBeGreaterThan(volumeLandmark(goal).low);
      expect(muscle.high, goal).toBeGreaterThan(volumeLandmark(goal).high);
    }
    // Losing fat trains as building muscle (Lift4 (4)).
    expect(volumeLandmark("fat_loss")).toEqual(muscle);
  });

  it("gives running support heavy main lifts and fewer sets", () => {
    const running = goalProfileFor("running");
    expect(running.mainReps).toBeLessThanOrEqual(
      goalProfileFor("strength").mainReps
    );
    expect(running.volumeMultiplier).toBeLessThan(1);
    expect(volumeLandmark("running").low).toBeLessThan(
      volumeLandmark("general").low
    );
  });

  it("keeps a fat-loss focus on the general reps, not high-rep work", () => {
    /* "There to keep your strength and muscle" is true because the reps
       are the general focus's, not the 12-15 the row once held. */
    expect(goalProfileFor("fat_loss").mainReps).toBe(
      goalProfileFor("general").mainReps
    );
  });

  it("counts the weeks the plan builds before a lighter one", () => {
    expect(
      [1, 2, 3, 4, 5].map((week) => generateWeekPrescription(week).deload)
    ).toEqual([false, false, false, true, false]);
    expect(CYCLE).toContain("three weeks");
  });

  it("counts the weeks an easing block holds", () => {
    expect(EASING_HOLD_WEEKS).toBe(2);
    expect(HOLD).toContain("first two weeks");
  });
});

describe("the hold sentence follows what finishing a session does", () => {
  /* The sentence says the weights hold. What holds them is
     `applySessionProgression`, at the finish. So drive a real finish with
     every set beaten and read the weight it writes, on the dates either
     side of the hold's end. */
  function finish(date: string, pace: BlockPace, owned = true) {
    const state = buildPlan({
      primaryGoal: "strength",
      nutritionPhase: "recomp",
      experience: "beginner",
      liftDays: 3,
      preferredSplit: "full_body",
      runMode: "freeform",
      weeklyRunDays: 0,
      equipment: "full_gym",
      injuries: [],
      currentDate: "2026-10-05",
      bodyweightKg: 80,
    }).programState;
    state.trainingBlock = block({ pace, focus: "strength", owned });
    const ex = state.workouts[0].exercises.find((e) => e.weight > 0)!;
    const next = applySessionProgression(state, 0, {
      completionId: `finish-${date}-${pace}`,
      date,
      prescription: { exercises: [ex], progressionBaseline: [ex] },
      setLogs: [
        Array.from({ length: ex.sets }, () => ({
          reps: (ex.repRangeMax ?? ex.reps) + 2,
          weight: ex.weight,
          completed: true,
          type: "working" as const,
        })),
      ],
    });
    const after = next.workouts[0].exercises.find(
      (e) => e.instanceId === ex.instanceId
    )!;
    return {
      moved: after.weight !== ex.weight,
      says: purpose({ ...state }, date)!.includes(HOLD),
    };
  }

  /* Each case names what the finish does as well as what the sentence
     says, so a finish that moved nothing anywhere cannot pass by agreeing
     with a sentence that never shows. */
  it.each([
    ["2026-10-05", "easing", true, false],
    ["2026-10-18", "easing", true, false],
    ["2026-10-19", "easing", true, true],
    ["2026-10-05", "full", true, true],
    /* Session completion does not ask whether the block owns the plan,
       so neither does the sentence. */
    ["2026-10-05", "easing", false, false],
  ] as const)(
    "on %s in a %s block (owned: %s)",
    (date, pace, owned, weightMoves) => {
      const { moved, says } = finish(date, pace, owned);
      expect(moved).toBe(weightMoves);
      expect(says).toBe(!moved);
    }
  );
});
