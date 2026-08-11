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
      /* LIFT-EV-10, copy half. A week containing only ONE discipline caps the
         composite load score at 68 (recomp) — `computeLiftLoadScore` returns 0
         for zero sessions and the halves are weighted 0.5/0.5 — so a marathon
         peak-block week lands HERE rather than in "sharpening", whatever was
         actually run. Measured: 70 km and 110 km of running with no lifting
         both score 68 (`singleDisciplineWeek.test.ts`).

         The engine already computes `runAheadOfBaseline` and
         `liftAheadOfBaseline`; the lines that say them just lived in a band
         these weeks cannot reach, so a 110 km week was described as "holding a
         steady rhythm". Consulting the same signals here is what stops the
         card being silent about the biggest thing in the week.

         The SCORE is deliberately untouched — see the note at the bottom of
         this file. This makes the words honest, not the number different. */
      if (signals.runAheadOfBaseline > 0.2) {
        return `Run volume ${Math.round(signals.runAheadOfBaseline * 100)}% up`;
      }
      if (signals.liftAheadOfBaseline > 0.15) {
        return `Lifting load ${Math.round(signals.liftAheadOfBaseline * 100)}% above baseline`;
      }
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

/* ─────────────────────────────────────────────
   LIFT-EV-10 — what this file does NOT fix

   The ledger row names a second option: renormalise the load weighting onto
   the trained discipline when the other has zero sessions. That is left
   undone, deliberately, and the reasoning belongs next to the code rather
   than only in a PR.

   The scoring behaviour is defensible on its own terms. `bl.liftTonnage` is a
   mean over the athlete's own active weeks, so a week that drops lifting
   genuinely carries less composite load than their normal week, and the PI is
   a load score. Renormalising would make it answer a different question —
   "how hard was the training you DID do" — for every user, and would raise the
   score of every athlete who skips a discipline. That is a product decision
   with no user signal behind it, and the row records it as an owner decision
   for exactly that reason.

   What was NOT defensible was the copy. "Holding a steady rhythm" is not a
   description of a 110 km week by any reading, and the app already had the
   number that says otherwise.

   Still open, and unaddressed here: with the ceiling at 68 (recomp) / 58
   (lean bulk) and both live deload triggers gating on PI >= 80, a
   single-discipline week can never be offered a deload. Fixing that needs the
   trigger to read discipline-specific load rather than the composite, which is
   a design decision, not a copy one.
   ───────────────────────────────────────────── */
