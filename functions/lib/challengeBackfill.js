"use strict";

/**
 * Challenge crediting increments — the ONE mapping from a source activity
 * doc to the challenge increments it produces, shared by the live
 * onWorkoutCreated / onRunCreated triggers AND the join-time backfill
 * (onChallengeParticipantCreated).
 *
 * Why shared: the backfill replays historical sources through the same
 * transactional apply path the live triggers use, so the VALUES must come
 * from one place — two copies of "a workout's hybrid term is
 * round(volume × 0.1)" is exactly the tested-copy-vs-running-copy drift
 * this repo keeps refixing. A source-reachability test pins that the live
 * triggers actually consume these helpers (ADR-0008: reachability over
 * prose).
 *
 * The join-time backfill itself (probe sweep 2026-08-05, third unverified
 * finding — verified 2026-08-08): joining a challenge mid-period credited
 * NOTHING retroactively. onChallengeParticipantCreated only recomputed
 * participantCount, and the sync functions fire only on activity creation,
 * so a user who joined Fastest 5K on day 20 got zero credit for their
 * day-5 run, permanently — while the reference apps (Strava) credit all
 * in-window activity on join. The idempotency markers
 * (participants/{uid}/applied/{sourceId}) make replay safe against both
 * live-sync races and trigger redelivery.
 */

const { instantToDateKey } = require("./challengeActivityWindow");
const { workoutVolumeKg } = require("./workoutVolume");

/** Metrics fed by workout docs / run docs. hybrid_score draws from both. */
const WORKOUT_METRICS = ["workout_count", "total_volume", "hybrid_score"];
const RUN_METRICS = ["total_km", "hybrid_score", "fastest_effort"];

function metricNeedsWorkouts(metric) {
  return WORKOUT_METRICS.includes(metric);
}

function metricNeedsRuns(metric) {
  return RUN_METRICS.includes(metric);
}

/**
 * The challenge's [startKey, endKey) day-key window for the backfill's
 * bounded source query. Fail closed (null) on missing/invalid/reversed
 * dates — same posture as challengeContainsActivityDate, which remains
 * the per-source authority; this is only the query bound.
 */
function backfillQueryWindow(challenge) {
  const startKey = instantToDateKey(challenge && challenge.startDate);
  const endKey = instantToDateKey(challenge && challenge.endDate);
  if (!startKey || !endKey || startKey >= endKey) return null;
  return { startKey, endKey };
}

/**
 * SUM-metric increments a workout doc produces. Mirrors (and is consumed
 * by) the onWorkoutCreated trigger: every workout counts once toward
 * workout_count; volume-bearing workouts add their tonnage to
 * total_volume and their kg×0.1 term to hybrid_score.
 */
function workoutChallengeIncrements(data) {
  const out = [{ metric: "workout_count", value: 1 }];
  /* Was `data.totalVolume` directly, which no workout doc carried — so
     this branch never ran and lifts credited nothing to total_volume or
     the hybrid score. `workoutVolumeKg` reads the field when present and
     derives it from the sets when not, which also credits the history
     the join-time backfill replays. */
  const volume = workoutVolumeKg(data);
  if (volume) {
    out.push({ metric: "total_volume", value: volume });
    out.push({ metric: "hybrid_score", value: Math.round(volume * 0.1) });
  }
  return out;
}

/**
 * Increments an ELIGIBLE run doc produces (caller must have applied
 * isVolumeEligibleRun — the same gate the live trigger uses, so
 * isInvalid / savedAnyway / sub-threshold runs never credit, live or
 * backfilled). SUM entries carry {metric, value}; the fastest_effort
 * entry carries {metric, meters, seconds} because its apply path is
 * MIN-based with a target-distance gate, not a sum.
 */
function runChallengeIncrements(data) {
  const out = [];
  const distanceKm =
    (data && data.distanceKm) ||
    (data && data.distance ? data.distance / 1000 : 0);
  if (distanceKm > 0) {
    out.push({
      metric: "total_km",
      value: Math.round(distanceKm * 100) / 100,
    });
    out.push({ metric: "hybrid_score", value: Math.round(distanceKm * 100) });
  }
  const meters = (data && data.distance) || distanceKm * 1000 || 0;
  const seconds = (data && data.duration) || 0;
  if (meters > 0 && seconds > 0) {
    out.push({ metric: "fastest_effort", meters, seconds });
  }
  return out;
}

module.exports = {
  metricNeedsWorkouts,
  metricNeedsRuns,
  backfillQueryWindow,
  workoutChallengeIncrements,
  runChallengeIncrements,
};
