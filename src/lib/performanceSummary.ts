/**
 * Plain-language summary copy for the Performance Index (PI) card.
 *
 * Mapped from the signals the PI hero exposes:
 *   - `pi` 0-100: drives the headline tier (Strong / Solid / Moderate /
 *     Light) — the user-facing "this week was…" verdict.
 *   - `loadBand`, with the deload recommendation: a body sentence only
 *     where there is ADVICE to give — overreach, a recommended deload, a
 *     deload-light week, or a baseline still forming.
 *
 * The high, moderate and low bands each carried a sentence ("High
 * training load. Keep nutrition and sleep on point.", "Balanced load. This
 * is the sustainable middle of your range."): restatements of the band in
 * a coaching voice, with sleep advice the app has no data for. The page now
 * shows what the week held beneath the verdict (PerformanceWeekBreakdown),
 * so those bands say nothing here rather than something general. The
 * week-on-week sentence went too: the delta chip beside the headline
 * already says it, in the same place, as a number.
 *
 * Extracted from PerformanceTab.tsx so the copy contract can be
 * tested in isolation and reused on any future PI surface (the
 * Home hero card already shows PI; a copy-drift between Home and
 * Analytics would be visibly inconsistent to the user).
 */

import type { LoadBand } from "./performanceTypes";
import { getVerbState } from "./performanceLine";

export interface PerformanceSummary {
  headline: string;
  body: string;
}

export function getPlainLanguageSummary(
  pi: number,
  /**
   * The RESOLVED band — callers pass `resolveLoadBand(doc)`, which is
   * total (see performanceDocFields.ts). It used to accept a raw
   * `string | undefined` read straight off the doc, and the else-branch
   * below turned every miss into a confident "Low training load" claim.
   * The Analytics call site read a field nothing writes, so EVERY user
   * got the low-load message forever — including at `overreach`, where
   * the guidance is the exact opposite. Typing it closed is what stops a
   * missing value from silently becoming a wrong claim again.
   */
  loadBand: LoadBand,
  /**
   * Cold-start gate. When the user has too few weeks of history, the PI's
   * load band and "vs baseline" framing are not yet meaningful (the baseline
   * is derived from prior weeks). Like Whoop / Garmin / Strava's
   * baseline-establishing period, surface an honest "we're still learning"
   * verdict instead of a confident one. Matches the Home hero's existing
   * ", establishing baseline" treatment so the two surfaces don't disagree.
   */
  establishing = false,
  /** Recovery recommendations override score-tier praise, as on Home. */
  deloadRecommended = false
): PerformanceSummary {
  if (establishing) {
    return {
      headline: "Establishing your baseline",
      body: "Your first few weeks set the reference we measure against. Keep logging workouts and runs — your weekly read sharpens after about 4 weeks.",
    };
  }

  const backingOff =
    getVerbState(loadBand, deloadRecommended) === "backing-off";
  const headline = backingOff
    ? "Backing off — make room for recovery"
    : pi >= 80
      ? "Strong week — your training is on track"
      : pi >= 60
        ? "Solid week — keep the cadence"
        : pi >= 40
          ? "Moderate load — room to push or hold"
          : "Light week — focus on recovery or ramp up";

  // Exhaustive over the five real bands — no catch-all. Only two carry
  // advice. `deload` says its own thing, because "increase intensity" is
  // wrong advice during planned recovery and the engine can't tell a
  // planned deload from simple inactivity.
  let body: string;
  switch (loadBand) {
    case "overreach":
      body =
        "You're pushing hard — recovery matters. Consider a lighter session.";
      break;
    case "deload":
      body =
        "Very light week. If that was planned recovery you're on track — otherwise an easy session is the way back in.";
      break;
    case "high":
    case "moderate":
    case "low":
      body = "";
      break;
  }

  // A discipline-specific recommendation can fire below the composite
  // overreach band. The body must honour it too, not say "Balanced load"
  // beneath a recommendation to ease the week.
  if (deloadRecommended && loadBand !== "overreach") {
    body = "A lighter week is recommended. Give yourself room to recover.";
  }

  return { headline, body };
}
