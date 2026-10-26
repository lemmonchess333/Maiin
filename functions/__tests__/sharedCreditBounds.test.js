/**
 * The bounds on what one session adds to a shared total
 * (lib/sharedCreditBounds.js), and the forged records they stop.
 *
 * Three of the four bounds are the numbers firestore.rules already puts on
 * a shared activity post. The first block reads them out of the rules, so
 * moving one without the other fails here rather than leaving the feed
 * and the boards disagreeing about what a plausible session is.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  MAX_RUN_METERS,
  MAX_SESSION_VOLUME_KG,
  MAX_SESSION_SECONDS,
  MAX_RUN_SPEED_MPS,
  creditableRunMeters,
  creditableVolumeKg,
  creditableSessionSeconds,
} from "../lib/sharedCreditBounds";
import {
  runChallengeIncrements,
  workoutChallengeIncrements,
} from "../lib/challengeBackfill";
import { runMetersFor, liftVolumeKgFor } from "../lib/lifetimeAccrual";
import { participationValue } from "../lib/challengeParticipationProgress";

const rules = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "..", "..", "firestore.rules"),
  "utf8"
);

/** The upper bound the activity create rule puts on `field`. */
function activityRuleBound(field) {
  const m = rules.match(
    new RegExp(`request\\.resource\\.data\\.${field}\\s*<=\\s*(\\d+)`)
  );
  expect(m, `firestore.rules has no "<=" bound on ${field}`).not.toBeNull();
  return Number(m[1]);
}

describe("the bounds are the activity rule's", () => {
  it("run distance", () => {
    expect(MAX_RUN_METERS).toBe(activityRuleBound("distance"));
  });
  it("session duration", () => {
    expect(MAX_SESSION_SECONDS).toBe(activityRuleBound("duration"));
  });
  it("session volume", () => {
    expect(MAX_SESSION_VOLUME_KG).toBe(activityRuleBound("totalVolume"));
  });
});

describe("creditableRunMeters", () => {
  it("passes a real run through, ultras included", () => {
    expect(creditableRunMeters(5000, 1500)).toBe(5000);
    // A 24-hour race: 250 km in 86,400 s.
    expect(creditableRunMeters(250000, 86400)).toBe(250000);
    // The 100 m world record, 9.58 s: 10.4 m/s, under the speed bound.
    expect(creditableRunMeters(100, 9.58)).toBe(100);
  });

  it("credits nothing past 500 km", () => {
    expect(creditableRunMeters(MAX_RUN_METERS, 200000)).toBe(MAX_RUN_METERS);
    expect(creditableRunMeters(MAX_RUN_METERS + 1, 200000)).toBe(0);
    expect(creditableRunMeters(1e9, 1e9)).toBe(0);
  });

  it("credits nothing faster than any run on foot", () => {
    // 5 km in 30 s, the eligibility floor: 167 m/s.
    expect(creditableRunMeters(5000, 30)).toBe(0);
    // A 40 km drive saved as a run, in 40 minutes: 16.7 m/s.
    expect(creditableRunMeters(40000, 2400)).toBe(0);
    expect(creditableRunMeters(1200, 1200 / MAX_RUN_SPEED_MPS)).toBe(1200);
  });

  it("judges a run with no duration on distance alone", () => {
    expect(creditableRunMeters(6000, undefined)).toBe(6000);
  });

  it("credits nothing for a missing, zero, negative or non-numeric distance", () => {
    expect(creditableRunMeters(0, 100)).toBe(0);
    expect(creditableRunMeters(-5000, 100)).toBe(0);
    expect(creditableRunMeters("far", 100)).toBe(0);
    expect(creditableRunMeters(undefined, 100)).toBe(0);
  });
});

describe("creditableVolumeKg and creditableSessionSeconds", () => {
  it("passes volume up to a million kilograms, and nothing past it", () => {
    expect(creditableVolumeKg(12345)).toBe(12345);
    expect(creditableVolumeKg(MAX_SESSION_VOLUME_KG)).toBe(
      MAX_SESSION_VOLUME_KG
    );
    expect(creditableVolumeKg(MAX_SESSION_VOLUME_KG + 1)).toBe(0);
    expect(creditableVolumeKg(-10)).toBe(0);
  });

  it("counts a session's time up to 24 hours", () => {
    expect(creditableSessionSeconds(3600)).toBe(3600);
    // A 30-hour ultra is real: it earns a full day, not nothing.
    expect(creditableSessionSeconds(108000)).toBe(MAX_SESSION_SECONDS);
    expect(creditableSessionSeconds(0)).toBe(0);
    expect(creditableSessionSeconds(-60)).toBe(0);
  });
});

describe("the forged records the bounds stop", () => {
  it("a 50 m run carrying a billion in distanceKm credits 50 m", () => {
    // The gate checks `distance`; the challenge mapping used to read
    // `distanceKm` first and credit it.
    const forged = { distance: 50, duration: 30, distanceKm: 1e9 };
    expect(runChallengeIncrements(forged)).toEqual([
      { metric: "total_km", value: 0.05 },
      { metric: "hybrid_score", value: 5 },
      { metric: "fastest_effort", meters: 50, seconds: 30 },
    ]);
    expect(runMetersFor(forged)).toBe(50);
  });

  it("a billion-metre run credits nothing, on any board or the lifetime total", () => {
    const forged = { distance: 1e9, duration: 31 };
    expect(runChallengeIncrements(forged)).toEqual([]);
    expect(runMetersFor(forged)).toBe(0);
  });

  it("a 5 km run in 30 s does not reach the fastest board", () => {
    expect(runChallengeIncrements({ distance: 5000, duration: 30 })).toEqual(
      []
    );
  });

  it("a workout stating a trillion kilograms counts as a workout and adds no volume", () => {
    const forged = { date: "2026-08-05", totalVolume: 1e12 };
    expect(workoutChallengeIncrements(forged)).toEqual([
      { metric: "workout_count", value: 1 },
    ]);
    expect(liftVolumeKgFor(forged)).toBe(0);
  });

  it("a session claiming a million minutes adds at most a day to a minutes goal", () => {
    const challenge = {
      metric: "training_minutes",
      startDate: new Date("2026-08-01T00:00:00Z"),
      endDate: new Date("2026-09-01T00:00:00Z"),
    };
    const workouts = [{ date: "2026-08-05", durationMinutes: 1e6 }];
    expect(participationValue(challenge, workouts, [])).toBe(24 * 60);
  });

  it("leaves real sessions exactly as they were", () => {
    expect(runChallengeIncrements({ distance: 5137, duration: 1544 })).toEqual([
      { metric: "total_km", value: 5.14 },
      { metric: "hybrid_score", value: 514 },
      { metric: "fastest_effort", meters: 5137, seconds: 1544 },
    ]);
    expect(workoutChallengeIncrements({ totalVolume: 4321 })).toEqual([
      { metric: "workout_count", value: 1 },
      { metric: "total_volume", value: 4321 },
      { metric: "hybrid_score", value: 432 },
    ]);
  });
});
