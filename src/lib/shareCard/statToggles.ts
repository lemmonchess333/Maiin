/**
 * Per-stat show/hide state for share cards (SOCIAL S1).
 *
 * Share cards let the user hide individual stats (the eye-icon pattern).
 * The visibility model is a Set of HIDDEN stat keys — matches the
 * ShareCardRenderData.hiddenStats contract (the offscreen renderer), so a card
 * with no toggles touched shows everything (empty set = all visible).
 *
 * Pure + immutable: every mutator returns a NEW set so React state
 * updates trigger a re-render (and the offscreen renderer re-rasterises).
 */

/** Toggleable stats per template — the keys a card's eye-icons control. */
export const TOGGLEABLE_STATS: Record<"run" | "lift" | "hybrid", readonly string[]> = {
  run: ["distance", "duration", "pace", "splits", "elevation"],
  lift: ["volume", "exercises", "duration", "prs"],
  hybrid: ["liftVolume", "runDistance", "totalTime"],
};

/** Is a stat currently shown? (hidden-set membership is the inverse.) */
export function isStatVisible(
  hidden: ReadonlySet<string>,
  key: string
): boolean {
  return !hidden.has(key);
}

/** Toggle one stat's visibility, returning a new hidden-set. */
export function toggleStat(
  hidden: ReadonlySet<string>,
  key: string
): Set<string> {
  const next = new Set(hidden);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
}

/**
 * How many of a template's stats are currently visible. Used to guard
 * the "you've hidden everything" edge — a card with zero visible stats
 * is just branding, so the UI can disable the last eye-toggle.
 */
export function visibleStatCount(
  template: keyof typeof TOGGLEABLE_STATS,
  hidden: ReadonlySet<string>
): number {
  return TOGGLEABLE_STATS[template].filter((k) => !hidden.has(k)).length;
}
