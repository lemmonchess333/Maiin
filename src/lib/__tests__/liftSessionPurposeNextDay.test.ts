/**
 * Heavy legs the day before a long run or a key session stay the person's
 * choice (Lift4 (10)): "Why this session" says so once, on a session with
 * leg lifts, and nothing in the plan moves.
 */
import { describe, expect, it } from "vitest";
import {
  legsBefore,
  liftSessionPurpose,
  type LiftPurposeProgramme,
} from "../liftSessionPurpose";
import type {
  ProgramExercise,
  ScheduledRunDay,
  WorkoutDay,
} from "@/features/program/programTypes";

const DATE = "2026-10-05";
const NEXT = "2026-10-06";

const exercise = (over: Partial<ProgramExercise>) =>
  ({
    name: "Squat",
    exerciseId: "squat",
    movementCategory: "knee_dominant",
    sets: 3,
    reps: 5,
    weight: 100,
    ...over,
  }) as ProgramExercise;

const legs: WorkoutDay = {
  dayName: "Lower",
  dayType: "lower",
  completed: false,
  exercises: [exercise({})],
};
const upper: WorkoutDay = {
  dayName: "Upper",
  dayType: "upper",
  completed: false,
  exercises: [
    exercise({
      name: "Bench Press",
      exerciseId: "bench-press",
      movementCategory: "horizontal_push",
    }),
  ],
};

const run = (over: Partial<ScheduledRunDay>): ScheduledRunDay => ({
  id: "run-1",
  dayIndex: 2,
  date: NEXT,
  weekKey: "2026-10-05",
  templateId: "long_12k",
  type: "long",
  status: "planned",
  ...over,
});

function why(
  day: WorkoutDay,
  runDays: ScheduledRunDay[],
  over: Partial<LiftPurposeProgramme> = {}
) {
  return liftSessionPurpose(
    {
      weekNumber: 3,
      currentPhase: "progression",
      primaryGoal: "running",
      runDays,
      ...over,
    },
    day,
    DATE,
    "beginner"
  );
}

describe("a leg session the day before a long run or a key session", () => {
  it("names the run the next day", () => {
    expect(why(legs, [run({})])).toContain(legsBefore("long run"));
    expect(
      why(legs, [run({ type: "tempo", templateId: "tempo_30" })])
    ).toContain(legsBefore("tempo run"));
    expect(
      why(legs, [run({ type: "race", templateId: "10k_race" })])
    ).toContain(legsBefore("race"));
  });

  it("says nothing before an easy run, a skipped one, or one two days on", () => {
    expect(
      why(legs, [run({ type: "easy", templateId: "easy_30" })])
    ).not.toContain("next day");
    expect(why(legs, [run({ status: "skipped" })])).not.toContain("next day");
    expect(why(legs, [run({ date: "2026-10-07" })])).not.toContain("next day");
    // A long run swapped for an easy one is an easy run.
    expect(why(legs, [run({ userOverride: "easy_30" })])).not.toContain(
      "next day"
    );
  });

  it("says nothing on a session without leg lifts", () => {
    expect(why(upper, [run({})])).not.toContain("next day");
  });

  it("leaves race week to its own line", () => {
    const raceWeek = why(
      legs,
      [run({ type: "race", templateId: "10k_race" })],
      {
        currentPhase: "deload",
        raceWeek: "race",
      }
    );
    expect(raceWeek).not.toContain("next day");
  });
});

/* Run27 (19): an ultra's back-to-back run is an easy run by type, and
   the lifting treats it as a long run: a leg session the day before one
   says so, as before the long run. */
describe("a leg session the day before an ultra's back-to-back run", () => {
  const backToBack = (over: Partial<ScheduledRunDay> = {}) =>
    run({ type: "easy", templateId: "back_to_back_90", ...over });

  it("names the back-to-back run", () => {
    expect(why(legs, [backToBack()])).toContain(
      "Your back-to-back run is the next day, and heavy leg work can leave your legs tired for it."
    );
    // A back-to-back made shorter keeps its family (`sameTimeOnFeetFamily`).
    expect(why(legs, [backToBack({ userOverride: "back_to_back_60" })])).toBe(
      why(legs, [backToBack()])
    );
  });

  it("says nothing before a skipped one, or on a session without leg lifts", () => {
    expect(why(legs, [backToBack({ status: "skipped" })])).not.toContain(
      "next day"
    );
    expect(why(upper, [backToBack()])).not.toContain("next day");
  });

  it("still says nothing before an easy run that is not one", () => {
    expect(
      why(legs, [run({ type: "easy", templateId: "easy_90" })])
    ).not.toContain("next day");
  });
});
