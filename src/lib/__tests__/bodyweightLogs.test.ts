import { describe, expect, it } from "vitest";
import { collapseBodyweightLogs } from "../bodyweightLogs";

describe("collapseBodyweightLogs", () => {
  it("returns one newest date-keyed manual row per local day", () => {
    expect(
      collapseBodyweightLogs([
        {
          id: "legacy-a",
          date: "2026-07-12",
          weight: 80.4,
          createdAt: 100,
        },
        {
          id: "2026-07-12",
          date: "2026-07-12",
          weight: 80.1,
          source: "manual",
          updatedAt: 200,
        },
        {
          id: "2026-07-11",
          date: "2026-07-11",
          weight: 80.6,
          source: "manual",
        },
      ])
    ).toEqual([
      { date: "2026-07-12", weight: 80.1 },
      { date: "2026-07-11", weight: 80.6 },
    ]);
  });

  it("keeps a historical manual value over a newer HealthKit value", () => {
    expect(
      collapseBodyweightLogs([
        {
          id: "legacy-manual",
          date: "2026-07-12",
          weight: 80.2,
          createdAt: 10,
        },
        {
          id: "hk",
          date: "2026-07-12",
          weight: 81.9,
          source: "healthkit",
          updatedAt: 999,
        },
      ])
    ).toEqual([{ date: "2026-07-12", weight: 80.2 }]);
  });

  it("prefers a date-keyed row over a legacy auto-id row when both manual", () => {
    expect(
      collapseBodyweightLogs([
        { id: "legacy-auto", date: "2026-07-12", weight: 80.4 },
        {
          id: "2026-07-12",
          date: "2026-07-12",
          weight: 80.0,
          source: "manual",
        },
      ])
    ).toEqual([{ date: "2026-07-12", weight: 80.0 }]);
  });

  it("uses the newest timestamp when two legacy manual rows share a day", () => {
    expect(
      collapseBodyweightLogs([
        { id: "older", date: "2026-07-12", weight: 80.4, createdAt: 10 },
        { id: "newer", date: "2026-07-12", weight: 80.1, createdAt: 20 },
      ])
    ).toEqual([{ date: "2026-07-12", weight: 80.1 }]);
  });

  it("normalizes Firestore Timestamp-like createdAt/updatedAt", () => {
    const ts = (ms: number) => ({ toMillis: () => ms });
    expect(
      collapseBodyweightLogs([
        { id: "a", date: "2026-07-12", weight: 80.4, updatedAt: ts(10) },
        { id: "b", date: "2026-07-12", weight: 80.1, updatedAt: ts(20) },
      ])
    ).toEqual([{ date: "2026-07-12", weight: 80.1 }]);
  });

  it("drops malformed dates and weights", () => {
    expect(
      collapseBodyweightLogs([
        { id: "bad-date", date: "12/07/2026", weight: 80 },
        { id: "bad-day", date: "2026-07-32", weight: 80 },
        { id: "bad-weight", date: "2026-07-12", weight: Number.NaN },
        { id: "zero", date: "2026-07-11", weight: 0 },
      ])
    ).toEqual([]);
  });

  it("sorts results newest-day first", () => {
    const out = collapseBodyweightLogs([
      { id: "2026-07-10", date: "2026-07-10", weight: 80, source: "manual" },
      { id: "2026-07-12", date: "2026-07-12", weight: 81, source: "manual" },
      { id: "2026-07-11", date: "2026-07-11", weight: 82, source: "manual" },
    ]);
    expect(out.map((r) => r.date)).toEqual([
      "2026-07-12",
      "2026-07-11",
      "2026-07-10",
    ]);
  });
});
