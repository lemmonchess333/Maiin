import { useMemo } from "react";
import { localDateString, parseLocalDate } from "@/lib/dateHelpers";
import { useLocalDateKey } from "@/hooks/useLocalDateKey";

/**
 * The moment a screen reads "now" at, taken again when the local day turns
 * (`useLocalDateKey`, which also checks on a return to the app).
 *
 * A page that read `new Date()` inside a memo kept that day for as long as
 * the page stayed mounted. A phone keeps a page mounted overnight, so the
 * morning's History still covered the window up to yesterday. Within one
 * day this returns the same Date, so memos keyed on it hold.
 */
export function useDayMoment(): Date {
  const todayKey = useLocalDateKey();
  return useMemo(() => {
    const at = new Date();
    // Read a moment after the key, from the same clock: across the day's
    // turn the two can disagree, and the key's day wins.
    return localDateString(at) === todayKey ? at : parseLocalDate(todayKey);
  }, [todayKey]);
}
