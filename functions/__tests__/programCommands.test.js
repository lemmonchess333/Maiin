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

describe("assertClientProgramCommand â€” envelope", () => {
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
    // __proto__ from JSON.parse is an own enumerable key â†’ unexpected field.
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

    // empty patch â€” nothing to do
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
})ãŸy¶‰žËkºwµçP¡ÍÑ…Ñ”¹Ý½É­½ÕÑÍlÅt¹½µÁ±•Ñ•¤¹Ñ½	”¡™…±Í”¤ì€¼¼½Ñ¡•È‘…äÕ¹Ñ½Õ¡•(€€€•áÁ•Ð ‰¹•áÑ]½É­½ÕÑ=Ù•ÉÉ¥‘”ˆ¥¸ÍÑ…Ñ”¤¹Ñ½	”¡™…±Í”¤ì€¼¼±•…É•€¡Ý…Ì€À¤(€ô¤ì((€¥Ð ‰‰Õ¥±‘ÌÑ¡”Ý½É­½ÕÐÉ•½É™É½´½µÁ±•Ñ•Í•Ð±½Ìˆ°€ ¤€ôøì(€€€½¹ÍÐì•™™•ÑÌô€ôÉÕ¸¡ìÝ•¥¡Ñ-œè€àÀô¤ì(€€€½¹ÍÐÜ€ô•™™•ÑÌ¹Ý½É­½ÕÐì(€€€•áÁ•Ð¡Ü¹•á•É¥Í•Ì¤¹Ñ½!…Ù•1•¹Ñ  È¤ì(€€€•áÁ•Ð¡Ü¹•á•É¥Í•ÍlÁt¤¹Ñ½ÅÕ…°¡ì(€€€€€•á•É¥Í•%è€‰‰•¹ µÁÉ•ÍÌˆ°(€€€€€•á•É¥Í•9…µ”è€‰	•¹ ˆ°(€€€€€…Ñ•½Éäè€‰¡½É¥é½¹Ñ…±}ÁÕÍ ˆ°(€€€€€…±½É¥•Í	ÕÉ¹•è€À°(€€€€€Í•ÑÌèl(€€€€€€€ìÍ•Ñ9Õµ‰•Èè€Ä°É•ÁÌè€à°Ý•¥¡Ñ-œè€ÄÀÀô°(€€€€€€€ìÍ•Ñ9Õµ‰•Èè€È°É•ÁÌè€à°Ý•¥¡Ñ-œè€ÄÀÀô°(€€€€€t°(€€€ô¤ì(€€€•áÁ•Ð¡Ü¹•á•É¥Í•ÍlÅt¹Í•ÑÌ¤¹Ñ½ÅÕ…°¡l(€€€€€ìÍ•Ñ9Õµ‰•Èè€Ä°É•ÁÌè€ÄÀ°Ý•¥¡Ñ-œè€ØÀô°(€€€t¤ì(€ô¤ì((€¥Ð ‰½µÁÕÑ•ÌÑ½Ñ…±…±½É¥•ÌÙ¥„Ñ¡”µ¥ÉÉ½É•…±½É¥”•¹¥¹”ˆ°€ ¤€ôøì(€€€€¼¼Ñ½¹¹…”€ÈÈÀÀ°€ÌÍ•ÑÌ°€ÐÔµ¥¸°€àÁ­œƒŠH5P€Ì¸ÔƒŠHÉ½Õ¹ ÐÔ¨àÀ¨Ì¸Ô¼ØÀ¤€ô€ÈÄÀ(€€€½¹ÍÐì•™™•ÑÌô€ôÉÕ¸¡ìÝ•¥¡Ñ-œè€àÀô¤ì(€€€•áÁ•Ð¡•™™•ÑÌ¹Ý½É­½ÕÐ¹Ñ½Ñ…±…±½É¥•Ì¤¹Ñ½	” ÈÄÀ¤ì(€€€•áÁ•Ð¡•™™•ÑÌ¹Ý½É­½ÕÐ¹‘ÕÉ…Ñ¥½¹5¥¹ÕÑ•Ì¤¹Ñ½	” ÐÔ¤ì(€ô¤ì((€¥Ð ‰Í…Ù•Ì€À…±½É¥•ÌÝ¡•¸‰½‘åÝ•¥¡Ð¥Ìµ¥ÍÍ¥¹œˆ°€ ¤€ôøì(€€€½¹ÍÐì•™™•ÑÌô€ôÉÕ¸¡íô¤ì(€€€•áÁ•Ð¡•™™•ÑÌ¹Ý½É­½ÕÐ¹Ñ½Ñ…±…±½É¥•Ì¤¹Ñ½	” À¤ì(€ô¤ì((€¥Ð ‰ÍÑ…µÁÌÑ¡”‘…Ñ”¥¸Ñ¡”ÕÍ•ÈÌÑ¥µ•é½¹”€¡¹½ÐÍ•ÉÙ•ÈUQ¤ˆ°€ ¤€ôøì(€€€€¼¼€ÀÈèÌÀUQ½¸€ÈÀÈØ´ÀÜ´ÄÌ¥Ì€ÈÈèÌÀ½¸€ÈÀÈØ´ÀÜ´ÄÈ¥¸9•Üe½É¬€¡P¤¸(€€€•áÁ•Ð¡ÉÕ¸¡ìÑ¥µ•é½¹”è€‰µ•É¥„½9•Ý}e½É¬ˆô¤¹•™™•ÑÌ¹Ý½É­½ÕÐ¹‘…Ñ”¤¹Ñ½	” (€€€€€€ˆÈÀÈØ´ÀÜ´ÄÈˆ(€€€€¤ì(€€€•áÁ•Ð¡ÉÕ¸¡íô¤¹•™™•ÑÌ¹Ý½É­½ÕÐ¹‘…Ñ”¤¹Ñ½	” ˆÈÀÈØ´ÀÜ´ÄÌˆ¤ì€¼¼UQ™…±±‰…¬(€ô¤ì((€¥Ð ‰Í•ÑÌ¹½Ñ•Ì½Í½ÕÉ”½½µÁ±•Ñ¥½¹%…¹½µ¥ÑÌÉ•…Ñ•‘Ð€¡…±±…‰±”¥¹©•ÑÌ¥Ð¤ˆ°€ ¤€ôøì(€€€½¹ÍÐÜ€ôÉÕ¸¡ìÝ•¥¡Ñ-œè€àÀô¤¹•™™•ÑÌ¹Ý½É­½ÕÐì(€€€•áÁ•Ð¡Ü¹¹½Ñ•Ì¤¹Ñ½	” ‰AÕÍ ƒŠPAÉ½É…µµ”]••¬€Ôˆ¤ì(€€€•áÁ•Ð¡Ü¹Í½ÕÉ”¤¹Ñ½	” ‰ÁÉ½É…µµ”ˆ¤ì(€€€•áÁ•Ð¡Ü¹½µÁ±•Ñ¥½¹%¤¹Ñ½	” ‰Í•ÍÍ}…‰‘•˜ÀÄˆ¤ì(€€€•áÁ•Ð ‰É•…Ñ•‘Ðˆ¥¸Ü¤¹Ñ½	”¡™…±Í”¤ì(€€€•áÁ•Ð ‰Í•ÍÍ¥½¹Y…É¥…¹Ðˆ¥¸Ü¤¹Ñ½	”¡™…±Í”¤ì(€ô¤ì((€¥Ð ‰…ÉÉ¥•ÌÍ•ÍÍ¥½¹Y…É¥…¹ÐÝ¡•¸ÁÉ½Ù¥‘•ˆ°€ ¤€ôøì(€€€½¹ÍÐÜ€ôÉÕ¸¡íô°ìÍ•ÍÍ¥½¹Y…É¥…¹Ðè€‰•áÁÉ•ÍÌÌÀˆô¤¹•™™•ÑÌ¹Ý½É­½ÕÐì(€€€•áÁ•Ð¡Ü¹Í•ÍÍ¥½¹Y…É¥…¹Ð¤¹Ñ½	” ‰•áÁÉ•ÍÌÌÀˆ¤ì(€ô¤ì((€¥Ð ‰™…±±Ì‰…¬Ñ¼Á±…¹¹•‘…Ñ„Ý¡•¸„Í•Ð±½œ¥Ì…‰Í•¹Ðˆ°€ ¤€ôøì(€€€½¹ÍÐÜ€ôÉÕ¸¡íô°ìÍ•Ñ1½Ìèmtô¤¹•™™•ÑÌ¹Ý½É­½ÕÐì(€€€€¼¼¹¼±½ÌƒŠHÁ±…¹¹•è‰•¹ €ÌÍ•ÑÌ É•ÁÌ€à€¼Ý•¥¡Ð€ÄÀÀ(€€€•áÁ•Ð¡Ü¹•á•É¥Í•ÍlÁt¹Í•ÑÌ¤¹Ñ½ÅÕ…°¡l(€€€€€ìÍ•Ñ9Õµ‰•Èè€Ä°É•ÁÌè€à°Ý•¥¡Ñ-œè€ÄÀÀô°(€€€€€ìÍ•Ñ9Õµ‰•Èè€È°É•ÁÌè€à°Ý•¥¡Ñ-œè€ÄÀÀô°(€€€€€ìÍ•Ñ9Õµ‰•Èè€Ì°É•ÁÌè€à°Ý•¥¡Ñ-œè€ÄÀÀô°(€€€t¤ì(€ô¤ì((€¥Ð ‰‘½•Ì¹½ÐµÕÑ…Ñ”Ñ¡”¥¹ÁÕÐÍÑ…Ñ”ˆ°€ ¤€ôøì(€€€½¹ÍÐ¥¹ÁÕÐ€ô½µÁ±•Ñ•MÑ…Ñ” ¤ì(€€€…ÁÁ±åAÉ½É…µ½µµ…¹¡ì(€€€€€ÍÑ…Ñ”è¥¹ÁÕÐ°(€€€€€ÁÉ½™¥±”èìÝ•¥¡Ñ-œè€àÀô°(€€€€€½µµ…¹èì(€€€€€€€­¥¹è€‰½µÁ±•Ñ•]½É­½ÕÑ…äˆ°(€€€€€€€½µµ…¹‘%è5°(€€€€€€€€¸¸¹‘…åAÉ” ¤°(€€€€€€€½µÁ±•Ñ¥½¸°(€€€€€ô°(€€€€€¹½Üè…Ñ”¹Á…ÉÍ” ˆÈÀÈØ´ÀÜ´ÄÍPÀÈèÌÀèÀÁhˆ¤°(€€€ô¤ì(€€€•áÁ•Ð¡¥¹ÁÕÐ¹Ý½É­½ÕÑÍlÁt¹½µÁ±•Ñ•¤¹Ñ½	”¡™…±Í”¤ì(€ô¤ì)ô¤ì()‘•ÍÉ¥‰” ‰…‘‘á•É¥Í•Ì€¼É•Á±…•á•É¥Í”€¡…Ñ…±½œµ‘•É¥Ù•°µ¥ÉÉ½ÉÌÁ¥¹¹•‰äÉ½ÍÌµÑ•ÍÑÌ¤ˆ°€ ¤€ôøì(€¥Ð ‰…‘‘á•É¥Í•Ì…ÁÁ•¹‘Ì…Ñ…±½œµ‘•É¥Ù••á•É¥Í•Ì…ÐÑ¡”•¹‰ä‘•™…Õ±Ðˆ°€ ¤€ôøì(€€€½¹ÍÐìÍÑ…Ñ”ô€ô…ÁÁ±ä¡ì(€€€€€­¥¹è€‰…‘‘á•É¥Í•Ìˆ°(€€€€€½µµ…¹‘%è5°(€€€€€€¸¸¹‘…åAÉ” ¤°(€€€€€•á•É¥Í•Ìèl(€€€€€€€ì•á•É¥Í•%è€‰‰•¹ µÁÉ•ÍÌˆô°(€€€€€€€ì•á•É¥Í•%è€‰™É½¹ÐµÍÅÕ…Ðˆ°Í•ÑÌè€Ð°É•ÁÌè€Ô°Ý•¥¡Ðè€àÀô°(€€€€€t°(€€€ô¤ì(€€€½¹ÍÐ•à€ôÍÑ…Ñ”¹Ý½É­½ÕÑÍlÁt¹•á•É¥Í•Ìì(€€€•áÁ•Ð¡•à¤¹Ñ½!…Ù•1•¹Ñ  Ð¤ì€¼¼¥¹ÍÐµ„°¥¹ÍÐµˆ°€¬€È…ÁÁ•¹‘•(€€€€¼¼±¥•¹Ð…‘‘•™…Õ±Ð€ Ï\ÄÃ\À¤Ý¡•¸™¥•±‘Ì½µ¥ÑÑ•(€€€•áÁ•Ð¡•álÉt¤¹Ñ½5…Ñ¡=‰©•Ð¡ì(€€€€€•á•É¥Í•%è€‰‰•¹ µÁÉ•ÍÌˆ°(€€€€€¹…µ”è€‰	•¹ AÉ•ÍÌˆ°(€€€€€Í•ÑÌè€Ì°(€€€€€É•ÁÌè€ÄÀ°(€€€€€Ý•¥¡Ðè€À°(€€€€€µ½Ù•µ•¹Ñ…Ñ•½Éäè€‰¡½É¥é½¹Ñ…±}ÁÕÍ ˆ°(€€€ô¤ì(€€€€¼¼•áÁ±¥¥ÐÁÉ•ÍÉ¥ÁÑ¥½¸¡½¹½ÕÉ•(€€€•áÁ•Ð¡•álÍt¤¹Ñ½5…Ñ¡=‰©•Ð¡ì(€€€€€•á•É¥Í•%è€‰™É½¹ÐµÍÅÕ…Ðˆ°(€€€€€Í•ÑÌè€Ð°(€€€€€É•ÁÌè€Ô°(€€€€€Ý•¥¡Ðè€àÀ°(€€€€€µ½Ù•µ•¹Ñ…Ñ•½Éäè€‰­¹••}‘½µ¥¹…¹Ðˆ°(€€€ô¤ì(€€€€¼¼‘•Ñ•Éµ¥¹¥ÍÑ¥Œ¥¹ÍÑ…¹”¥‘Ì‘•É¥Ù•™É½´Ñ¡”½µµ…¹‘%(€€€•áÁ•Ð¡•álÉt¹¥¹ÍÑ…¹•%¤¹Ñ½	”¡µ´‘í5ô´Á€¤ì(€€€•áÁ•Ð¡•álÍt¹¥¹ÍÑ…¹•%¤¹Ñ½	”¡µ´‘í5ô´Å€¤ì(€ô¤ì((€¥Ð ‰…‘‘á•É¥Í•Ì¡½¹½ÕÉÌ¥¹Í•ÉÑÐˆ°€ ¤€ôøì(€€€½¹ÍÐìÍÑ…Ñ”ô€ô…ÁÁ±ä¡ì(€€€€€­¥¹è€‰…‘‘á•É¥Í•Ìˆ°(€€€€€½µµ…¹‘%è5°(€€€€€€¸¸¹‘…åAÉ” ¤°(€€€€€•á•É¥Í•Ìèmì•á•É¥Í•%è€‰‰•¹ µÁÉ•ÍÌˆõt°(€€€€€¥¹Í•ÉÑÐè€Ä°(€€€ô¤ì(€€€•áÁ•Ð¡ÍÑ…Ñ”¹Ý½É­½ÕÑÍlÁt¹•á•É¥Í•Ì¹µ…À ¡”¤€ôø”¹¥¹ÍÑ…¹•%¤¤¹Ñ½ÅÕ…°¡l(€€€€€€‰¥¹ÍÐµ„ˆ°(€€€€€µ´‘í5ô´Á€°(€€€€€€‰¥¹ÍÐµˆˆ°(€€€t¤ì(€ô¤ì((€¥Ð ‰…‘‘á•É¥Í•ÌÉ•©•ÑÌ…¸Õ¹­¹½Ý¸…Ñ…±½œ¥Ý¥Ñ ¥¹Ù…±¥µ…ÉÕµ•¹Ðˆ°€ ¤€ôøì(€€€•áÁ•Ñ!ÑÑÁÌ (€€€€€€ ¤€ôø(€€€€€€€…ÁÁ±ä¡ì(€€€€€€€€€­¥¹è€‰…‘‘á•É¥Í•Ìˆ°(€€€€€€€€€½µµ…¹‘%è5°(€€€€€€€€€€¸¸¹‘…åAÉ” ¤°(€€€€€€€€€•á•É¥Í•Ìèmì•á•É¥Í•%è€‰¹½Ðµ„µÉ•…°µ•á•É¥Í”ˆõt°(€€€€€€€ô¤°(€€€€€€‰¥¹Ù…±¥µ…ÉÕµ•¹Ðˆ(€€€€¤ì(€ô¤ì((€¥Ð ‰É•Á±…•á•É¥Í”ÍÝ…ÁÌÑ¡”•á•É¥Í”Ý¥Ñ¡½ÕÐ…ÉÉå¥¹œ…¸Õ¹Í…™”±½…ˆ°€ ¤€ôøì(€€€½¹ÍÐìÍÑ…Ñ”ô€ô…ÁÁ±ä¡ì(€€€€€­¥¹è€‰É•Á±…•á•É¥Í”ˆ°(€€€€€½µµ…¹‘%è5°(€€€€€€¸¸¹‘…åAÉ” ¤°(€€€€€½±‘%¹ÍÑ…¹•%è€‰¥¹ÍÐµ„ˆ°€¼¼	•¹ °Í•ÑÌ€ÌÉ•ÁÌ€àÝ•¥¡Ð€ÄÀÀ(€€€€€É•Á±…•µ•¹Ñá•É¥Í•%è€‰™É½¹ÐµÍÅÕ…Ðˆ°(€€€ô¤ì(€€€½¹ÍÐ•à€ôÍÑ…Ñ”¹Ý½É­½ÕÑÍlÁt¹•á•É¥Í•Ìì(€€€•áÁ•Ð¡•à¤¹Ñ½!…Ù•1•¹Ñ  È¤ì(€€€•áÁ•Ð¡•álÁt¤¹Ñ½5…Ñ¡=‰©•Ð¡ì(€€€€€•á•É¥Í•%è€‰™É½¹ÐµÍÅÕ…Ðˆ°(€€€€€¹…µ”è€‰É½¹ÐMÅÕ…Ðˆ°(€€€€€Í•ÑÌè€Ì°(€€€€€É•ÁÌè€à°(€€€€€Ý•¥¡Ðè€À°€¼¼…É‰¥ÑÉ…ÉäÉ½ÍÌµµ½Ù•µ•¹Ð­¥±½É…µÌ…É”Õ¹…±¥‰É…Ñ•(€€€€€µ½Ù•µ•¹Ñ…Ñ•½Éäè€‰­¹••}‘½µ¥¹…¹Ðˆ°(€€€€€¥¹ÍÑ…¹•%èµ´‘í5õ€°(€€€ô¤ì(€€€•áÁ•Ð¡•álÅt¹¥¹ÍÑ…¹•%¤¹Ñ½	” ‰¥¹ÍÐµˆˆ¤ì€¼¼Õ¹Ñ½Õ¡•(€ô¤ì((€¥Ð ‰É•Á±…•á•É¥Í”¡…¹•ÌÑ¥µ•µ¡½±Õ¹¥ÑÌ…¹É•Í•ÑÌÑ¡”Ñ…É•Ð½¡•É•¹Ñ±äˆ°€ ¤€ôøì(€€€½¹ÍÐìÍÑ…Ñ”ô€ô…ÁÁ±ä¡ì(€€€€€­¥¹è€‰É•Á±…•á•É¥Í”ˆ°(€€€€€½µµ…¹‘%è5°(€€€€€€¸¸¹‘…åAÉ” ¤°(€€€€€½±‘%¹ÍÑ…¹•%è€‰¥¹ÍÐµ„ˆ°(€€€€€É•Á±…•µ•¹Ñá•É¥Í•%è€‰Á±…¹¬ˆ°(€€€ô¤ì(€€€•áÁ•Ð¡ÍÑ…Ñ”¹Ý½É­½ÕÑÍlÁt¹•á•É¥Í•ÍlÁt¤¹Ñ½5…Ñ¡=‰©•Ð¡ì(€€€€€•á•É¥Í•%è€‰Á±…¹¬ˆ°(€€€€€É•ÁÌè€ÌÀ°(€€€€€‰…Í•I•ÁÌè€ÌÀ°(€€€€€É•ÁU¹¥Ðè€‰Í•½¹‘Ìˆ°(€€€€€Ý•¥¡Ðè€À°(€€€ô¤ì(€ô¤ì((€¥Ð ‰É•Á±…•á•É¥Í”…ÉÉ¥•ÌÑ¡”Í±½ÐÌÁÉ•ÍÉ¥ÁÑ¥½¸™¥•±‘Ì€¡‰…­±½œ€ŒÜ¤ˆ°€ ¤€ôøì(€€€€¼¼¥Í•ÍÍ½Éä¹½ÜÁ¥­Ì	=Q Ñ¡”ÁÉ½É•ÍÍ¥½¸Í¡•µ”…¹Ñ¡”±½…ÍÑ•À°Í¼(€€€€¼¼‘É½ÁÁ¥¹œ¥Ð½¸„ÍÝ…ÀÍ¥±•¹Ñ±äÉ”µÁÉ¥•Ì…¸¥Í½±…Ñ¥½¸…Ì„½µÁ½Õ¹(€€€€¼¼€ È¸Ô­œ½¸„ÕÉ°¤¸‰…Í•M•ÑÌ¥ÌÑ¡”Ù½±Õµ”µÉ…µÀ…¹¡½ÈìÉ•ÁI…¹•5…à€¬(€€€€¼¼‰…Í•I•ÁÌ…É”Ñ¡”É…¹”¥Ð±¥µ‰ÌìÉ•ÍÑM•½¹‘Ì¥ÌÑ¡”…ÕÑ¡½É•É•ÍÐ¸(€€€½¹ÍÐÍÑ…Ñ”€ô‰…Í•MÑ…Ñ” ¤ì(€€€=‰©•Ð¹…ÍÍ¥¸¡ÍÑ…Ñ”¹Ý½É­½ÕÑÍlÁt¹•á•É¥Í•ÍlÁt°ì(€€€€€¥Í•ÍÍ½ÉäèÑÉÕ”°(€€€€€ÁÉ½É•ÍÍ¥½¹QåÁ”è€‰‘½Õ‰±”ˆ°(€€€€€É•ÁI…¹•5…àè€ÄÔ°(€€€€€‰…Í•I•ÁÌè€ÄÈ°(€€€€€‰…Í•M•ÑÌè€Ð°(€€€€€É•ÍÑM•½¹‘Ìè€ØÀ°(€€€€€ÁÉ••±½…‘]•¥¡Ðè€ÄÈÀ°(€€€ô¤ì(€€€½¹ÍÐ½ÕÐ€ô…ÁÁ±ä (€€€€€ì(€€€€€€€­¥¹è€‰É•Á±…•á•É¥Í”ˆ°(€€€€€€€½µµ…¹‘%è5°(€€€€€€€€¸¸¹‘…åAÉ” ¤°(€€€€€€€½±‘%¹ÍÑ…¹•%è€‰¥¹ÍÐµ„ˆ°(€€€€€€€É•Á±…•µ•¹Ñá•É¥Í•%è€‰™É½¹ÐµÍÅÕ…Ðˆ°(€€€€€ô°(€€€€€ÍÑ…Ñ”(€€€€¤ì(€€€•áÁ•Ð¡½ÕÐ¹ÍÑ…Ñ”¹Ý½É­½ÕÑÍlÁt¹•á•É¥Í•ÍlÁt¤¹Ñ½5…Ñ¡=‰©•Ð¡ì(€€€€€•á•É¥Í•%è€‰™É½¹ÐµÍÅÕ…Ðˆ°(€€€€€¥Í•ÍÍ½ÉäèÑÉÕ”°(€€€€€ÁÉ½É•ÍÍ¥½¹QåÁ”è€‰‘½Õ‰±”ˆ°(€€€€€É•ÁI…¹•5…àè€ÄÔ°(€€€€€‰…Í•I•ÁÌè€ÄÈ°(€€€€€‰…Í•M•ÑÌè€Ð°(€€€€€É•ÍÑM•½¹‘Ìè€ØÀ°(€€€ô¤ì(€€€€¼¼ÁÉ••±½…‘]•¥¡Ð‘•±¥‰•É…Ñ•±ä‘½•Ì9=P…ÉÉäƒŠPÑ¡”É•Á±…•µ•¹Ð­••ÁÌ¥ÑÌ(€€€€¼¼‘•±½…‘•±½…É…Ñ¡•ÈÑ¡…¸©ÕµÁ¥¹œÑ¼„Ý•¥¡Ð¥Ð¹•Ù•È±¥™Ñ•¸(€€€•áÁ•Ð ‰ÁÉ••±½…‘]•¥¡Ðˆ¥¸½ÕÐ¹ÍÑ…Ñ”¹Ý½É­½ÕÑÍlÁt¹•á•É¥Í•ÍlÁt¤¹Ñ½	”¡™…±Í”¤ì(€ô¤ì((€¥Ð ‰É•Á±…•á•É¥Í”É•©•ÑÌ…¸Õ¹­¹½Ý¸½±¥¹ÍÑ…¹”¥ˆ°€ ¤€ôøì(€€€•áÁ•Ñ!ÑÑÁÌ (€€€€€€ ¤€ôø(€€€€€€€…ÁÁ±ä¡ì(€€€€€€€€€­¥¹è€‰É•Á±…•á•É¥Í”ˆ°(€€€€€€€€€½µµ…¹‘%è5°(€€€€€€€€€€¸¸¹‘…åAÉ” ¤°(€€€€€€€€€½±‘%¹ÍÑ…¹•%è€‰¥¹ÍÐµàˆ°(€€€€€€€€€É•Á±…•µ•¹Ñá•É¥Í•%è€‰™É½¹ÐµÍÅÕ…Ðˆ°(€€€€€€€ô¤°(€€€€€€‰™…¥±•µÁÉ•½¹‘¥Ñ¥½¸ˆ(€€€€¤ì(€ô¤ì((€¥Ð ‰É•Á±…•á•É¥Í”É•©•ÑÌ…¸Õ¹­¹½Ý¸É•Á±…•µ•¹Ð…Ñ…±½œ¥ˆ°€ ¤€ôøì(€€€•áÁ•Ñ!ÑÑÁÌ (€€€€€€ ¤€ôø(€€€€€€€…ÁÁ±ä¡ì(€€€€€€€€€­¥¹è€‰É•Á±…•á•É¥Í”ˆ°(€€€€€€€€€½µµ…¹‘%è5°(€€€€€€€€€€¸¸¹‘…åAÉ” ¤°(€€€€€€€€€½±‘%¹ÍÑ…¹•%è€‰¥¹ÍÐµ„ˆ°(€€€€€€€€€É•Á±…•µ•¹Ñá•É¥Í•%è€‰¹½Ðµ„µÉ•…°µ•á•É¥Í”ˆ°(€€€€€€€ô¤°(€€€€€€‰¥¹Ù…±¥µ…ÉÕµ•¹Ðˆ(€€€€¤ì(€ô¤ì((€¥Ð ‰‘½•Ì¹½ÐµÕÑ…Ñ”Ñ¡”¥¹ÁÕÐÍÑ…Ñ”ˆ°€ ¤€ôøì(€€€½¹ÍÐ¥¹ÁÕÐ€ô‰…Í•MÑ…Ñ” ¤ì(€€€…ÁÁ±ä (€€€€€ì(€€€€€€€­¥¹è€‰…‘‘á•É¥Í•Ìˆ°(€€€€€€€½µµ…¹‘%è5°(€€€€€€€€¸¸¹‘…åAÉ” ¤°(€€€€€€€•á•É¥Í•Ìèmì•á•É¥Í•%è€‰‰•¹ µÁÉ•ÍÌˆõt°(€€€€€ô°(€€€€€¥¹ÁÕÐ(€€€€¤ì(€€€•áÁ•Ð¡¥¹ÁÕÐ¹Ý½É­½ÕÑÍlÁt¹•á•É¥Í•Ì¤¹Ñ½!…Ù•1•¹Ñ  È¤ì(€ô¤ì)ô¤ì()‘•ÍÉ¥‰” ‰±½á•É¥Í”€¡É•‘Õ•ÈÝ¥É¥¹œƒŠPÁÉ½É•ÍÍ¥½¸µ…Ñ Á¥¹¹•‰äÉ½ÍÌµÑ•ÍÐ¤ˆ°€ ¤€ôøì(€™Õ¹Ñ¥½¸±½µ¡½Ù•ÉÉ¥‘•Ì¤ì(€€€É•ÑÕÉ¸ì(€€€€€­¥¹è€‰±½á•É¥Í”ˆ°(€€€€€½µµ…¹‘%è5°(€€€€€€¸¸¹‘…åAÉ” ¤°(€€€€€•á•É¥Í•%¹ÍÑ…¹•%è€‰¥¹ÍÐµ„ˆ°(€€€€€…ÑÕ…°èìÝ•¥¡Ðè€ÄÀÀ°É•ÁÌè€à°½µÁ±•Ñ•èÑÉÕ”ô°(€€€€€€¸¸¹½Ù•ÉÉ¥‘•Ì°(€€€ôì(€ô((€¥Ð ‰…ÕÑ½AÉ½É•ÍÍ¥½¸½¸è…ÁÁ±¥•ÌÁÉ½É•ÍÍ¥½¸Ñ¼Ñ¡”Ñ…É•Ð•á•É¥Í”ˆ°€ ¤€ôøì(€€€€¼¼¥¹ÍÐµ„è±¥¹•…È€¡¹¼ÁÉ½É•ÍÍ¥½¹QåÁ”¤°µ¥É½±½…‘¥¹œ½¸°½µÁ±•Ñ•Í•Ð…Ð(€€€€¼¼ÁÉ•ÍÉ¥ÁÑ¥½¸ƒŠH€¬Å­œµ¥É½±½…€¡±¥•¹Ð…ÁÁ±åAÉ½É•ÍÍ¥½¸ÉÕ±”¤¸(€€€½¹ÍÐìÍÑ…Ñ”ô€ô…ÁÁ±ä¡±½µ ¤¤ì(€€€½¹ÍÐÉ½Ü€ôÍÑ…Ñ”¹Ý½É­½ÕÑÍlÁt¹•á•É¥Í•Ì¹™¥¹ (€€€€€€¡”¤€ôø”¹¥¹ÍÑ…¹•%€ôôô€‰¥¹ÍÐµ„ˆ(€€€€¤ì(€€€•áÁ•Ð¡É½Ü¹Ý•¥¡Ð¤¹Ñ½	” ÄÀÄ¤ì(€€€•áÁ•Ð¡É½Ü¹±…ÍÑÑÑ•µÁÑ•‘]•¥¡Ð¤¹Ñ½	” ÄÀÀ¤ì(€€€•áÁ•Ð¡É½Ü¹Á•É™½Éµ…¹•!¥ÍÑ½Éä¤¹Ñ½!…Ù•1•¹Ñ  Ä¤ì(€ô¤ì((€¥Ð ‰…ÕÑ½AÉ½É•ÍÍ¥½¸½™˜èÉ•½É‘ÌÑ¡”…ÑÑ•µÁÐÝ¥Ñ¡½ÕÐ¡…¹¥¹œÁÉ•ÍÉ¥ÁÑ¥½¸ˆ°€ ¤€ôøì(€€€½¹ÍÐÌ€ô‰…Í•MÑ…Ñ” ¤ì(€€€Ì¹Í•ÑÑ¥¹Ì€ôì…ÕÑ½AÉ½É•ÍÍ¥½¸è™…±Í”°µ¥É½±½…‘¥¹œèÑÉÕ”ôì(€€€½¹ÍÐìÍÑ…Ñ”ô€ô…ÁÁ±ä¡±½µ ¤°Ì¤ì(€€€½¹ÍÐÉ½Ü€ôÍÑ…Ñ”¹Ý½É­½ÕÑÍlÁt¹•á•É¥Í•Ì¹™¥¹ (€€€€€€¡”¤€ôø”¹¥¹ÍÑ…¹•%€ôôô€‰¥¹ÍÐµ„ˆ(€€€€¤ì(€€€•áÁ•Ð¡É½Ü¹Ý•¥¡Ð¤¹Ñ½	” ÄÀÀ¤ì€¼¼Õ¹¡…¹•(€€€•áÁ•Ð¡É½Ü¹±…ÍÑÑÑ•µÁÑ•‘]•¥¡Ð¤¹Ñ½	” ÄÀÀ¤ì(€€€•áÁ•Ð¡É½Ü¹±…ÍÑA•É™½Éµ…¹”¤¹Ñ½ÅÕ…°¡ì(€€€€€Í•ÑÌè€Ì°(€€€€€É•ÁÌè€à°(€€€€€Ý•¥¡Ðè€ÄÀÀ°(€€€€€½µÁ±•Ñ•èÑÉÕ”°(€€€ô¤ì(€ô¤ì((€¥Ð ‰½¹±äÑ¡”Ñ…É•Ð•á•É¥Í”¡…¹•ÌìÑ¡”½Ñ¡•È¥ÌÕ¹Ñ½Õ¡•ˆ°€ ¤€ôøì(€€€½¹ÍÐìÍÑ…Ñ”ô€ô…ÁÁ±ä¡±½µ ¤¤ì(€€€½¹ÍÐ½Ñ¡•È€ôÍÑ…Ñ”¹Ý½É­½ÕÑÍlÁt¹•á•É¥Í•Ì¹™¥¹ (€€€€€€¡”¤€ôø”¹¥¹ÍÑ…¹•%€ôôô€‰¥¹ÍÐµˆˆ(€€€€¤ì(€€€•áÁ•Ð¡½Ñ¡•È¹Ý•¥¡Ð¤¹Ñ½	” ØÀ¤ì(€€€•áÁ•Ð¡½Ñ¡•È¹±…ÍÑÑÑ•µÁÑ•‘]•¥¡Ð¤¹Ñ½	•U¹‘•™¥¹• ¤ì(€ô¤ì((€¥Ð ‰É•©•ÑÌ…¸Õ¹­¹½Ý¸•á•É¥Í”¥¹ÍÑ…¹”¥ˆ°€ ¤€ôøì(€€€•áÁ•Ñ!ÑÑÁÌ (€€€€€€ ¤€ôø…ÁÁ±ä¡±½µ¡ì•á•É¥Í•%¹ÍÑ…¹•%è€‰¥¹ÍÐµàˆô¤¤°(€€€€€€‰™…¥±•µÁÉ•½¹‘¥Ñ¥½¸ˆ(€€€€¤ì(€ô¤ì((€¥Ð ‰‘½•Ì¹½ÐµÕÑ…Ñ”Ñ¡”¥¹ÁÕÐÍÑ…Ñ”ˆ°€ ¤€ôøì(€€€½¹ÍÐ¥¹ÁÕÐ€ô‰…Í•MÑ…Ñ” ¤ì(€€€…ÁÁ±ä¡±½µ ¤°¥¹ÁÕÐ¤ì(€€€•áÁ•Ð¡¥¹ÁÕÐ¹Ý½É­½ÕÑÍlÁt¹•á•É¥Í•ÍlÁt¹Ý•¥¡Ð¤¹Ñ½	” ÄÀÀ¤ì(€ô¤ì)ô¤ì()‘•ÍÉ¥‰” ‰‘•±½…Ý••¬½µµ…¹‘Ì€¡AI=I4µ1=´ÀÄ¤ˆ°€ ¤€ôøì(€½¹ÍÐ…ÁÁ±åµ€ô€¡½Ù•ÉÉ¥‘•Ì¤€ôø€¡ì(€€€­¥¹è€‰…ÁÁ±å•±½…‘]••¬ˆ°(€€€½µµ…¹‘%è5°(€€€•áÁ•Ñ•‘]••­9Õµ‰•Èè€Ô°(€€€€¸¸¹½Ù•ÉÉ¥‘•Ì°(€ô¤ì(€½¹ÍÐÉ•Ù•ÉÑµ€ô€¡½Ù•ÉÉ¥‘•Ì¤€ôø€¡ì(€€€­¥¹è€‰É•Ù•ÉÑ•±½…‘]••¬ˆ°(€€€½µµ…¹‘%è5°(€€€•áÁ•Ñ•‘]••­9Õµ‰•Èè€Ô°(€€€€¸¸¹½Ù•ÉÉ¥‘•Ì°(€ô¤ì((€¥Ð ‰…ÁÁ±¥•ÌÑ¡”µ¥ÉÉ½É•ÑÉ…¹Í™½É´èƒŠ"HÄÍ•Ð€¡™±½½È€È¤°Ý•¥¡Ðƒ\À¸àÔƒŠH¹•…É•ÍÐ€È¸Ôˆ°€ ¤€ôøì(€€€½¹ÍÐìÍÑ…Ñ”ô€ô…ÁÁ±ä¡…ÁÁ±åµ ¤¤ì(€€€½¹ÍÐmÁÕÍ °±•Ít€ôÍÑ…Ñ”¹Ý½É­½ÕÑÌì(€€€€¼¼€ÄÀÀƒ\À¸àÔ€ô€àÔ€¡…±É•…‘ä½¸Ñ¡”€È¸ÔÉ¥¤(€€€•áÁ•Ð¡ÁÕÍ ¹•á•É¥Í•ÍlÁt¤¹Ñ½5…Ñ¡=‰©•Ð¡ìÍ•ÑÌè€È°Ý•¥¡Ðè€àÔô¤ì(€€€€¼¼€ØÀƒ\À¸àÔ€ô€ÔÄƒŠH€ÔÀ(€€€•áÁ•Ð¡ÁÕÍ ¹•á•É¥Í•ÍlÅt¤¹Ñ½5…Ñ¡=‰©•Ð¡ìÍ•ÑÌè€È°Ý•¥¡Ðè€ÔÀô¤ì(€€€€¼¼€ÄÐÀƒ\À¸àÔ€ô€ÄÄäƒŠH€ÄÈÀ(€€€•áÁ•Ð¡±•Ì¹•á•É¥Í•ÍlÁt¤¹Ñ½5…Ñ¡=‰©•Ð¡ìÍ•ÑÌè€È°Ý•¥¡Ðè€ÄÈÀô¤ì(€ô¤ì((€¥Ð ‰Á½ÍÐµ¹½Ù¥”±¥™Ñ•ÉÌ•ÐÑ¡”Ù½±Õµ”É•¥Á”¥¹ÍÑ•…€¡‰…­±½œ€Œà¤ˆ°€ ¤€ôøì(€€€€¼¼!•±µÌ Ðè¥¹Ñ•Éµ•‘¥…Ñ”¬Ñ…­”ù¡…±˜Ñ¡”Ù½±Õµ”…ÐÑ¡”M5±½…°Í¼Ñ¡”(€€€€¼¼É•‘Õ•ÈµÕÍÐÉ•…ÁÉ½™¥±”¹•áÁ•É¥•¹”¸¸…‰Í•¹Ð½Õ¹­¹½Ý¸Ù…±Õ”ÍÑ…åÌ½¸(€€€€¼¼Ñ¡”¹½Ù¥”É•¥Á”Ñ¡”ÑÝ¼Ñ•ÍÑÌ•¥Ñ¡•ÈÍ¥‘”½˜Ñ¡¥Ì½¹”Á¥¸¸(€€€½¹ÍÐÝ¥Ñ¡áÁ•É¥•¹”€ô€¡•áÁ•É¥•¹”¤€ôø(€€€€€…ÁÁ±åAÉ½É…µ½µµ…¹¡ì(€€€€€€€ÍÑ…Ñ”è‰…Í•MÑ…Ñ” ¤°(€€€€€€€ÁÉ½™¥±”èì•áÁ•É¥•¹”ô°(€€€€€€€½µµ…¹è…ÁÁ±åµ ¤°(€€€€€€€¹½Üè9=\°(€€€€€ô¤¹ÍÑ…Ñ”¹Ý½É­½ÕÑÌì((€€€½¹ÍÐ¥¹Ñ•È€ôÝ¥Ñ¡áÁ•É¥•¹” ‰¥¹Ñ•Éµ•‘¥…Ñ”ˆ¤ì(€€€€¼¼AÕÍ è‰•¹ €Ï\ã\ÄÀÀƒŠH€Ë\Û\ÄÀÀìÉ½Ü€Ï\ÄÃ\ØÀƒŠH€Ë\ã\ØÀ(€€€•áÁ•Ð¡¥¹Ñ•ÉlÁt¹•á•É¥Í•ÍlÁt¤¹Ñ½5…Ñ¡=‰©•Ð¡ì(€€€€€Í•ÑÌè€È°(€€€€€É•ÁÌè€Ø°(€€€€€Ý•¥¡Ðè€ÄÀÀ°(€€€ô¤ì(€€€•áÁ•Ð¡¥¹Ñ•ÉlÁt¹•á•É¥Í•ÍlÅt¤¹Ñ½5…Ñ¡=‰©•Ð¡ì(€€€€€Í•ÑÌè€È°(€€€€€É•ÁÌè€à°(€€€€€Ý•¥¡Ðè€ØÀ°(€€€ô¤ì(€€€€¼¼1•ÌèÍÅÕ…Ð€Ï\×\ÄÐÀƒŠH€Ë\Ï\ÄÐÀ€¡É•À™±½½È¥Ì€Ì¤(€€€•áÁ•Ð¡¥¹Ñ•ÉlÅt¹•á•É¥Í•ÍlÁt¤¹Ñ½5…Ñ¡=‰©•Ð¡ì(€€€€€Í•ÑÌè€È°(€€€€€É•ÁÌè€Ì°(€€€€€Ý•¥¡Ðè€ÄÐÀ°(€€€ô¤ì((€€€•áÁ•Ð¡Ý¥Ñ¡áÁ•É¥•¹” ‰…‘Ù…¹•ˆ¤¤¹Ñ½ÅÕ…°¡¥¹Ñ•È¤ì(€€€€¼¼U¹­¹½Ý¸€¼…‰Í•¹ÐƒŠH¹½Ù¥”É•¥Á”€¡±½…ÕÐ°É•ÁÌÕ¹Ñ½Õ¡•¤(€€€•áÁ•Ð¡Ý¥Ñ¡áÁ•É¥•¹” ‰¹½¹Í•¹Í”ˆ¥lÁt¹•á•É¥Í•ÍlÁt¤¹Ñ½5…Ñ¡=‰©•Ð¡ì(€€€€€Í•ÑÌè€È°(€€€€€É•ÁÌè€à°(€€€€€Ý•¥¡Ðè€àÔ°(€€€ô¤ì(€€€•áÁ•Ð¡Ý¥Ñ¡áÁ•É¥•¹”¡Õ¹‘•™¥¹•¥lÁt¹•á•É¥Í•ÍlÁt¤¹Ñ½5…Ñ¡=‰©•Ð¡ì(€€€€€Ý•¥¡Ðè€àÔ°(€€€ô¤ì(€ô¤ì((€¥Ð ‰Í•ÑÌÕÉÉ•¹ÑA¡…Í”‘•±½…°±•…ÉÌ™…Ñ¥Õ”°ÍÑ…µÁÌÕÁ‘…Ñ•‘Ðˆ°€ ¤€ôøì(€€€½¹ÍÐ¥¹ÁÕÐ€ô‰…Í•MÑ…Ñ” ¤ì(€€€¥¹ÁÕÐ¹™…Ñ¥Õ•M½É”€ô€Üì(€€€½¹ÍÐìÍÑ…Ñ”ô€ô…ÁÁ±ä¡…ÁÁ±åµ ¤°¥¹ÁÕÐ¤ì(€€€•áÁ•Ð¡ÍÑ…Ñ”¹ÕÉÉ•¹ÑA¡…Í”¤¹Ñ½	” ‰‘•±½…ˆ¤ì(€€€•áÁ•Ð¡ÍÑ…Ñ”¹™…Ñ¥Õ•M½É”¤¹Ñ½	” À¤ì(€€€•áÁ•Ð¡ÍÑ…Ñ”¹ÕÁ‘…Ñ•‘Ð¤¹Ñ½	”¡9=\¤ì(€ô¤ì((€¥Ð ‰ÍÑ…Í¡•ÌÑ¡”ÁÉ”µ‘•±½…Í¹…ÁÍ¡½Ð™½ÈÕ¹‘¼ˆ°€ ¤€ôøì(€€€½¹ÍÐ¥¹ÁÕÐ€ô‰…Í•MÑ…Ñ” ¤ì(€€€¥¹ÁÕÐ¹™…Ñ¥Õ•M½É”€ô€Üì(€€€½¹ÍÐìÍÑ…Ñ”ô€ô…ÁÁ±ä¡…ÁÁ±åµ ¤°¥¹ÁÕÐ¤ì(€€€•áÁ•Ð¡ÍÑ…Ñ”¹‘•±½…‘M¹…ÁÍ¡½Ð¤¹Ñ½5…Ñ¡=‰©•Ð¡ì(€€€€€Ý••­9Õµ‰•Èè€Ô°(€€€€€ÕÉÉ•¹ÑA¡…Í”è€‰ÁÉ½É•ÍÍ¥½¸ˆ°(€€€€€™…Ñ¥Õ•M½É”è€Ü°(€€€€€…ÁÁ±¥•‘Ðè9=\°(€€€ô¤ì(€€€•áÁ•Ð¡ÍÑ…Ñ”¹‘•±½…‘M¹…ÁÍ¡½Ð¹Ý½É­½ÕÑÌ¤¹Ñ½ÅÕ…°¡‰…Í•MÑ…Ñ” ¤¹Ý½É­½ÕÑÌ¤ì(€ô¤ì((€¥Ð ‰É•©•ÑÌ„Í•½¹…ÁÁ±äƒŠP¹¼ƒ\À¸à×
È½µÁ½Õ¹‘¥¹œˆ°€ ¤€ôøì(€€€½¹ÍÐìÍÑ…Ñ”ô€ô…ÁÁ±ä¡…ÁÁ±åµ ¤¤ì(€€€•áÁ•Ñ!ÑÑÁÌ  ¤€ôø…ÁÁ±ä¡…ÁÁ±åµ ¤°ÍÑ…Ñ”¤°€‰™…¥±•µÁÉ•½¹‘¥Ñ¥½¸ˆ¤ì(€ô¤ì((€¥Ð ‰É•©•ÑÌ„ÍÑ…±”Ý••¬ÕÉÍ½Èˆ°€ ¤€ôøì(€€€•áÁ•Ñ!ÑÑÁÌ (€€€€€€ ¤€ôø…ÁÁ±ä¡…ÁÁ±åµ¡ì•áÁ•Ñ•‘]••­9Õµ‰•Èè€Ðô¤¤°(€€€€€€‰™…¥±•µÁÉ•½¹‘¥Ñ¥½¸ˆ(€€€€¤ì(€€€•áÁ•Ñ!ÑÑÁÌ (€€€€€€ ¤€ôø…ÁÁ±ä¡É•Ù•ÉÑµ¡ì•áÁ•Ñ•‘]••­9Õµ‰•Èè€Ðô¤¤°(€€€€€€‰™…¥±•µÁÉ•½¹‘¥Ñ¥½¸ˆ(€€€€¤ì(€ô¤ì((€¥Ð ‰É•Ù•ÉÐÉ•ÍÑ½É•ÌÑ¡”ÍÑ…Í •á…Ñ±ä…¹É•µ½Ù•Ì¥Ðˆ°€ ¤€ôøì(€€€½¹ÍÐ¥¹ÁÕÐ€ô‰…Í•MÑ…Ñ” ¤ì(€€€¥¹ÁÕÐ¹™…Ñ¥Õ•M½É”€ô€Üì(€€€½¹ÍÐìÍÑ…Ñ”è‘•±½…‘•ô€ô…ÁÁ±ä¡…ÁÁ±åµ ¤°¥¹ÁÕÐ¤ì(€€€½¹ÍÐìÍÑ…Ñ”èÉ•Ù•ÉÑ•ô€ô…ÁÁ±ä¡É•Ù•ÉÑµ ¤°‘•±½…‘•¤ì(€€€•áÁ•Ð¡É•Ù•ÉÑ•¹Ý½É­½ÕÑÌ¤¹Ñ½ÅÕ…°¡‰…Í•MÑ…Ñ” ¤¹Ý½É­½ÕÑÌ¤ì(€€€•áÁ•Ð¡É•Ù•ÉÑ•¹ÕÉÉ•¹ÑA¡…Í”¤¹Ñ½	” ‰ÁÉ½É•ÍÍ¥½¸ˆ¤ì(€€€•áÁ•Ð¡É•Ù•ÉÑ•¹™…Ñ¥Õ•M½É”¤¹Ñ½	” Ü¤ì(€€€•áÁ•Ð ‰‘•±½…‘M¹…ÁÍ¡½Ðˆ¥¸É•Ù•ÉÑ•¤¹Ñ½	”¡™…±Í”¤ì(€ô¤ì((€¥Ð ‰É•Ù•ÉÐÝ¥Ñ¡½ÕÐ„Í¹…ÁÍ¡½ÐÉ•©•ÑÌˆ°€ ¤€ôøì(€€€•áÁ•Ñ!ÑÑÁÌ  ¤€ôø…ÁÁ±ä¡É•Ù•ÉÑµ ¤¤°€‰™…¥±•µÁÉ•½¹‘¥Ñ¥½¸ˆ¤ì(€ô¤ì((€¥Ð ‰É•Ù•ÉÐÝ¥Ñ „Í¹…ÁÍ¡½Ð™É½´…¹½Ñ¡•ÈÝ••¬É•©•ÑÌ€¡¥¹•ÉÐ…™Ñ•ÈÉ½±±½Ù•È¤ˆ°€ ¤€ôøì(€€€½¹ÍÐìÍÑ…Ñ”è‘•±½…‘•ô€ô…ÁÁ±ä¡…ÁÁ±åµ ¤¤ì(€€€€¼¼M¥µÕ±…Ñ”„É½±±½Ù•ÈèÑ¡”ÕÉÍ½Èµ½Ù•½¸‰ÕÐÑ¡”ÍÑ…±”ÍÑ…Í É•µ…¥¹Ì¸(€€€½¹ÍÐÉ½±±•€ôì€¸¸¹‘•±½…‘•°Ý••­9Õµ‰•Èè€Ø°ÕÉÉ•¹ÑA¡…Í”è€‰ÁÉ½É•ÍÍ¥½¸ˆôì(€€€•áÁ•Ñ!ÑÑÁÌ (€€€€€€ ¤€ôø…ÁÁ±ä¡É•Ù•ÉÑµ¡ì•áÁ•Ñ•‘]••­9Õµ‰•Èè€Øô¤°É½±±•¤°(€€€€€€‰™…¥±•µÁÉ•½¹‘¥Ñ¥½¸ˆ(€€€€¤ì(€ô¤ì((€¥Ð ‰‘½•Ì¹½ÐµÕÑ…Ñ”Ñ¡”¥¹ÁÕÐÍÑ…Ñ”ˆ°€ ¤€ôøì(€€€½¹ÍÐ¥¹ÁÕÐ€ô‰…Í•MÑ…Ñ” ¤ì(€€€…ÁÁ±ä¡…ÁÁ±åµ ¤°¥¹ÁÕÐ¤ì(€€€•áÁ•Ð¡¥¹ÁÕÐ¹Ý½É­½ÕÑÍlÁt¹•á•É¥Í•ÍlÁt¤¹Ñ½5…Ñ¡=‰©•Ð¡ì(€€€€€Í•ÑÌè€Ì°(€€€€€Ý•¥¡Ðè€ÄÀÀ°(€€€ô¤ì(€€€•áÁ•Ð¡¥¹ÁÕÐ¹ÕÉÉ•¹ÑA¡…Í”¤¹Ñ½	” ‰ÁÉ½É•ÍÍ¥½¸ˆ¤ì(€€€•áÁ•Ð ‰‘•±½…‘M¹…ÁÍ¡½Ðˆ¥¸¥¹ÁÕÐ¤¹Ñ½	”¡™…±Í”¤ì(€ô¤ì)ô¤ì