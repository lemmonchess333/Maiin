/**
 * The word filter over a feed post: every text the feed card shows a
 * follower is read, not only the caption and the session's name.
 */
import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  ACTIVITY_MAX_BYTES,
  ACTIVITY_TEXT_FIELDS,
  flaggedActivityField,
  objectionableActivityField,
} = require("../lib/activityModeration");
const { storedSize } = require("../lib/storedSize");

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

describe("flaggedActivityField", () => {
  /** The largest post the app can write: fifty exercise rows as liftPost
   *  builds them, a hundred route points, every text field at its cap and
   *  the longest photo URL. */
  const LARGEST = {
    ...CLEAN,
    authorName: "a".repeat(50),
    authorPhotoURL: `https://firebasestorage.googleapis.com/v0/b/adaptive-fitness-af8bb.firebasestorage.app/o/profile-photos%2F${"u".repeat(1900)}`,
    activityTitle: "t".repeat(200),
    workoutName: "t".repeat(200),
    runName: "t".repeat(200),
    caption: "c".repeat(140),
    prExercise: "p".repeat(200),
    challengeMilestone: "m".repeat(200),
    badgeEarned: "b".repeat(200),
    exerciseCount: 50,
    totalVolume: 12000,
    duration: 5400,
    muscleGroups: Array.from({ length: 20 }, (_, i) => `category_${i}`),
    exercises: Array.from({ length: 50 }, (_, i) => ({
      name: `Single-arm dumbbell row variation ${i}`,
      exerciseId: `single-arm-dumbbell-row-variation-${i}`,
      summary: "3×10×32.5 kg",
      setCount: 3,
      targetReps: 10,
      targetWeightKg: 32.5,
      superset: 2,
    })),
    routePreview: Array.from({ length: 100 }, (_, i) => ({
      lat: 51.5 + i / 1000,
      lon: -0.12 - i / 1000,
      breakBefore: true,
    })),
  };

  it("passes the largest post the app writes, with room to spare", () => {
    expect(flaggedActivityField(LARGEST)).toBeNull();
    expect(storedSize(LARGEST)).toBeLessThan(ACTIVITY_MAX_BYTES / 3);
  });

  it("holds a post past the limit, whatever field carries the weight", () => {
    const heavy = "y".repeat(9000);
    for (const post of [
      { ...CLEAN, exercises: Array(50).fill({ name: heavy }) },
      {
        ...CLEAN,
        routePreview: Array(100).fill({ lat: 0, lon: 0, note: heavy }),
      },
    ]) {
      expect(flaggedActivityField(post)).toBe("size");
    }
  });

  it("names the word filter's field for a post within the limit", () => {
    expect(flaggedActivityField({ ...CLEAN, caption: "shit head" })).toBe(
      "caption"
    );
    expect(flaggedActivityField(CLEAN)).toBeNull();
  });
});
