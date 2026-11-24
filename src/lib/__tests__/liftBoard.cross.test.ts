/**
 * Lift boards, client and server (Run30 call 3; ADR-0008). The server
 * decides which lifts have a board and which set of a workout goes on one
 * (functions/lib/liftBoards.js, which the workout triggers require); the
 * app decides when to show the board and draws your own row from your own
 * workouts. If the two drift, a lift's page asks for a board the callable
 * refuses, or your row ranks a set the server would never count.
 */
import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { EXERCISES } from "../exercises";
import {
  LIFT_BOARD_EXERCISE_IDS,
  MAX_LOAD_KG,
  heaviestSet,
  hasLiftBoard,
} from "../liftBoard";

const require_ = createRequire(import.meta.url);
const server = require_("../../../functions/lib/liftBoards") as {
  BOARD_LIFTS: Record<string, string>;
  BOARD_LIFT_IDS: string[];
  MAX_LOAD_KG: number;
  isBoardLift: (id: unknown) => boolean;
  heaviestSet: (sets: unknown[]) => { weightKg: number; reps: number } | null;
};

describe("lift boards: client and server agree", () => {
  it("have a board for the same lifts: every barbell exercise in the catalogue", () => {
    expect([...LIFT_BOARD_EXERCISE_IDS].sort()).toEqual(
      [...server.BOARD_LIFT_IDS].sort()
    );
    expect(LIFT_BOARD_EXERCISE_IDS.length).toBeGreaterThan(20);
    for (const id of LIFT_BOARD_EXERCISE_IDS) {
      expect(hasLiftBoard(id)).toBe(true);
      expect(server.isBoardLift(id)).toBe(true);
    }
    for (const e of EXERCISES.filter((x) => x.equipment !== "Barbell")) {
      expect(hasLiftBoard(e.id), e.id).toBe(false);
      expect(server.isBoardLift(e.id), e.id).toBe(false);
    }
  });

  it("name each lift as the catalogue does, for workouts saved without an id", () => {
    for (const id of LIFT_BOARD_EXERCISE_IDS)
      expect(server.BOARD_LIFTS[id]).toBe(
        EXERCISES.find((e) => e.id === id)?.name
      );
  });

  it("count the same set", () => {
    expect(MAX_LOAD_KG).toBe(server.MAX_LOAD_KG);
    const cases = [
      [],
      [
        { weightKg: 100, reps: 1 },
        { weightKg: 100, reps: 3 },
      ],
      [
        { weightKg: 140, reps: 2, type: "warmup" },
        { weightKg: 90, reps: 8 },
      ],
      [
        { weightKg: 140, reps: 0 },
        { weightKg: 0, reps: 10 },
      ],
      [
        { weightKg: MAX_LOAD_KG + 0.5, reps: 1 },
        { weightKg: 60, reps: 2.7 },
      ],
      [
        { weightKg: MAX_LOAD_KG, reps: 1 },
        { weightKg: 62.5, reps: 5 },
      ],
      [
        { weightKg: Number.NaN, reps: 5 },
        { weightKg: 50, reps: Number.NaN },
      ],
    ];
    for (const sets of cases)
      expect(heaviestSet(sets), JSON.stringify(sets)).toEqual(
        server.heaviestSet(sets)
      );
  });
});
