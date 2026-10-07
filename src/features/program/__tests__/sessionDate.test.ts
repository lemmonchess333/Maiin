/**
 * A session's history record carries the session's own local date (Lift3:
 * a session is dated by when it started), stamped where the record is made,
 * so the progression engine reads no clock. A late or offline save, or a
 * simulator stepping through weeks, gets the same plan whatever day the
 * clock says. Phase 1, item 3 of the training-engine pass.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { applySessionProgression } from "../sessionCompletion";
import { applySessionSets } from "../programEngine";
import { readSessionSets } from "../sessionSets";
import { normalizeProgramState, type ProgramState } from "../programTypes";

const plan = (): ProgramState =>
  normalizeProgramState({
    weekNumber: 2,
    goal: "recomp",
    currentPhase: "progression",
    splitType: "full_body",
    workouts: [
      {
        dayName: "Full body",
        dayType: "full_body",
        completed: false,
        exercises: [
          {
            instanceId: "squat-1",
            exerciseId: "squat",
            name: "Squat",
            movementCategory: "knee_dominant",
            sets: 3,
            reps: 5,
            weight: 100,
            progressionType: "linear",
          },
        ],
      },
    ],
    settings: { autoProgression: true, smallPlates: false },
    fatigueScore: 0,
    weekHistory: [],
    updatedAt: 0,
  } as unknown as ProgramState);

const SESSION_DATE = "2026-09-10";

/** The squat logged at 100 kg for these reps, one set each. */
function session(state: ProgramState, reps: number[]) {
  const lifts = state.workouts[0].exercises;
  return applySessionProgression(state, 0, {
    completionId: `session-${reps.join("-")}`,
    date: SESSION_DATE,
    prescription: { exercises: lifts, progressionBaseline: lifts },
    setLogs: [reps.map((r) => ({ weight: 100, reps: r, completed: true }))],
  });
}

const squat = (state: ProgramState) => state.workouts[0].exercises[0];
const lastRecord = (state: ProgramState) =>
  squat(state).performanceHistory?.at(-1);

/** Run on a clock set to a day far from the session's. */
function onAnotherDay<T>(run: () => T): T {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2031, 0, 1, 12));
  try {
    return run();
  } finally {
    vi.useRealTimers();
  }
}

afterEach(() => {
  vi.useRealTimers();
});

describe("a session's history record is dated by the session", () => {
  it.each([
    ["a step (every set at the target)", [5, 5, 5]],
    ["a hold (some sets short)", [5, 5, 4]],
    ["a miss (every set short)", [4, 4, 4]],
  ])(
    "stamps the session's date on %s, whatever day the clock says",
    (_label, reps) => {
      const after = onAnotherDay(() => session(plan(), reps));
      expect(lastRecord(after)?.date).toBe(SESSION_DATE);
    }
  );

  it("gives the same plan on any day", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 8, 10, 12));
    const sameDay = session(plan(), [5, 5, 4]);
    vi.useRealTimers();
    const later = onAnotherDay(() => session(plan(), [5, 5, 4]));
    expect(JSON.stringify(later)).toBe(JSON.stringify(sameDay));
  });

  it("lets the engine be called directly with the session's date", () => {
    const read = readSessionSets(
      [5, 5, 5].map((reps) => ({ weight: 100, reps, completed: true })),
      3
    );
    expect(read).not.toBeNull();
    const next = onAnotherDay(() =>
      applySessionSets(squat(plan()), read!, false, 1, SESSION_DATE)
    );
    expect(next.performanceHistory?.at(-1)?.date).toBe(SESSION_DATE);
  });
});
