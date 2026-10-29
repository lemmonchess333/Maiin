import { describe, expect, it } from "vitest";
import {
  historyDatePresets,
  trainingHistoryFilters,
  trainingHistoryReturnTo,
  trainingHistorySearch,
  trainingHistorySessions,
  validHistoryDate,
} from "../trainingHistory";
import type { SavedRun } from "../savedRuns";
import type { Workout } from "../savedWorkouts";

const TODAY = "2026-10-29";
const filters = (query = "") =>
  trainingHistoryFilters(new URLSearchParams(query), TODAY);
const workout = (id: string, date: string): Workout => ({
  id,
  date,
  notes: "Full body B — Programme Week 1",
  durationMinutes: 46,
  exercises: [],
  totalCalories: 0,
  createdAt: null!,
});
const run = (
  id: string,
  day: string,
  extra: Partial<SavedRun> = {}
): SavedRun => ({
  id,
  day,
  date: day,
  completedAt: new Date("2026-10-30T01:00:00Z"),
  savedAtSeconds: 0,
  activityType: "easy",
  distance: 5000,
  duration: 1800,
  avgPace: 360,
  calories: 0,
  elevationGain: 0,
  relativeEffort: null,
  ...extra,
});

describe("training history date and URL state", () => {
  it("defaults to exactly 30 inclusive local days", () => {
    expect(filters()).toEqual({
      from: "2026-09-30",
      to: TODAY,
      sport: "all",
      search: "",
    });
    expect(historyDatePresets("2027-01-01")[1].dates).toEqual({
      from: "2026-12-03",
      to: "2027-01-01",
    });
    expect(historyDatePresets("2026-03-30")[0].dates).toEqual({
      from: "2026-03-30",
      to: "2026-03-30",
    });
  });

  it.each([
    "2026-02-29",
    "2026-04-31",
    "2026-13-01",
    "2026-00-01",
    "2026-10-00",
    "2026-10-29T00:00:00Z",
    "garbage",
  ])("rejects a malformed calendar day: %s", (value) => {
    expect(validHistoryDate(value)).toBe(false);
    expect(filters(`from=${value}&to=2026-10-29`).from).toBe("2026-09-30");
  });

  it("accepts a leap day and replaces a reversed period rather than issuing it", () => {
    expect(validHistoryDate("2028-02-29")).toBe(true);
    expect(filters("from=2026-10-29&to=2026-10-01")).toEqual(filters());
  });

  it("round-trips a pinned period, sport and a name with URL punctuation", () => {
    const chosen = {
      from: "2025-01-01",
      to: "2025-02-01",
      sport: "runs" as const,
      search: "Tempo & Treadmill",
    };
    const query = trainingHistorySearch(chosen);
    expect(
      trainingHistoryFilters(new URLSearchParams(query), "2027-01-01")
    ).toEqual(chosen);
    expect(filters("sport=unknown").sport).toBe("all");
  });

  it("accepts only internal session-history return paths", () => {
    expect(
      trainingHistoryReturnTo({
        trainingHistoryReturnTo: "/history/sessions?from=2026-01-01&sport=runs",
      })
    ).toBe("/history/sessions?from=2026-01-01&sport=runs");
    for (const path of [
      "https://example.com",
      "//example.com",
      "/history/sessions-extra",
      "/program",
      null,
    ]) {
      expect(
        trainingHistoryReturnTo({ trainingHistoryReturnTo: path })
      ).toBeNull();
    }
  });
});

describe("a saved-session chronology", () => {
  it("uses session days, including a run completed on a later day", () => {
    const rows = trainingHistorySessions(
      [workout("lift", "2026-10-28")],
      [run("run", "2026-10-27")],
      filters(),
      "km"
    );
    expect(rows.map((row) => [row.kind, row.day])).toEqual([
      ["lift", "2026-10-28"],
      ["run", "2026-10-27"],
    ]);
    expect(rows[0].title).toBe("Full body B");
    expect(rows[1].summary).toEqual(["5.0 km", "30:00", "6:00 /km"]);
  });

  it("keeps every same-day record and includes both period bounds", () => {
    const lifts = Array.from({ length: 70 }, (_, i) =>
      workout(`w${i}`, "2026-10-29")
    );
    const runs = [run("first-day", "2026-09-30"), run("outside", "2026-09-29")];
    const rows = trainingHistorySessions(lifts, runs, filters(), "km");
    expect(rows).toHaveLength(71);
    expect(new Set(rows.map((row) => row.key)).size).toBe(71);
    expect(rows.at(-1)?.id).toBe("first-day");
    expect(
      trainingHistorySessions([...lifts].reverse(), runs, filters(), "km").map(
        (row) => row.key
      )
    ).toEqual(rows.map((row) => row.key));
  });

  it("searches only the period and sport, and preserves treadmill and invalid identities", () => {
    const runs = [
      run("belt", "2026-10-28", {
        activityType: "long",
        place: "treadmill",
        isInvalid: true,
      }),
      run("old", "2025-10-01", { activityType: "long", place: "treadmill" }),
    ];
    const rows = trainingHistorySessions(
      [workout("lift", "2026-10-29")],
      runs,
      filters("sport=runs&q=TREADMILL"),
      "mi"
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      title: "Long run · Treadmill",
      notCounted: true,
      href: "/run/belt",
    });
    expect(rows[0].summary[0]).toContain("mi");
    expect(rows[0].summary[2]).toContain("/mi");
    expect(
      trainingHistorySessions([], runs, filters("sport=lifts"), "km")
    ).toEqual([]);
  });

  it("never fabricates a pace for a zero-distance run or a duration for an old untimed lift", () => {
    const rows = trainingHistorySessions(
      [{ ...workout("old", TODAY), durationMinutes: undefined! }],
      [run("zero", TODAY, { distance: 0 })],
      filters(),
      "km"
    );
    expect(rows[0].summary).toEqual(["0 exercises"]);
    expect(rows[1].summary).toHaveLength(2);
    expect(rows[1].notCounted).toBe(true);
  });
});
