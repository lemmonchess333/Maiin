// @vitest-environment jsdom — needs DOM/storage APIs; the rest of this directory runs in the fast node environment (audit batch 2).
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {} }));

import {
  exportWorkoutsCSV,
  exportMealsCSV,
  exportBodyweightCSV,
  downloadCSV,
} from "../export";
import { seedFirestore, resetFirestore } from "@/test/firestoreHarness";

const UID = "user1";
const WORKOUTS = `users/${UID}/workouts`;
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
  it("returns header row when no workouts", async () => {
    const csv = await exportWorkoutsCSV("user1");
    expect(csv).toBe("Date,Exercise,Set,Weight (kg),Reps,Type");
  });

  it("formats workout data correctly", async () => {
    seedIn(WORKOUTS, [
      {
        date: "2025-01-15",
        exercises: [
          {
            exerciseName: "Bench Press",
            sets: [
              { weightKg: 80, reps: 8, type: "working" },
              { weightKg: 85, reps: 6, type: "working" },
            ],
          },
        ],
      },
    ]);
    const csv = await exportWorkoutsCSV("user1");
    const lines = csv.split("\n");
    expect(lines).toHaveLength(3); // header + 2 sets
    expect(lines[1]).toBe('2025-01-15,"Bench Press",1,80,8,working');
    expect(lines[2]).toBe('2025-01-15,"Bench Press",2,85,6,working');
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

describe("exportMealsCSV", () => {
  it("returns header row when no meals", async () => {
    const csv = await exportMealsCSV("user1");
    expect(csv).toBe("Date,Meal,Calories,Protein (g),Carbs (g),Fat (g)");
  });

  it("formats meal data correctly", async () => {
    seedIn(MEALS, [
      {
        date: "2025-01-15",
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
    seedIn(MEALS, [{ date: "2025-01-15" }]);
    const csv = await exportMealsCSV("user1");
    expect(csv).toContain('2025-01-15,"",0,0,0,0');
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

describe("downloadCSV", () => {
  it("creates and clicks a download link", () => {
    const mockClick = vi.fn();
    const mockCreateObjectURL = vi.fn().mockReturnValue("blob:url");
    const mockRevokeObjectURL = vi.fn();
    const mockCreateElement = vi.fn().mockReturnValue({
      href: "",
      download: "",
      click: mockClick,
    });

    vi.stubGlobal("URL", {
      createObjectURL: mockCreateObjectURL,
      revokeObjectURL: mockRevokeObjectURL,
    });
    vi.spyOn(document, "createElement").mockImplementation(mockCreateElement);

    downloadCSV("csv,content", "test.csv");

    expect(mockCreateElement).toHaveBeenCalledWith("a");
    expect(mockClick).toHaveBeenCalled();
    expect(mockRevokeObjectURL).toHaveBeenCalledWith("blob:url");
  });
});
