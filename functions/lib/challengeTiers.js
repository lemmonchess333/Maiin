/**
 * Challenge tier resolution — JS mirror of
 * `src/features/challenges/challengeTiers.ts`.
 *
 * The single definition of "which tier has this value reached?" for both
 * metric families:
 *  - cumulative (total_volume, streak_days, …): higher is better, value >= threshold
 *  - fastest_effort: lower (faster) is better; value MUST be > 0 ("0 = no
 *    qualifying effort yet"), then value <= threshold, gold = quickest.
 *
 * `tierAchieved` is written on BOTH client and server, so these copies MUST
 * agree — pinned by src/features/challenges/__tests__/challengeTiers.cross.test.ts.
 * Pure functions only. Keep in lockstep with the TS source.
 *
 * This replaces two divergent inline blocks that previously lived in
 * functions/index.js: the fastest-effort block lacked the `> 0` guard (a
 * malformed 0-duration run could be awarded a tier) and used `tiers.x && …`
 * truthiness (rejecting a 0 threshold); the cumulative block used `|| Infinity`.
 */

/** Has `value` reached the single tier `threshold` for `metric`? */
function isTierAchieved(value, threshold, metric) {
  if (typeof threshold !== "number" || !Number.isFinite(threshold)) return false;
  if (metric === "fastest_effort") {
    return value > 0 && value <= threshold;
  }
  return value >= threshold;
}

/** The highest tier `value` has reached, or null. Written to tierAchieved. */
function resolveTier(value, tiers, metric) {
  if (!tiers) return null;
  if (isTierAchieved(value, tiers.gold, metric)) return "gold";
  if (isTierAchieved(value, tiers.silver, metric)) return "silver";
  if (isTierAchieved(value, tiers.bronze, metric)) return "bronze";
  return null;
}

module.exports = { isTierAchieved, resolveTier };
