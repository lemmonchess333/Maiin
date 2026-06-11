/**
 * Proactive recalibration moments (D7).
 *
 * Goal/days/injuries DRIFT (lapsed-returning, vacation gaps, new injuries), but
 * recalibration is otherwise only ever user-initiated — a stale plan just keeps
 * running. This decides, purely, whether to invite a re-check at a natural seam,
 * and returns the contextual-tip payload (a per-seam `tipKey` so each seam can
 * re-surface even after an earlier one was dismissed — the dismiss-once banner
 * is per-key).
 *
 * Gentle + rate-limited by design: at most one prompt per seam, dismissible.
 *
 * Seams (strongest first):
 *   - return-from-gap: ≥10 days since the last training session.
 *   - block boundary: every ~4 weeks (a mesocycle-ish recalibration point).
 */
export interface RecalibrationCheckIn {
  /** Per-seam dismiss-once key (re-surfaces at the next distinct seam). */
  tipKey: string;
  title: string;
  description: string;
}

const GAP_DAYS = 10;
const BLOCK_WEEKS = 4;

export function recalibrationCheckIn(input: {
  weekNumber?: number | null;
  daysSinceLastTraining?: number | null;
}): RecalibrationCheckIn | null {
  const week = Math.max(0, Math.floor(input.weekNumber ?? 0));
  const gap = input.daysSinceLastTraining ?? 0;

  if (gap >= GAP_DAYS) {
    return {
      tipKey: `recal-return-w${week}`,
      title: "Does your plan still fit?",
      description:
        "You've been away a bit — recheck your training days and goal so your plan matches where you are now.",
    };
  }

  if (week >= BLOCK_WEEKS && week % BLOCK_WEEKS === 0) {
    return {
      tipKey: `recal-block-w${week}`,
      title: "Still on track?",
      description:
        "A few weeks in — still chasing the same goal and training days? Tune your plan if anything's changed.",
    };
  }

  return null;
}
