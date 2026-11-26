import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  queueDurableWrite: vi.fn(),
  flushQueue: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/lib/offlineQueue", () => ({
  queueDurableWrite: (...args: unknown[]) => mocks.queueDurableWrite(...args),
  flushQueue: (...args: unknown[]) => mocks.flushQueue(...args),
}));

import {
  WorkoutCsvImportError,
  importWorkoutsCsv,
  matchCatalogExercise,
  parseWorkoutsCsv,
} from "@/lib/workoutCsvImport";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("matchCatalogExercise", () => {
  it("matches canonical Hevy/Strong parenthetical exercise titles to Tropos ids", () => {
    expect(matchCatalogExercise("Bench Press (Barbell)")).toEqual({
      exerciseId: "bench-press",
      exerciseName: "Bench Press",
      category: "Chest",
    });
    expect(matchCatalogExercise("Bench Press (Dumbbell)")).toEqual({
      exerciseId: "db-bench",
      exerciseName: "Dumbbell Bench Press",
      category: "Chest",
    });
    expect(matchCatalogExercise("Squat (Barbell)")).toEqual({
      exerciseId: "squat",
      exerciseName: "Barbell Squat",
      category: "Legs",
    });
    expect(matchCatalogExercise("Romanian Deadlift (Dumbbell)")).toEqual({
      exerciseId: "db-rdl",
      exerciseName: "Dumbbell Romanian Deadlift",
      category: "Legs",
    });
    expect(matchCatalogExercise("Triceps Rope Pushdown")).toEqual({
      exerciseId: "rope-tricep-pushdown",
      exerciseName: "Rope Tricep Pushdown",
      category: "Triceps",
    });
    expect(matchCatalogExercise("Pull Up")).toEqual({
      exerciseId: "pull-ups",
      exerciseName: "Pull-Ups",
      category: "Back",
    });
  });

  it("falls back to a deterministic custom id for unknown exercises", () => {
    expect(matchCatalogExercise("Zercher Carry")).toEqual({
      exerciseId: "custom-zercher-carry",
      exerciseName: "Zercher Carry",
      category: "Full Body",
    });
  });
});

describe("parseWorkoutsCsv", () => {
  it("parses Hevy CSV with kg weights, set types, RPE, duration, timed sets, and exercise notes", () => {
    const hevyCsv = [
      "title,start_time,end_time,description,exercise_title,superset_id,exercise_notes,set_index,set_type,weight_kg,reps,distance_km,duration_seconds,rpe",
      '"Push A","25 Oct 2026, 09:00","25 Oct 2026, 09:50","Felt strong","Bench Press (Barbell)",,"Paused reps",0,warmup,40,10,,,',
      '"Push A","25 Oct 2026, 09:00","25 Oct 2026, 09:50","Felt strong","Bench Press (Barbell)",,"Paused reps",1,normal,80,8,,,8.5',
      '"Push A","25 Oct 2026, 09:00","25 Oct 2026, 09:50","Felt strong","Bench Press (Barbell)",,"Paused reps",2,failure,80,7,,,10',
      '"Push A","25 Oct 2026, 09:00","25 Oct 2026, 09:50","Felt strong","Plank",,,0,normal,0,0,,60,',
    ].join("\n");

    const parsed = parseWorkoutsCsv(hevyCsv, { weightKg: 80 });
    expect(parsed.source).toBe("hevy");
    expect(parsed.workouts).toHaveLength(1);
    expect(parsed.totalSets).toBe(4);

    const w = parsed.workouts[0];
    expect(w.date).toBe("2026-10-25");
    expect(w.durationMinutes).toBe(50);
    expect(w.notes).toBe("Push A · Felt strong");
    expect(w.exercises).toHaveLength(2);

    const bench = w.exercises[0];
    expect(bench.exerciseId).toBe("bench-press");
    expect(bench.notes).toBe("Paused reps");
    expect(bench.sets.map((s) => s.type)).toEqual([
      "warmup",
      "working",
      "failure",
    ]);
    expect(bench.sets[1].rpe).toBe(8.5);

    const plank = w.exercises[1];
    expect(plank.exerciseId).toBe("plank");
    expect(plank.repUnit).toBe("seconds");
    expect(plank.sets[0].reps).toBe(60);
    expect(w.totalCalories).toBeGreaterThan(150);
  });

  it("converts Hevy weight_lbs to kg cleanly", () => {
    const csv = [
      "title,start_time,end_time,description,exercise_title,superset_id,exercise_notes,set_index,set_type,weight_lbs,reps,distance_miles,duration_seconds,rpe",
      '"Lower","2026-10-20 07:00:00","2026-10-20 07:45:00",,"Squat (Barbell)",,,0,normal,225,5,,,8',
    ].join("\n");

    const parsed = parseWorkoutsCsv(csv);
    expect(parsed.workouts[0].exercises[0].sets[0].weightKg).toBeCloseTo(
      102.06,
      2
    );
  });

  it("parses European semicolon-delimited Strong CSV with W/D/F set orders and duration strings", () => {
    const strongCsv = [
      "\uFEFFDate;Workout Name;Duration;Exercise Name;Set Order;Weight;Reps;Distance;Seconds;Notes;Workout Notes;RPE",
      "2026-10-18 18:10:00;Pull Day;1h 5m;Bent Over Row (Barbell);W;40;10;0;0;;;",
      "2026-10-18 18:10:00;Pull Day;1h 5m;Bent Over Row (Barbell);1;70;8;0;0;;Good grip;8",
      "2026-10-18 18:10:00;Pull Day;1h 5m;Bent Over Row (Barbell);D;55;12;0;0;;;9",
      "2026-10-18 18:10:00;Pull Day;1h 5m;Bent Over Row (Barbell);Rest Timer;0;0;0;90;;;",
    ].join("\r\n");

    const parsed = parseWorkoutsCsv(strongCsv, { defaultWeightUnit: "kg" });
    expect(parsed.source).toBe("strong");
    expect(parsed.workouts).toHaveLength(1);
    const w = parsed.workouts[0];
    expect(w.date).toBe("2026-10-18");
    expect(w.durationMinutes).toBe(65);
    expect(w.exercises[0].exerciseId).toBe("barbell-row");
    expect(w.exercises[0].sets.map((s) => s.type)).toEqual([
      "warmup",
      "working",
      "dropset",
    ]);
  });

  it("round-trips Tropos CSV exports, skipping circuit rows and formula prefixes", () => {
    const troposCsv = [
      "Date,Exercise,Set,Weight (kg),Reps,Type,RPE",
      '2026-10-15,"Bench Press",1,85,6,working,8.5',
      '2026-10-15,"Bench Press",2,85,6,working,9',
      '2026-10-15,"Quick 10",2,0,580,circuit,',
      '2026-10-14,"\'=Custom Press",1,50,10,working,',
    ].join("\n");

    const parsed = parseWorkoutsCsv(troposCsv);
    expect(parsed.source).toBe("tropos");
    expect(parsed.workouts).toHaveLength(2);
    expect(parsed.workouts[0].date).toBe("2026-10-15");
    expect(parsed.workouts[0].exercises).toHaveLength(1);
    expect(parsed.workouts[0].exercises[0].sets).toHaveLength(2);
    expect(parsed.workouts[1].exercises[0].exerciseName).toBe("=Custom Press");
  });

  it("produces deterministic importIds so re-importing is idempotent", () => {
    const csv = [
      "Date,Exercise,Set,Weight (kg),Reps,Type,RPE",
      '2026-10-15,"Deadlift",1,140,5,working,8',
    ].join("\n");

    const first = parseWorkoutsCsv(csv);
    const second = parseWorkoutsCsv(csv);
    expect(first.workouts[0].importId).toMatch(/^csv-[0-9a-f]{8}$/);
    expect(first.workouts[0].importId).toBe(second.workouts[0].importId);
  });

  it("throws typed WorkoutCsvImportError for empty or unrecognized files", () => {
    expect(() => parseWorkoutsCsv("Date,Exercise\n")).toThrowError(
      WorkoutCsvImportError
    );
    try {
      parseWorkoutsCsv("foo,bar,baz\n1,2,3");
    } catch (err) {
      expect(err).toBeInstanceOf(WorkoutCsvImportError);
      expect((err as WorkoutCsvImportError).code).toBe(
        "CSV_UNRECOGNIZED_FORMAT"
      );
    }
  });
});

describe("importWorkoutsCsv", () => {
  it("queues durable Firestore writes for each workout and flushes when online", async () => {
    const csv = [
      "Date,Exercise,Set,Weight (kg),Reps,Type,RPE",
      '2026-10-10,"Bench Press",1,80,8,working,8',
      '2026-10-12,"Barbell Squat",1,100,5,working,8.5',
    ].join("\n");

    const summary = await importWorkoutsCsv("user-1", csv, { weightKg: 78 });
    expect(summary).toEqual({
      source: "tropos",
      importedCount: 2,
      totalSets: 2,
      earliestDate: "2026-10-10",
      latestDate: "2026-10-12",
    });
    expect(mocks.queueDurableWrite).toHaveBeenCalledTimes(2);
    expect(mocks.queueDurableWrite).toHaveBeenCalledWith(
      "user-1",
      "users/user-1/workouts",
      expect.stringMatching(/^csv-[0-9a-f]{8}$/),
      expect.objectContaining({
        date: "2026-10-10",
        totalVolume: 640,
      })
    );
    expect(mocks.flushQueue).toHaveBeenCalledWith({}, "user-1");
  });
});
