/**
 * The 8-rep floor is for easy bodyweight lifts only (`roleTable.ts`): push-
 * ups, squats, lunges, bridges, calf raises and the trunk's floor work.
 * Most people can't do 8 pull-ups, dips or pistols, so those keep the
 * table's low reps. Every bodyweight exercise in the catalogue is one or
 * the other, and the server's role table floors the same ones.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { EXERCISES } from "@/lib/exercises";
import {
  EASY_BODYWEIGHT_EXERCISE_IDS,
  HARD_BODYWEIGHT_EXERCISE_IDS,
  roleRepsFor,
} from "../roleTable";

const require = createRequire(import.meta.url);
const cf = require("../../../../functions/lib/roleTable") as {
  EASY_BODYWEIGHT_EXERCISE_IDS: readonly string[];
};

describe("easy and hard bodyweight lifts", () => {
  it("decides every bodyweight exercise in the catalogue, one way or the other", () => {
    for (const ex of EXERCISES.filter((e) => e.equipment === "Bodyweight")) {
      const easy = EASY_BODYWEIGHT_EXERCISE_IDS.has(ex.id);
      const hard = HARD_BODYWEIGHT_EXERCISE_IDS.has(ex.id);
      expect(easy !== hard, ex.id).toBe(true);
    }
    for (const id of [
      ...EASY_BODYWEIGHT_EXERCISE_IDS,
      ...HARD_BODYWEIGHT_EXERCISE_IDS,
    ])
      expect(EXERCISES.find((e) => e.id === id)?.equipment, id).toBe(
        "Bodyweight"
      );
  });

  it("is the same easy list on the server", () => {
    expect([...cf.EASY_BODYWEIGHT_EXERCISE_IDS].sort()).toEqual(
      [...EASY_BODYWEIGHT_EXERCISE_IDS].sort()
    );
  });

  it("starts push-ups at 8, and leaves pull-ups their low reps", () => {
    const row = (exerciseId: string) =>
      roleRepsFor("strength", { exerciseId }, "intermediate");
    expect(row("push-ups").bottom).toBe(8);
    expect(row("bodyweight-squat").bottom).toBe(8);
    for (const hard of ["pull-ups", "chin-ups", "dips", "pistol-squat"])
      expect(row(hard).bottom, hard).toBe(5);
  });
});
