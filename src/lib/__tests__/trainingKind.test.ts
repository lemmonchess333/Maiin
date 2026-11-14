/**
 * What a person trains, read from the plan (App1 Q23): the setup answer
 * (`athleteType`) is written once and never changes, so a reader that
 * trusted it called a runner who added lift days a runner only, and a
 * lifter who started a race plan a lifter only.
 */
import { describe, expect, it } from "vitest";
import {
  setupSport,
  trainingKind,
  type TrainingKindPlan,
  type TrainingKindProfile,
} from "../trainingKind";

const BOTH = { lifts: true, runs: true };
const LIFTS_ONLY = { lifts: true, runs: false };
const RUNS_ONLY = { lifts: false, runs: true };

/** A week laid out with these days, the rest rest days. */
const week = (types: Record<number, "lift" | "run" | "both">) =>
  [0, 1, 2, 3, 4, 5, 6].map((day) => ({
    day,
    type: types[day] ?? ("rest" as const),
  }));

const LIFT_WEEK = week({ 1: "lift", 3: "lift", 5: "lift" });

/** A programme with two lift sessions, and no `runDays` key at all, as a
 *  lift-only plan can be stored. */
const LIFT_PROGRAMME = {
  workouts: [{ dayName: "Push" }, { dayName: "Pull" }],
} as unknown as TrainingKindPlan;

const NO_LIFT_PROGRAMME = {
  workouts: [],
  runDays: [],
} as unknown as TrainingKindPlan;

const profile = (fields: TrainingKindProfile) => fields;

describe("trainingKind — lifts", () => {
  it("are the programme's lift sessions once it has loaded", () => {
    // A runner's stored layout can be synthesised from an old lift target;
    // the programme they have holds no lifts.
    expect(
      trainingKind(
        profile({ runMode: "freeform", weeklyWorkoutsTarget: 3 }),
        NO_LIFT_PROGRAMME
      )
    ).toEqual(RUNS_ONLY);
  });

  it("are the week's layout while the programme loads", () => {
    expect(
      trainingKind(
        profile({
          runMode: "freeform",
          runFrequency: "none",
          weekSchedule: LIFT_WEEK,
        }),
        null
      )
    ).toEqual(LIFTS_ONLY);
  });
});

describe("trainingKind — a lift-only plan", () => {
  it("has no running, with no run days and no runDays key", () => {
    expect(
      trainingKind(
        profile({
          athleteType: "Lifter",
          runFrequency: "none",
          runMode: "freeform",
          weekSchedule: LIFT_WEEK,
        }),
        LIFT_PROGRAMME
      )
    ).toEqual(LIFTS_ONLY);
  });

  it("reads the plan, not a setup answer that says both", () => {
    expect(
      trainingKind(
        profile({
          athleteType: "Hybrid",
          runFrequency: "none",
          runMode: "freeform",
          weekSchedule: LIFT_WEEK,
        }),
        LIFT_PROGRAMME
      )
    ).toEqual(LIFTS_ONLY);
  });
});

describe("trainingKind — run plans", () => {
  const lifter = {
    athleteType: "Lifter",
    runFrequency: "none",
    weekSchedule: LIFT_WEEK,
  } as const;

  it("a race plan runs, in a week with no runs in it too", () => {
    expect(
      trainingKind(profile({ ...lifter, runMode: "race_prep" }), {
        ...LIFT_PROGRAMME,
        runDays: [],
      })
    ).toEqual(BOTH);
  });

  it("a plan with no race date runs, though the profile says free running", () => {
    expect(
      trainingKind(profile({ ...lifter, runMode: "freeform" }), {
        ...LIFT_PROGRAMME,
        runDays: [],
        runPlan: { mode: "rolling" } as never,
      })
    ).toEqual(BOTH);
  });

  it("the starter goal runs", () => {
    expect(
      trainingKind(profile({ ...lifter, runMode: "starter" }), LIFT_PROGRAMME)
    ).toEqual(BOTH);
  });

  it("run days on the plan or in the week run", () => {
    expect(
      trainingKind(profile({ ...lifter, runMode: "freeform" }), {
        ...LIFT_PROGRAMME,
        runDays: [{ id: "r1" }],
      } as unknown as TrainingKindPlan)
    ).toEqual(BOTH);
    expect(
      trainingKind(
        profile({
          ...lifter,
          runMode: "freeform",
          weekSchedule: week({ 1: "lift", 3: "both", 6: "run" }),
        }),
        LIFT_PROGRAMME
      )
    ).toEqual(BOTH);
  });

  it("a lifter who started a race plan is both, whatever setup said", () => {
    expect(
      trainingKind(profile({ ...lifter, runMode: "race_prep" }), LIFT_PROGRAMME)
    ).toEqual(BOTH);
  });
});

describe("trainingKind — free running, which plans no day", () => {
  it("someone with no lift days runs", () => {
    expect(
      trainingKind(
        profile({
          athleteType: "Runner",
          runFrequency: "occasional",
          runMode: "freeform",
          weeklyWorkoutsTarget: 0,
        }),
        NO_LIFT_PROGRAMME
      )
    ).toEqual(RUNS_ONLY);
  });

  it("beside lifts, the running level says it", () => {
    for (const runFrequency of ["new", "occasional", "regular"] as const)
      expect(
        trainingKind(
          profile({
            runFrequency,
            runMode: "freeform",
            weekSchedule: LIFT_WEEK,
          }),
          LIFT_PROGRAMME
        )
      ).toEqual(BOTH);
  });

  it("a runner who added lift days is both", () => {
    expect(
      trainingKind(
        profile({
          athleteType: "Runner",
          runFrequency: "regular",
          runMode: "freeform",
          weekSchedule: LIFT_WEEK,
        }),
        LIFT_PROGRAMME
      )
    ).toEqual(BOTH);
  });

  it("a weekly running goal runs", () => {
    expect(
      trainingKind(
        profile({
          runFrequency: "none",
          runMode: "freeform",
          weekSchedule: LIFT_WEEK,
          nonRaceGoal: { kind: "minutes", target: 60 },
        }),
        LIFT_PROGRAMME
      )
    ).toEqual(BOTH);
  });

  it("between plans: a starter goal over, or a race's run days left", () => {
    // The goal finished and went back to free running.
    expect(
      trainingKind(
        profile({
          runFrequency: "none",
          runMode: "freeform",
          weekSchedule: LIFT_WEEK,
          starterGoal: { startedOn: "2026-08-01", finishedOn: "2026-10-03" },
        }),
        LIFT_PROGRAMME
      )
    ).toEqual(BOTH);
    // A race's recovery ended: no race, no run days on the plan, and the
    // week it was laid on still has its run days.
    expect(
      trainingKind(
        profile({
          runFrequency: "none",
          runMode: "freeform",
          weekSchedule: week({ 1: "lift", 2: "run", 4: "both", 6: "run" }),
        }),
        { ...LIFT_PROGRAMME, runDays: [] }
      )
    ).toEqual(BOTH);
  });
});

describe("trainingKind — before there is a plan", () => {
  it("knows nothing with no profile", () => {
    expect(trainingKind(null, null)).toEqual({ lifts: false, runs: false });
  });

  it("reads the setup answer until the plan exists", () => {
    expect(trainingKind(profile({ athleteType: "Runner" }), null)).toEqual(
      RUNS_ONLY
    );
    expect(trainingKind(profile({ athleteType: "Hybrid" }), null)).toEqual(
      BOTH
    );
    expect(trainingKind(profile({ athleteType: "Lifter" }), null)).toEqual(
      LIFTS_ONLY
    );
    expect(trainingKind(profile({}), null)).toEqual(LIFTS_ONLY);
  });

  it("stops reading it once any of the plan is stored", () => {
    // The plan's run mode alone: a runner's profile before the programme
    // has loaded, with a layout of no lift days.
    expect(
      trainingKind(
        profile({
          athleteType: "Lifter",
          runMode: "freeform",
          weeklyWorkoutsTarget: 0,
        }),
        null
      )
    ).toEqual(RUNS_ONLY);
    // The programme alone.
    expect(
      trainingKind(profile({ athleteType: "Runner" }), LIFT_PROGRAMME)
    ).toEqual(LIFTS_ONLY);
  });
});

describe("setupSport — the first-week numbers' reading of setup", () => {
  it("names the setup answer, a lifter when it is missing", () => {
    expect(setupSport({ athleteType: "Runner" })).toBe("runner");
    expect(setupSport({ athleteType: "Hybrid" })).toBe("hybrid");
    expect(setupSport({ athleteType: "Lifter" })).toBe("lifter");
    expect(setupSport({})).toBe("lifter");
    expect(setupSport(null)).toBe("lifter");
  });
});
