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
  max: number,
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
