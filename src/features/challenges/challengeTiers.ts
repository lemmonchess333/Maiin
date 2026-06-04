/**
 * Challenge tier resolution — the SINGLE definition of "which tier has this
 * value reached?" across both metric families:
 *  - **cumulative** (`total_volume`, `streak_days`, `combined_score`, …):
 *    higher is better → `value >= threshold`.
 *  - **`fastest_effort`**: lower (faster) is better; `value` MUST be `> 0`
 *    ("0 = no qualifying effort yet"), then `value <= threshold`, with gold the
 *    quickest threshold.
 *
 * Two physical copies exist — this client TS module and the server
 * `functions/lib/challengeTiers.js` — because `tierAchieved` is written on
 * BOTH sides: the client `updateProgress` and the server triggers
 * (`syncChallengeProgress` / `syncFastestEffortProgress`) each persist it. If
 * the two derive different tiers, a participant's stored tier flickers between
 * writers. They are pinned equal by `challengeTiers.cross.test.ts`. Keep this
 * in lockstep with the JS mirror.
 *
 * (Consolidation 2026-06-04: the server previously inlined this twice with
 * divergent semantics — the fastest-effort block lacked the `> 0` guard and
 * used `tiers.x && …` truthiness that rejected a 0 threshold; the cumulative
 * block used `|| Infinity`. Unifying here fixes those.)
 */

export type ChallengeTier = "bronze" | "silver" | "gold";

export interface ChallengeTiers {
  bronze: number;
  silver: number;
  gold: number;
}

/** Has `value` reached the single tier `threshold` for `metric`? */
export function isTierAchieved(
  value: number,
  threshold: number,
  metric: string
): boolean {
  if (typeof threshold !== "number" || !Number.isFinite(threshold))
    return false;
  if (metric === "fastest_effort") {
    // Lower is better; 0 means "no qualifying effort yet" → not achieved.
    return value > 0 && value <= threshold;
  }
  return value >= threshold;
}

/**
 * The highest tier `value` has reached, or `null`. This is what gets written to
 * `participants/{uid}.tierAchieved`. Gold is checked first for both families
 * (cumulative: highest threshold; fastest: quickest threshold).
 */
export function resolveTier(
  value: number,
  tiers: ChallengeTiers | null | undefined,
  metric: string
): ChallengeTier | null {
  if (!tiers) return null;
  if (isTierAchieved(value, tiers.gold, metric)) return "gold";
  if (isTierAchieved(value, tiers.silver, metric)) return "silver";
  if (isTierAchieved(value, tiers.bronze, metric)) return "bronze";
  return null;
}
