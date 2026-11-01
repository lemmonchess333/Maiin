"use strict";

/**
 * How a plan write leaves the race goal, and the public "Training for" chip
 * that names it.
 *
 * The plan writers (configurePlan, completeOnboarding) are sent the race
 * goal whole: distance and date, and the optional event name, goal time and
 * race-space link. A merge write keeps every stored key the new value leaves
 * out, so a goal moved off a listed race kept that race's link, and an event
 * name or goal time once set could not be taken off. `wholeRaceGoal` adds a
 * delete for each of those keys.
 *
 * The chip (`trainingForSpaceId` on users/{uid}/public/profile) is the
 * person's choice, made on their race's Space, to show that race. When the
 * goal no longer links to it the chip goes, in the same commit.
 */

/**
 * @param {unknown} next - the race goal the write sends (an object, or null)
 * @param {unknown} stored - the race goal on the profile now
 * @param {unknown} deleteField - the SDK's delete sentinel
 */
function wholeRaceGoal(next, stored, deleteField) {
  if (!next || typeof next !== "object" || Array.isArray(next)) return next;
  const out = { ...next };
  if (stored && typeof stored === "object" && !Array.isArray(stored)) {
    for (const key of Object.keys(stored)) {
      if (!(key in next)) out[key] = deleteField;
    }
  }
  return out;
}

/**
 * The starter goal (Run9's 30 minutes without stopping) is written whole
 * the same way: a goal begun after one finished or ended must not keep the
 * old goal's `finishedOn`, `endedOn` or `stage`, which a merge would.
 *
 * @param {unknown} next - the starter goal the write sends (an object, or null)
 * @param {unknown} stored - the starter goal on the profile now
 * @param {unknown} deleteField - the SDK's delete sentinel
 */
function wholeStarterGoal(next, stored, deleteField) {
  return wholeRaceGoal(next, stored, deleteField);
}

/**
 * @param {unknown} shown - the stored trainingForSpaceId
 * @param {unknown} raceGoal - the race goal the write leaves on the profile
 * @returns {boolean} true when the chip names a race the goal is not
 */
function raceIdentityIsStale(shown, raceGoal) {
  if (typeof shown !== "string" || shown === "") return false;
  const linked =
    raceGoal && typeof raceGoal === "object" && !Array.isArray(raceGoal)
      ? raceGoal.eventSpaceId
      : undefined;
  return shown !== linked;
}

module.exports = { wholeRaceGoal, wholeStarterGoal, raceIdentityIsStale };
