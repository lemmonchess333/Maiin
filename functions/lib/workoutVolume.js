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
 */
function workoutVolumeKg(data) {
  const stated = Number(data && data.totalVolume);
  if (Number.isFinite(stated) && stated > 0) return stated;
  const exercises = (data && data.exercises) || [];
  if (!Array.isArray(exercises)) return 0;
  let total = 0;
  for (const ex of exercises) {
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

module.exports = { workoutVolumeKg };
