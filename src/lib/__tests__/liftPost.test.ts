import { describe, expect, it } from "vitest";
import {
  liftPost,
  liftPostPreview,
  liftPostRows,
  postedExercises,
  type LiftForPost,
} from "../liftPost";
import type { WorkoutExercise } from "../savedWorkouts";
import { group } from "@/test/localeGrouping";

/**
 * A lift's feed post. Every lift post is built here, from the saved
 * workout, so it says what was done; and the feed card reads every shape
 * of post the feed has ever held through `liftPostRows`.
 */

const set = (reps: number, weightKg: number) => ({
  setNumber: 1,
  reps,
  weightKg,
});

const exercise = (
  exerciseName: string,
  sets: { setNumber: number; reps: number; weightKg: number }[],
  extra: Partial<WorkoutExercise> = {}
): WorkoutExercise => ({
  exerciseId: extra.exerciseId ?? exerciseName.toLowerCase(),
  exerciseName,
  category: "horizontal_push",
  sets,
  caloriesBurned: 0,
  ...extra,
});

const BENCH = exercise("Bench Press", [set(8, 60), set(8, 60), set(6, 60)], {
  exerciseId: "bench-press",
});
/* Left out on the day: in the workout, with no sets. */
const CURL = exercise("Curl", [], { category: "arms" });
/* A timed hold: its "reps" are seconds, and it moves no weight. */
const PLANK = exercise("Weighted Plank", [set(60, 20), set(60, 20)], {
  exerciseId: "weighted-plank",
  category: "core",
  repUnit: "seconds",
});

const LIFT: LiftForPost = {
  title: "Push",
  exercises: [BENCH, CURL, PLANK],
  durationMinutes: 52,
};

const AUTHOR = { uid: "u1", displayName: "Alex", photoURL: null };

describe("liftPost", () => {
  it("lists what was done, not the plan", () => {
    const post = liftPost(AUTHOR, LIFT, { visibility: "followers" });
    expect(post.exerciseCount).toBe(2);
    expect(post.exercises?.map((ex) => ex.name)).toEqual([
      "Bench Press",
      "Weighted Plank",
    ]);
    expect(post.muscleGroups).toEqual(["horizontal_push", "core"]);
  });

  it("gives every row its figures and the summary the feed card draws", () => {
    const [bench, plank] = postedExercises(LIFT.exercises);
    expect(bench).toEqual({
      name: "Bench Press",
      exerciseId: "bench-press",
      summary: "3×8×60 kg",
      setCount: 3,
      targetReps: 8,
      targetWeightKg: 60,
    });
    expect(plank.summary).toBe("2×60 s × 20 kg");
  });

  it("counts weight moved, which a timed hold has none of", () => {
    const post = liftPost(AUTHOR, LIFT, { visibility: "public" });
    expect(post.totalVolume).toBe(8 * 60 + 8 * 60 + 6 * 60);
    expect(post.duration).toBe(52 * 60);
  });

  it("names the author and keeps a caption only when there is one", () => {
    const quiet = liftPost(AUTHOR, LIFT, {
      visibility: "public",
      caption: "   ",
    });
    expect(quiet).not.toHaveProperty("caption");
    expect(quiet).not.toHaveProperty("authorPhotoURL");
    expect(quiet).toMatchObject({
      authorId: "u1",
      authorName: "Alex",
      type: "workout",
      visibility: "public",
      workoutName: "Push",
      activityTitle: "Push",
    });
    const said = liftPost(
      { uid: "u1", displayName: "", photoURL: "https://img/a.png" },
      LIFT,
      { visibility: "followers", caption: " Heavy day " }
    );
    expect(said).toMatchObject({
      caption: "Heavy day",
      authorName: "Athlete",
      authorPhotoURL: "https://img/a.png",
    });
  });
});

describe("liftPostPreview", () => {
  it("shows the exercises done, the weight moved and the minutes", () => {
    expect(liftPostPreview(LIFT)).toEqual({
      type: "workout",
      title: "Push",
      meta: ["2 exercises", `${group(1320)} kg volume`, "52 min"],
    });
  });

  it("leaves out what it has no figure for", () => {
    expect(
      liftPostPreview({
        title: "Core",
        exercises: [PLANK],
        durationMinutes: 0,
      }).meta
    ).toEqual(["1 exercise"]);
  });
});

describe("liftPostRows — every post in the feed", () => {
  it("reads a post written now", () => {
    const rows = liftPostRows(
      liftPost(AUTHOR, LIFT, { visibility: "public" }).exercises
    );
    expect(rows.map((row) => row.summary)).toEqual([
      "3×8×60 kg",
      "2×60 s × 20 kg",
    ]);
    expect(rows[0].structured).toEqual({
      setCount: 3,
      targetReps: 8,
      targetWeightKg: 60,
    });
  });

  it("reads a post shared from a saved workout, which had no summary", () => {
    // What WorkoutFeedShareSheet wrote before liftPost. The card read the
    // missing summary and broke.
    const rows = liftPostRows([
      { name: "Bench Press", sets: 2, reps: 8, weightKg: 60 },
    ]);
    expect(rows).toEqual([
      {
        name: "Bench Press",
        summary: "2×8×60 kg",
        structured: { setCount: 2, targetReps: 8, targetWeightKg: 60 },
      },
    ]);
  });

  it("reads the oldest posts, which carry a summary only", () => {
    expect(
      liftPostRows([{ name: "Back Squat", summary: "5 x 5 100kg" }])
    ).toEqual([
      { name: "Back Squat", summary: "5 x 5 100kg", structured: null },
    ]);
    // Nothing to draw is drawn as nothing, never as a crash.
    expect(liftPostRows([{ name: "Row" }])[0].summary).toBe("");
  });

  it("knows a bodyweight lift by its name when the post has no id", () => {
    expect(
      liftPostRows([
        { name: "Push-Ups", setCount: 3, targetReps: 12, targetWeightKg: 0 },
      ])[0].summary
    ).toBe("3×12 BW");
  });

  it("skips what is not a row, and reads no rows from no list", () => {
    expect(liftPostRows([null, "Bench", 3, { summary: "3×5" }])).toEqual([
      { name: "Exercise", summary: "3×5", structured: null },
    ]);
    expect(liftPostRows(undefined)).toEqual([]);
    expect(liftPostRows({ name: "Bench" })).toEqual([]);
  });
});
