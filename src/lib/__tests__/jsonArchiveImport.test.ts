import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  commitBulkImportWrites: vi.fn().mockResolvedValue(0),
}));

vi.mock("@/lib/bulkImportWrite", () => ({
  commitBulkImportWrites: (...args: unknown[]) =>
    mocks.commitBulkImportWrites(...args),
}));

import {
  JsonArchiveImportError,
  importFullBackupJson,
  parseFullBackupJson,
} from "@/lib/jsonArchiveImport";

const TODAY = "2026-10-25";

function buildSampleArchive() {
  return JSON.stringify({
    schemaVersion: 1,
    exportedAt: "2026-10-25T10:00:00.000Z",
    workouts: [
      {
        date: "2026-10-20",
        exercises: [
          {
            name: "Bench Press",
            sets: [
              { set: 1, weightKg: 80, reps: 8, type: "working", rpe: 8 },
              { set: 2, weightKg: 80, reps: 8, type: "working", rpe: 8.5 },
            ],
          },
          {
            name: "Custom Cable Fly",
            sets: [{ set: 1, weightKg: 15, reps: 12, type: "working" }],
          },
        ],
      },
      {
        date: "2026-10-21",
        exercises: [],
        circuit: { name: "Quick 10", roundsDone: 3, activeSeconds: 540 },
      },
    ],
    runs: [
      {
        date: "2026-10-21",
        distanceKm: 8.5,
        durationSec: 2550,
        avgPaceSecPerKm: 300,
        elevationGainM: 65,
        activityType: "tempo",
      },
      {
        date: "2026-10-22",
        distanceKm: 5,
        durationSec: 1650,
        avgPaceSecPerKm: 330,
        elevationGainM: 0,
        activityType: "easy",
        place: "treadmill",
      },
    ],
    meals: [
      {
        date: "2026-10-22",
        name: "Oats and whey",
        calories: 520,
        proteinG: 42,
        carbsG: 62,
        fatG: 10,
      },
    ],
    bodyweight: [
      { date: "2026-10-20", weightKg: 76.2 },
      { date: "2026-10-20", weightKg: 76.0 },
      { date: "2026-10-21", weightKg: 75.8 },
      { date: "2026-11-15", weightKg: 75.0 }, // future: ignored
    ],
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("parseFullBackupJson", () => {
  it("parses workouts, runs, meals, and bodyweight from a schemaVersion 1 Tropos backup", () => {
    const parsed = parseFullBackupJson(buildSampleArchive(), {
      weightKg: 76,
      todayKey: TODAY,
    });

    expect(parsed.workouts).toHaveLength(1);
    expect(parsed.runs).toHaveLength(2);
    expect(parsed.meals).toHaveLength(1);
    expect(parsed.bodyweight).toHaveLength(2);
    expect(parsed.totalItems).toBe(6);

    expect(parsed.workouts[0].docId).toMatch(/^json-[0-9a-f]{8}$/);
    expect(parsed.workouts[0].data.totalVolume).toBe(1460);

    expect(parsed.runs[0].data.activityType).toBe("tempo");
    expect(parsed.runs[0].data.distance).toBe(8500);
    expect(parsed.runs[1].data.place).toBe("treadmill");

    expect(parsed.meals[0].data.foodName).toBe("Oats and whey");
    expect(parsed.meals[0].data.totalCalories).toBe(520);

    expect(parsed.bodyweight.map((b) => [b.date, b.weightKg])).toEqual([
      ["2026-10-20", 76],
      ["2026-10-21", 75.8],
    ]);
  });

  it("produces deterministic IDs so re-importing a backup is idempotent", () => {
    const raw = buildSampleArchive();
    const first = parseFullBackupJson(raw, { todayKey: TODAY });
    const second = parseFullBackupJson(raw, { todayKey: TODAY });

    expect(first.workouts[0].docId).toBe(second.workouts[0].docId);
    expect(first.runs.map((r) => r.docId)).toEqual(
      second.runs.map((r) => r.docId)
    );
    expect(first.meals[0].docId).toBe(second.meals[0].docId);
    expect(first.bodyweight.map((b) => b.docId)).toEqual(
      second.bodyweight.map((b) => b.docId)
    );
  });

  it("throws typed JsonArchiveImportError for invalid JSON, unsupported schema, or empty backups", () => {
    expect(() => parseFullBackupJson("{bad json")).toThrowError(
      JsonArchiveImportError
    );
    try {
      parseFullBackupJson(JSON.stringify({ schemaVersion: 2 }));
    } catch (err) {
      expect(err).toBeInstanceOf(JsonArchiveImportError);
      expect((err as JsonArchiveImportError).code).toBe(
        "ARCHIVE_UNSUPPORTED_SCHEMA"
      );
    }
    try {
      parseFullBackupJson(
        JSON.stringify({
          schemaVersion: 1,
          workouts: [],
          runs: [],
          meals: [],
          bodyweight: [],
        })
      );
    } catch (err) {
      expect(err).toBeInstanceOf(JsonArchiveImportError);
      expect((err as JsonArchiveImportError).code).toBe("ARCHIVE_EMPTY");
    }
  });
});

describe("importFullBackupJson", () => {
  it("queues durable writes across all four collections and flushes when online", async () => {
    const summary = await importFullBackupJson("user-1", buildSampleArchive(), {
      weightKg: 76,
      todayKey: TODAY,
    });

    expect(summary).toEqual({
      workouts: 1,
      runs: 2,
      meals: 1,
      bodyweight: 2,
      totalItems: 6,
    });
    expect(mocks.commitBulkImportWrites).toHaveBeenCalledOnce();
    const [uid, writes] = mocks.commitBulkImportWrites.mock.calls[0];
    expect(uid).toBe("user-1");
    expect(writes).toHaveLength(6);
    expect(writes).toContainEqual(
      expect.objectContaining({
        collectionPath: "users/user-1/workouts",
        docId: expect.stringMatching(/^json-[0-9a-f]{8}$/),
        data: expect.objectContaining({ date: "2026-10-20" }),
      })
    );
    expect(writes).toContainEqual(
      expect.objectContaining({
        collectionPath: "users/user-1/runs",
        docId: expect.stringMatching(/^json-[0-9a-f]{8}$/),
        data: expect.objectContaining({ date: "2026-10-21", distance: 8500 }),
      })
    );
    expect(writes).toContainEqual(
      expect.objectContaining({
        collectionPath: "users/user-1/meals",
        docId: expect.stringMatching(/^json-[0-9a-f]{8}$/),
        data: expect.objectContaining({
          date: "2026-10-22",
          totalCalories: 520,
        }),
      })
    );
    expect(writes).toContainEqual(
      expect.objectContaining({
        collectionPath: "users/user-1/bodyweightLogs",
        docId: "2026-10-21",
        merge: true,
        data: expect.objectContaining({ date: "2026-10-21", weight: 75.8 }),
      })
    );
  });
});
