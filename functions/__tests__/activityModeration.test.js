/**
 * The word filter over a feed post: every text the feed card shows a
 * follower is read, not only the caption and the session's name.
 */
import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  ACTIVITY_TEXT_FIELDS,
  objectionableActivityField,
} = require("../lib/activityModeration");

const CLEAN = {
  authorId: "alice",
  authorName: "Alice",
  type: "workout",
  visibility: "public",
  activityTitle: "Push",
  workoutName: "Push",
  caption: "Felt strong today",
  avgPace: 312,
  muscleGroups: ["horizontal_push", "arms_triceps"],
  exercises: [
    { name: "Bench press", summary: "3×8×60 kg", setCount: 3 },
    { name: "Dips", summary: "3×10 BW" },
  ],
};

describe("objectionableActivityField", () => {
  it("passes a post the app writes", () => {
    expect(objectionableActivityField(CLEAN)).toBeNull();
  });

  it.each([
    "authorName",
    "activityTitle",
    "workoutName",
    "runName",
    "caption",
    "prExercise",
    "challengeMilestone",
    "badgeEarned",
    "avgPace",
  ])("names %s when its text trips the filter", (field) => {
    expect(objectionableActivityField({ ...CLEAN, [field]: "shit head" })).toBe(
      field
    );
  });

  it("reads the same fields it lists", () => {
    expect([...ACTIVITY_TEXT_FIELDS].sort()).toEqual(
      [
        "activityTitle",
        "authorName",
        "avgPace",
        "badgeEarned",
        "caption",
        "challengeMilestone",
        "prExercise",
        "runName",
        "workoutName",
      ].sort()
    );
  });

  it("reads each exercise row's name and summary, in every stored shape", () => {
    for (const exercises of [
      [{ name: "shit head", summary: "3×8" }],
      [{ name: "Bench press", summary: "shit head" }],
      [{ name: "Squat", sets: 3, reps: 5, weightKg: 100 }, { name: "shit" }],
      ["shit head"],
    ]) {
      expect(objectionableActivityField({ ...CLEAN, exercises })).toBe(
        "exercises"
      );
    }
  });

  it("reads a muscle group as the card spells it", () => {
    expect(
      objectionableActivityField({ ...CLEAN, muscleGroups: ["shit_head"] })
    ).toBe("muscleGroups");
  });

  it("leaves numbers, maps and malformed lists alone", () => {
    expect(
      objectionableActivityField({
        ...CLEAN,
        avgPace: 300,
        exercises: [null, 42, { name: 7 }],
        muscleGroups: [null, 3],
      })
    ).toBeNull();
    expect(objectionableActivityField(null)).toBeNull();
  });
});
