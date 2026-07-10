/**
 * Stable per-date ordering cache for quick-add chips.
 *
 * The Food page's quick-add row was reshuffling on every log
 * because the underlying frequency map recomputes from the live
 * `meals` subscription. Each new log either bumps an existing
 * food's count (changing tie order) or introduces a new one
 * (changing rank), and the chips visibly reorder mid-session.
 *
 * Stability strategy: snapshot the order ONCE per date. On
 * subsequent renders for the same date, render the cached order
 * filtered against currently-existing keys (so deleted/vanished
 * items drop out without rebuilding the whole cache). When the
 * user switches to a different date, that date computes its own
 * fresh order. Returning to today restores today's stable order.
 *
 * Cache lives in a useRef Map<dateKey, orderedKeys[]>; survives
 * renders within the same Food page mount, doesn't persist
 * across page reloads (acceptable — quick-add ordering is
 * session-scoped polish, not a saved preference).
 *
 * Pure function `orderQuickAddItems`: takes the cached key order
 * and the current key→item map, returns the items in cached
 * order, dropping any keys that no longer exist in current data,
 * and appending any new freshly-ranked keys at the end (so a
 * brand-new logged item still appears, just doesn't displace the
 * existing stable row).
 */

/** One component food of a repeated meal bundle — the same item shape
 *  meal docs persist in `items[]`. */
export interface QuickAddBundleItem {
  name: string;
  portionSize: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface QuickAddItem {
  /** Lowercased + trimmed food name — same key the existing
   *  frequency map already uses. Don't introduce a new
   *  identifier scheme. */
  key: string;
  name: string;
  cal: number;
  pro: number;
  carb: number;
  fat: number;
  portionSize: string;
  /** Set when the chip originates from the user's favourites pool
   *  (useFoodFavourites). Long-press → remove fires only on chips
   *  with a favouriteId; recents / seeded-defaults stay
   *  non-removable because removing them has no persistent
   *  meaning (they re-derive from meal history each render). */
  favouriteId?: string;
  /** FOOD-01: present when the chip repeats a whole historical
   *  multi-item meal. Carries the ORIGINAL foodName + items[] so a
   *  repeat re-logs the real composition instead of flattening the
   *  meal into one synthetic aggregate row — and so the persisted
   *  foodName stays the real name, not a display string like
   *  "Fish, Fries +2" (which would pollute the frequency map).
   *  Absent for single-food chips, favourites, and seeded defaults
   *  (their existing one-item persist path is already faithful). */
  bundle?: { foodName: string; items: QuickAddBundleItem[] };
}

/**
 * FOOD-01 — the persisted shape for a quick-add tap. Pure so the
 * 1-item / 2-item / 3+-item repeat behaviours are unit-testable
 * without mounting the Food page:
 *   - bundle chips re-log the original foodName + full items[]
 *   - plain chips keep the existing single synthetic item
 * Totals always come from the chip (the frequency map already keeps
 * the latest version of the meal, so chip totals == bundle totals).
 */
export function buildQuickAddMealPayload(item: QuickAddItem): {
  foodName: string;
  items: QuickAddBundleItem[];
} {
  if (item.bundle && item.bundle.items.length > 0) {
    return { foodName: item.bundle.foodName, items: item.bundle.items };
  }
  return {
    foodName: item.name,
    items: [
      {
        name: item.name,
        portionSize: item.portionSize,
        calories: item.cal,
        protein: item.pro,
        carbs: item.carb,
        fat: item.fat,
      },
    ],
  };
}

/**
 * Apply a cached order to a current set of items.
 *
 * @param cachedOrder Keys in their stable cached order
 * @param current     Today's freshly-ranked items keyed by `key`
 * @param max         Cap on visible items (matches the existing 5-chip cap)
 * @returns           Items rendered in cached order, with vanished
 *                    keys filtered out and new keys appended at the
 *                    end (so a just-logged-for-the-first-time food
 *                    becomes visible immediately, but doesn't
 *                    displace the stable row).
 */
export function orderQuickAddItems(
  cachedOrder: string[],
  current: Map<string, QuickAddItem>,
  max: number
): QuickAddItem[] {
  const result: QuickAddItem[] = [];
  const seen = new Set<string>();

  for (const key of cachedOrder) {
    if (result.length >= max) break;
    const item = current.get(key);
    if (!item) continue; // vanished — drop without disturbing the cache
    result.push(item);
    seen.add(key);
  }

  /* Append-new pass: a freshly logged food that wasn't in the
     cache should still appear (otherwise users would never see
     their newest logs surface as quick-add until tomorrow). It
     lands at the end so it doesn't displace the user's stable
     row. The next time the date cache rebuilds (next visit /
     date change), it'll claim its real ranked position. */
  for (const [key, item] of current) {
    if (result.length >= max) break;
    if (seen.has(key)) continue;
    result.push(item);
  }

  return result;
}
