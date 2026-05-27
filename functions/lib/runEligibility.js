/**
 * Shared volume-eligibility predicate for saved-run documents.
 *
 * Previously inlined as `_isVolumeEligibleRun` in `index.js` and
 * also duplicated inline inside `onRunCreated`'s challenge/PR sync
 * branch. Mirror of `src/lib/runStatsEligibility.ts:isVolumeEligible`
 * — the client-side source-of-truth that History filtering, PR
 * computation, weekly stats, and the crew leaderboards all share.
 *
 * Defends against:
 *   - `isInvalid` runs that the user explicitly flagged as broken
 *   - `savedAnyway` runs (a "Save anyway" on a sub-threshold record)
 *   - Distance-too-short (<50m) or duration-too-short (<30s) saves
 *
 * `functions/` is plain CommonJS so we can't import the TS module
 * directly. Keep this file in lockstep with the TS source — any
 * eligibility rule added there must be added here.
 */

function isVolumeEligibleRun(data) {
  if (!data) return false;
  if (data.isInvalid === true) return false;
  if (data.savedAnyway === true) return false;
  if (!(Number(data.distance) || 0) || Number(data.distance) < 50) return false;
  if (!(Number(data.duration) || 0) || Number(data.duration) < 30) return false;
  return true;
}

module.exports = { isVolumeEligibleRun };
