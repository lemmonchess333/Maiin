import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

import { EXERCISES } from "@/lib/exercises";
import {
  TIMED_EXERCISE_IDS,
  repUnitForExerciseId,
  isTimedExerciseId,
} from "../repUnits";

/**
 * Data-mirror pin: functions/lib/timedExerciseIds.js is the server copy of
 * repUnits.ts (the CommonJS runtime can't require the Vite/TS catalogue).
 *
 * This is here because the mirror HAD drifted, in the direction that says
 * a test was the only thing missing. `repUnitsCatalogue.test.ts` ties the
 * CLIENT set to the catalogue, and its header records the drift it caught:
 * L-Sit says "hold for time" in its own instructions, was absent from the
 * set, and so a swap prescribed "3 × 10" — ten reps of a hold. That fix
 * added `l-sit` and `farmers-carry` to the client set. The server set kept
 * its original four, and nothing noticed, because it was a private
 * `const` inside programCommands.js that no test could reach.
 *
 * So the server reducer would have re-prescribed a swapped-in L-sit as ten
 * reps — the exact bug, still live, on the copy nobody was looking at.
 * CLAUDE.md's #1 recurring mistake and ADR-0008's reachability rule, in
 * one artefact.
 *
 * Set equality is asserted rather than coverage in one direction: an
 * over-broad server list passes a "contains everything the client has"
 * check while silently making an ordinary exercise timed, which costs the
 * same as the omission.
 */
const require = createRequire(import.meta.url);
const cf = require("../../../../functions/lib/timedExerciseIds") as {
  TIMED_EXERCISE_IDS: string[];
  repUnitForExerciseId: (id: string | undefined) => "seconds" | undefined;
  isTimedExerciseId: (id: string | undefined) => boolean;
};

describe("timed id set CF ↔ client parity", () => {
  it("the two sets are equal", () => {
    expect([...cf.TIMED_EXERCISE_IDS].sort()).toEqual(
      [...TIMED_EXERCISE_IDS].sort()
    );
  });

  it("every id names a real catalogue exercise", () => {
    /* Set equality alone is satisfied by two identical sets of typos —
       which would read as "no exercise is timed" rather than failing. */
    const catalogue = new Set(EXERCISES.map((e) => e.id));
    for (const id of cf.TIMED_EXERCISE_IDS) {
      expect(catalogue.has(id), `${id} is not in the catalogue`).toBe(true);
    }
  });

  it("agrees per id across the whole catalogue, not just its own members", () => {
    for (const e of EXERCISES) {
      expect(cf.isTimedExerciseId(e.id), e.id).toBe(isTimedExerciseId(e.id));
      expect(cf.repUnitForExerciseId(e.id), e.id).toBe(
        repUnitForExerciseId(e.id)
      );
    }
  });

  it("agrees on the inputs that reach it as absent or unknown", () => {
    /* The server copy read `TIMED_EXERCISE_IDS.has(exerciseId)` with no
       falsy guard while the client short-circuits on one. Same answer, but
       only because Set.has(undefined) is false — worth pinning rather than
       relying on. */
    for (const id of [undefined, "", "not-a-real-id"]) {
      expect(cf.isTimedExerciseId(id)).toBe(isTimedExerciseId(id));
      expect(cf.repUnitForExerciseId(id)).toBe(repUnitForExerciseId(id));
    }
  });
});
