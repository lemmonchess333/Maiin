/**
 * Cross-test: the client's Plate-Club rule IS the server's (ADR-0008 — pin
 * the running copies against each other, not against prose).
 *
 * `src/features/streaks/liftWeightMilestones.ts` exists so the badge can be
 * awarded the moment a workout saves; `functions/lib/badgeRules.js` awards
 * the same ids from `onWorkoutCreated`. Two copies of one rule is exactly
 * the drift this repo keeps re-fixing, so every part that could diverge is
 * asserted here against the server module loaded via createRequire:
 *
 *   1. the compound-lift id set, as a set;
 *   2. the threshold table, as literals;
 *   3. the predicate, over a fixture matrix that includes every server test
 *      case plus malformed input — both sides must return the same ids in
 *      the same order;
 *   4. the set projection — the client scores `setLogs` the way
 *      `projectWorkoutSets` will turn them into the doc the server scores.
 *
 * A threshold moved or a compound lift added on one side only fails here,
 * in the unit suite, on the PR.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import {
  COMPOUND_LIFT_IDS,
  LIFT_WEIGHT_MILESTONES,
  liftWeightMilestoneBadges,
  exercisesForLiftBadges,
} from "../liftWeightMilestones";

const require_ = createRequire(import.meta.url);
const server = require_("../../../../functions/lib/badgeRules") as {
  liftWeightMilestoneBadges: (exercises: unknown) => string[];
  LIFT_WEIGHT_MILESTONES: { id: string; minKg: number }[];
  COMPOUND_LIFT_IDS: Set<string>;
};
const setRecord = require_("../../../../functions/lib/workoutSetRecord") as {
  projectWorkoutSets: (
    logs:
      | { weight: number; reps: number; completed: boolean; type?: string }[]
      | undefined,
    planned: { sets: number; reps: number; weightKg: number }
  ) => { weightKg: number }[];
};

const ex = (exerciseId: string, ...kg: number[]) => ({
  exerciseId,
  sets: kg.map((weightKg) => ({ weightKg, reps: 5 })),
});

describe("Plate-Club rule — client copy is pinned to the server copy", () => {
  it("compound-lift ids are the same set", () => {
    expect([...COMPOUND_LIFT_IDS].sort()).toEqual(
      [...server.COMPOUND_LIFT_IDS].sort()
    );
  });

  it("thresholds are the same literals, in the same order", () => {
    expect(LIFT_WEIGHT_MILESTONES).toEqual(server.LIFT_WEIGHT_MILESTONES);
    // And the literals themselves, so a change on BOTH sides still has to
    // be a deliberate one — these are what the catalogue descriptions say.
    expect(LIFT_WEIGHT_MILESTONES).toEqual([
      { id: "plate_club", minKg: 60 },
      { id: "two_plate", minKg: 100 },
      { id: "three_plate", minKg: 140 },
    ]);
  });

  const matrix: [string, unknown][] = [
    ["nothing below 60 on a compound", [ex("bench-press", 40, 50)]],
    ["plate_club at exactly 60", [ex("squat", 60)]],
    ["every tier the heaviest set clears", [ex("deadlift", 100, 140)]],
    [
      "heaviest compound across exercises, not per exercise",
      [ex("bench-press", 80), ex("overhead-press", 50), ex("squat", 105, 95)],
    ],
    ["a non-compound never counts", [ex("barbell-curl", 140)]],
    ["compound with no sets", [{ exerciseId: "squat", sets: [] }]],
    ["just under a threshold", [ex("squat", 99.5)]],
    ["empty list", []],
    ["null", null],
    ["not an array", { exerciseId: "squat" }],
    ["null exercise entry", [null, ex("squat", 60)]],
    ["sets not an array", [{ exerciseId: "squat", sets: "60" }]],
    [
      "weight as a numeric string",
      [{ exerciseId: "squat", sets: [{ weightKg: "100" }] }],
    ],
    [
      "weight NaN / missing",
      [{ exerciseId: "squat", sets: [{ weightKg: NaN }, {}] }],
    ],
    ["negative weight", [ex("squat", -200)]],
  ];

  for (const [name, input] of matrix) {
    it(`predicate agrees with the server: ${name}`, () => {
      expect(
        liftWeightMilestoneBadges(
          input as Parameters<typeof liftWeightMilestoneBadges>[0]
        )
      ).toEqual(server.liftWeightMilestoneBadges(input));
    });
  }

  it("scores the sets the server will build from the same logs", () => {
    // Completed-only, weightKg = weight, positional against the day's
    // exercises — exactly projectWorkoutSets on the live-session path.
    const logs = [
      [
        { weight: 60, reps: 5, completed: true, type: "working" },
        { weight: 100, reps: 3, completed: false, type: "working" },
        { weight: 80, reps: 5, completed: true, type: "dropset" },
      ],
      [{ weight: 140, reps: 1, completed: true, type: "working" }],
    ];
    const exercises = [{ exerciseId: "squat" }, { exerciseId: "barbell-curl" }];
    const planned = { sets: 3, reps: 5, weightKg: 999 };

    const client = exercisesForLiftBadges(exercises, logs);
    const serverSets = logs.map((l) =>
      setRecord.projectWorkoutSets(l, planned).map((s) => s.weightKg)
    );
    expect(client.map((e) => e.sets!.map((s) => s.weightKg))).toEqual(
      serverSets
    );

    // And the verdict off those sets agrees: the 100 was not completed, the
    // 140 is on a curl, so the heaviest COMPOUND set is 80 → plate_club only.
    expect(liftWeightMilestoneBadges(client)).toEqual(["plate_club"]);
    expect(
      server.liftWeightMilestoneBadges(
        exercises.map((e, i) => ({
          ...e,
          sets: setRecord.projectWorkoutSets(logs[i], planned),
        }))
      )
    ).toEqual(["plate_club"]);
  });

  it("an exercise with no log array yields no sets (server would use planned — an under-award, never over)", () => {
    const client = exercisesForLiftBadges([{ exerciseId: "squat" }], []);
    expect(client[0].sets).toEqual([]);
    expect(liftWeightMilestoneBadges(client)).toEqual([]);
  });
});
