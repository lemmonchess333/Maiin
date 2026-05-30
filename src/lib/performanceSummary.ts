/**
 * Plain-language summary copy for the Performance Index (PI) card.
 *
 * Mapped from the three signals the PI hero exposes:
 *   - `pi` 0-100: drives the headline tier (Strong / Solid / Moderate /
 *     Light) — the user-facing "this week was…" verdict.
 *   - `loadBand` (recovery hint): four bands map to four distinct
 *     coaching messages keyed off the user's pushed-hard / pushed-
 *     balanced / pushed-light state.
 *   - `delta` vs prior week: when present and exceeding the ±5pt
 *     noise floor, a trend sentence is appended.
 *
 * Extracted from PerformanceTab.tsx so the copy contract can be
 * tested in isolation and reused on any future PI surface (the
 * Home hero card already shows PI; a copy-drift between Home and
 * Analytics would be visibly inconsistent to the user).
 */

export interface PerformanceSummary {
  headline: string;
  body: string;
}

export function getPlainLanguageSummary(
  pi: number,
  loadBand: string | undefined,
  delta: number | null,
  /**
   * Cold-start gate. When the user has too few weeks of history, the PI's
   * load band and "vs baseline" framing are not yet meaningful (the baseline
   * is derived from prior weeks). Like Whoop / Garmin / Strava's
   * baseline-establishing period, surface an honest "we're still learning"
   * verdict instead of a confident one. Matches the Home hero's existing
   * ", establishing baseline" treatment so the two surfaces don't disagree.
   */
  establishing = false,
): PerformanceSummary {
  if (establishing) {
    return {
      headline: "Establishing your baseline",
      body: "Your first few weeks set the reference we measure against. Keep logging workouts and runs — your weekly read sharpens after about 4 weeks.",
    };
  }

  const headline =
    pi >= 80
      ? "Strong week — your training is on track"
      : pi >= 60
        ? "Solid progress — keep building momentum"
        : pi >= 40
          ? "Moderate effort — room to push harder"
          : "Light week — focus on recovery or ramp up";

  const band = (loadBand ?? "").toLowerCase();
  let body =
    band === "overreach"
      ? "You're pushing hard — recovery matters. Consider a lighter session."
      : band === "high"
        ? "High training load. Keep nutrition and sleep on point."
        : band === "moderate"
          ? "Balanced workload. Room to push harder or maintain."
          : "Low training load. Good time to recover or increase intensity.";

  if (delta !== null && Math.abs(delta) > 5) {
    body +=
      delta > 0
        ? ` Trending up ${delta} pts from last week.`
        : ` Down ${Math.abs(delta)} pts from last week.`;
  }

  return { headline, body };
}
