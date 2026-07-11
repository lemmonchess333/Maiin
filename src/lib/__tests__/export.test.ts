// @vitest-environment jsdom — needs DOM/storage APIs; the rest of this directory runs in the fast node environment (audit batch 2).
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Firebase
const mockGetDocs = vi.fn();

vi.mock("firebase/firestore", () => ({
  collection: vi.fn((...args: string[]) => args.join("/")),
  query: vi.fn((...args: unknown[]) => args[0]),
  orderBy: vi.fn(),
  getDocs: (...args: unknown[]) => mockGetDocs(...args),
}));

vi.mock("@/lib/firebase", () => ({
  db: "mock-db",
}));

import {
  exportWorkoutsCSV,
  exportMealsCSV,
  exportBodyweightCSV,
  downloadCSV,
} from "../export";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("exportWorkoutsCSV", () => {
  it("returns header row when no workouts", async () => {
    mockGetDocs.mockResolvedValue({ docs: [] });
    const csv = await exportWorkoutsCSV("user1");
    expect(csv).toBe("Date,Exercise,Set,Weight (kg),Reps,Type");
  });

  it("formats workout data correctly", async () => {
    mockGetDocs.mockResolvedValue({
      docs: [
        {
          data: () => ({
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
          }),
        },
      ],
    });
    const csv = await exportWorkoutsCSV("user1");
    const lines = csv.split("\n");
    expect(lines).toHaveLength(3); // header + 2 sets
    expect(lines[1]).toBe('2025-01-15,"Bench Press",1,80,8,working');
    expect(lines[2]).toBe('2025-01-15,"Bench Press",2,85,6,working');
  });

  it("escapes double quotes in exercise names", async () => {
    mockGetDocs.mockResolvedValue({
      docs: [
        {
          data: () => ({
            date: "2025-01-15",
            exercises: [
              {
                exerciseName: 'Dumbbell "Hammer" Curl',
                sets: [{ weightKg: 15, reps: 12 }],
              },
            ],
          }),
        },
      ],
    });
    const csv = await exportWorkoutsCSV("user1");
    expect(csv).toContain('""Hammer""');
  });

  it("falls back to name field when exerciseName is missing", async () => {
    mockGetDocs.mockResolvedValue({
      docs: [
        {
          data: () => ({
            date: "2025-01-15",
            exercises: [
              {
                name: "Squat",
                sets: [{ weight: 100, reps: 5 }],
              },
            ],
          }),
        },
      ],
    });
    const csv = await exportWorkoutsCSV("user1");
    expect(csv).toContain('"Squat"');
  });

  it("handles missing sets gracefully", async () => {
    mockGetDocs.mockResolvedValue({
      docs: [
        {
          data: () => ({
            date: "2025-01-15",
            exercises: [{ exerciseName: "Plank" }],
          }),
        },
      ],
    });
    const csv = await exportWorkoutsCSV("user1");
    const lines = csv.split("\n");
    expect(lines).toHaveLength(1); // header only
  });
});

describe("exportMealsCSV", () => {
  it("returns header row when no meals", async () => {
    mockGetDocs.mockResolvedValue({ docs: [] });
    const csv = await exportMealsCSV("user1");
    expect(csv).toBe("Date,Meal,Calories,Protein (g),Carbs (g),Fat (g)");
  });

  it("formats meal data correctly", async () => {
    mockGetDocs.mockResolvedValue({
      docs: [
        {
          data: () => ({
            date: "2025-01-15",
            foodName: "Chicken Breast",
            totalCalories: 300,
            totalProtein: 50,
            totalCarbs: 0,
            totalFat: 7,
          }),
        },
      ],
    });
    const csv = await exportMealsCSV("user1");
    const lines = csv.split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[1]).toBe('2025-01-15,"Chicken Breast",300,50,0,7');
  });

  it("handles missing fields with defaults", async () => {
    mockGetDocs.mockResolvedValue({
      docs: [
        {
          data: () => ({ date: "2025-01-15" }),
        },
      ],
    });
    const csv = await exportMealsCSV("user1");
    expect(csv).toContain('2025-01-15,"",0,0,0,0');
  });
});

describe("exportBodyweightCSV", () => {
  it("returns header row when no logs", async () => {
    mockGetDocs.mockResolvedValue({ docs: [] });
    const csv = await exportBodyweightCSV("user1");
    expect(csv).toBe("Date,Weight (kg)");
  });

  it("formats bodyweight data correctly", async () => {
    mockGetDocs.mockResolvedValue({
      docs: [
        { data: () => ({ date: "2025-01-15", weight: 82.5 }) },
        { data: () => ({ date: "2025-01-14", weight: 82.3 }) },
      ],
    });
    const csv = await exportBodyweightCSV("user1");
    const lines = csv.split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[1]).toBe("2025-01-15,82.5");
    expect(lines[2]).toBe("2025-01-14,82.3");
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
