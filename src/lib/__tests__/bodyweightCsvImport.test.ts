import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  commitBulkImportWrites: vi.fn().mockResolvedValue(0),
}));

vi.mock("@/lib/bulkImportWrite", () => ({
  commitBulkImportWrites: (...args: unknown[]) =>
    mocks.commitBulkImportWrites(...args),
}));

import {
  BodyweightCsvImportError,
  importBodyweightCsv,
  parseBodyweightCsv,
} from "@/lib/bodyweightCsvImport";

const TODAY = "2026-10-25";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("parseBodyweightCsv", () => {
  it("round-trips Tropos exportBodyweightCSV output", () => {
    const csv = [
      "Date,Weight (kg)",
      "2026-10-20,76.4",
      "2026-10-22,76.1",
      "2026-10-24,75.9",
    ].join("\n");

    const parsed = parseBodyweightCsv(csv, { todayKey: TODAY });
    expect(parsed.earliestDate).toBe("2026-10-20");
    expect(parsed.latestDate).toBe("2026-10-24");
    expect(parsed.entries.map((e) => [e.date, e.weightKg])).toEqual([
      ["2026-10-20", 76.4],
      ["2026-10-22", 76.1],
      ["2026-10-24", 75.9],
    ]);
  });

  it("parses Happy Scale CSV in lbs, ignores moving_average column, and collapses same-day duplicates to latest reading", () => {
    const csv = [
      "date,weight,moving_average,notes",
      "10/18/2026 07:00,170.0,170.4,morning",
      "10/18/2026 20:15,171.2,170.5,evening",
      "10/19/2026 07:10,169.5,170.2,",
    ].join("\n");

    const parsed = parseBodyweightCsv(csv, {
      defaultWeightUnit: "lbs",
      todayKey: TODAY,
    });
    expect(parsed.entries).toHaveLength(2);
    expect(parsed.entries[0].date).toBe("2026-10-18");
    // Latest reading on 2026-10-18 wins (171.2 lb -> 77.66 kg)
    expect(parsed.entries[0].weightKg).toBeCloseTo(77.66, 2);
    expect(parsed.entries[1].date).toBe("2026-10-19");
    expect(parsed.entries[1].weightKg).toBeCloseTo(76.88, 2);
  });

  it("parses Renpho CSV with month-name AM/PM timestamps, inline units, and ignores fat/muscle columns", () => {
    const csv = [
      "\uFEFFTime of Measurement,Weight(lb),Body Fat(%),Muscle Mass(lb)",
      '"Oct 12, 2026 7:15:00 AM","165.4 lb",16.2,130.1',
      '"Oct 13, 2026 7:05:00 AM","11 st 10 lb",16.0,130.2',
    ].join("\r\n");

    const parsed = parseBodyweightCsv(csv, { todayKey: TODAY });
    expect(parsed.entries).toHaveLength(2);
    expect(parsed.entries[0].date).toBe("2026-10-12");
    expect(parsed.entries[0].weightKg).toBeCloseTo(75.02, 2);
    expect(parsed.entries[1].date).toBe("2026-10-13");
    // 11 st 10 lb = 164 lb -> 74.39 kg
    expect(parsed.entries[1].weightKg).toBeCloseTo(74.39, 2);
  });

  it("parses semicolon-delimited Withings CSV with European decimal commas and filters out-of-range / future rows", () => {
    const csv = [
      "Date;Weight (kg);Fat mass (kg)",
      "2026-10-15 07:30:00;74,8;11,2",
      "2026-10-16 07:30:00;5,0;1,0",
      "2026-11-01 07:30:00;74,5;11,1",
    ].join("\n");

    const parsed = parseBodyweightCsv(csv, { todayKey: TODAY });
    expect(parsed.entries).toHaveLength(1);
    expect(parsed.entries[0].date).toBe("2026-10-15");
    expect(parsed.entries[0].weightKg).toBe(74.8);
  });

  it("throws typed BodyweightCsvImportError for empty or unrecognized CSVs", () => {
    expect(() => parseBodyweightCsv("Date,Weight (kg)\n")).toThrowError(
      BodyweightCsvImportError
    );
    try {
      parseBodyweightCsv("Name,Calories\nOats,350");
    } catch (err) {
      expect(err).toBeInstanceOf(BodyweightCsvImportError);
      expect((err as BodyweightCsvImportError).code).toBe(
        "CSV_UNRECOGNIZED_FORMAT"
      );
    }
  });
});

describe("importBodyweightCsv", () => {
  it("queues date-keyed durable writes into users/{uid}/bodyweightLogs and flushes", async () => {
    const csv = ["Date,Weight (kg)", "2026-10-10,77.2", "2026-10-12,76.8"].join(
      "\n"
    );

    const summary = await importBodyweightCsv("user-1", csv, {
      todayKey: TODAY,
    });
    expect(summary).toEqual({
      importedCount: 2,
      earliestDate: "2026-10-10",
      latestDate: "2026-10-12",
    });
    expect(mocks.commitBulkImportWrites).toHaveBeenCalledOnce();
    const [uid, writes] = mocks.commitBulkImportWrites.mock.calls[0];
    expect(uid).toBe("user-1");
    expect(writes).toHaveLength(2);
    expect(writes[0]).toEqual(
      expect.objectContaining({
        collectionPath: "users/user-1/bodyweightLogs",
        docId: "2026-10-10",
        merge: true,
        data: expect.objectContaining({
          date: "2026-10-10",
          weight: 77.2,
          source: "import",
        }),
      })
    );
  });
});
