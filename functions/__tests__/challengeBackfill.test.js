/**
 * functions/lib/challengeBackfill.js — the ONE source→increment mapping
 * shared by the live activity triggers and the join-time backfill.
 *
 * Two things are pinned here:
 *   1. The increment VALUES (workout_count 1, total_volume kg,
 *      hybrid_score round(kg×0.1) / round(km×100), total_km 2dp,
 *      fastest_effort meters+seconds tuple) — the arithmetic the live
 *      triggers used to compute inline.
 *   2. REACHABILITY (ADR-0008): the live onWorkoutCreated / onRunCreated
 *      bodies actually consume these helpers, so the backfill cannot
 *      silently drift from what live crediting does. Without that pin,
 *      this module is the "tested copy" and index.js the diverging
 *      "running copy" — the repo's #1 recurring mistake.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  metricNeedsWorkouts,
  metricNeedsRuns,
  backfillQueryWindow,
  workoutChallengeIncrements,
  runChallengeIncrements,
} from "../lib/challengeBackfill";

const JULY = {
  startDate: new Date("2026-07-01T00:00:00Z"),
  endDate: new Date("2026-08-01T00:00:00Z"),
};

describe("metric routing", () => {
  it("workout metrics come from workouts, run metrics from runs, hybrid from both", () => {
    expect(metricNeedsWorkouts("workout_count")).toBe(true);
    expect(metricNeedsWorkouts("total_volume")).toBe(true);
    expect(metricNeedsWorkouts("hybrid_score")).toBe(true);
    expect(metricNeedsWorkouts("total_km")).toBe(false);
    expect(metricNeedsWorkouts("fastest_effort")).toBe(false);

    expect(metricNeedsRuns("total_km")).toBe(true);
    expect(metricNeedsRuns("fastest_effort")).toBe(true);
    expect(metricNeedsRuns("hybrid_score")).toBe(true);
    expect(metricNeedsRuns("workout_count")).toBe(false);
    expect(metricNeedsRuns("total_volume")).toBe(false);

    // Unknown/absent metric routes nowhere — the backfill is a no-op.
    expect(metricNeedsWorkouts(undefined)).toBe(false);
    expect(metricNeedsRuns("group_goal")).toBe(false);
  });
});

describe("backfillQueryWindow", () => {
  it("yields the challenge's UTC day-key range", () => {
    expect(backfillQueryWindow(JULY)).toEqual({
      startKey: "2026-07-01",
      endKey: "2026-08-01",
    });
  });

  it("fails closed on missing or reversed dates", () => {
    expect(backfillQueryWindow({})).toBeNull();
    expect(backfillQueryWindow(null)).toBeNull();
    expect(backfillQueryWindow({ startDate: JULY.startDate })).toBeNull();
    expect(
      backfillQueryWindow({
        startDate: JULY.endDate,
        endDate: JULY.startDate,
      })
    ).toBeNull();
    expect(
      backfillQueryWindow({
        startDate: JULY.startDate,
        endDate: JULY.startDate,
      })
    ).toBeNull();
  });
});

describe("workoutChallengeIncrements", () => {
  it("every workout counts once; volume-bearing workouts add tonnage + hybrid term", () => {
    expect(workoutChallengeIncrements({ totalVolume: 4321 })).toEqual([
      { metric: "workout_count", value: 1 },
      { metric: "total_volume", value: 4321 },
      // hybrid volume term is kg×0.1, rounded — 432.1 → 432
      { metric: "hybrid_score", value: 432 },
    ]);
  });

  it("a volume-less workout only feeds workout_count", () => {
    expect(workoutChallengeIncrements({})).toEqual([
      { metric: "workout_count", value: 1 },
    ]);
    expect(workoutChallengeIncrements({ totalVolume: 0 })).toEqual([
      { metric: "workout_count", value: 1 },
    ]);
  });
});

describe("runChallengeIncrements", () => {
  it("distance feeds total_km (2dp) + hybrid (km×100); timed distance feeds fastest_effort", () => {
    expect(runChallengeIncrements({ distance: 5137, duration: 1544 })).toEqual([
      { metric: "total_km", value: 5.14 },
      { metric: "hybrid_score", value: 514 },
      { metric: "fastest_effort", meters: 5137, seconds: 1544 },
    ]);
  });

  it("prefers distanceKm when present, deriving meters from it for fastest_effort", () => {
    expect(runChallengeIncrements({ distanceKm: 10 })).toEqual([
      { metric: "total_km", value: 10 },
      { metric: "hybrid_score", value: 1000 },
      // no duration → no fastest_effort entry
    ]);
  });

  it("a zero-distance or zero-duration run produces no fastest_effort entry", () => {
    expect(runChallengeIncrements({ duration: 1800 })).toEqual([]);
    expect(runChallengeIncrements({})).toEqual([]);
  });
});

describe("reachability: the live triggers consume the shared mapping (ADR-0008)", () => {
  const indexSource = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "..", "index.js"),
    "utf8"
  );

  it("onWorkoutCreated and onRunCreated iterate the increments helpers", () => {
    // The live crediting path and the backfill must share the mapping.
    // If either trigger reverts to inline values, this fails and the
    // backfill becomes an untested mirror — don't let it.
    expect(indexSource).toContain(
      "challengeBackfill.workoutChallengeIncrements(data)"
    );
    expect(indexSource).toContain(
      "challengeBackfill.runChallengeIncrements(data)"
    );
  });

  it("the participant-create trigger runs the backfill", () => {
    expect(indexSource).toContain("backfillChallengeProgressForParticipant(");
    // Runs replayed by the backfill pass the same eligibility gate the
    // live trigger applies.
    expect(indexSource).toMatch(
      /backfillChallengeProgressForParticipant[\s\S]{0,2000}isVolumeEligibleRun\(data\)/
    );
  });
});
