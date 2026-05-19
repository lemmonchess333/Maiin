/* ─────────────────────────────────────────────
   Performance card colour function

   Two-channel visual signalling for the consolidated PI hero card:
   - Stroke colour carries verb-state categorically (brand purple OR amber).
   - Glow intensity carries score-quality continuously (0 → 1, PI 45-100).

   Locked in plan row PI3 (see .claude/plans/programme-run-followups.md).
   Replaces getScoreColor from src/lib/healthScore.ts (deleted in PI1).
   ───────────────────────────────────────────── */

import { THEME } from "./theme";
import type { LoadBand } from "./performanceTypes";

export interface CardColour {
  /** Stroke colour for the ring gradient (brand purple OR amber). */
  hue: string;
  /** Drop-shadow glow intensity, 0..1. Scales linearly across PI 45-100. */
  glowIntensity: number;
}

/**
 * Compute card colour + glow for the consolidated Performance hero.
 *
 * Verb ↔ stroke ↔ glow mapping (per PI1 + PI3 locks):
 *   Recovering (PI < 25, deload band)        → brand, glow 0
 *   Building   (PI 25-44, low band)          → brand, glow 0
 *   Cruising   (PI 45-69, moderate band)     → brand, glow 0..0.44
 *   Sharpening (PI 70-84, high band)         → brand, glow 0.45..0.71
 *   Backing off (overreach OR deloadRecommended) → amber, glow 0
 *
 * The amber branch fires for BOTH:
 *   - `loadBand === "overreach"` (PI ≥ 85)
 *   - `deloadRecommended === true` (engine recommendation, any score)
 *
 * Verb "Backing off" (per PI1) aligns 1-1 with the amber branch.
 * Warnings don't celebrate — glow stays at 0 in amber state regardless
 * of score magnitude.
 */
export function getCardColour(
  pi: number,
  loadBand: LoadBand,
  deloadRecommended: boolean,
): CardColour {
  if (deloadRecommended || loadBand === "overreach") {
    return { hue: THEME.amber, glowIntensity: 0 };
  }

  // Continuous glow scales 0 → 1 across PI 45-100.
  // Clamped both sides defensively — engine clamps PI to 0..100 but a
  // future schema change shouldn't blow up the ring filter.
  const glowIntensity = Math.max(0, Math.min(1, (pi - 45) / 55));
  return { hue: THEME.brand, glowIntensity };
}
