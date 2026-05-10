/**
 * Derive a diary-readable food name from an item list.
 *
 * F4 audit found that AI photo scans were persisting the model's
 * generated container title (e.g. "Breakfast Ingredients") as
 * the meal's `foodName`, which then surfaced in the diary row
 * even though the actual identified items ("Granola",
 * "Blueberries", "Hummus") were correctly stored in the nested
 * `items` array. The NL parse path already builds a foodName
 * from items via `items.map(i => i.name).join(", ")`. Aligning
 * the AI scan persistence with the NL pattern removes the
 * model-generated category title from the diary while keeping
 * the original AI response intact upstream.
 *
 * Naming shape mirrors Quick Add's existing multi-item smart
 * label ("First, Second +N" for 3+ items) rather than the
 * NL path's full comma-join — for AI scans that can return
 * many items, the +N shape avoids 200-character diary rows.
 * Single-item and 2-item cases use a literal join so the
 * diary reads naturally.
 *
 * Legacy data: existing meal documents persisted before this
 * helper landed keep their AI-generated foodName ("Breakfast
 * Ingredients", etc) — no migration. Only new AI scans use the
 * derived name.
 */

export interface ItemForNaming {
  name?: string | null;
}

const DEFAULT_FALLBACK = 'Meal';

function cleanName(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.trim();
}

/**
 * @param items   The persisted items array from the AI scan
 * @param fallback Used when every item is missing/empty —
 *                 typically the AI's original container title or
 *                 a generic word. Defaults to "Meal".
 */
export function buildFoodNameFromItems(
  items: readonly ItemForNaming[] | undefined | null,
  fallback: string = DEFAULT_FALLBACK,
): string {
  if (!items || items.length === 0) {
    const cleaned = cleanName(fallback);
    return cleaned || DEFAULT_FALLBACK;
  }

  /* Filter to identifiable names. We don't reuse
     `isGenericAiFoodName` here because callers should already
     have cleaned generic items off the AI result via
     `filterIdentifiableAiItems` before reaching the save path
     (F4 contract). This helper just defends against missing /
     whitespace-only names that may have slipped through. */
  const named = items
    .map((item) => cleanName(item?.name))
    .filter((name) => name.length > 0);

  if (named.length === 0) {
    const cleaned = cleanName(fallback);
    return cleaned || DEFAULT_FALLBACK;
  }

  if (named.length === 1) {
    return named[0];
  }

  if (named.length === 2) {
    return `${named[0]}, ${named[1]}`;
  }

  return `${named[0]}, ${named[1]} +${named.length - 2}`;
}
