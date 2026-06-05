import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  PROGRAM_STATE_KEYS,
  MAX_PROGRAM_STATE_BYTES,
  sanitizeProgramState,
  programStateTooLarge,
} = require("../lib/programStateSanitizer");

// A representative buildPlan() output — every key here is legitimate and must
// pass through untouched. If a future buildPlan field is added without
// updating PROGRAM_STATE_KEYS, this test fails (the "silently dropped" guard).
const realProgramState = {
  goal: "lean bulk",
  currentPhase: "Hypertrophy",
  weekNumber: 1,
  splitType: "upper_lower",
  workouts: [
    { dayName: "Upper", dayType: "lift", exercises: [], completed: false },
  ],
  fatigueScore: 0,
  updatedAt: 1717_000_000_000,
  settings: { autoProgression: true, microloading: true },
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
      templateId: "ppl_4day",
    };
    const { value, dropped } = sanitizeProgramState(withOptionals);
    expect(dropped).toEqual([]);
    expect(value.manualCompletions).toEqual({ "run-1": { at: 1 } });
    expect(value.templateId).toBe("ppl_4day");
  });

  it("leaves nested values untouched (only top-level is allow-listed)", () => {
    const { value } = sanitizeProgramState({
      ...realProgramState,
      // a junk nested field inside a legit object is NOT stripped — the engine
      // reads specific fields; top-level injection + bloat is the real vector.
      settings: { autoProgression: true, microloading: true, junk: 1 },
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
