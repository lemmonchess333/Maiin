// @vitest-environment jsdom — needs DOM/storage APIs; the rest of this directory runs in the fast node environment (audit batch 2).
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {} }));

import {
  exportWorkoutsCSV,
  exportRunsCSV,
  exportMealsCSV,
  exportBodyweightCSV,
  exportAllDataJSON,
  csvFile,
  jsonFile,
} from "../export";
import { seedFirestore, resetFirestore } from "@/test/firestoreHarness";

const UID = "user1";
const WORKOUTS = `users/${UID}/workouts`;
const RUNS = `users/${UID}/runs`;
const MEALS = `users/${UID}/meals`;
const BODYWEIGHT = `users/${UID}/bodyweightLogs`;

/** Seed one collection's docs: seedIn(WORKOUTS, [{...}, {...}]). */
function seedIn(collectionPath: string, rows: Record<string, unknown>[]) {
  seedFirestore(
    Object.fromEntries(rows.map((r, i) => [`${collectionPath}/d${i}`, r]))
  );
}

beforeEach(() => {
  resetFirestore();
  vi.clearAllMocks();
});

describe("exportWorkoutsCSV", () => {
  it("keeps formula-like exercise names and set types as text", async () => {
    seedIn(WORKOUTS, [
      {
        date: "2026-09-07",
        exercises: [
          { name: "=1+1", sets: [{ weightKg: 80, reps: 8, type: "+1+1" }] },
        ],
      },
    ]);
    expect(await exportWorkoutsCSV(UID)).toContain(
      '2026-09-07,"\'=1+1",1,80,8,"\'+1+1",'
    );
  });
  it("keeps a circuit (Circ1) as one row: its name, rounds done and seconds", async () => {
    const { circuitWorkoutFields } = await import("@/lib/circuitCompletion");
    const { builtInCircuit } =
      await import("@/features/circuit/builtInCircuits");
    const circuit = builtInCircuit({ kit: "minimal", minutes: 10 });
    seedIn(WORKOUTS, [
      circuitWorkoutFields({
        uid: UID,
        completionId: "c1",
        startedAt: new Date(2026, 8, 7, 7).getTime(),
        circuit,
        outcome: {
          intervalsDone: 10,
          roundsDone: 2,
          workSecondsDone: 400,
          activeSeconds: 580,
          finished: true,
        },
        bodyweightKg: 70,
      }),
    ]);
    const lines = (await exportWorkoutsCSV(UID)).split("\n");
    expect(lines).toEqual([
      "Date,Exercise,Set,Weight (kg),Reps,Type,RPE",
      `2026-09-07,"${circuit.name}",2,0,580,circuit,`,
    ]);
  });

  it("returns header row when no workouts", async () => {
    const csv = await exportWorkoutsCSV("user1");
    expect(csv).toBe("Date,Exercise,Set,Weight (kg),Reps,Type,RPE");
  });

  it("formats workout data and optional RPE correctly", async () => {
    seedIn(WORKOUTS, [
      {
        date: "2025-01-15",
        exercises: [
          {
            exerciseName: "Bench Press",
            sets: [
              { weightKg: 80, reps: 8, type: "working", rpe: 7.5 },
              { weightKg: 85, reps: 6, type: "working" },
            ],
          },
        ],
      },
    ]);
    const csv = await exportWorkoutsCSV("user1");
    const lines = csv.split("\n");
    expect(lines).toHaveLength(3); // header + 2 sets
    expect(lines[1]).toBe('2025-01-15,"Bench Press",1,80,8,working,7.5');
    expect(lines[2]).toBe('2025-01-15,"Bench Press",2,85,6,working,');
  });

  it("escapes double quotes in exercise names", async () => {
    seedIn(WORKOUTS, [
      {
        date: "2025-01-15",
        exercises: [
          {
            exerciseName: 'Dumbbell "Hammer" Curl',
            sets: [{ weightKg: 15, reps: 12 }],
          },
        ],
      },
    ]);
    const csv = await exportWorkoutsCSV("user1");
    expect(csv).toContain('""Hammer""');
  });

  it("falls back to name field when exerciseName is missing", async () => {
    seedIn(WORKOUTS, [
      {
        date: "2025-01-15",
        exercises: [
          {
            name: "Squat",
            sets: [{ weight: 100, reps: 5 }],
          },
        ],
      },
    ]);
    const csv = await exportWorkoutsCSV("user1");
    expect(csv).toContain('"Squat"');
  });

  it("handles missing sets gracefully", async () => {
    seedIn(WORKOUTS, [
      {
        date: "2025-01-15",
        exercises: [{ exerciseName: "Plank" }],
      },
    ]);
    const csv = await exportWorkoutsCSV("user1");
    const lines = csv.split("\n");
    expect(lines).toHaveLength(1); // header only
  });
});

describe("exportRunsCSV", () => {
  const HEADER =
    "Date,Type,Distance (km),Duration (s),Avg pace (s/km),Elevation gain (m),Calories,Place,Effort";

  it("returns header row when no runs exist", async () => {
    expect(await exportRunsCSV(UID)).toBe(HEADER);
  });

  it("exports valid runs, skips invalid runs unless savedAnyway, and neutralizes formulas", async () => {
    seedIn(RUNS, [
      {
        date: "2026-11-24",
        completedAt: { toDate: () => new Date("2026-11-24T08:00:00Z") },
        activityType: "tempo",
        distance: 8450,
        duration: 2400,
        avgPace: 284,
        elevationGain: 62,
        calories: 580,
        place: "treadmill",
        relativeEffort: "matched",
      },
      {
        date: "2026-11-23",
        completedAt: { toDate: () => new Date("2026-11-23T08:00:00Z") },
        activityType: "easy",
        distance: 5000,
        duration: 1800,
        avgPace: 360,
        elevationGain: 10,
        calories: 320,
        isInvalid: true,
      },
      {
        date: "2026-11-22",
        completedAt: { toDate: () => new Date("2026-11-22T08:00:00Z") },
        activityType: "=CMD()",
        distance: 5000,
        duration: 1700,
        avgPace: 340,
        elevationGain: 15,
        calories: 310,
        isInvalid: true,
        savedAnyway: true,
      },
    ]);

    const csv = await exportRunsCSV(UID);
    const lines = csv.split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe(HEADER);
    expect(lines[1]).toBe(
      "2026-11-24,tempo,8.45,2400,284,62,580,treadmill,matched"
    );
    expect(lines[2]).toBe('2026-11-22,"\'=CMD()",5,1700,340,15,310,,');
  });
});

describe("exportMealsCSV", () => {
  it.each([
    "=1+1",
    "+1+1",
    "-1+1",
    "@SUM(1)",
    "\t=1+1",
    "\r=1+1",
    "  =1+1",
    "\u0000=1+1",
    "＝1+1",
  ])("neutralises formula-like meal names: %j", async (name) => {
    seedIn(MEALS, [
      { date: "2026-09-07", createdAt: 1, foodName: name, totalCalories: 100 },
    ]);
    expect(await exportMealsCSV(UID)).toContain(`"'${name}",100,0,0,0`);
  });

  it("contains embedded separators and formula-like numeric fields within their own cells", async () => {
    seedIn(MEALS, [
      {
        date: "2026-09-07",
        createdAt: 1,
        foodName: 'Oats,"\n=1+1',
        totalCalories: "=2+2",
      },
    ]);
    expect(await exportMealsCSV(UID)).toContain(
      '2026-09-07,"Oats,""\n=1+1","\'=2+2",0,0,0'
    );
  });
  it("returns header row when no meals", async () => {
    const csv = await exportMealsCSV("user1");
    expect(csv).toBe("Date,Meal,Calories,Protein (g),Carbs (g),Fat (g)");
  });

  it("formats meal data correctly", async () => {
    seedIn(MEALS, [
      {
        date: "2025-01-15",
        createdAt: 1,
        foodName: "Chicken Breast",
        totalCalories: 300,
        totalProtein: 50,
        totalCarbs: 0,
        totalFat: 7,
      },
    ]);
    const csv = await exportMealsCSV("user1");
    const lines = csv.split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[1]).toBe('2025-01-15,"Chicken Breast",300,50,0,7');
  });

  it("handles missing fields with defaults", async () => {
    seedIn(MEALS, [{ date: "2025-01-15", createdAt: 1 }]);
    const csv = await exportMealsCSV("user1");
    expect(csv).toContain('2025-01-15,"",0,0,0,0');
  });

  it("omits soft-deleted meals, like every other reader of the diary", async () => {
    seedIn(MEALS, [
      {
        date: "2025-01-15",
        createdAt: 1,
        foodName: "Kept",
        totalCalories: 300,
      },
      {
        date: "2025-01-15",
        createdAt: 2,
        foodName: "Binned",
        totalCalories: 900,
        deletedAt: "2025-01-15T12:00:00.000Z",
      },
    ]);
    const csv = await exportMealsCSV("user1");
    expect(csv).toContain('"Kept"');
    expect(csv).not.toContain('"Binned"');
  });
});

describe("exportBodyweightCSV", () => {
  it("returns header row when no logs", async () => {
    const csv = await exportBodyweightCSV("user1");
    expect(csv).toBe("Date,Weight (kg)");
  });

  it("formats bodyweight data correctly", async () => {
    // Seeded oldest-first on purpose: `orderBy("date", "desc")` has to
    // reverse them. The old stub returned the array exactly as given, so
    // the ordering clause was never exercised.
    seedIn(BODYWEIGHT, [
      { date: "2025-01-14", weight: 82.3 },
      { date: "2025-01-15", weight: 82.5 },
    ]);
    const csv = await exportBodyweightCSV("user1");
    const lines = csv.split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[1]).toBe("2025-01-15,82.5");
    expect(lines[2]).toBe("2025-01-14,82.3");
  });
});

describe("collection isolation", () => {
  /* The three exporters read three DIFFERENT collections. The old stub's
     `getDocs` ignored which one was asked for and returned the same canned
     docs to all of them, so `exportWorkoutsCSV` could have read `meals`
     and every test above would still have passed. On a data export that
     is not a cosmetic bug — the user receives someone else's shape of
     data, or silently loses a category. */
  beforeEach(() => {
    seedIn(WORKOUTS, [
      {
        date: "2025-01-15",
        exercises: [
          { exerciseName: "Bench Press", sets: [{ weightKg: 80, reps: 8 }] },
        ],
      },
    ]);
    seedIn(MEALS, [
      {
        date: "2025-01-15",
        createdAt: 1,
        foodName: "Chicken Breast",
        calories: 200,
        protein: 40,
        carbs: 0,
        fat: 4,
      },
    ]);
    seedIn(BODYWEIGHT, [{ date: "2025-01-15", weight: 82.5 }]);
  });

  it("exportWorkoutsCSV reads workouts only", async () => {
    const csv = await exportWorkoutsCSV(UID);
    expect(csv).toContain("Bench Press");
    expect(csv).not.toContain("Chicken Breast");
    expect(csv).not.toContain("82.5");
  });

  it("exportMealsCSV reads meals only", async () => {
    const csv = await exportMealsCSV(UID);
    expect(csv).toContain("Chicken Breast");
    expect(csv).not.toContain("Bench Press");
  });

  it("exportBodyweightCSV reads bodyweight logs only", async () => {
    const csv = await exportBodyweightCSV(UID);
    expect(csv).toContain("82.5");
    expect(csv).not.toContain("Bench Press");
    expect(csv).not.toContain("Chicken Breast");
  });
});

describe("csvFile", () => {
  /* The handover (share sheet, or a download on the web) is shareFile's,
     tested in shareFile.test.ts; this is the file it is given. */
  it("makes the export a CSV file under its name", async () => {
    const file = csvFile("Date,Weight (kg)\n2026-10-04,82.5", "test.csv");
    expect(file.name).toBe("test.csv");
    expect(file.type).toBe("text/csv");
    expect(await file.text()).toBe("Date,Weight (kg)\n2026-10-04,82.5");
  });
});

describe("exportAllDataJSON & jsonFile", () => {
  it("combines workouts (with RPE), valid runs, active meals, and bodyweight into schemaVersion 1 JSON", async () => {
    seedIn(WORKOUTS, [
      {
        date: "2026-10-04",
        exercises: [
          {
            exerciseName: "Bench Press",
            sets: [{ weightKg: 80, reps: 8, type: "working", rpe: 8 }],
          },
        ],
      },
    ]);
    seedIn(RUNS, [
      {
        date: "2026-10-04",
        completedAt: { toDate: () => new Date("2026-10-04T08:00:00Z") },
        distance: 5000,
        duration: 1500,
        avgPace: 300,
        elevationGain: 45,
        activityType: "easy",
      },
      {
        date: "2026-10-03",
        completedAt: { toDate: () => new Date("2026-10-03T08:00:00Z") },
        distance: 100,
        duration: 20,
        avgPace: 200,
        activityType: "freerun",
        isInvalid: true,
        savedAnyway: false,
      },
    ]);
    seedIn(MEALS, [
      {
        date: "2026-10-04",
        createdAt: 2,
        foodName: "Oats",
        totalCalories: 420,
        totalProtein: 18,
        totalCarbs: 62,
        totalFat: 10,
      },
      {
        date: "2026-10-04",
        createdAt: 1,
        foodName: "Deleted",
        totalCalories: 900,
        deletedAt: "2026-10-04T10:00:00.000Z",
      },
    ]);
    seedIn(BODYWEIGHT, [{ date: "2026-10-04", weight: 78.4 }]);

    const raw = await exportAllDataJSON(UID);
    const parsed = JSON.parse(raw);

    expect(parsed.schemaVersion).toBe(1);
    expect(typeof parsed.exportedAt).toBe("string");
    expect(parsed.workouts).toEqual([
      {
        date: "2026-10-04",
        exercises: [
          {
            name: "Bench Press",
            sets: [{ set: 1, weightKg: 80, reps: 8, type: "working", rpe: 8 }],
          },
        ],
      },
    ]);
    expect(parsed.runs).toHaveLength(1);
    expect(parsed.runs[0]).toMatchObject({
      date: "2026-10-04",
      distanceKm: 5,
      durationSec: 1500,
      avgPaceSecPerKm: 300,
      elevationGainM: 45,
      activityType: "easy",
    });
    expect(parsed.meals).toEqual([
      {
        date: "2026-10-04",
        name: "Oats",
        calories: 420,
        proteinG: 18,
        carbsG: 62,
        fatG: 10,
      },
    ]);
    expect(parsed.bodyweight).toEqual([{ date: "2026-10-04", weightKg: 78.4 }]);
  });

  it("wraps JSON archive with application/json mime type", async () => {
    const file = jsonFile('{"schemaVersion":1}', "tropos-all-data.json");
    expect(file.name).toBe("tropos-all-data.json");
    expect(file.type).toBe("application/json");
    expect(await file.text()).toBe('{"schemaVersion":1}');
  });
});
