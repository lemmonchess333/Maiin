/**
 * Generic / unidentifiable AI food-name detection.
 *
 * The AI photo path can return a result like
 *   { foodName: "Unidentifiable", calories: 0, ... }
 * — or the same generic name with hallucinated non-zero macros
 *   { foodName: "Unidentifiable", calories: 2, protein: 1, ... }.
 * Both shapes pollute the diary and Quick Add with non-food
 * noise. The reliable signal is the NAME, not the macros — AI
 * may hallucinate small macros on a wall, but the name will
 * still be a generic fallback string.
 *
 * Real foods with zero calories (water, black coffee, herbs,
 * spices) must remain savable, so we DO NOT gate on macros
 * being zero. Only the name pattern.
 *
 * Scope: applied only to AI/photo analysis output. Manual,
 * database, OFF, barcode, quick-add, copy, and duplicate paths
 * have user-confirmed names and skip this filter.
 *
 * Render-time filtering: callers should apply this at the
 * point where AI items reach the user (review editor) or
 * downstream chips (Quick Add legacy hygiene), NOT by
 * invalidating any cached ranking. Filtering preserves the F2
 * stable-order contract.
 */

const GENERIC_AI_NAMES = new Set<string>([
  'unidentifiable',
  'unidentified',
  'unknown',
  'unknown food',
  'unknown item',
  'food',
  'item',
  'object',
  'meal',
  'thing',
  'no food detected',
  'no food',
  'n/a',
  'na',
  'none',
]);

/**
 * Is the supplied name a generic AI fallback rather than a real
 * food? Case-insensitive, whitespace-trimmed, undefined-safe.
 */
export function isGenericAiFoodName(name: string | undefined | null): boolean {
  if (name === undefined || name === null) return true;
  const normalised = name.trim().toLowerCase();
  if (normalised.length === 0) return true;
  return GENERIC_AI_NAMES.has(normalised);
}

/**
 * Drop items whose name reads as a generic AI fallback. Returns
 * a new array — does not mutate the input. Caller decides what
 * to do with the empty case (show empty-result state, etc).
 */
export function filterIdentifiableAiItems<T extends { name?: string | null | undefined }>(
  items: readonly T[],
): T[] {
  return items.filter((item) => !isGenericAiFoodName(item.name));
}

/**
 * Convenience predicate: is the AI result effectively empty
 * (no identifiable items)? True when the array is empty OR
 * every entry is generic / unidentifiable.
 */
export function isEmptyAiFoodResult<T extends { name?: string | null | undefined }>(
  items: readonly T[] | undefined | null,
): boolean {
  if (!items || items.length === 0) return true;
  return filterIdentifiableAiItems(items).length === 0;
}
