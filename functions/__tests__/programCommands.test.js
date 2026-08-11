import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  assertClientProgramCommand,
  assertCommandId,
  applyProgramCommand,
  makeCommandReceipt,
  workoutDaySignature,
  isProgramCommandError,
  ProgramCommandError,
  PROGRAM_COMMAND_RECEIPT_RETENTION_MS,
  CLIENT_COMMAND_KINDS,
  RESTORE_WINDOW_MS,
} = require("../lib/programCommands");

// A valid 16..128 char opaque id.
const CMD_ID = "cmd_abcdef0123456789";
const COMPLETION_ID = "sess_abcdef01";

const PRECONDITION = {
  dayIndex: 2,
  expectedWeekNumber: 5,
  expectedDaySignature: "Push|inst-a|inst-b",
};

function expectRejected(command) {
  let thrown;
  try {
    assertClientProgramCommand(command);
  } catch (error) {
    thrown = error;
  }
  expect(thrown, "expected the command to be rejected").toBeDefined();
  expect(isProgramCommandError(thrown)).toBe(true);
  return thrown;
}

describe("assertCommandId", () => {
  it("accepts a bounded opaque id", () => {
    expect(assertCommandId(CMD_ID)).toBe(CMD_ID);
  });

  it.each([
    ["too short", "short"],
    ["too long", "x".repeat(129)],
    ["illegal char", "cmd with spaces 123456"],
    ["dot char", "cmd.abcdef0123456789"],
    ["non-string", 12345678901234567],
    ["null", null],
  ])("rejects %s", (_label, value) => {
    expect(() => assertCommandId(value)).toThrow(ProgramCommandError);
  });
});

describe("assertClientProgramCommand — envelope", () => {
  it("rejects a non-object", () => {
    expectRejected(null);
    expectRejected("completeWorkoutDay");
    expectRejected([]);
  });

  it("rejects a missing / unknown kind", () => {
    expectRejected({ commandId: CMD_ID });
    expectRejected({ kind: "doSomething", commandId: CMD_ID });
  });

  it("rejects the private server transition replaceProgramme", () => {
    const error = expectRejected({
      kind: "replaceProgramme",
      commandId: CMD_ID,
      programState: { workouts: [] },
    });
    expect(error.message).toMatch(/not a client command/i);
  });

  it("rejects a missing / invalid commandId on a known kind", () => {
    expectRejected({ kind: "skipWorkoutDay", ...PRECONDITION });
    expectRejected({
      kind: "skipWorkoutDay",
      commandId: "short",
      ...PRECONDITION,
    });
  });

  it("rejects a prototype-polluting payload", () => {
    const malicious = JSON.parse(
      '{"kind":"skipWorkoutDay","commandId":"cmd_abcdef0123456789","dayIndex":2,"expectedWeekNumber":5,"expectedDaySignature":"x","__proto__":{"polluted":true}}'
    );
    // __proto__ from JSON.parse is an own enumerable key → unexpected field.
    expectRejected(malicious);
  });

  it("returns a fresh minimal object (strips nothing modelled, copies not references)", () => {
    const command = {
      kind: "skipWorkoutDay",
      commandId: CMD_ID,
      ...PRECONDITION,
    };
    const out = assertClientProgramCommand(command);
    expect(out).not.toBe(command);
    expect(out).toEqual({
      kind: "skipWorkoutDay",
      commandId: CMD_ID,
      ...PRECONDITION,
    });
  });
});

describe("WorkoutDayPrecondition validation", () => {
  const base = { kind: "skipWorkoutDay", commandId: CMD_ID };

  it("accepts a valid precondition", () => {
    expect(
      assertClientProgramCommand({ ...base, ...PRECONDITION })
    ).toMatchObject(PRECONDITION);
  });

  it("rejects a negative / out-of-range / non-integer dayIndex", () => {
    expectRejected({ ...base, ...PRECONDITION, dayIndex: -1 });
    expectRejected({ ...base, ...PRECONDITION, dayIndex: 99 });
    expectRejected({ ...base, ...PRECONDITION, dayIndex: 1.5 });
  });

  it("rejects a zero / huge expectedWeekNumber", () => {
    expectRejected({ ...base, ...PRECONDITION, expectedWeekNumber: 0 });
    expectRejected({ ...base, ...PRECONDITION, expectedWeekNumber: 100000 });
  });

  it("rejects a non-string / empty / oversized signature", () => {
    expectRejected({ ...base, ...PRECONDITION, expectedDaySignature: 42 });
    expectRejected({ ...base, ...PRECONDITION, expectedDaySignature: "" });
    expectRejected({
      ...base,
      ...PRECONDITION,
      expectedDaySignature: "x".repeat(5000),
    });
  });

  it("rejects an extra field on a precondition command", () => {
    expectRejected({ ...base, ...PRECONDITION, sneaky: true });
  });

  it("rejects a missing precondition field", () => {
    expectRejected({ ...base, dayIndex: 2, expectedWeekNumber: 5 });
  });
});

describe("completeWorkoutDay", () => {
  const valid = {
    kind: "completeWorkoutDay",
    commandId: CMD_ID,
    ...PRECONDITION,
    completion: {
      completionId: COMPLETION_ID,
      durationMinutes: 47,
      setLogs: [
        [
          { weight: 100, reps: 8, completed: true },
          { weight: 100, reps: 6, completed: true },
        ],
        [],
      ],
    },
  };

  it("accepts a valid completion (with optional sessionVariant)", () => {
    expect(assertClientProgramCommand(valid)).toMatchObject({
      kind: "completeWorkoutDay",
      completion: { completionId: COMPLETION_ID, durationMinutes: 47 },
    });
    const withVariant = {
      ...valid,
      completion: { ...valid.completion, sessionVariant: "express30" },
    };
    expect(
      assertClientProgramCommand(withVariant).completion.sessionVariant
    ).toBe("express30");
  });

  it("rejects a bad completionId (too short / illegal char)", () => {
    expectRejected({
      ...valid,
      completion: { ...valid.completion, completionId: "short" },
    });
    expectRejected({
      ...valid,
      completion: { ...valid.completion, completionId: "bad id with spaces" },
    });
  });

  it("rejects an out-of-range duration", () => {
    expectRejected({
      ...valid,
      completion: { ...valid.completion, durationMinutes: -1 },
    });
    expectRejected({
      ...valid,
      completion: { ...valid.completion, durationMinutes: 99999 },
    });
  });

  it("rejects a bad sessionVariant", () => {
    expectRejected({
      ...valid,
      completion: { ...valid.completion, sessionVariant: "express90" },
    });
  });

  it("rejects a non-array / malformed setLogs entry", () => {
    expectRejected({
      ...valid,
      completion: { ...valid.completion, setLogs: "nope" },
    });
    expectRejected({
      ...valid,
      completion: { ...valid.completion, setLogs: [[{ weight: 1, reps: 1 }]] },
    });
    expectRejected({
      ...valid,
      completion: {
        ...valid.completion,
        setLogs: [[{ weight: 1, reps: 1, completed: true, extra: 1 }]],
      },
    });
  });

  it("rejects an extra field inside completion", () => {
    expectRejected({
      ...valid,
      completion: { ...valid.completion, notes: "hi" },
    });
  });
});

describe("logExercise", () => {
  const valid = {
    kind: "logExercise",
    commandId: CMD_ID,
    ...PRECONDITION,
    exerciseInstanceId: "inst-a",
    actual: { weight: 60, reps: 10, completed: true },
  };

  it("accepts a valid log", () => {
    expect(assertClientProgramCommand(valid)).toMatchObject({
      kind: "logExercise",
      exerciseInstanceId: "inst-a",
      actual: { weight: 60, reps: 10, completed: true },
    });
  });

  it("rejects a malformed actual", () => {
    expectRejected({ ...valid, actual: { weight: 60, reps: 10 } });
    expectRejected({
      ...valid,
      actual: { weight: 60, reps: 10, completed: "yes" },
    });
    expectRejected({
      ...valid,
      actual: { weight: -1, reps: 10, completed: true },
    });
  });

  it("rejects a missing instance id", () => {
    const { exerciseInstanceId, ...rest } = valid;
    void exerciseInstanceId;
    expectRejected(rest);
  });
});

describe("exercise mutation commands", () => {
  it("removeExercise validates an instance id", () => {
    expect(
      assertClientProgramCommand({
        kind: "removeExercise",
        commandId: CMD_ID,
        ...PRECONDITION,
        exerciseInstanceId: "inst-a",
      })
    ).toMatchObject({ kind: "removeExercise", exerciseInstanceId: "inst-a" });
    expectRejected({
      kind: "removeExercise",
      commandId: CMD_ID,
      ...PRECONDITION,
      exerciseInstanceId: "",
    });
  });

  it("addExercises validates a bounded ExerciseInput list; rejects patch injection", () => {
    const out = assertClientProgramCommand({
      kind: "addExercises",
      commandId: CMD_ID,
      ...PRECONDITION,
      exercises: [
        { exerciseId: "bench", sets: 3, reps: 8 },
        { exerciseId: "row" },
      ],
      insertAt: 1,
    });
    expect(out.exercises).toHaveLength(2);
    expect(out.insertAt).toBe(1);

    // empty list
    expectRejected({
      kind: "addExercises",
      commandId: CMD_ID,
      ...PRECONDITION,
      exercises: [],
    });
    // a client-supplied exercise OBJECT with unmodelled fields (arbitrary patch)
    expectRejected({
      kind: "addExercises",
      commandId: CMD_ID,
      ...PRECONDITION,
      exercises: [
        { exerciseId: "bench", name: "Injected", muscles: ["chest"] },
      ],
    });
    // out-of-range insertAt
    expectRejected({
      kind: "addExercises",
      commandId: CMD_ID,
      ...PRECONDITION,
      exercises: [{ exerciseId: "bench" }],
      insertAt: 9999,
    });
  });

  it("replaceExercise validates both ids", () => {
    expect(
      assertClientProgramCommand({
        kind: "replaceExercise",
        commandId: CMD_ID,
        ...PRECONDITION,
        oldInstanceId: "inst-a",
        replacementExerciseId: "incline_press",
      })
    ).toMatchObject({
      oldInstanceId: "inst-a",
      replacementExerciseId: "incline_press",
    });
    expectRejected({
      kind: "replaceExercise",
      commandId: CMD_ID,
      ...PRECONDITION,
      oldInstanceId: "inst-a",
    });
  });

  it("updateExercise requires a bounded, non-empty patch (no generic object)", () => {
    expect(
      assertClientProgramCommand({
        kind: "updateExercise",
        commandId: CMD_ID,
        ...PRECONDITION,
        exerciseInstanceId: "inst-a",
        patch: { weight: 70 },
      })
    ).toMatchObject({ patch: { weight: 70 } });

    // empty patch — nothing to do
    expectRejected({
      kind: "updateExercise",
      commandId: CMD_ID,
      ...PRECONDITION,
      exerciseInstanceId: "inst-a",
      patch: {},
    });
    // arbitrary field in patch
    expectRejected({
      kind: "updateExercise",
      commandId: CMD_ID,
      ...PRECONDITION,
      exerciseInstanceId: "inst-a",
      patch: { restSeconds: 90 },
    });
  });

  it("reorderExercises requires a unique, bounded id set", () => {
    expect(
      assertClientProgramCommand({
        kind: "reorderExercises",
        commandId: CMD_ID,
        ...PRECONDITION,
        orderedInstanceIds: ["inst-a", "inst-b", "inst-c"],
      }).orderedInstanceIds
    ).toEqual(["inst-a", "inst-b", "inst-c"]);

    // duplicate id
    expectRejected({
      kind: "reorderExercises",
      commandId: CMD_ID,
      ...PRECONDITION,
      orderedInstanceIds: ["inst-a", "inst-a"],
    });
    // empty
    expectRejected({
      kind: "reorderExercises",
      commandId: CMD_ID,
      ...PRECONDITION,
      orderedInstanceIds: [],
    });
    // non-string element
    expectRejected({
      kind: "reorderExercises",
      commandId: CMD_ID,
      ...PRECONDITION,
      orderedInstanceIds: ["inst-a", 3],
    });
  });
});

describe("preconditionless commands", () => {
  it("setProgramSettings requires both boolean flags, nothing else", () => {
    expect(
      assertClientProgramCommand({
        kind: "setProgramSettings",
        commandId: CMD_ID,
        settings: { autoProgression: true, microloading: false },
      })
    ).toMatchObject({
      settings: { autoProgression: true, microloading: false },
    });
    expectRejected({
      kind: "setProgramSettings",
      commandId: CMD_ID,
      settings: { autoProgression: true },
    });
    expectRejected({
      kind: "setProgramSettings",
      commandId: CMD_ID,
      settings: { autoProgression: true, microloading: false, extra: 1 },
    });
    // preconditions are NOT part of this command
    expectRejected({
      kind: "setProgramSettings",
      commandId: CMD_ID,
      settings: { autoProgression: true, microloading: false },
      dayIndex: 1,
    });
  });

  it("applyDeloadWeek / revertDeloadWeek take only the week cursor (PROGRAM-DELOAD-01)", () => {
    for (const kind of ["applyDeloadWeek", "revertDeloadWeek"]) {
      expect(
        assertClientProgramCommand({
          kind,
          commandId: CMD_ID,
          expectedWeekNumber: 5,
        })
      ).toMatchObject({ kind, expectedWeekNumber: 5 });
      // week cursor is required + bounded
      expectRejected({ kind, commandId: CMD_ID });
      expectRejected({ kind, commandId: CMD_ID, expectedWeekNumber: 0 });
      expectRejected({ kind, commandId: CMD_ID, expectedWeekNumber: 5.5 });
      // no day precondition, no extra fields
      expectRejected({
        kind,
        commandId: CMD_ID,
        expectedWeekNumber: 5,
        dayIndex: 0,
      });
      expectRejected({
        kind,
        commandId: CMD_ID,
        expectedWeekNumber: 5,
        workouts: [],
      });
    }
  });

  it("setProgramGoalMirror accepts only the allowed goal enum", () => {
    expect(
      assertClientProgramCommand({
        kind: "setProgramGoalMirror",
        commandId: CMD_ID,
        goal: "recomp",
      }).goal
    ).toBe("recomp");
    expectRejected({
      kind: "setProgramGoalMirror",
      commandId: CMD_ID,
      goal: "bulk",
    });
  });

  it("setManualRunCompletion validates runDayId + boolean", () => {
    expect(
      assertClientProgramCommand({
        kind: "setManualRunCompletion",
        commandId: CMD_ID,
        runDayId: "run-2026-07-13",
        completed: true,
      })
    ).toMatchObject({ runDayId: "run-2026-07-13", completed: true });
    expectRejected({
      kind: "setManualRunCompletion",
      commandId: CMD_ID,
      runDayId: "run-1",
      completed: "yes",
    });
  });

  // Widened from skipped-only when `restoreRunDay` migrated to the boundary
  // (SESSION-RESTORE-01). These are the two USER-initiated transitions; the
  // completed_* states stay engine-only, which is what this still pins.
  it("transitionRunDay permits skipped and planned, nothing else", () => {
    for (const to of ["skipped", "planned"]) {
      expect(
        assertClientProgramCommand({
          kind: "transitionRunDay",
          commandId: CMD_ID,
          runDayId: "run-1",
          to,
        }).to
      ).toBe(to);
    }
    for (const to of [
      "completed_exact",
      "completed_modified",
      "completed_late",
      "race_no_show",
    ]) {
      expectRejected({
        kind: "transitionRunDay",
        commandId: CMD_ID,
        runDayId: "run-1",
        to,
      });
    }
  });

  it("overrideRunDay validates runDayId + templateId", () => {
    expect(
      assertClientProgramCommand({
        kind: "overrideRunDay",
        commandId: CMD_ID,
        runDayId: "run-1",
        templateId: "tempo_20",
      })
    ).toMatchObject({ runDayId: "run-1", templateId: "tempo_20" });
    expectRejected({
      kind: "overrideRunDay",
      commandId: CMD_ID,
      runDayId: "run-1",
    });
  });
});

describe("every declared client kind round-trips", () => {
  it("CLIENT_COMMAND_KINDS matches the validated set (no orphan kind)", () => {
    expect(new Set(CLIENT_COMMAND_KINDS)).toEqual(
      new Set([
        "completeWorkoutDay",
        "skipWorkoutDay",
        "setNextWorkout",
        "logExercise",
        "removeExercise",
        "addExercises",
        "replaceExercise",
        "updateExercise",
        "reorderExercises",
        "setProgramSettings",
        "setProgramGoalMirror",
        "setManualRunCompletion",
        "transitionRunDay",
        "overrideRunDay",
        "applyDeloadWeek",
        "revertDeloadWeek",
        // P6: the soft-delete undo. Added deliberately — this list is frozen
        // precisely so a new kind cannot arrive unnoticed, and it caught this
        // one on the first run.
        "restoreExercise",
        "clearNextWorkout",
        // P6: the lift-side restore, paired with skipWorkoutDay so set and
        // reset share one write path, and the fell-behind dismissal.
        "restoreWorkoutDay",
        "dismissFellBehindPrompt",
        "endTrainingBlockKeepingFocus",
        "skipRecoveryEarly",
        "moveRunDay",
        "startTrainingBlock",
        "releaseTrainingBlock",
      ])
    );
  });
});

describe("makeCommandReceipt", () => {
  it("holds only kind + timestamps with 31-day retention", () => {
    const now = 1_700_000_000_000;
    const receipt = makeCommandReceipt({
      command: { kind: "skipWorkoutDay" },
      now,
    });
    expect(receipt).toEqual({
      kind: "skipWorkoutDay",
      appliedAt: now,
      cleanupAfter: now + PROGRAM_COMMAND_RECEIPT_RETENTION_MS,
    });
    expect(PROGRAM_COMMAND_RECEIPT_RETENTION_MS).toBe(31 * 24 * 60 * 60 * 1000);
  });

  it("never leaks the command payload into the receipt", () => {
    const receipt = makeCommandReceipt({
      command: { kind: "logExercise", actual: { weight: 999 } },
      now: 1,
    });
    expect(Object.keys(receipt).sort()).toEqual([
      "appliedAt",
      "cleanupAfter",
      "kind",
    ]);
  });

  it("rejects a missing kind or non-finite timestamp", () => {
    expect(() => makeCommandReceipt({ command: {}, now: 1 })).toThrow(
      ProgramCommandError
    );
    expect(() =>
      makeCommandReceipt({ command: { kind: "skipWorkoutDay" }, now: NaN })
    ).toThrow(ProgramCommandError);
  });
});

// ===========================================================================
// Reducer (applyProgramCommand) — packet 18, PR2
// ===========================================================================

const NOW = 2_000_000;

function baseState() {
  return {
    goal: "recomp",
    currentPhase: "progression",
    weekNumber: 5,
    splitType: "upper_lower",
    fatigueScore: 0,
    updatedAt: 1000,
    settings: { autoProgression: true, microloading: true },
    weekHistory: [],
    workouts: [
      {
        dayName: "Push",
        dayType: "push",
        completed: false,
        skipped: false,
        exercises: [
          {
            name: "Bench",
            exerciseId: "bench",
            instanceId: "inst-a",
            sets: 3,
            reps: 8,
            weight: 100,
          },
          {
            name: "Row",
            exerciseId: "row",
            instanceId: "inst-b",
            sets: 3,
            reps: 10,
            weight: 60,
          },
        ],
      },
      {
        dayName: "Legs",
        dayType: "legs",
        completed: false,
        skipped: false,
        exercises: [
          {
            name: "Squat",
            exerciseId: "squat",
            instanceId: "inst-c",
            sets: 3,
            reps: 5,
            weight: 140,
          },
        ],
      },
    ],
    runDays: [
      {
        id: "run-1",
        dayIndex: 2,
        templateId: "easy_30",
        type: "easy",
        status: "planned",
        completed: false,
      },
      {
        id: "run-2",
        dayIndex: 4,
        templateId: "tempo_20",
        type: "tempo",
        status: "skipped",
        completed: false,
      },
    ],
    manualCompletions: {},
  };
}

const PUSH_SIG = "Push|inst-a|inst-b";
const CMD = "cmd_reducer0123456789";

function dayPre(overrides) {
  return {
    dayIndex: 0,
    expectedWeekNumber: 5,
    expectedDaySignature: PUSH_SIG,
    ...overrides,
  };
}

// `profile` gained a parameter with skipRecoveryEarly, the first reducer whose
// OUTCOME depends on the user document (it resolves the recovery exit from the
// transaction-current raceGoal). Defaults to {} so every existing call is
// unchanged.
function apply(command, state, profile) {
  return applyProgramCommand({
    state: state || baseState(),
    profile: profile || {},
    command,
    now: NOW,
  });
}

// Apply the represcribe transform directly, for the block round-trip test.
function represcribed(state, goal) {
  const { represcribeWorkouts } = require("../lib/represcribe");
  return represcribeWorkouts(state.workouts, goal, "advanced");
}

function expectHttps(fn, httpsCode) {
  let thrown;
  try {
    fn();
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeDefined();
  expect(isProgramCommandError(thrown)).toBe(true);
  expect(thrown.httpsCode).toBe(httpsCode);
  return thrown;
}

describe("workoutDaySignature", () => {
  it("is dayName joined with exercise instanceIds by |", () => {
    expect(workoutDaySignature(baseState().workouts[0])).toBe(PUSH_SIG);
    expect(workoutDaySignature(baseState().workouts[1])).toBe("Legs|inst-c");
  });
});

describe("applyProgramCommand — envelope", () => {
  it("rejects a non-finite now with invalid-argument", () => {
    expectHttps(
      () =>
        applyProgramCommand({
          state: baseState(),
          command: { kind: "skipWorkoutDay", commandId: CMD, ...dayPre() },
          now: NaN,
        }),
      "invalid-argument"
    );
  });

  it("stamps updatedAt = now and returns empty effects", () => {
    const { state, effects } = apply({
      kind: "skipWorkoutDay",
      commandId: CMD,
      ...dayPre(),
    });
    expect(state.updatedAt).toBe(NOW);
    expect(effects).toEqual({});
  });

  it("does not mutate the input state (immutability)", () => {
    const input = baseState();
    apply({ kind: "skipWorkoutDay", commandId: CMD, ...dayPre() }, input);
    expect(input.workouts[0].skipped).toBe(false);
  });
});

describe("WorkoutDayPrecondition enforcement", () => {
  it("rejects a stale week number with failed-precondition", () => {
    expectHttps(
      () =>
        apply({
          kind: "skipWorkoutDay",
          commandId: CMD,
          ...dayPre({ expectedWeekNumber: 4 }),
        }),
      "failed-precondition"
    );
  });

  it("rejects a stale day signature with failed-precondition", () => {
    expectHttps(
      () =>
        apply({
          kind: "skipWorkoutDay",
          commandId: CMD,
          ...dayPre({ expectedDaySignature: "Push|inst-a" }),
        }),
      "failed-precondition"
    );
  });

  it("rejects an out-of-range day index with failed-precondition", () => {
    expectHttps(
      () =>
        apply({
          kind: "skipWorkoutDay",
          commandId: CMD,
          ...dayPre({ dayIndex: 9 }),
        }),
      "failed-precondition"
    );
  });
});

describe("workout-day commands", () => {
  it("skipWorkoutDay sets skipped on only the target day", () => {
    const { state } = apply({
      kind: "skipWorkoutDay",
      commandId: CMD,
      ...dayPre(),
    });
    expect(state.workouts[0].skipped).toBe(true);
    expect(state.workouts[0].completed).toBe(false);
    expect(state.workouts[1].skipped).toBe(false);
  });

  it("setNextWorkout sets nextWorkoutOverride", () => {
    const { state } = apply({
      kind: "setNextWorkout",
      commandId: CMD,
      ...dayPre(),
    });
    expect(state.nextWorkoutOverride).toBe(0);
  });

  it("removeExercise drops the targeted instance, preserving the other", () => {
    const { state } = apply({
      kind: "removeExercise",
      commandId: CMD,
      ...dayPre(),
      exerciseInstanceId: "inst-a",
    });
    expect(state.workouts[0].exercises.map((e) => e.instanceId)).toEqual([
      "inst-b",
    ]);
  });

  it("removeExercise rejects an unknown instance id", () => {
    expectHttps(
      () =>
        apply({
          kind: "removeExercise",
          commandId: CMD,
          ...dayPre(),
          exerciseInstanceId: "inst-x",
        }),
      "failed-precondition"
    );
  });

  it("updateExercise merges only the bounded patch", () => {
    const { state } = apply({
      kind: "updateExercise",
      commandId: CMD,
      ...dayPre(),
      exerciseInstanceId: "inst-b",
      patch: { weight: 65 },
    });
    const row = state.workouts[0].exercises.find(
      (e) => e.instanceId === "inst-b"
    );
    expect(row.weight).toBe(65);
    expect(row.reps).toBe(10); // untouched
    expect(row.name).toBe("Row");
  });

  it("reorderExercises rearranges to the requested order", () => {
    const { state } = apply({
      kind: "reorderExercises",
      commandId: CMD,
      ...dayPre(),
      orderedInstanceIds: ["inst-b", "inst-a"],
    });
    expect(state.workouts[0].exercises.map((e) => e.instanceId)).toEqual([
      "inst-b",
      "inst-a",
    ]);
  });

  it("reorderExercises rejects a set that isn't the day's exact instances", () => {
    expectHttps(
      () =>
        apply({
          kind: "reorderExercises",
          commandId: CMD,
          ...dayPre(),
          orderedInstanceIds: ["inst-a", "inst-x"],
        }),
      "failed-precondition"
    );
  });
});

describe("preconditionless field commands", () => {
  it("setProgramSettings replaces settings", () => {
    const { state } = apply({
      kind: "setProgramSettings",
      commandId: CMD,
      settings: { autoProgression: false, microloading: false },
    });
    expect(state.settings).toEqual({
      autoProgression: false,
      microloading: false,
    });
  });

  it("setProgramGoalMirror updates goal", () => {
    const { state } = apply({
      kind: "setProgramGoalMirror",
      commandId: CMD,
      goal: "cut",
    });
    expect(state.goal).toBe("cut");
  });
});

describe("training block start/release (Blk2)", () => {
  const START = {
    kind: "startTrainingBlock",
    commandId: CMD,
    focus: "strength",
    pace: "full",
    durationWeeks: 8,
    startDate: "2026-03-02",
  };
  const RELEASE = { kind: "releaseTrainingBlock", commandId: CMD };

  it("starts a block, represcribes the week, and moves primaryGoal", () => {
    const seeded = baseState();
    seeded.primaryGoal = "hypertrophy";
    const { state } = apply(START, seeded, { experience: "advanced" });

    expect(state.primaryGoal).toBe("strength");
    expect(state.trainingBlock.focus).toBe("strength");
    expect(state.trainingBlock.owned).toBe(true);
    // goalBefore is captured from SERVER state, not sent.
    expect(state.trainingBlock.goalBefore).toBe("hypertrophy");
    expect(state.trainingBlock.id).toBe(`2026-03-02-${NOW}`);
    expect(state.trainingBlock.createdAt).toBe(NOW);
    expect(state.trainingBlock.weeklyLiftTarget).toBe(
      baseState().workouts.length
    );
    // The prescription actually moved — strength mains are 5 reps before
    // undulation, so an advanced lifter's first (heavy) day lands at 3.
    expect(state.workouts[0].exercises[0].reps).toBeLessThan(8);
    expect(state.workouts[0].exercises[0].baseReps).toBe(
      state.workouts[0].exercises[0].reps
    );
  });

  it("grants amnesty when the focus CHANGES", () => {
    const seeded = baseState();
    seeded.primaryGoal = "hypertrophy";
    const { state } = apply(START, seeded, {});
    expect(state.trainingBlock.amnestyWeeksLeft).toBeGreaterThan(0);
  });

  it("grants NO amnesty when the focus is unchanged at full pace", () => {
    const seeded = baseState();
    seeded.primaryGoal = "strength";
    const { state } = apply(START, seeded, { primaryGoal: "strength" });
    expect(state.trainingBlock.amnestyWeeksLeft).toBe(0);
  });

  it("grants amnesty for an easing pace even when the focus is unchanged", () => {
    const seeded = baseState();
    seeded.primaryGoal = "strength";
    const { state } = apply({ ...START, pace: "easing" }, seeded, {
      primaryGoal: "strength",
    });
    expect(state.trainingBlock.amnestyWeeksLeft).toBeGreaterThan(0);
  });

  it("a client cannot grant itself amnesty or a fake goalBefore", () => {
    // Neither field is on the command surface at all — the validator rejects
    // them, which is what keeps the reducer's derivation authoritative.
    expectRejected({ ...START, commandId: CMD_ID, amnestyWeeksLeft: 99 });
    expectRejected({ ...START, commandId: CMD_ID, goalBefore: "fat_loss" });
    expectRejected({ ...START, commandId: CMD_ID, owned: false });
  });

  it("refuses a second block", () => {
    const seeded = baseState();
    seeded.trainingBlock = { id: "blk1", owned: true, goalBefore: "general" };
    expectHttps(() => apply(START, seeded), "failed-precondition");
  });

  it("refuses a block for a run-only athlete (no lift week to own)", () => {
    const seeded = baseState();
    seeded.workouts = [];
    expectHttps(() => apply(START, seeded), "failed-precondition");
  });

  it("caps anchorExerciseIds at 3 and bounds the enums", () => {
    expectRejected({
      ...START,
      commandId: CMD_ID,
      anchorExerciseIds: ["a", "b", "c", "d"],
    });
    expectRejected({ ...START, commandId: CMD_ID, durationWeeks: 6 });
    expectRejected({ ...START, commandId: CMD_ID, pace: "brutal" });
    expectRejected({ ...START, commandId: CMD_ID, focus: "not_a_goal" });
    expectRejected({ ...START, commandId: CMD_ID, startDate: "03/02/2026" });
  });

  it("accepts an EMPTY why (the field is optional in the UI)", () => {
    expect(
      assertClientProgramCommand({ ...START, commandId: CMD_ID, why: "" }).why
    ).toBe("");
  });

  // ── release ──────────────────────────────────────────────────────────

  it("release restores goalBefore and re-derives the week from it", () => {
    const seeded = baseState();
    seeded.primaryGoal = "hypertrophy";
    const started = apply(START, seeded, { experience: "advanced" }).state;

    const { state } = apply(RELEASE, started, { experience: "advanced" });
    expect("trainingBlock" in state).toBe(false);
    expect(state.primaryGoal).toBe("hypertrophy");
    // Round-trip: the SAME transform with goalBefore IS the inverse, so the
    // rep targets come back. (Loads deliberately do not rewind — see the
    // reducer — so only the rep prescription is compared.)
    const before = represcribed(seeded, "hypertrophy");
    expect(state.workouts.map((d) => d.exercises.map((e) => e.reps))).toEqual(
      before.map((d) => d.exercises.map((e) => e.reps))
    );
  });

  it("release does NOT represcribe a legacy un-owned block", () => {
    const seeded = baseState();
    seeded.primaryGoal = "hypertrophy";
    seeded.trainingBlock = {
      id: "legacy",
      owned: false,
      goalBefore: "strength",
    };
    const { state } = apply(RELEASE, seeded, { experience: "advanced" });
    expect(state.primaryGoal).toBe("strength");
    // Untouched: it never owned a prescription, so releasing must not
    // retroactively rewrite one.
    expect(state.workouts).toEqual(seeded.workouts);
  });

  it("release rejects when there is no block", () => {
    expectHttps(() => apply(RELEASE, baseState()), "failed-precondition");
  });

  it("release carries no payload the client could steer", () => {
    expectRejected({ ...RELEASE, commandId: CMD_ID, goalBefore: "fat_loss" });
  });
});

describe("moveRunDay (RUN-RESCHEDULE-01)", () => {
  const SCHEDULE = [
    { day: 0, type: "rest" },
    { day: 1, type: "lift" },
    { day: 2, type: "run" },
    { day: 3, type: "both" },
    { day: 4, type: "rest" },
  ];

  function weekState(extra = {}) {
    const s = baseState();
    s.runDays = [
      {
        id: "run-1",
        dayIndex: 2,
        date: "2026-03-03",
        weekKey: "2026-03-01",
        templateId: "tempo_20",
        type: "tempo",
        status: "planned",
        completed: false,
        ...extra,
      },
      {
        id: "run-2",
        dayIndex: 4,
        date: "2026-03-05",
        weekKey: "2026-03-01",
        templateId: "easy_30",
        type: "easy",
        status: "planned",
        completed: false,
      },
    ];
    return s;
  }

  const move = (targetDayIndex, runDayId = "run-1") => ({
    kind: "moveRunDay",
    commandId: CMD,
    runDayId,
    targetDayIndex,
  });

  it("moves the run and DERIVES the date from the week anchor", () => {
    const { state } = apply(move(1), weekState(), { weekSchedule: SCHEDULE });
    expect(state.runDays[0].dayIndex).toBe(1);
    // The date is computed server-side, not sent — Monday of that week.
    expect(state.runDays[0].date).toBe("2026-03-02");
    expect(state.runDays[0].movedFromDate).toBe("2026-03-03");
    expect(state.runDays[0].movedToDate).toBe("2026-03-02");
    // A hard run onto a lift day clashes truthfully.
    expect(state.runDays[0].clashesWithLift).toBe(true);
    // Identity survives — this is a move, not a rebuild.
    expect(state.runDays[0].id).toBe("run-1");
    expect(state.runDays[0].templateId).toBe("tempo_20");
    expect(state.runDays[0].status).toBe("planned");
  });

  it("snapping back to the origin DELETES the move markers", () => {
    const moved = weekState({
      dayIndex: 3,
      date: "2026-03-04",
      movedFromDate: "2026-03-03",
      movedToDate: "2026-03-04",
    });
    const { state } = apply(move(2), moved, { weekSchedule: SCHEDULE });
    expect(state.runDays[0].date).toBe("2026-03-03");
    // Deleted, not undefined — Firestore rejects undefined, and a stale
    // marker would read as "this run was moved" forever.
    expect("movedFromDate" in state.runDays[0]).toBe(false);
    expect("movedToDate" in state.runDays[0]).toBe(false);
  });

  it("refuses to double-book a day", () => {
    // run-2 already sits on day 4.
    expectHttps(
      () => apply(move(4), weekState(), { weekSchedule: SCHEDULE }),
      "failed-precondition"
    );
  });

  it("is a no-op when the run is already on that day", () => {
    const { state } = apply(move(2), weekState(), { weekSchedule: SCHEDULE });
    expect(state.runDays[0].date).toBe("2026-03-03");
    expect(state.runDays[0].dayIndex).toBe(2);
  });

  it("RUN-RACE-GUARD-01: a race cannot be moved", () => {
    for (const raceShape of [{ type: "race" }, { templateId: "10k_race" }]) {
      expectHttps(
        () => apply(move(1), weekState(raceShape), { weekSchedule: SCHEDULE }),
        "failed-precondition"
      );
    }
  });

  it("refuses a non-planned run", () => {
    for (const status of ["skipped", "completed_exact", "race_no_show"]) {
      expectHttps(
        () => apply(move(1), weekState({ status }), { weekSchedule: SCHEDULE }),
        "failed-precondition"
      );
    }
  });

  it("refuses a run with no week anchor", () => {
    expectHttps(
      () =>
        apply(move(1), weekState({ weekKey: undefined }), {
          weekSchedule: SCHEDULE,
        }),
      "failed-precondition"
    );
  });

  it("rejects an unknown runDayId", () => {
    expectHttps(
      () => apply(move(1, "nope"), weekState(), { weekSchedule: SCHEDULE }),
      "failed-precondition"
    );
  });

  it("an out-of-week target day is rejected by the VALIDATOR", () => {
    expectRejected({
      kind: "moveRunDay",
      commandId: CMD_ID,
      runDayId: "run-1",
      targetDayIndex: 7,
    });
  });
});

describe("skipRecoveryEarly (P6 — the atomicity fix)", () => {
  const CMD_SRE = { kind: "skipRecoveryEarly", commandId: CMD };

  function recoveringState(runPlanExtra = {}) {
    const s = baseState();
    s.runPlan = {
      mode: "race_prep",
      phase: "recovery",
      recoveryEndDate: "2026-04-01",
      ...runPlanExtra,
    };
    return s;
  }

  const RACE = { distance: "marathon", targetDate: "2026-03-15" };
  const NEWER = { distance: "10k", targetDate: "2026-09-01" };

  it("rejects when the user is not in recovery", () => {
    expectHttps(() => apply(CMD_SRE, baseState()), "failed-precondition");
    const notRecovering = baseState();
    notRecovering.runPlan = { mode: "race_prep", phase: "build" };
    expectHttps(() => apply(CMD_SRE, notRecovering), "failed-precondition");
  });

  it("race done, no successor: freeform, plan dropped, raceGoal CLEARED", () => {
    const { state, effects } = apply(
      CMD_SRE,
      recoveringState({ raceGoal: RACE }),
      { raceGoal: RACE }
    );
    // runPlan deleted, not undefined — Firestore rejects undefined.
    expect("runPlan" in state).toBe(false);
    expect(state.runDays).toEqual([]);
    // BOTH halves of the materialization, in one transaction. The client used
    // to issue these as two independent writes.
    expect(effects.profile).toEqual({ raceGoal: null, runMode: "freeform" });
  });

  it("newer race set during recovery: stays race_prep, keeps the successor", () => {
    const { state, effects } = apply(
      CMD_SRE,
      recoveringState({ raceGoal: RACE }),
      { raceGoal: NEWER }
    );
    expect(effects.profile.runMode).toBe("race_prep");
    // The successor must NOT be cleared — that is the whole back-to-back case.
    expect(effects.profile.raceGoal).toBeUndefined();
    // Only the recovery markers go; the plan itself survives.
    expect(state.runPlan.mode).toBe("race_prep");
    expect("phase" in state.runPlan).toBe(false);
    expect("recoveryEndDate" in state.runPlan).toBe(false);
    expect(state.runPlan.raceGoal).toEqual(RACE);
  });

  it("the exit is decided from SERVER state, not from anything the client sent", () => {
    // Same command, same programState, two different profiles — two different
    // outcomes. The command carries no payload at all, so a client that still
    // believes it has a race cannot talk the server into preserving one.
    const withNewer = apply(CMD_SRE, recoveringState({ raceGoal: RACE }), {
      raceGoal: NEWER,
    });
    const withNone = apply(CMD_SRE, recoveringState({ raceGoal: RACE }), {});
    expect(withNewer.effects.profile.runMode).toBe("race_prep");
    expect(withNone.effects.profile.runMode).toBe("freeform");
  });

  it("falls back to the profile's race when runPlan carries no mirror", () => {
    const { effects } = apply(CMD_SRE, recoveringState(), { raceGoal: RACE });
    expect(effects.profile).toEqual({ raceGoal: null, runMode: "freeform" });
  });
});

describe("restoreWorkoutDay + dismissFellBehindPrompt (P6)", () => {
  function skippedState() {
    const s = baseState();
    s.workouts[0].skipped = true;
    return s;
  }

  const restoreCmd = {
    kind: "restoreWorkoutDay",
    commandId: CMD,
    dayIndex: 0,
    expectedWeekNumber: 5,
    expectedDaySignature: PUSH_SIG,
  };

  it("clears `skipped` on a skipped day", () => {
    const { state } = apply(restoreCmd, skippedState());
    expect(state.workouts[0].skipped).toBe(false);
    // Nothing else moves — no completion, no stats side effect.
    expect(state.workouts[0].completed).toBe(false);
    expect(state.workouts[0].exercises).toHaveLength(2);
  });

  it("REFUSES to reopen a completed day", () => {
    // The load-bearing guard: a completed day returning to plannable would
    // double-count on every consumer that reads `completed`.
    const s = skippedState();
    s.workouts[0].completed = true;
    expectHttps(() => apply(restoreCmd, s), "failed-precondition");
  });

  it("is an idempotent no-op on a day that is not skipped", () => {
    const { state } = apply(restoreCmd, baseState());
    expect(state.workouts[0].skipped).toBe(false);
  });

  it("enforces the day precondition like every other day command", () => {
    expectHttps(
      () =>
        apply(
          { ...restoreCmd, expectedDaySignature: "Push|stale" },
          skippedState()
        ),
      "failed-precondition"
    );
  });

  it("dismissFellBehindPrompt DELETES the key rather than nulling it", () => {
    const s = baseState();
    s.pendingFellBehindPrompt = { weekKey: "2026-03-01", ran: 1, target: 3 };
    const { state } = apply(
      { kind: "dismissFellBehindPrompt", commandId: CMD },
      s
    );
    // Firestore rejects undefined, and readers test for absence.
    expect("pendingFellBehindPrompt" in state).toBe(false);
  });

  it("dismissFellBehindPrompt on an absent prompt is a no-op", () => {
    const { state } = apply(
      { kind: "dismissFellBehindPrompt", commandId: CMD },
      baseState()
    );
    expect(state.pendingFellBehindPrompt).toBeUndefined();
  });

  it("endTrainingBlockKeepingFocus removes the block and KEEPS primaryGoal", () => {
    const s = baseState();
    s.trainingBlock = {
      id: "blk1",
      owned: true,
      focus: "strength",
      pace: "standard",
      durationWeeks: 8,
      startDate: "2026-03-02",
      goalBefore: "hypertrophy",
    };
    s.primaryGoal = "strength";
    const { state } = apply(
      { kind: "endTrainingBlockKeepingFocus", commandId: CMD },
      s
    );
    expect("trainingBlock" in state).toBe(false);
    // Keeping the focus IS the outcome — this must NOT revert to goalBefore,
    // which is what releaseTrainingBlock does instead.
    expect(state.primaryGoal).toBe("strength");
    // The prescription the block left behind is untouched.
    expect(state.workouts[0].exercises[0].reps).toBe(8);
  });

  it("endTrainingBlockKeepingFocus rejects when there is no block", () => {
    expectHttps(
      () =>
        apply(
          { kind: "endTrainingBlockKeepingFocus", commandId: CMD },
          baseState()
        ),
      "failed-precondition"
    );
  });

  it("dismissFellBehindPrompt leaves the rest of the plan alone", () => {
    const s = baseState();
    s.pendingFellBehindPrompt = { weekKey: "2026-03-01" };
    const { state } = apply(
      { kind: "dismissFellBehindPrompt", commandId: CMD },
      s
    );
    expect(state.workouts).toHaveLength(baseState().workouts.length);
    expect(state.runDays).toHaveLength(2);
    expect(state.weekNumber).toBe(5);
  });
});

describe("run-day commands", () => {
  it("setManualRunCompletion marks a planned run complete via the map", () => {
    const { state } = apply({
      kind: "setManualRunCompletion",
      commandId: CMD,
      runDayId: "run-1",
      completed: true,
    });
    expect(state.manualCompletions["run-1"]).toEqual({ completedAt: NOW });
    expect(state.runDays[0].status).toBe("planned");
  });

  it("setManualRunCompletion two-steps a skipped run back to planned first", () => {
    const { state } = apply({
      kind: "setManualRunCompletion",
      commandId: CMD,
      runDayId: "run-2",
      completed: true,
    });
    expect(state.runDays[1].status).toBe("planned");
    expect(state.runDays[1].completed).toBe(false);
    expect(state.manualCompletions["run-2"]).toEqual({ completedAt: NOW });
  });

  it("setManualRunCompletion completed:false removes an existing map key", () => {
    const seeded = baseState();
    seeded.manualCompletions = { "run-1": { completedAt: 1 } };
    const { state } = apply(
      {
        kind: "setManualRunCompletion",
        commandId: CMD,
        runDayId: "run-1",
        completed: false,
      },
      seeded
    );
    expect(state.manualCompletions["run-1"]).toBeUndefined();
  });

  it("setManualRunCompletion completed:false on an absent key is a no-op", () => {
    const { state } = apply({
      kind: "setManualRunCompletion",
      commandId: CMD,
      runDayId: "run-1",
      completed: false,
    });
    expect(state.manualCompletions).toEqual({});
  });

  it("setManualRunCompletion rejects an unknown runDayId", () => {
    expectHttps(
      () =>
        apply({
          kind: "setManualRunCompletion",
          commandId: CMD,
          runDayId: "nope",
          completed: true,
        }),
      "failed-precondition"
    );
  });

  it("transitionRunDay skips a planned run", () => {
    const { state } = apply({
      kind: "transitionRunDay",
      commandId: CMD,
      runDayId: "run-1",
      to: "skipped",
    });
    expect(state.runDays[0].status).toBe("skipped");
  });

  it("transitionRunDay rejects an illegal transition (skipped -> skipped)", () => {
    expectHttps(
      () =>
        apply({
          kind: "transitionRunDay",
          commandId: CMD,
          runDayId: "run-2",
          to: "skipped",
        }),
      "failed-precondition"
    );
  });

  it("overrideRunDay swaps templateId + userOverride on an editable run", () => {
    const { state } = apply({
      kind: "overrideRunDay",
      commandId: CMD,
      runDayId: "run-1",
      templateId: "hills_8x1",
    });
    expect(state.runDays[0].templateId).toBe("hills_8x1");
    expect(state.runDays[0].userOverride).toBe("hills_8x1");
  });

  it("overrideRunDay rejects a non-editable (skipped) run", () => {
    expectHttps(
      () =>
        apply({
          kind: "overrideRunDay",
          commandId: CMD,
          runDayId: "run-2",
          templateId: "hills_8x1",
        }),
      "failed-precondition"
    );
  });

  // ── SESSION-RESTORE-01 — the restore half of transitionRunDay ──────────

  it("transitionRunDay restores a skipped run to planned", () => {
    const { state } = apply({
      kind: "transitionRunDay",
      commandId: CMD,
      runDayId: "run-2",
      to: "planned",
    });
    expect(state.runDays[1].status).toBe("planned");
    // A restore is a pure status reversal — never a completion.
    expect(state.manualCompletions["run-2"]).toBeUndefined();
    // Identity survives.
    expect(state.runDays[1].id).toBe("run-2");
    expect(state.runDays[1].templateId).toBe("tempo_20");
  });

  it("transitionRunDay resets the legacy `completed` mirror on restore", () => {
    // The inconsistency has to be SEEDED to prove anything: a fixture that
    // already reads `completed: false` passes with the mirror deleted, which
    // is how the first version of this test was worthless.
    //
    // It is reachable, too. The client aligns status↔completed during
    // read-migration ("status wins"), but `normalizeForReducer` deliberately
    // does NOT migrate, so a legacy doc reaches the reducer with the pair
    // still disagreeing. Without the mirror the restore would produce
    // `status: "planned", completed: true` — a slot that reads planned in
    // the week rail and completed to anything asking the legacy field.
    const seeded = baseState();
    seeded.runDays[1].completed = true;
    const { state } = apply(
      {
        kind: "transitionRunDay",
        commandId: CMD,
        runDayId: "run-2",
        to: "planned",
      },
      seeded
    );
    expect(state.runDays[1].status).toBe("planned");
    expect(state.runDays[1].completed).toBe(false);
  });

  it("transitionRunDay restores a race_no_show run to planned", () => {
    const seeded = baseState();
    seeded.runDays[1].status = "race_no_show";
    const { state } = apply(
      {
        kind: "transitionRunDay",
        commandId: CMD,
        runDayId: "run-2",
        to: "planned",
      },
      seeded
    );
    expect(state.runDays[1].status).toBe("planned");
  });

  it("transitionRunDay refuses to reopen a completed run", () => {
    const seeded = baseState();
    seeded.runDays[0].status = "completed_exact";
    seeded.runDays[0].completed = true;
    expectHttps(
      () =>
        apply(
          {
            kind: "transitionRunDay",
            commandId: CMD,
            runDayId: "run-1",
            to: "planned",
          },
          seeded
        ),
      "failed-precondition"
    );
  });

  // ── RUN-RACE-GUARD-01 — a race's identity is immutable ────────────────
  //
  // These pin the guard the SERVER was missing while both client writers
  // enforced it. Each runs twice: once against `type: "race"` (the
  // load-bearing signal) and once against a race templateId with no type
  // (the legacy shape), because those are two independent code paths in
  // `isRaceRunDay` and a guard that only catches one is not a guard.

  function raceState(shape) {
    const seeded = baseState();
    seeded.runDays[0] =
      shape === "type"
        ? { ...seeded.runDays[0], type: "race", templateId: "easy_30" }
        : {
            ...seeded.runDays[0],
            templateId: "marathon_race",
            type: undefined,
          };
    return seeded;
  }

  for (const shape of ["type", "templateId"]) {
    it(`setManualRunCompletion refuses to tick a race complete (by ${shape})`, () => {
      expectHttps(
        () =>
          apply(
            {
              kind: "setManualRunCompletion",
              commandId: CMD,
              runDayId: "run-1",
              completed: true,
            },
            raceState(shape)
          ),
        "failed-precondition"
      );
    });

    it(`overrideRunDay refuses to swap a race's template (by ${shape})`, () => {
      expectHttps(
        () =>
          apply(
            {
              kind: "overrideRunDay",
              commandId: CMD,
              runDayId: "run-1",
              templateId: "easy_30",
            },
            raceState(shape)
          ),
        "failed-precondition"
      );
    });
  }

  it("UNMARKING a race is still allowed — it is the repair path", () => {
    // A slot ticked before the guard existed must be un-tickable, or the
    // guard strands exactly the documents it was added to protect.
    const seeded = raceState("type");
    seeded.manualCompletions = { "run-1": { completedAt: 1 } };
    const { state } = apply(
      {
        kind: "setManualRunCompletion",
        commandId: CMD,
        runDayId: "run-1",
        completed: false,
      },
      seeded
    );
    expect(state.manualCompletions["run-1"]).toBeUndefined();
  });

  it("a non-race run is unaffected by the race guard", () => {
    const { state } = apply({
      kind: "setManualRunCompletion",
      commandId: CMD,
      runDayId: "run-1",
      completed: true,
    });
    expect(state.manualCompletions["run-1"]).toEqual({ completedAt: NOW });
  });
});

describe("completeWorkoutDay (effect — calorie mirror pinned by cross-test)", () => {
  // Dedicated state: Push day with categorised exercises + a run/override to
  // prove isolation.
  function completeState() {
    const s = baseState();
    s.nextWorkoutOverride = 0;
    s.workouts[0].exercises = [
      {
        name: "Bench",
        exerciseId: "bench-press",
        instanceId: "inst-a",
        movementCategory: "horizontal_push",
        sets: 3,
        reps: 8,
        weight: 100,
      },
      {
        name: "Row",
        exerciseId: "cable-row",
        instanceId: "inst-b",
        movementCategory: "horizontal_pull",
        sets: 3,
        reps: 10,
        weight: 60,
      },
    ];
    return s;
  }

  const completion = {
    completionId: "sess_abcdef01",
    durationMinutes: 45,
    setLogs: [
      [
        { weight: 100, reps: 8, completed: true },
        { weight: 100, reps: 8, completed: true },
        { weight: 100, reps: 7, completed: false },
      ],
      [{ weight: 60, reps: 10, completed: true }],
    ],
  };

  function run(profile, extra) {
    return applyProgramCommand({
      state: completeState(),
      profile: profile || {},
      command: {
        kind: "completeWorkoutDay",
        commandId: CMD,
        ...dayPre(),
        completion: { ...completion, ...(extra || {}) },
      },
      now: Date.parse("2026-07-13T02:30:00Z"),
    });
  }

  it("marks the day complete, forces skipped:false, clears a matching override", () => {
    const { state } = run();
    expect(state.workouts[0].completed).toBe(true);
    expect(state.workouts[0].skipped).toBe(false);
    expect(state.workouts[1].completed).toBe(false); // other day untouched
    expect("nextWorkoutOverride" in state).toBe(false); // cleared (was 0)
  });

  it("builds the workout record from completed set logs", () => {
    const { effects } = run({ weightKg: 80 });
    const w = effects.workout;
    expect(w.exercises).toHaveLength(2);
    expect(w.exercises[0]).toEqual({
      exerciseId: "bench-press",
      exerciseName: "Bench",
      category: "horizontal_push",
      caloriesBurned: 0,
      // D2: the per-set record now carries how the set was performed and the
      // PRESCRIPTION it was performed against, via the projection shared with
      // the client (functions/lib/workoutSetRecord.js, pinned by
      // workoutSetRecord.cross.test.ts).
      sets: [
        {
          setNumber: 1,
          reps: 8,
          weightKg: 100,
          type: "working",
          plannedReps: 8,
          plannedWeightKg: 100,
        },
        {
          setNumber: 2,
          reps: 8,
          weightKg: 100,
          type: "working",
          plannedReps: 8,
          plannedWeightKg: 100,
        },
      ],
    });
    expect(w.exercises[1].sets).toEqual([
      {
        setNumber: 1,
        reps: 10,
        weightKg: 60,
        type: "working",
        plannedReps: 10,
        plannedWeightKg: 60,
      },
    ]);
  });

  it("computes totalCalories via the mirrored calorie engine", () => {
    // tonnage 2200, 3 sets, 45 min, 80kg → MET 3.5 → round(45*80*3.5/60) = 210
    const { effects } = run({ weightKg: 80 });
    expect(effects.workout.totalCalories).toBe(210);
    expect(effects.workout.durationMinutes).toBe(45);
  });

  it("saves 0 calories when bodyweight is missing", () => {
    const { effects } = run({});
    expect(effects.workout.totalCalories).toBe(0);
  });

  it("stamps the date in the user's timezone (not server UTC)", () => {
    // 02:30 UTC on 2026-07-13 is 22:30 on 2026-07-12 in New York (EDT).
    expect(run({ timezone: "America/New_York" }).effects.workout.date).toBe(
      "2026-07-12"
    );
    expect(run({}).effects.workout.date).toBe("2026-07-13"); // UTC fallback
  });

  it("sets notes/source/completionId and omits createdAt (callable injects it)", () => {
    const w = run({ weightKg: 80 }).effects.workout;
    expect(w.notes).toBe("Push — Programme Week 5");
    expect(w.source).toBe("programme");
    expect(w.completionId).toBe("sess_abcdef01");
    expect("createdAt" in w).toBe(false);
    expect("sessionVariant" in w).toBe(false);
  });

  it("carries sessionVariant when provided", () => {
    const w = run({}, { sessionVariant: "express30" }).effects.workout;
    expect(w.sessionVariant).toBe("express30");
  });

  it("falls back to planned data when a set log is absent", () => {
    const w = run({}, { setLogs: [] }).effects.workout;
    // no logs → planned: bench 3 sets @ reps 8 / weight 100. D2: the
    // synthesised rows are typed "working" and carry actual === planned,
    // since there is no execution to distinguish them from.
    const planned = {
      reps: 8,
      weightKg: 100,
      type: "working",
      plannedReps: 8,
      plannedWeightKg: 100,
    };
    expect(w.exercises[0].sets).toEqual([
      { setNumber: 1, ...planned },
      { setNumber: 2, ...planned },
      { setNumber: 3, ...planned },
    ]);
  });

  it("does not mutate the input state", () => {
    const input = completeState();
    applyProgramCommand({
      state: input,
      profile: { weightKg: 80 },
      command: {
        kind: "completeWorkoutDay",
        commandId: CMD,
        ...dayPre(),
        completion,
      },
      now: Date.parse("2026-07-13T02:30:00Z"),
    });
    expect(input.workouts[0].completed).toBe(false);
  });
});

describe("addExercises / replaceExercise (catalog-derived, mirrors pinned by cross-tests)", () => {
  it("addExercises appends catalog-derived exercises at the end by default", () => {
    const { state } = apply({
      kind: "addExercises",
      commandId: CMD,
      ...dayPre(),
      exercises: [
        { exerciseId: "bench-press" },
        { exerciseId: "front-squat", sets: 4, reps: 5, weight: 80 },
      ],
    });
    const ex = state.workouts[0].exercises;
    expect(ex).toHaveLength(4); // inst-a, inst-b, + 2 appended
    // client add default (3×10×0) when fields omitted
    expect(ex[2]).toMatchObject({
      exerciseId: "bench-press",
      name: "Bench Press",
      sets: 3,
      reps: 10,
      weight: 0,
      movementCategory: "horizontal_push",
    });
    // explicit prescription honoured
    expect(ex[3]).toMatchObject({
      exerciseId: "front-squat",
      sets: 4,
      reps: 5,
      weight: 80,
      movementCategory: "knee_dominant",
    });
    // deterministic instance ids derived from the commandId
    expect(ex[2].instanceId).toBe(`cmd-${CMD}-0`);
    expect(ex[3].instanceId).toBe(`cmd-${CMD}-1`);
  });

  it("addExercises honours insertAt", () => {
    const { state } = apply({
      kind: "addExercises",
      commandId: CMD,
      ...dayPre(),
      exercises: [{ exerciseId: "bench-press" }],
      insertAt: 1,
    });
    expect(state.workouts[0].exercises.map((e) => e.instanceId)).toEqual([
      "inst-a",
      `cmd-${CMD}-0`,
      "inst-b",
    ]);
  });

  it("addExercises rejects an unknown catalog id with invalid-argument", () => {
    expectHttps(
      () =>
        apply({
          kind: "addExercises",
          commandId: CMD,
          ...dayPre(),
          exercises: [{ exerciseId: "not-a-real-exercise" }],
        }),
      "invalid-argument"
    );
  });

  it("replaceExercise swaps the exercise without carrying an unsafe load", () => {
    const { state } = apply({
      kind: "replaceExercise",
      commandId: CMD,
      ...dayPre(),
      oldInstanceId: "inst-a", // Bench, sets 3 reps 8 weight 100
      replacementExerciseId: "front-squat",
    });
    const ex = state.workouts[0].exercises;
    expect(ex).toHaveLength(2);
    expect(ex[0]).toMatchObject({
      exerciseId: "front-squat",
      name: "Front Squat",
      sets: 3,
      reps: 8,
      // Omitting `replacementWeight` keeps the pre-existing behaviour: the
      // reducer has no profile of its own, so an unsupplied load stays 0
      // rather than inheriting the old movement's kilograms.
      weight: 0,
      movementCategory: "knee_dominant",
      instanceId: `cmd-${CMD}`,
    });
    expect(ex[1].instanceId).toBe("inst-b"); // untouched
  });

  it("replaceExercise changes timed-hold units and resets the target coherently", () => {
    const { state } = apply({
      kind: "replaceExercise",
      commandId: CMD,
      ...dayPre(),
      oldInstanceId: "inst-a",
      replacementExerciseId: "plank",
    });
    expect(state.workouts[0].exercises[0]).toMatchObject({
      exerciseId: "plank",
      reps: 30,
      baseReps: 30,
      repUnit: "seconds",
      weight: 0,
    });
  });

  it("replaceExercise carries the slot's prescription fields (backlog #7)", () => {
    // isAccessory now picks BOTH the progression scheme and the load step, so
    // dropping it on a swap silently re-prices an isolation as a compound
    // (2.5 kg on a curl). baseSets is the volume-ramp anchor; repRangeMax +
    // baseReps are the range it climbs; restSeconds is the authored rest.
    const state = baseState();
    Object.assign(state.workouts[0].exercises[0], {
      isAccessory: true,
      progressionType: "double",
      repRangeMax: 15,
      baseReps: 12,
      baseSets: 4,
      restSeconds: 60,
      preDeloadWeight: 120,
    });
    const out = apply(
      {
        kind: "replaceExercise",
        commandId: CMD,
        ...dayPre(),
        oldInstanceId: "inst-a",
        replacementExerciseId: "front-squat",
      },
      state
    );
    expect(out.state.workouts[0].exercises[0]).toMatchObject({
      exerciseId: "front-squat",
      isAccessory: true,
      progressionType: "double",
      repRangeMax: 15,
      baseReps: 12,
      baseSets: 4,
      restSeconds: 60,
    });
    // preDeloadWeight deliberately does NOT carry — the replacement keeps its
    // deloaded load rather than jumping to a weight it never lifted.
    expect("preDeloadWeight" in out.state.workouts[0].exercises[0]).toBe(false);
  });

  it("replaceExercise rejects an unknown old instance id", () => {
    expectHttps(
      () =>
        apply({
          kind: "replaceExercise",
          commandId: CMD,
          ...dayPre(),
          oldInstanceId: "inst-x",
          replacementExerciseId: "front-squat",
        }),
      "failed-precondition"
    );
  });

  it("clearNextWorkout drops the override, and takes no day precondition", () => {
    // A clear is not scoped to a day, so unlike setNextWorkout it carries no
    // dayIndex/signature. It exists so setNextWorkout can migrate WHOLE —
    // set and reset of one field on two write paths is the mixed-mode hazard
    // the boundary removes.
    const withOverride = { ...baseState(), nextWorkoutOverride: 1 };
    const { state } = apply(
      { kind: "clearNextWorkout", commandId: CMD },
      withOverride
    );
    // Deleted, not set to undefined — Firestore rejects undefined outright.
    expect("nextWorkoutOverride" in state).toBe(false);
  });

  it("clearNextWorkout is a no-op when there is no override", () => {
    const { state } = apply({ kind: "clearNextWorkout", commandId: CMD });
    expect("nextWorkoutOverride" in state).toBe(false);
  });

  it("removeExercise SOFT-deletes — the exercise is stashed verbatim", () => {
    // The undo has to return the same exercise, not a catalog rebuild of it.
    // History and calibrated load are exactly what a rebuild cannot recover.
    const { state } = apply({
      kind: "removeExercise",
      commandId: CMD,
      ...dayPre(),
      exerciseInstanceId: "inst-a",
    });
    expect(state.workouts[0].exercises).toHaveLength(1);
    expect(state.lastRemovedExercise).toMatchObject({
      dayIndex: 0,
      index: 0,
      exercise: { instanceId: "inst-a" },
    });
    expect(typeof state.lastRemovedExercise.removedAt).toBe("number");
  });

  it("restoreExercise puts it back at its original index, then clears the slot", () => {
    const removed = apply({
      kind: "removeExercise",
      commandId: CMD,
      ...dayPre(),
      exerciseInstanceId: "inst-a",
    }).state;
    const { state } = apply(
      {
        kind: "restoreExercise",
        commandId: "cmd_restore0123456789a",
        // POST-removal signature: the day is one exercise shorter now, and the
        // precondition rightly refuses a signature from before the remove.
        ...dayPre({
          expectedDaySignature: workoutDaySignature(removed.workouts[0]),
        }),
      },
      removed
    );
    expect(state.workouts[0].exercises.map((e) => e.instanceId)).toEqual([
      "inst-a",
      "inst-b",
    ]);
    // One slot, consumed. Leaving it would let a second undo duplicate the row.
    expect(state.lastRemovedExercise).toBeUndefined();
  });

  it("restoreExercise returns the ORIGINAL exercise, history and all", () => {
    // The property the whole soft delete exists for. A catalog rebuild would
    // produce the right name and nothing else.
    const before = baseState().workouts[0].exercises[0];
    const removed = apply({
      kind: "removeExercise",
      commandId: CMD,
      ...dayPre(),
      exerciseInstanceId: "inst-a",
    }).state;
    const { state } = apply(
      {
        kind: "restoreExercise",
        commandId: "cmd_restore0123456789b",
        ...dayPre({
          expectedDaySignature: workoutDaySignature(removed.workouts[0]),
        }),
      },
      removed
    );
    expect(state.workouts[0].exercises[0]).toEqual(before);
  });

  it("restoreExercise refuses an empty slot, a stale one, and the wrong day", () => {
    expectHttps(
      () => apply({ kind: "restoreExercise", commandId: CMD, ...dayPre() }),
      "failed-precondition"
    );

    const removed = apply({
      kind: "removeExercise",
      commandId: CMD,
      ...dayPre(),
      exerciseInstanceId: "inst-a",
    }).state;

    // Older than the window — an undo of something long forgotten is a
    // surprise, not an undo.
    expectHttps(
      () =>
        apply(
          {
            kind: "restoreExercise",
            commandId: "cmd_restore0123456789c",
            ...dayPre({
              expectedDaySignature: workoutDaySignature(removed.workouts[0]),
            }),
          },
          {
            ...removed,
            lastRemovedExercise: {
              ...removed.lastRemovedExercise,
              removedAt: NOW - RESTORE_WINDOW_MS - 1,
            },
          }
        ),
      "failed-precondition"
    );

    // A different day's removal must not surface as this day's undo.
    expectHttps(
      () =>
        apply(
          {
            kind: "restoreExercise",
            commandId: "cmd_restore0123456789d",
            ...dayPre({
              dayIndex: 1,
              expectedDaySignature: workoutDaySignature(
                baseState().workouts[1]
              ),
            }),
          },
          removed
        ),
      "failed-precondition"
    );
  });

  it("restoreExercise is idempotent when the exercise is already back", () => {
    // A replay whose receipt was lost, or a manual re-add. Must not duplicate.
    const removed = apply({
      kind: "removeExercise",
      commandId: CMD,
      ...dayPre(),
      exerciseInstanceId: "inst-a",
    }).state;
    const restored = apply(
      {
        kind: "restoreExercise",
        commandId: "cmd_restore0123456789e",
        ...dayPre({
          expectedDaySignature: workoutDaySignature(removed.workouts[0]),
        }),
      },
      removed
    ).state;
    // Second attempt against the RESTORED day — signature is the original
    // again, because the exercise is back.
    const { state } = apply(
      {
        kind: "restoreExercise",
        commandId: "cmd_restore0123456789f",
        ...dayPre(),
      },
      { ...restored, lastRemovedExercise: removed.lastRemovedExercise }
    );
    expect(
      state.workouts[0].exercises.filter((e) => e.instanceId === "inst-a")
    ).toHaveLength(1);
  });

  it("replaceExercise seeds the CALIBRATED load when the client sends one", () => {
    // The reducer cannot compute this — it has no profile — and hard-coding 0
    // meant routing a swap through the boundary silently downgraded every
    // replacement to uncalibrated. A bounded scalar is accepted for exactly
    // this, and nothing else about the exercise is taken from the client.
    const { state } = apply({
      kind: "replaceExercise",
      commandId: CMD,
      ...dayPre(),
      oldInstanceId: "inst-a",
      replacementExerciseId: "front-squat",
      replacementWeight: 42.5,
    });
    expect(state.workouts[0].exercises[0]).toMatchObject({
      exerciseId: "front-squat",
      name: "Front Squat", // still catalog-derived
      weight: 42.5,
    });
  });

  it("replaceExercise bounds the client-sent load", () => {
    // The scalar is trusted only within bounds. Same treatment as every other
    // client-supplied weight (logExercise, updateExercise.patch).
    for (const bad of [-1, 1e9, "60", NaN, Infinity, null]) {
      expectHttps(
        () =>
          apply({
            kind: "replaceExercise",
            commandId: CMD,
            ...dayPre(),
            oldInstanceId: "inst-a",
            replacementExerciseId: "front-squat",
            replacementWeight: bad,
          }),
        "invalid-argument"
      );
    }
  });

  it("replaceExercise still refuses a client-supplied exercise object", () => {
    // The load relaxation must not become a general patch. Name and category
    // stay server-derived; an unknown key is rejected outright.
    expectHttps(
      () =>
        apply({
          kind: "replaceExercise",
          commandId: CMD,
          ...dayPre(),
          oldInstanceId: "inst-a",
          replacementExerciseId: "front-squat",
          name: "Totally Legit Lift",
        }),
      "invalid-argument"
    );
  });

  it("replaceExercise rejects an unknown replacement catalog id", () => {
    expectHttps(
      () =>
        apply({
          kind: "replaceExercise",
          commandId: CMD,
          ...dayPre(),
          oldInstanceId: "inst-a",
          replacementExerciseId: "not-a-real-exercise",
        }),
      "invalid-argument"
    );
  });

  it("does not mutate the input state", () => {
    const input = baseState();
    apply(
      {
        kind: "addExercises",
        commandId: CMD,
        ...dayPre(),
        exercises: [{ exerciseId: "bench-press" }],
      },
      input
    );
    expect(input.workouts[0].exercises).toHaveLength(2);
  });
});

describe("logExercise (reducer wiring — progression math pinned by cross-test)", () => {
  function logCmd(overrides) {
    return {
      kind: "logExercise",
      commandId: CMD,
      ...dayPre(),
      exerciseInstanceId: "inst-a",
      actual: { weight: 100, reps: 8, completed: true },
      ...overrides,
    };
  }

  it("autoProgression on: applies progression to the target exercise", () => {
    // inst-a: linear (no progressionType), microloading on, completed set at
    // prescription → +1kg microload (client applyProgression rule).
    const { state } = apply(logCmd());
    const row = state.workouts[0].exercises.find(
      (e) => e.instanceId === "inst-a"
    );
    expect(row.weight).toBe(101);
    expect(row.lastAttemptedWeight).toBe(100);
    expect(row.performanceHistory).toHaveLength(1);
  });

  // ── Blk2: the easing-block hold — the reducer's THIRD branch ──────────
  //
  // Added with the boundary migration. The client had this branch and the
  // reducer did not, so migrating logExercise as-was would have progressed a
  // returning lifter straight through the window designed to hold them —
  // silently, since both branches write a plausible-looking exercise.

  function easingState(startDate = "2026-03-02") {
    const s = baseState();
    s.trainingBlock = { pace: "easing", startDate, durationWeeks: 8 };
    return s;
  }

  it("easing block, week 2: HOLDS the load but still records the session", () => {
    const { state } = apply(logCmd({ today: "2026-03-09" }), easingState());
    const row = state.workouts[0].exercises.find(
      (e) => e.instanceId === "inst-a"
    );
    // Held: no microload, unlike the autoProgression branch above (which
    // takes the same input to 101).
    expect(row.weight).toBe(100);
    // But recorded — this is what separates the hold from autoProgression:off,
    // which writes no history at all. The sessions happened.
    expect(row.performanceHistory).toHaveLength(1);
    expect(row.performanceHistory[0]).toMatchObject({
      weight: 100,
      repsCompleted: 8,
      repsTarget: 8,
    });
    expect(row.lastAttemptedWeight).toBe(100);
  });

  it("easing block, week 3: the hold has expired and load progresses", () => {
    // 2026-03-16 is the first day of week 3 — one day past EASING_HOLD_WEEKS.
    // Pinning the day AFTER the boundary is what makes the previous test
    // mean "held" rather than "this fixture never progresses anyway".
    const { state } = apply(logCmd({ today: "2026-03-16" }), easingState());
    expect(
      state.workouts[0].exercises.find((e) => e.instanceId === "inst-a").weight
    ).toBe(101);
  });

  it("a non-easing block does not hold", () => {
    const s = easingState();
    s.trainingBlock.pace = "standard";
    const { state } = apply(logCmd({ today: "2026-03-09" }), s);
    expect(
      state.workouts[0].exercises.find((e) => e.instanceId === "inst-a").weight
    ).toBe(101);
  });

  it("no `today` on the command means no hold (a pre-migration client)", () => {
    const { state } = apply(logCmd(), easingState());
    expect(
      state.workouts[0].exercises.find((e) => e.instanceId === "inst-a").weight
    ).toBe(101);
  });

  it("actualRpe reaches the progression engine", () => {
    // The command used to drop RPE entirely, so a maximal-effort set
    // progressed exactly like an easy one. 10 is past RPE_HOLD_THRESHOLD.
    const { state } = apply(logCmd({ actualRpe: 10 }));
    expect(
      state.workouts[0].exercises.find((e) => e.instanceId === "inst-a").weight
    ).toBe(100);
  });

  it("autoProgression off: records the attempt without changing prescription", () => {
    const s = baseState();
    s.settings = { autoProgression: false, microloading: true };
    const { state } = apply(logCmd(), s);
    const row = state.workouts[0].exercises.find(
      (e) => e.instanceId === "inst-a"
    );
    expect(row.weight).toBe(100); // unchanged
    expect(row.lastAttemptedWeight).toBe(100);
    expect(row.lastPerformance).toEqual({
      sets: 3,
      reps: 8,
      weight: 100,
      completed: true,
    });
  });

  it("only the target exercise changes; the other is untouched", () => {
    const { state } = apply(logCmd());
    const other = state.workouts[0].exercises.find(
      (e) => e.instanceId === "inst-b"
    );
    expect(other.weight).toBe(60);
    expect(other.lastAttemptedWeight).toBeUndefined();
  });

  it("rejects an unknown exercise instance id", () => {
    expectHttps(
      () => apply(logCmd({ exerciseInstanceId: "inst-x" })),
      "failed-precondition"
    );
  });

  it("does not mutate the input state", () => {
    const input = baseState();
    apply(logCmd(), input);
    expect(input.workouts[0].exercises[0].weight).toBe(100);
  });
});

describe("deload week commands (PROGRAM-DELOAD-01)", () => {
  const applyCmd = (overrides) => ({
    kind: "applyDeloadWeek",
    commandId: CMD,
    expectedWeekNumber: 5,
    ...overrides,
  });
  const revertCmd = (overrides) => ({
    kind: "revertDeloadWeek",
    commandId: CMD,
    expectedWeekNumber: 5,
    ...overrides,
  });

  it("applies the mirrored transform: −1 set (floor 2), weight ×0.85 → nearest 2.5", () => {
    const { state } = apply(applyCmd());
    const [push, legs] = state.workouts;
    // 100 ×0.85 = 85 (already on the 2.5 grid)
    expect(push.exercises[0]).toMatchObject({ sets: 2, weight: 85 });
    // 60 ×0.85 = 51 → 50
    expect(push.exercises[1]).toMatchObject({ sets: 2, weight: 50 });
    // 140 ×0.85 = 119 → 120
    expect(legs.exercises[0]).toMatchObject({ sets: 2, weight: 120 });
  });

  it("post-novice lifters get the volume recipe instead (backlog #8)", () => {
    // Helms H4: intermediate+ take ~half the volume at the SAME load, so the
    // reducer must read profile.experience. An absent/unknown value stays on
    // the novice recipe the two tests either side of this one pin.
    const withExperience = (experience) =>
      applyProgramCommand({
        state: baseState(),
        profile: { experience },
        command: applyCmd(),
        now: NOW,
      }).state.workouts;

    const inter = withExperience("intermediate");
    // Push: bench 3×8×100 → 2×6×100; row 3×10×60 → 2×8×60
    expect(inter[0].exercises[0]).toMatchObject({
      sets: 2,
      reps: 6,
      weight: 100,
    });
    expect(inter[0].exercises[1]).toMatchObject({
      sets: 2,
      reps: 8,
      weight: 60,
    });
    // Legs: squat 3×5×140 → 2×3×140 (rep floor is 3)
    expect(inter[1].exercises[0]).toMatchObject({
      sets: 2,
      reps: 3,
      weight: 140,
    });

    expect(withExperience("advanced")).toEqual(inter);
    // Unknown / absent → novice recipe (load cut, reps untouched)
    expect(withExperience("nonsense")[0].exercises[0]).toMatchObject({
      sets: 2,
      reps: 8,
      weight: 85,
    });
    expect(withExperience(undefined)[0].exercises[0]).toMatchObject({
      weight: 85,
    });
  });

  it("sets currentPhase deload, clears fatigue, stamps updatedAt", () => {
    const input = baseState();
    input.fatigueScore = 7;
    const { state } = apply(applyCmd(), input);
    expect(state.currentPhase).toBe("deload");
    expect(state.fatigueScore).toBe(0);
    expect(state.updatedAt).toBe(NOW);
  });

  it("stashes the pre-deload snapshot for undo", () => {
    const input = baseState();
    input.fatigueScore = 7;
    const { state } = apply(applyCmd(), input);
    expect(state.deloadSnapshot).toMatchObject({
      weekNumber: 5,
      currentPhase: "progression",
      fatigueScore: 7,
      appliedAt: NOW,
    });
    expect(state.deloadSnapshot.workouts).toEqual(baseState().workouts);
  });

  /**
   * The run half (P1d pin 1, rebuilt).
   *
   * The lock words this as "reduce long run volume by 25%", but the
   * running evidence handoff's non-adoptions forbid "a universal taper
   * duration/percentage". So the client steps each run down one rung on
   * its own template ladder and sends the result; this side applies it
   * under the same guards `overrideRunDay` uses.
   *
   * `runSwaps` is OPTIONAL — an older client, or a lift-only user, sends
   * none and gets exactly the previous behaviour.
   */
  describe("run half — runSwaps", () => {
    const withRuns = (runDays) => {
      const s = baseState();
      s.runDays = runDays;
      return s;
    };
    const planned = (over) => ({
      id: "run-1",
      dayIndex: 2,
      templateId: "long_20k",
      type: "long",
      status: "planned",
      completed: false,
      ...over,
    });

    it("steps the named runs down, writing templateId AND userOverride", () => {
      // Both fields, matching overrideRunDay — a deloaded day must read as
      // swapped everywhere downstream, exactly like a hand-swapped one.
      const { state } = apply(
        applyCmd({ runSwaps: [{ runDayId: "run-1", templateId: "long_15k" }] }),
        withRuns([planned()])
      );
      expect(state.runDays[0]).toMatchObject({
        templateId: "long_15k",
        userOverride: "long_15k",
      });
    });

    it("snapshots runDays so undo restores them", () => {
      const before = [planned()];
      const { state } = apply(
        applyCmd({ runSwaps: [{ runDayId: "run-1", templateId: "long_15k" }] }),
        withRuns(before)
      );
      expect(state.deloadSnapshot.runDays).toEqual(before);

      const { state: reverted } = apply(revertCmd(), state);
      expect(reverted.runDays).toEqual(before);
      expect(reverted.runDays[0].templateId).toBe("long_20k");
    });

    it("undo restores the athlete's OWN prior override, not a cleared field", () => {
      // The day was already swapped by the user before the deload. Because
      // the reducer overwrites templateId, nothing on the day remembers
      // that choice — only the snapshot does. Clearing instead of
      // restoring would silently discard a user decision.
      const before = [planned({ templateId: "tempo_40", userOverride: "tempo_40", type: "tempo" })];
      const { state } = apply(
        applyCmd({ runSwaps: [{ runDayId: "run-1", templateId: "tempo_30" }] }),
        withRuns(before)
      );
      expect(state.runDays[0].templateId).toBe("tempo_30");

      const { state: reverted } = apply(revertCmd(), state);
      expect(reverted.runDays[0]).toMatchObject({
        templateId: "tempo_40",
        userOverride: "tempo_40",
      });
    });

    it("REFUSES to swap a race, without failing the whole deload", () => {
      // Race identity is immutable (RUN-RACE-GUARD-01). One bad entry must
      // not cost the user the lift half of a week-level action, so the
      // refusal is a skip rather than a throw.
      const { state } = apply(
        applyCmd({
          runSwaps: [
            { runDayId: "run-1", templateId: "easy_30" },
            { runDayId: "run-2", templateId: "tempo_20" },
          ],
        }),
        withRuns([
          planned({ id: "run-1", templateId: "marathon_race", type: "race" }),
          planned({ id: "run-2", templateId: "tempo_30", type: "tempo" }),
        ])
      );
      expect(state.runDays[0].templateId).toBe("marathon_race");
      expect(state.runDays[0].userOverride).toBeUndefined();
      // ...and the rest of the week still applied.
      expect(state.runDays[1].templateId).toBe("tempo_20");
      expect(state.currentPhase).toBe("deload");
    });

    it("skips days that are no longer editable", () => {
      const { state } = apply(
        applyCmd({ runSwaps: [{ runDayId: "run-1", templateId: "long_15k" }] }),
        withRuns([planned({ status: "completed_exact" })])
      );
      expect(state.runDays[0].templateId).toBe("long_20k");
    });

    it("ignores a swap naming a run day that no longer exists", () => {
      const { state } = apply(
        applyCmd({ runSwaps: [{ runDayId: "ghost", templateId: "long_15k" }] }),
        withRuns([planned()])
      );
      expect(state.runDays[0].templateId).toBe("long_20k");
      expect(state.currentPhase).toBe("deload");
    });

    it("omitting runSwaps leaves runs untouched — the old-client path", () => {
      const before = [planned()];
      const { state } = apply(applyCmd(), withRuns(before));
      expect(state.runDays).toEqual(before);
      // The lift half still ran.
      expect(state.currentPhase).toBe("deload");
      expect(state.workouts[0].exercises[0].sets).toBe(2);
    });

    it("reverts cleanly from a snapshot written before the run half shipped", () => {
      // Backward compatibility for a deload applied by the previous
      // version: its snapshot has no runDays, and revert must restore the
      // lift side rather than wiping runDays to undefined.
      const { state } = apply(applyCmd(), withRuns([planned()]));
      delete state.deloadSnapshot.runDays;
      const { state: reverted } = apply(revertCmd(), state);
      expect(Array.isArray(reverted.runDays)).toBe(true);
      expect(reverted.currentPhase).toBe("progression");
    });

    it("rejects a malformed or oversized runSwaps payload", () => {
      expectHttps(
        () => apply(applyCmd({ runSwaps: "nope" })),
        "invalid-argument"
      );
      expectHttps(
        () => apply(applyCmd({ runSwaps: [{ runDayId: "run-1" }] })),
        "invalid-argument"
      );
      expectHttps(
        () =>
          apply(
            applyCmd({
              runSwaps: Array.from({ length: 8 }, (_, i) => ({
                runDayId: `r${i}`,
                templateId: "easy_30",
              })),
            })
          ),
        "invalid-argument"
      );
    });
  });

  it("rejects a second apply — no ×0.85² compounding", () => {
    const { state } = apply(applyCmd());
    expectHttps(() => apply(applyCmd(), state), "failed-precondition");
  });

  it("rejects a stale week cursor", () => {
    expectHttps(
      () => apply(applyCmd({ expectedWeekNumber: 4 })),
      "failed-precondition"
    );
    expectHttps(
      () => apply(revertCmd({ expectedWeekNumber: 4 })),
      "failed-precondition"
    );
  });

  it("revert restores the stash exactly and removes it", () => {
    const input = baseState();
    input.fatigueScore = 7;
    const { state: deloaded } = apply(applyCmd(), input);
    const { state: reverted } = apply(revertCmd(), deloaded);
    expect(reverted.workouts).toEqual(baseState().workouts);
    expect(reverted.currentPhase).toBe("progression");
    expect(reverted.fatigueScore).toBe(7);
    expect("deloadSnapshot" in reverted).toBe(false);
  });

  it("revert without a snapshot rejects", () => {
    expectHttps(() => apply(revertCmd()), "failed-precondition");
  });

  it("revert with a snapshot from another week rejects (inert after rollover)", () => {
    const { state: deloaded } = apply(applyCmd());
    // Simulate a rollover: the cursor moved on but the stale stash remains.
    const rolled = { ...deloaded, weekNumber: 6, currentPhase: "progression" };
    expectHttps(
      () => apply(revertCmd({ expectedWeekNumber: 6 }), rolled),
      "failed-precondition"
    );
  });

  it("does not mutate the input state", () => {
    const input = baseState();
    apply(applyCmd(), input);
    expect(input.workouts[0].exercises[0]).toMatchObject({
      sets: 3,
      weight: 100,
    });
    expect(input.currentPhase).toBe("progression");
    expect("deloadSnapshot" in input).toBe(false);
  });
});
