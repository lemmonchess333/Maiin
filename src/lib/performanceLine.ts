/* ─────────────────────────────────────────────
   Performance card verb + supporting line

   Two client-side utilities consumed by the consolidated PI hero:
   - getVerb(loadBand, deloadRecommended) → 5-state verb taxonomy
   - getLine(state, signals) → tone-aligned data-aware supporting line

   Locked in plan rows PI1 (verb taxonomy + Option U) and PI5 (signals
   contract). See .claude/plans/programme-run-followups.md.

   Why the engine emits `signals` rather than the line text:
   - Copy is hot-deployable (TS file change → Vite deploy, no CF redeploy)
   - i18n-ready (state enum translates; line strings localise client-side)
   - A/B-testable via the standard client-side flag flow
   - Engine still makes the data-aware decisions; client only renders

   Verb-state ↔ verb-string ↔ glow mapping (PI3 lock):
     Recovering (deload band, PI < 25)         → no glow, brand purple
     Building   (low band,    PI 25-44)        → no glow, brand purple
     Cruising   (moderate,    PI 45-69)        → glow 0..0.44, brand
     Sharpening (high,        PI 70-84)        → glow 0.45..0.71, brand
     Backing off (overreach OR deloadRecommended) → no glow, amber
   ───────────────────────────────────────────── */

import type { LoadBand, PerformanceSignals } from "./performanceTypes";

/** Verb-state — categorical state the card communicates. */
export type VerbState =
  | "recovering"
  | "building"
  | "cruising"
  | "sharpening"
  | "backing-off";

/** Human-facing verb strings (English; i18n later). */
export const VERB_LABEL: Record<VerbState, string> = {
  recovering: "Recovering",
  building: "Building",
  cruising: "Steady",
  sharpening: "Sharpening",
  "backing-off": "Backing off",
};

/**
 * Derive verb-state from loadBand + deloadRecommended.
 * Deload override always wins so the verb aligns with InsightStrip's
 * recommendation (no "Sharpening + consider a deload" contradiction).
 */
export function getVerbState(
  loadBand: LoadBand,
  deloadRecommended: boolean
): VerbState {
  if (deloadRecommended || loadBand === "overreach") return "backing-off";
  switch (loadBand) {
    case "deload":
      return "recovering";
    case "low":
      return "building";
    case "moderate":
      return "cruising";
    case "high":
      return "sharpening";
  }
}

/** Convenience: state + label in one call. */
export function getVerb(
  loadBand: LoadBand,
  deloadRecommended: boolean
): { state: VerbState; label: string } {
  const state = getVerbState(loadBand, deloadRecommended);
  return { state, label: VERB_LABEL[state] };
}

/**
 * Tone-aligned data-aware supporting line for the hero card.
 *
 * Data signals (from engine) layer onto the verb-state to produce a
 * specific line. Within each verb-state we cascade from most-specific
 * (data-rich) to least-specific (generic) so the most informative
 * variant fires when its signal is present.
 */
export function getLine(state: VerbState, signals: PerformanceSignals): string {
  switch (state) {
    case "backing-off":
      if (signals.recoveryWeak) return "Recovery signals down — ease this week";
      return "Loads high — ease this week";

    case "sharpening":
      if (signals.bothLoadsStrong)
        return "Lifting and running both strong this week";
      if (signals.liftAheadOfBaseline > 0.15) {
        return `Lifting load ${Math.round(signals.liftAheadOfBaseline * 100)}% above baseline`;
      }
      if (signals.runAheadOfBaseline > 0.2) {
        return `Run volume ${Math.round(signals.runAheadOfBaseline * 100)}% up`;
      }
      return "Strong week — keep it going";

    case "cruising":
      if (signals.adherenceWeak) return "Fewer sessions than usual";
      return "Holding a steady rhythm";

    case "building":
      // Returning user (has lifetime data) vs new user (no baseline yet)
      if (signals.lifetimeWeeks >= 4) return "Building back up";
      return "Establishing your week";

    case "recovering":
      // Recently active recovery vs lapsed/sick gap
      if (signals.daysSinceLastTraining > 7)
        return "Quiet week — log when you're back";
      return "Light week — take it easy";
  }
}

/** Empty-state line (no perf doc yet — pre-first-log). */
export const EMPTY_STATE_LINE =
  "Your Performance will appear after your first logged session";
