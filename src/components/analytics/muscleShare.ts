/* ─────────────────────────────────────────────
   Muscle volume share tiers — Hist5c pin 8.

   Replaces the previous absolute set-count buckets (≤30 low, ≤70
   mid, >70 high) which saturated the MuscleHeatMap body diagram
   uniformly purple at long windows. Share-based tiers survive any
   window length: a muscle at 22% of total volume reads "high"
   whether the window is 1W with 50 total sets or 1Y with 2,500.

   Kept as a sibling module (not co-located in MuscleHeatMap.tsx)
   because react-refresh requires component files to export only
   components.
   ───────────────────────────────────────────── */

/** ≥18% of total volume → high tier (saturated diagram fill). */
export const HIGH_SHARE = 0.18;
/** ≥8% → mid; otherwise → low. */
export const MID_SHARE = 0.08;

export type ShareTier = "high" | "mid" | "low";

/**
 * Compute the share tier for a muscle group's set count relative
 * to the total sets across all groups in the same window.
 * Defensive against zero/negative totals (returns "low").
 */
export function getShareTier(sets: number, totalSets: number): ShareTier {
  if (totalSets <= 0) return "low";
  const share = sets / totalSets;
  if (share >= HIGH_SHARE) return "high";
  if (share >= MID_SHARE) return "mid";
  return "low";
}

export function getFrequencyForShare(
  sets: number,
  totalSets: number,
): 1 | 2 | 3 {
  const tier = getShareTier(sets, totalSets);
  if (tier === "low") return 1;
  if (tier === "mid") return 2;
  return 3;
}
