/**
 * Where a range input's fill should stop, as a CSS percentage.
 *
 * Chromium gives you no way to paint the groove without also painting the
 * fill. `accent-color` colours the filled portion and the thumb and leaves
 * the groove to the UA — which paints it #EFEFEF in BOTH themes, so the
 * unselected remainder was 16.5:1 against the dark page (four times the
 * luminance of the purple beside it) and 1.03:1 on light. And you cannot
 * fix just the groove, because in Chromium the accent fill IS the track
 * background: painting the track replaces it, which is what the first
 * attempt at this did, leaving a uniform bar with a lone thumb.
 *
 * So the fill is painted too, as a hard-stopped gradient, and this is the
 * stop position. It exists as a pure function rather than inline in the
 * component so the arithmetic — which has three separate ways to divide by
 * zero or fall off the end — can be tested without a DOM.
 */
export function rangeFillPct(value: number, min: number, max: number): string {
  const span = max - min;
  /* Degenerate range (min === max, or either non-finite). A slider with
     nowhere to travel is fully satisfied wherever it sits, so 100% — an
     empty groove would read as "nothing selected" on a control that
     cannot be moved. */
  if (!Number.isFinite(span) || span <= 0) return "100%";
  if (!Number.isFinite(value)) return "0%";
  const ratio = (value - min) / span;
  const clamped = Math.min(Math.max(ratio, 0), 1);
  /* Rounded to 0.1% — enough that a 1000-step slider still moves visibly,
     while keeping the emitted custom property short and stable so it does
     not churn the style attribute on every pointermove. */
  return `${Math.round(clamped * 1000) / 10}%`;
}
