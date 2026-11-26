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
  NutritionCsvImportError,
  importNutritionCsv,
  parseNutritionCsv,
} from "@/lib/nutritionCsvImport";

const TODAY = "2026-10-25";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("parseNutritionCsv", () => {
  it("parses Tropos exported meals CSV with exact macros and deterministic IDs", () => {
    const csv = [
      "Date,Meal,Calories,Protein (g),Carbs (g),Fat (g)",
      '2026-10-20,"Oats, whey & berries",520,42.5,61,11.2',
      '2026-10-20,"Oats, whey & berries",520,42.5,61,11.2',
      "2026-10-21,Chicken rice bowl,680,55,74,16",
      "2026-11-15,Future meal,400,30,40,10",
    ].join("\n");

    const first = parseNutritionCsv(csv, { todayKey: TODAY });
    const second = parseNutritionCsv(csv, { todayKey: TODAY });

    expect(first).toHaveLength(3);
    expect(first[0].data.foodName).toBe("Oats, whey & berries");
    expect(first[0].data.totalCalories).toBe(520);
    expect(first[0].data.totalProtein).toBe(42.5);
    // Duplicate meals on the same day receive distinct deterministic IDs.
    expect(first[0].docId).not.toBe(first[1].docId);
    expect(first.map((m) => m.docId)).toEqual(second.map((m) => m.docId));
  });

  it("parses MyFitnessPal diary export with Carbohydrates (g) and extra columns", () => {
    const csv = [
      "Date,Meal,Calories,Fat (g),Saturated Fat,Sodium (mg),Carbohydrates (g),Fiber,Sugar,Protein (g)",
      "2026-10-18,Breakfast,485,12.5,3,310,58,6,14,34",
      "2026-10-18,Lunch,710,18,4,620,82,9,7,52",
      "2026-10-18,Water,0,0,0,0,0,0,0,0",
    ].join("\n");

    const parsed = parseNutritionCsv(csv, { todayKey: TODAY });
    expect(parsed).toHaveLength(2);
    expect(parsed[0].data.foodName).toBe("Breakfast");
    expect(parsed[0].data.totalCarbs).toBe(58);
    expect(parsed[1].data.totalProtein).toBe(52);
  });

  it("parses Cronometer and Lose It! exports with Energy (kcal), Day, and European decimals", () => {
    const cronometer = [
      "Day;Food Name;Energy (kcal);Protein (g);Carbs (g);Fat (g)",
      "19/10/2026;Greek yoghurt & honey;290,4;24,5;31,2;6,5",
      "20/10/2026;Salmon & sweet potato;640;46;52;24",
    ].join("\n");

    const parsed = parseNutritionCsv(cronometer, { todayKey: TODAY });
    expect(parsed).toHaveLength(2);
    expect(parsed[0].date).toBe("2026-10-19");
    expect(parsed[0].data.totalCalories).toBe(290);
    expect(parsed[0].data.totalProtein).toBe(24.5);

    const loseIt = [
      "Date,Name,Type,Quantity,Units,Calories,Fat (g),Protein (g),Carbohydrates (g)",
      "10/21/2026,Egg white scramble,Breakfast,1,serving,310,8,38,12",
    ].join("\n");
    const parsedLoseIt = parseNutritionCsv(loseIt, { todayKey: TODAY });
    expect(parsedLoseIt).toHaveLength(1);
    expect(parsedLoseIt[0].date).toBe("2026-10-21");
    expect(parsedLoseIt[0].data.foodName).toBe("Egg white scramble");
  });

  it("throws typed NutritionCsvImportError for empty, unrecognized, or zero-entry CSVs", () => {
    expect(() => parseNutritionCsv("Date,Meal,Calories")).toThrowError(
      NutritionCsvImportError
    );
    try {
      parseNutritionCsv("Foo,Bar\n1,2");
    } catch (err) {
      expect(err).toBeInstanceOf(NutritionCsvImportError);
      expect((err as NutritionCsvImportError).code).toBe(
        "CSV_UNRECOGNIZED_FORMAT"
      );
    }
    try {
      parseNutritionCsv(
        "Date,Meal,Calories,Protein (g)\n2026-10-20,Water,0,0",
        { todayKey: TODAY }
      );
    } catch (err) {
      expect(err).toBeInstanceOf(NutritionCsvImportError);
      expect((err as NutritionCsvImportError).code).toBe("CSV_NO_ENTRIES");
    }
  });
});

describe("importNutritionCsv", () => {
  it("queues durable writes into users/{uid}/meals and flushes", async () => {
    const csv = [
      "Date,Meal,Calories,Protein (g),Carbs (g),Fat (g)",
      "2026-10-18,Oats,450,35,55,9",
      "2026-10-20,Pasta,720,40,95,18",
    ].join("\n");

    const summary = await importNutritionCsv("u-1", csv, { todayKey: TODAY });
    expect(summary).toEqual({
      importedCount: 2,
      earliestDate: "2026-10-18",
      latestDate: "2026-10-20",
    });
    expect(mocks.queueDurableWrite).toHaveBeenCalledTimes(2);
    expect(mocks.queueDurableWrite).toHaveBeenCalledWith(
      "u-1",
      "users/u-1/meals",
      expect.stringMatching(/^csv-[0-9a-f]{8}$/),
      expect.objectContaining({
        date: "2026-10-18",
        foodName: "Oats",
        totalCalories: 450,
      })
    );
    expect(mocks.flushQueue).toHaveBeenCalledWith({}, "u-1");
  });
});
