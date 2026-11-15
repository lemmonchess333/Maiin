import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  PROGRAM_STATE_KEYS,
  RETIRED_PROGRAM_STATE_KEYS,
  RETIRED_PROGRAM_STATE_SUBKEYS,
  MAX_PROGRAM_STATE_BYTES,
  sanitizeProgramState,
  programStateTooLarge,
} = require("../lib/programStateSanitizer");

// A representative buildPlan() output — every key here is legitimate and must
// pass through untouched.
//
// This fixture does NOT guard against a new ProgramState field missing from
// PROGRAM_STATE_KEYS, despite the comment that used to claim it did. The
// fixture is hand-maintained too, so a field added to the interface and to
// neither the fixture nor the key set stayed green — which is exactly how
// `plateauResponses` shipped unlisted and made the deload button throw
// invalid-argument for every user who had rolled a week. A fixture cannot pin
// a type. That pin lives in `programStateKeyParity.test.js`, which derives the
// expected key set from the ProgramState interface itself.
const realProgramState = {
  goal: "lean bulk",
  currentPhase: "Hypertrophy",
  weekNumber: 1,
  splitType: "upper_lower",
  workouts: [
    { dayName: "Upper", dayType: "lift", exercises: [], completed: false },
  ],
  updatedAt: 1717_000_000_000,
  settings: { autoProgression: true, smallPlates: true },
  weekHistory: [],
  runDays: [],
  runPlan: { phase: null },
  primaryGoal: "hypertrophy",
  programSchemaVersion: 2,
};

describe("sanitizeProgramState", () => {
  it("passes a real buildPlan programState through unchanged (no drops)", () => {
    const { value, dropped } = sanitizeProgramState(realProgramState);
    expect(dropped).toEqual([]);
    expect(value).toEqual(realProgramState);
  });

  it("strips injected non-schema top-level keys and reports them", () => {
    const { value, dropped } = sanitizeProgramState({
      ...realProgramState,
      note: "https://tracker/uid=victim",
      __proto_inject: { a: 1 },
      bloat: "x".repeat(100),
    });
    expect(dropped.sort()).toEqual(["__proto_inject", "bloat", "note"]);
    expect(value.note).toBeUndefined();
    expect(value.bloat).toBeUndefined();
    expect(value.goal).toBe("lean bulk"); // legit field preserved
  });

  it("keeps all canonical optional/server-set keys", () => {
    const withOptionals = {
      ...realProgramState,
      nextWorkoutOverride: 2,
      manualCompletions: { "run-1": { at: 1 } },
      pendingFellBehindPrompt: {
        weekKey: "2026-06-01",
        completedRatio: 0.25,
        realRunCount: 1,
        weeklyTarget: 4,
      },
      // PROGRAM-DELOAD-01: without this key in the allow-list the
      // command transaction's own sanitizer would strip the stash it
      // just wrote and undo would always fail.
      deloadSnapshot: {
        weekNumber: 5,
        workouts: [],
        currentPhase: "progression",
        appliedAt: 1000,
      },
    };
    const { value, dropped } = sanitizeProgramState(withOptionals);
    expect(dropped).toEqual([]);
    expect(value).toEqual(withOptionals);
  });

  it("leaves nested values untouched (only top-level is allow-listed)", () => {
    const { value } = sanitizeProgramState({
      ...realProgramState,
      // a junk nested field inside a legit object is NOT stripped — the engine
      // reads specific fields; top-level injection + bloat is the real vector.
      settings: { autoProgression: true, smallPlates: true, junk: 1 },
    });
    expect(value.settings.junk).toBe(1);
  });

  it("returns non-object input unchanged with no drops", () => {
    expect(sanitizeProgramState(null)).toEqual({ value: null, dropped: [] });
    expect(sanitizeProgramState(undefined)).toEqual({
      value: undefined,
      dropped: [],
    });
    expect(sanitizeProgramState([1, 2])).toEqual({
      value: [1, 2],
      dropped: [],
    });
  });

  it("PROGRAM_STATE_KEYS covers every key in a real programState", () => {
    for (const key of Object.keys(realProgramState)) {
      expect(PROGRAM_STATE_KEYS.has(key)).toBe(true);
    }
  });

  // PROGRAM-BLOCK-02. The fixture above can't cover this: `trainingBlock` is
  // client-written and never appears in a buildPlan output, so the
  // covers-every-key test would still pass with the key missing. The two
  // server paths that round-trip a whole programState fail in OPPOSITE
  // directions without it — applyProgramCommand rejects the command outright
  // (the deload button throws for every block user), configurePlan warns and
  // drops (the block silently disappears on every settings save) — so the
  // property worth pinning is simply that the field survives a round trip.
  it("carries an active trainingBlock through untouched", () => {
    const withBlock = {
      ...realProgramState,
      trainingBlock: {
        id: "2026-08-01-1754035200000",
        owned: true,
        focus: "strength",
        pace: "full",
        durationWeeks: 8,
        startDate: "2026-08-01",
        goalBefore: "hypertrophy",
        weeklyLiftTarget: 4,
        anchorExerciseIds: ["squat"],
        why: "",
        createdAt: 1754035200000,
        schemaVersion: 1,
      },
    };
    const { value, dropped } = sanitizeProgramState(withBlock);
    expect(dropped).toEqual([]);
    expect(value.trainingBlock).toEqual(withBlock.trainingBlock);
  });
});

// App1 Q24. Stored plans carry these until the strip script has run, and
// an app from before the change still writes `fatigueScore`. Reported as
// dropped, any one would make applyProgramCommand refuse every command on
// that plan, so each goes silently.
describe("retired keys", () => {
  const stored = () => ({
    ...realProgramState,
    fatigueScore: 7,
    plateauResponses: 2,
    templateId: "ppl_4day",
    recoveringMuscles: ["Chest"],
    settings: { autoProgression: true, smallPlates: true, microloading: true },
    trainingBlock: { id: "b1", owned: true, amnestyWeeksLeft: 3 },
    deloadSnapshot: {
      weekNumber: 1,
      workouts: [],
      currentPhase: "progression",
      fatigueScore: 7,
      appliedAt: 1000,
    },
    runDays: [{ id: "r1", dayIndex: 1, templateId: "easy_30" }],
  });

  it("deletes each one without reporting it as dropped", () => {
    const { value, dropped } = sanitizeProgramState(stored());
    expect(dropped).toEqual([]);
    for (const key of RETIRED_PROGRAM_STATE_KEYS) {
      expect(key in value, key).toBe(false);
    }
    for (const [parent, keys] of Object.entries(
      RETIRED_PROGRAM_STATE_SUBKEYS
    )) {
      for (const key of keys) {
        expect(key in value[parent], `${parent}.${key}`).toBe(false);
      }
    }
  });

  it("keeps everything else in the objects it reaches into", () => {
    const { value } = sanitizeProgramState(stored());
    expect(value.settings).toEqual({
      autoProgression: true,
      smallPlates: true,
    });
    expect(value.trainingBlock).toEqual({ id: "b1", owned: true });
    expect(value.deloadSnapshot).toEqual({
      weekNumber: 1,
      workouts: [],
      currentPhase: "progression",
      appliedAt: 1000,
    });
  });

  it("never touches a run day's templateId, which is live", () => {
    const { value } = sanitizeProgramState(stored());
    expect(value.runDays).toEqual([
      { id: "r1", dayIndex: 1, templateId: "easy_30" },
    ]);
  });

  it("leaves the input as it was", () => {
    const input = stored();
    sanitizeProgramState(input);
    expect(input).toEqual(stored());
  });

  it("are never also allow-listed", () => {
    for (const key of RETIRED_PROGRAM_STATE_KEYS) {
      expect(PROGRAM_STATE_KEYS.has(key), key).toBe(false);
    }
    for (const parent of Object.keys(RETIRED_PROGRAM_STATE_SUBKEYS)) {
      expect(PROGRAM_STATE_KEYS.has(parent), parent).toBe(true);
    }
  });
});

describe("programStateTooLarge", () => {
  it("is false for a normal program", () => {
    expect(programStateTooLarge(realProgramState)).toBe(false);
  });

  it("is true past the ceiling", () => {
    const huge = {
      ...realProgramState,
      weekHistory: [{ note: "x".repeat(MAX_PROGRAM_STATE_BYTES + 1) }],
    };
    expect(programStateTooLarge(huge)).toBe(true);
  });

  it("rejects non-serialisable (circular) input", () => {
    const circular = { ...realProgramState };
    circular.self = circular;
    expect(programStateTooLarge(circular)).toBe(true);
  });
});
