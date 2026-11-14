/**
 * A stored plan that still carries a retired key (App1 Q24) goes through a
 * programme command cleanly, and comes out without it.
 *
 * `runProgramCommandTransaction` refuses the whole command when the
 * sanitiser reports a dropped key ("Programme command produced invalid
 * state"). Taking these keys off PROGRAM_STATE_KEYS without the retired list
 * would have made every command refuse on every plan written before the
 * change, which is every plan: they all carry `fatigueScore`. This drives the
 * real transaction against the in-memory Firestore, whose `set` here refuses
 * `undefined` as the Admin SDK's does.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { memoryFirestore } = require("./helpers/memoryFirestore.cjs");
const {
  runProgramCommandTransaction,
} = require("../lib/programCommandTransaction");
const {
  RETIRED_PROGRAM_STATE_KEYS,
  RETIRED_PROGRAM_STATE_SUBKEYS,
} = require("../lib/programStateSanitizer");

const UID = "u1";
const PROGRAM = `users/${UID}/programState/current`;
const NOW = Date.parse("2026-11-13T12:00:00Z");

/** Paths in `value` that hold `undefined`. */
function undefinedPaths(value, path = "") {
  if (value === undefined) return [path];
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, child]) =>
    undefinedPaths(child, path ? `${path}.${key}` : key)
  );
}

/** The fake, with a `set` that refuses `undefined` as the Admin SDK does. */
function adminLikeFirestore(seed) {
  const fs = memoryFirestore(seed);
  const runTransaction = fs.runTransaction;
  fs.runTransaction = (fn) =>
    runTransaction((tx) =>
      fn({
        ...tx,
        set: (ref, value, options) => {
          const bad = undefinedPaths(value);
          if (bad.length > 0)
            throw new Error(
              `Cannot use "undefined" as a Firestore value (found in field "${bad[0]}")`
            );
          return tx.set(ref, value, options);
        },
      })
    );
  return fs;
}

function plan() {
  return {
    goal: "recomp",
    currentPhase: "progression",
    weekNumber: 5,
    splitType: "upper_lower",
    updatedAt: 1000,
    settings: { autoProgression: true, smallPlates: false },
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
            exerciseId: "bench-press",
            instanceId: "inst-a",
            movementCategory: "horizontal_push",
            sets: 3,
            reps: 8,
            weight: 100,
          },
        ],
      },
    ],
    runDays: [
      {
        id: "runday_2026-11-09_2_easy_30",
        dayIndex: 2,
        date: "2026-11-11",
        weekKey: "2026-11-09",
        templateId: "easy_30",
        status: "planned",
        completed: false,
      },
    ],
    programSchemaVersion: 6,
  };
}

/** A plan as one written before the change is stored. */
function storedBefore() {
  return {
    ...plan(),
    fatigueScore: 12,
    plateauResponses: 1,
    templateId: "ppl_4day",
    recoveringMuscles: ["Chest"],
    settings: { autoProgression: true, smallPlates: false, microloading: true },
    trainingBlock: {
      id: "2026-11-02-1",
      owned: true,
      focus: "strength",
      pace: "full",
      durationWeeks: 8,
      startDate: "2026-11-02",
      goalBefore: "strength",
      amnestyWeeksLeft: 3,
      weeklyLiftTarget: 1,
      anchorExerciseIds: [],
      why: "",
      createdAt: 1,
      schemaVersion: 1,
    },
  };
}

function expectNoRetiredKeys(doc) {
  for (const key of RETIRED_PROGRAM_STATE_KEYS) {
    expect(key in doc, key).toBe(false);
  }
  for (const [parent, keys] of Object.entries(RETIRED_PROGRAM_STATE_SUBKEYS)) {
    if (!doc[parent]) continue;
    for (const key of keys) {
      expect(key in doc[parent], `${parent}.${key}`).toBe(false);
    }
  }
}

async function run(fs, command) {
  return runProgramCommandTransaction({
    firestore: fs,
    uid: UID,
    command,
    now: NOW,
  });
}

describe("a stored plan carrying retired keys (App1 Q24)", () => {
  it("takes a command, and is written back without them", async () => {
    const fs = adminLikeFirestore({ [PROGRAM]: storedBefore() });
    await run(fs, {
      kind: "setProgramSettings",
      commandId: "cmd_settings0123456789",
      settings: { autoProgression: false, smallPlates: true },
    });
    const stored = fs.data.get(PROGRAM);
    expectNoRetiredKeys(stored);
    expect(stored.settings).toEqual({
      autoProgression: false,
      smallPlates: true,
    });
    // Everything else is as it was, the block and a run day's template
    // among it.
    expect(stored.trainingBlock.focus).toBe("strength");
    expect(stored.runDays[0].templateId).toBe("easy_30");
    expect(stored.workouts[0].exercises[0].weight).toBe(100);
  });

  it("applies and undoes a deload, with nothing undefined written", async () => {
    const fs = adminLikeFirestore({ [PROGRAM]: storedBefore() });
    await run(fs, {
      kind: "applyDeloadWeek",
      commandId: "cmd_deload0123456789a",
      expectedWeekNumber: 5,
    });
    const deloaded = fs.data.get(PROGRAM);
    expect(deloaded.currentPhase).toBe("deload");
    expectNoRetiredKeys(deloaded);

    await run(fs, {
      kind: "revertDeloadWeek",
      commandId: "cmd_revert0123456789a",
      expectedWeekNumber: 5,
    });
    const reverted = fs.data.get(PROGRAM);
    expect(reverted.currentPhase).toBe("progression");
    expect(reverted.workouts).toEqual(plan().workouts);
    expect("deloadSnapshot" in reverted).toBe(false);
    expectNoRetiredKeys(reverted);
  });

  it("undoes a deload whose snapshot was taken before the change", async () => {
    // The old deload copied `fatigueScore` into its snapshot and set the
    // plan's own to 0; its undo wrote the snapshot's back.
    const before = plan();
    const fs = adminLikeFirestore({
      [PROGRAM]: {
        ...storedBefore(),
        currentPhase: "deload",
        fatigueScore: 0,
        workouts: before.workouts.map((day) => ({
          ...day,
          exercises: day.exercises.map((ex) => ({ ...ex, sets: 2 })),
        })),
        deloadSnapshot: {
          weekNumber: 5,
          workouts: before.workouts,
          runDays: before.runDays,
          currentPhase: "progression",
          fatigueScore: 12,
          appliedAt: NOW - 1000,
        },
      },
    });
    await run(fs, {
      kind: "revertDeloadWeek",
      commandId: "cmd_revertold0123456",
      expectedWeekNumber: 5,
    });
    const reverted = fs.data.get(PROGRAM);
    expect(reverted.currentPhase).toBe("progression");
    expect(reverted.workouts).toEqual(before.workouts);
    expect("deloadSnapshot" in reverted).toBe(false);
    expectNoRetiredKeys(reverted);
  });

  it("a plan with none of them goes through the deload and back", async () => {
    const fs = adminLikeFirestore({ [PROGRAM]: plan() });
    await run(fs, {
      kind: "applyDeloadWeek",
      commandId: "cmd_deloadnew01234567",
      expectedWeekNumber: 5,
    });
    expect("fatigueScore" in fs.data.get(PROGRAM).deloadSnapshot).toBe(false);
    await run(fs, {
      kind: "revertDeloadWeek",
      commandId: "cmd_revertnew01234567",
      expectedWeekNumber: 5,
    });
    expect(fs.data.get(PROGRAM).workouts).toEqual(plan().workouts);
  });
});
