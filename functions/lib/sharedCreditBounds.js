"use strict";

/**
 * The most one logged session can add to a total that other people see
 * (challenge boards, which any signed-in user can read) or that unlocks a
 * public badge (lifetime totals).
 *
 * Sessions are client-written, and `users/{uid}/runs` and `/workouts` take
 * any owner write, so the credit path is where a value has to be held to
 * something: before these bounds a single hand-written run with a distance
 * of a billion metres went straight onto the km board and into lifetime
 * totals. The numbers are the ones firestore.rules already puts on a
 * shared activity post (the activity create rule's "Numeric bounds"), so a
 * session too big to post to the feed is too big for a board as well.
 * sharedCreditBounds.test.js reads them out of the rules and fails if the
 * two drift.
 *
 * Personal stats do not use these. A real 30-hour ultra still counts in
 * the runner's own history; it only stops adding minutes at 24 hours.
 */

/** 500 km in one run: the rules' "covers ultras". */
const MAX_RUN_METERS = 500000;
/** 1,000,000 kg in one session: the rules' "1M kg per session is plenty". */
const MAX_SESSION_VOLUME_KG = 1000000;
/** 24 hours in one session. */
const MAX_SESSION_SECONDS = 86400;
/** 12 m/s (43 km/h) average over a whole run. The one bound the rules do
 *  not already set: above the 100 m world record's average, so no run on
 *  foot reaches it, while a drive or a ride saved as a run does. Without
 *  it a hand-written 5 km in 30 seconds (the eligibility floor) led the
 *  fastest-5K board. */
const MAX_RUN_SPEED_MPS = 12;

/** A run's metres for shared totals: its own figure, or 0 when the run is
 *  past the distance bound or faster than any run on foot. A run with no
 *  duration is judged on distance alone; the live paths never credit one
 *  (isVolumeEligibleRun requires 30 s). */
function creditableRunMeters(meters, durationSeconds) {
  const value = Number(meters) || 0;
  if (!(value > 0) || value > MAX_RUN_METERS) return 0;
  const seconds = Number(durationSeconds) || 0;
  if (seconds > 0 && value / seconds > MAX_RUN_SPEED_MPS) return 0;
  return value;
}

/** A session's volume for shared totals: its own figure, or 0 past the
 *  bound. Zero rather than the bound, because no session lifts a million
 *  kilograms; a figure past it is a bad record, not a big day. */
function creditableVolumeKg(kg) {
  const value = Number(kg) || 0;
  return value > 0 && value <= MAX_SESSION_VOLUME_KG ? value : 0;
}

/** A session's time for minute goals, counted up to 24 hours. Clamped
 *  rather than dropped: unlike a million kilograms, a session past a day
 *  can be real. */
function creditableSessionSeconds(seconds) {
  const value = Number(seconds) || 0;
  return value > 0 ? Math.min(value, MAX_SESSION_SECONDS) : 0;
}

module.exports = {
  MAX_RUN_METERS,
  MAX_SESSION_VOLUME_KG,
  MAX_SESSION_SECONDS,
  MAX_RUN_SPEED_MPS,
  creditableRunMeters,
  creditableVolumeKg,
  creditableSessionSeconds,
};
