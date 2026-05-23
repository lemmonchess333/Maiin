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
): PerformanceSummary {
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
