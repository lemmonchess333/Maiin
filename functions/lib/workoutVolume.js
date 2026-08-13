"use strict";

/**
 * The tonnage a workout doc represents, in kilograms.
 *
 * `totalVolume` is the field every server consumer wants — but no writer
 * put it on the workout doc until 2026-08-13. It was computed client-side
 * for the social ACTIVITY post and never carried onto
 * `users/{uid}/workouts/{id}`, which is the path `onWorkoutCreated` fires
 * on. So `workoutChallengeIncrements` skipped its volume branch and
 * `liftVolumeKgFor` returned 0, for every lift anyone had ever logged:
 * the `total_volume` challenge metric, the hybrid score's kg term and
 * lifetime lift volume all sat at zero while the app showed a full
 * training week.
 *
 * Every unit test passed throughout, because each fed a fixture carrying
 * `{ totalVolume: 4321 }` — a shape production never wrote. CLAUDE.md
 * names this exact failure as the repo's #1 recurring mistake: the tested
 * copy does not prove the running copy.
 *
 * Reading the field when present and DERIVING it from the sets otherwise
 * is what makes the fix retroactive. Without the fallback every workout
 * logged before the writer change stays uncredited forever — including
 * through the join-time backfill, which replays historical docs.
 *
 * The derivation must mirror the WRITER's tonnage rule, not merely look
 * like it. Both writers — `useProgram.completeWorkoutDay` and the server
 * command reducer — reduce with `repUnit === "seconds" ? 0 : …`, because
 * a timed hold's `reps` is a DURATION. `weighted-plank` is a real catalog
 * exercise carrying both a load and a `repUnit` of seconds, so a naive
 * `weightKg × reps` reads a 20 kg / 60 s hold as 1,200 kg of tonnage that
 * the writer itself scores as nothing. That gap only shows on the
 * derivation path, which is exactly the path that replays history — so it
 * would have written inflated numbers into permanent challenge totals
 * while every post-fix doc, carrying the stated field, stayed correct.
 */
function workoutVolumeKg(data) {
  const stated = Number(data && data.totalVolume);
  if (Number.isFinite(stated) && stated > 0) return stated;
  const exercises = (data && data.exercises) || [];
  if (!Array.isArray(exercises)) return 0;
  let total = 0;
  for (const ex of exercises) {
    if (ex && ex.repUnit === "seconds") continue;
    const sets = (ex && ex.sets) || [];
    if (!Array.isArray(sets)) continue;
    for (const set of sets) {
      const kg = Number(set && set.weightKg);
      const reps = Number(set && set.reps);
      if (Number.isFinite(kg) && Number.isFinite(reps)) total += kg * reps;
    }
  }
  return total > 0 ? total : 0;
}

/**
 * The metrics a lift-volume re-credit must replay, and the ones it must
 * NOT.
 *
 * `workout_count` credited correctly all along and carries an idempotency
 * marker for every workout, so replaying it is a guaranteed no-op — but a
 * guaranteed no-op still costs a transaction per workout per challenge.
 * The volume-bearing metrics are the entire gap, and they have no markers
 * to collide with, because the metric guard in
 * `applyChallengeProgressIncrement` returned before writing one.
 */
const RECREDIT_METRICS = ["total_volume", "hybrid_score"];

function isRecreditMetric(metric) {
  return RECREDIT_METRICS.includes(metric);
}

module.exports = { workoutVolumeKg, RECREDIT_METRICS, isRecreditMetric };
