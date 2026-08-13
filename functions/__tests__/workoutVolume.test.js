/**
 * Lift volume, fed the shape the client ACTUALLY writes.
 *
 * The bug this pins was invisible for the life of the feature. Every
 * server consumer of a workout doc read `totalVolume`:
 *
 *   workoutChallengeIncrements → total_volume + the hybrid score's kg term
 *   liftVolumeKgFor            → lifetime lift volume (and its badges)
 *
 * and no writer ever put that field on `users/{uid}/workouts/{id}`, which
 * is the path `onWorkoutCreated` fires on. The tonnage was computed
 * client-side and written only onto the social ACTIVITY post. So the
 * volume branch never ran: every lift anyone logged credited exactly
 * nothing, while the app showed a full training week. Surfaced from a
 * device screenshot — a hybrid challenge reading 44 against a 3,000
 * bronze during a "High training load" week.
 *
 * IT PASSED THE WHOLE TIME because every fixture invented the field:
 * `workoutChallengeIncrements({ totalVolume: 4321 })`,
 * `liftVolumeKgFor({ totalVolume: 6000 })`. Both assert a correct helper
 * against a document production never produced — CLAUDE.md's #1 recurring
 * mistake, "the tested copy does not prove the running copy", in its
 * purest form.
 *
 * So these fixtures are WRITER-SHAPED: exercises carrying sets, exactly as
 * `useProgram`'s and `Routine`'s batch writes emit them, with the
 * historical case (no `totalVolume`) kept as its own test because that is
 * every workout logged before the fix.
 */
import { describe, it, expect } from "vitest";
import { workoutVolumeKg, isRecreditMetric } from "../lib/workoutVolume";
import { workoutChallengeIncrements } from "../lib/challengeBackfill";
import { liftVolumeKgFor } from "../lib/lifetimeAccrual";

/** A workout doc as the client writes it — note: no `totalVolume`. */
function historicalWorkoutDoc() {
  return {
    date: "2026-08-13",
    durationMinutes: 52,
    notes: "Pull — Lat Focus — Programme Week 12",
    source: "programme",
    exercises: [
      {
        exerciseName: "Barbell Row",
        sets: [
          { weightKg: 60, reps: 8 },
          { weightKg: 60, reps: 8 },
          { weightKg: 65, reps: 6 },
        ],
      },
      {
        exerciseName: "Lat Pulldown",
        sets: [
          { weightKg: 50, reps: 10 },
          { weightKg: 50, reps: 10 },
        ],
      },
    ],
  };
}

// 60×8 + 60×8 + 65×6 + 50×10 + 50×10 = 480 + 480 + 390 + 500 + 500
const EXPECTED_KG = 2350;

describe("workoutVolumeKg", () => {
  it("derives tonnage from a doc with no totalVolume — the historical shape", () => {
    expect(workoutVolumeKg(historicalWorkoutDoc())).toBe(EXPECTED_KG);
  });

  it("prefers the stated field once the writer supplies it", () => {
    /* Post-fix docs carry it, and the client's own figure is canonical —
       it saw the session, this only reconstructs it. */
    const doc = { ...historicalWorkoutDoc(), totalVolume: 2400 };
    expect(workoutVolumeKg(doc)).toBe(2400);
  });

  it("is zero for a session that moved no external load", () => {
    /* Bodyweight work is a real session with zero tonnage — it must not
       fall through to a derived guess, and must not throw. */
    expect(
      workoutVolumeKg({ exercises: [{ sets: [{ weightKg: 0, reps: 20 }] }] })
    ).toBe(0);
  });

  it("survives the shapes a partial or legacy doc can present", () => {
    expect(workoutVolumeKg(undefined)).toBe(0);
    expect(workoutVolumeKg({})).toBe(0);
    expect(workoutVolumeKg({ exercises: null })).toBe(0);
    expect(workoutVolumeKg({ exercises: [{}] })).toBe(0);
    expect(workoutVolumeKg({ exercises: [{ sets: "nope" }] })).toBe(0);
    expect(
      workoutVolumeKg({ exercises: [{ sets: [{ weightKg: "x", reps: 5 }] }] })
    ).toBe(0);
  });
});

describe("the consumers credit a real workout doc", () => {
  it("challenge increments include volume + the hybrid kg term", () => {
    /* The assertion the old fixture could not make. Pre-fix this returned
       workout_count alone. */
    const incs = workoutChallengeIncrements(historicalWorkoutDoc());
    expect(incs).toEqual([
      { metric: "workout_count", value: 1 },
      { metric: "total_volume", value: EXPECTED_KG },
      { metric: "hybrid_score", value: Math.round(EXPECTED_KG * 0.1) },
    ]);
  });

  it("lifetime lift volume counts the session", () => {
    expect(liftVolumeKgFor(historicalWorkoutDoc())).toBe(EXPECTED_KG);
  });

  it("a bodyweight session still counts once, without a volume term", () => {
    /* workout_count is unconditional; the volume metrics stay off rather
       than crediting a zero, which would write a no-op increment and an
       idempotency marker for nothing. */
    const incs = workoutChallengeIncrements({
      exercises: [{ sets: [{ weightKg: 0, reps: 20 }] }],
    });
    expect(incs).toEqual([{ metric: "workout_count", value: 1 }]);
  });
});

/**
 * Which metrics the one-shot re-credit replays.
 *
 * The selection is the whole safety argument, so it is a named helper
 * rather than an inline filter: `workout_count` credited correctly all
 * along AND carries a marker per workout, so replaying it is a guaranteed
 * no-op that still costs a transaction each time. The volume metrics are
 * the entire gap, and they carry no markers to collide with because the
 * metric guard returned before writing one.
 */
describe("re-credit metric selection", () => {
  it("replays exactly the metrics the missing field starved", () => {
    expect(isRecreditMetric("total_volume")).toBe(true);
    expect(isRecreditMetric("hybrid_score")).toBe(true);
  });

  it("does not replay the metric that was never broken", () => {
    /* Replaying workout_count would be safe but wasteful — and a future
       reader should see that the exclusion is deliberate, not an
       oversight. */
    expect(isRecreditMetric("workout_count")).toBe(false);
  });

  it("does not replay the run-fed metrics", () => {
    /* Runs credited correctly throughout: their doc carries `distance`.
       A workout replay must not touch them. */
    expect(isRecreditMetric("total_km")).toBe(false);
    expect(isRecreditMetric("fastest_effort")).toBe(false);
    expect(isRecreditMetric("streak_days")).toBe(false);
  });

  it("covers every volume-bearing metric a workout can produce", () => {
    /* Ties the list to the SOURCE mapping rather than restating it: any
       new volume metric added to `workoutChallengeIncrements` shows up
       here as an unreplayed gap. */
    const produced = workoutChallengeIncrements(historicalWorkoutDoc())
      .map((i) => i.metric)
      .filter((m) => m !== "workout_count");
    for (const metric of produced) {
      expect(isRecreditMetric(metric)).toBe(true);
    }
  });
});
