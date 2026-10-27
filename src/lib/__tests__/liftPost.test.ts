import { describe, expect, it } from "vitest";
import {
  liftPost,
  liftPostExerciseCount,
  liftPostPreview,
  liftPostRowDone,
  liftPostRows,
  postedExercises,
  type LiftForPost,
  liftPostLeadArt,
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

/* An exercise with no set done stays off every surface that reads a lift
   post: the rows, the count, the lead drawing and "Save as routine". Posts
   written now never list one; a post shared from a saved workout before
   `liftPost` listed every exercise in the workout, and counted it. */
describe("an exercise with no set done", () => {
  /* What WorkoutFeedShareSheet wrote for a Pull day whose T-Bar Row was
     skipped: the saved workout keeps the exercise with no sets, and the
     post took every exercise and the workout's whole count. */
  const sharedBefore = {
    exerciseCount: 4,
    exercises: [
      { name: "Lat Pulldown", sets: 2, reps: 8, weightKg: 42.5 },
      { name: "Seated Cable Row", sets: 2, reps: 10, weightKg: 40 },
      { name: "T-Bar Row", sets: 0, reps: 0, weightKg: 0 },
      { name: "Face Pull", sets: 2, reps: 15, weightKg: 15 },
    ],
  };

  it("is left off the rows of an older post, never drawn as a dash", () => {
    const rows = liftPostRows(sharedBefore.exercises);
    expect(rows.map((row) => row.name)).toEqual([
      "Lat Pulldown",
      "Seated Cable Row",
      "Face Pull",
    ]);
    expect(rows.map((row) => row.summary)).toEqual([
      "2×8×42.5 kg",
      "2×10×40 kg",
      "2×15×15 kg",
    ]);
  });

  it("is left out of the post's count", () => {
    expect(liftPostExerciseCount(sharedBefore)).toBe(3);
  });

  it("is left off in every shape a post can carry it", () => {
    const rows = liftPostRows([
      { name: "Bench Press", setCount: 0, targetReps: 0, targetWeightKg: 0 },
      { name: "Dips", summary: "—" },
      { name: "Push-Ups", setCount: 3, targetReps: 12, targetWeightKg: 0 },
    ]);
    expect(rows.map((row) => row.name)).toEqual(["Push-Ups"]);
    expect(liftPostRowDone({ name: "Dips", summary: " — " })).toBe(false);
    expect(
      liftPostRowDone({ name: "Row", sets: 0, reps: 8, weightKg: 40 })
    ).toBe(false);
    // A row that says nothing either way is drawn, as the oldest are.
    expect(liftPostRowDone({ name: "Row" })).toBe(true);
    expect(liftPostRowDone({ name: "Squat", summary: "5 x 5 100kg" })).toBe(
      true
    );
  });

  it("is passed over for the lead drawing", () => {
    expect(
      liftPostLeadArt([
        {
          name: "Bench Press",
          exerciseId: "bench-press",
          sets: 0,
          reps: 0,
          weightKg: 0,
        },
        {
          name: "Barbell Squat",
          exerciseId: "squat",
          sets: 3,
          reps: 5,
          weightKg: 80,
        },
      ])?.src
    ).toBe("form-art/squat.webp");
  });

  it("is never on a post written now, whose count is the rows'", () => {
    const post = liftPost(AUTHOR, LIFT, { visibility: "public" });
    expect(liftPostExerciseCount(post)).toBe(2);
    expect(liftPostRows(post.exercises)).toHaveLength(2);
  });
});

describe("liftPostExerciseCount", () => {
  it("keeps the oldest posts' count, which held three rows of more", () => {
    expect(
      liftPostExerciseCount({
        exerciseCount: 6,
        exercises: [
          { name: "Romanian Deadlift", summary: "3 x 8 60kg" },
          { name: "Back Squat", summary: "5 x 5 100kg" },
          { name: "Walking Lunge", summary: "3 x 12 BW" },
          { name: "Leg Curl", summary: "—" },
        ],
      })
    ).toBe(5);
  });

  it("is the rows of a post whose rows carry figures, which holds them all", () => {
    // The post's page lists these rows, so the card's count is theirs.
    expect(
      liftPostExerciseCount({
        exerciseCount: 5,
        exercises: [
          {
            name: "Bench Press",
            setCount: 4,
            targetReps: 8,
            targetWeightKg: 65,
          },
          {
            name: "Overhead Press",
            setCount: 3,
            targetReps: 10,
            targetWeightKg: 40,
          },
          { name: "Dips", setCount: 0, targetReps: 0, targetWeightKg: 0 },
        ],
      })
    ).toBe(2);
  });

  it("is never fewer than the rows drawn, and reads a post with neither", () => {
    expect(
      liftPostExerciseCount({
        exercises: [
          { name: "Squat", setCount: 3, targetReps: 5, targetWeightKg: 80 },
        ],
      })
    ).toBe(1);
    expect(liftPostExerciseCount({ exerciseCount: 2 })).toBe(2);
    expect(liftPostExerciseCount({})).toBe(0);
    expect(liftPostExerciseCount({ exerciseCount: "4", exercises: "x" })).toBe(
      0
    );
  });
});

/* Lift18: the post stores kg; who reads it decides the unit. */
describe("a lift post read in lb", () => {
  it("rows with figures are written in the reader's unit", () => {
    const rows = liftPostRows(
      [
        {
          name: "Bench Press",
          exerciseId: "bench-press",
          summary: "3×8×60 kg",
          setCount: 3,
          targetReps: 8,
          targetWeightKg: 60,
        },
      ],
      "lbs"
    );
    expect(rows[0].summary).toBe("3×8×132.3 lb");
    expect(rows[0].structured?.targetWeightKg).toBe(60);
  });

  it("the oldest rows, with only a summary, keep what they say", () => {
    expect(
      liftPostRows([{ name: "Squat", summary: "5 x 5 100kg" }], "lbs")[0]
        .summary
    ).toBe("5 x 5 100kg");
  });

  it("the share sheet's preview gives the volume in the lifter's unit", () => {
    const lift: LiftForPost = {
      title: "Upper",
      durationMinutes: 40,
      exercises: [
        {
          exerciseName: "Bench Press",
          exerciseId: "bench-press",
          sets: [
            { reps: 10, weightKg: 100, completed: true },
            { reps: 10, weightKg: 100, completed: true },
          ],
        } as unknown as WorkoutExercise,
      ],
    };
    // 2,000 kg is 4,409 lb.
    expect(liftPostPreview(lift, "lbs").meta.join(" · ")).toContain(
      `${group(4409)} lb volume`
    );
    expect(liftPostPreview(lift).meta.join(" · ")).toContain(
      `${group(2000)} kg volume`
    );
  });
});

describe("liftPostLeadArt", () => {
  it("is the first exercise on the post with a drawing", () => {
    expect(
      liftPostLeadArt([
        { name: "My Own Lift" },
        { name: "Bench Press", exerciseId: "bench-press" },
        { name: "Barbell Squat", exerciseId: "squat" },
      ])?.src
    ).toBe("form-art/bench-press.webp");
  });

  it("names an older post's lift from the catalogue", () => {
    expect(liftPostLeadArt([{ name: "Barbell Squat" }])?.src).toBe(
      "form-art/squat.webp"
    );
  });

  it("is null for a post with no drawn lift, or none at all", () => {
    expect(liftPostLeadArt([{ name: "My Own Lift" }])).toBeNull();
    expect(liftPostLeadArt(undefined)).toBeNull();
    expect(liftPostLeadArt([null, 3, "x"])).toBeNull();
  });
});
