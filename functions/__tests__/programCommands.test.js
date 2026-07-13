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

  it("transitionRunDay permits only to:skipped", () => {
    expect(
      assertClientProgramCommand({
        kind: "transitionRunDay",
        commandId: CMD_ID,
        runDayId: "run-1",
        to: "skipped",
      }).to
    ).toBe("skipped");
    expectRejected({
      kind: "transitionRunDay",
      commandId: CMD_ID,
      runDayId: "run-1",
      to: "planned",
    });
    expectRejected({
      kind: "transitionRunDay",
      commandId: CMD_ID,
      runDayId: "run-1",
      to: "completed_exact",
    });
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

function apply(command, state) {
  return applyProgramCommand({
    state: state || baseState(),
    profile: {},
    command,
    now: NOW,
  });
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
});

describe("staged generation commands", () => {
  it.each([
    "completeWorkoutDay",
    "logExercise",
    "addExercises",
    "replaceExercise",
  ])("%s is validated but not yet applied in this stage", (kind) => {
    // Build a minimally-valid command per kind so validation passes and the
    // reducer's staged guard (not the validator) is what rejects it.
    const commands = {
      completeWorkoutDay: {
        kind,
        commandId: CMD,
        ...dayPre(),
        completion: {
          completionId: "sess_abcdef01",
          durationMinutes: 40,
          setLogs: [],
        },
      },
      logExercise: {
        kind,
        commandId: CMD,
        ...dayPre(),
        exerciseInstanceId: "inst-a",
        actual: { weight: 100, reps: 8, completed: true },
      },
      addExercises: {
        kind,
        commandId: CMD,
        ...dayPre(),
        exercises: [{ exerciseId: "bench" }],
      },
      replaceExercise: {
        kind,
        commandId: CMD,
        ...dayPre(),
        oldInstanceId: "inst-a",
        replacementExerciseId: "incline",
      },
    };
    const error = expectHttps(
      () => apply(commands[kind]),
      "failed-precondition"
    );
    expect(error.message).toMatch(/build stage/i);
  });
});
