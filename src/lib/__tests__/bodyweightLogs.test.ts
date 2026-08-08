import { describe, expect, it } from "vitest";
import {
  collapseBodyweightLogs,
  weighInProfileMirror,
} from "../bodyweightLogs";

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

describe("weighInProfileMirror — the weigh-in updates the anchor everyone reads", () => {
  // profile.weightKg feeds calculateTDEE, getAdjustedTargets' protein/fat
  // scaling, and resolveGoalWeightPlan's direction. The daily weigh-in flow
  // wrote bodyweightLogs only, so the anchor went stale for months —
  // probe-measured: a 90→78kg cut ran +26g/day protein and a 186 kcal/day
  // target overshoot against the 90 that no longer existed.
  it("returns a rounded patch when the weight genuinely moved", () => {
    expect(weighInProfileMirror(90, 78.04)).toEqual({ weightKg: 78 });
    expect(weighInProfileMirror(undefined, 82.55)).toEqual({ weightKg: 82.6 });
    expect(weighInProfileMirror(null, 70)).toEqual({ weightKg: 70 });
  });

  it("returns null when nothing meaningful changed — no wasted write", () => {
    expect(weighInProfileMirror(78, 78)).toBeNull();
    expect(weighInProfileMirror(78, 78.04)).toBeNull(); // rounds to 78
    expect(weighInProfileMirror(78.1, 78.1)).toBeNull();
  });

  it("never mirrors garbage", () => {
    expect(weighInProfileMirror(78, 0)).toBeNull();
    expect(weighInProfileMirror(78, -5)).toBeNull();
    expect(weighInProfileMirror(78, Number.NaN)).toBeNull();
    expect(weighInProfileMirror(78, Number.POSITIVE_INFINITY)).toBeNull();
  });

  it("a legacy weightKg of 0 does not block the first real mirror", () => {
    // 0 is exactly the stored-garbage case the input guards now prevent —
    // the mirror is one of the paths that heals it.
    expect(weighInProfileMirror(0, 78)).toEqual({ weightKg: 78 });
  });
});
