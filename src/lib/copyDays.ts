import {
  addLocalDays,
  localDateString,
  parseLocalDate,
} from "@/lib/dateHelpers";
import { formatShortWeekdayDayMonth } from "@/utils/formatters";

/** Days back from today a copy can go to: two weeks, which covers "log
 *  last Tuesday's lunch today" and "I forgot to log it on Sunday" without
 *  a calendar. */
export const COPY_DAYS_BACK = 13;

/** The days a copied entry can land on, newest first: today, yesterday,
 *  then the short weekday form ("Mon 26 Oct"), never before `minDate`. */
export function copyDestinations(
  todayKey: string,
  minDate: string
): { key: string; label: string }[] {
  const today = parseLocalDate(todayKey);
  const out: { key: string; label: string }[] = [];
  for (let back = 0; back <= COPY_DAYS_BACK; back++) {
    const key = localDateString(addLocalDays(today, -back));
    if (key < minDate) break;
    out.push({
      key,
      label:
        back === 0
          ? "Today"
          : back === 1
            ? "Yesterday"
            : formatShortWeekdayDayMonth(parseLocalDate(key)),
    });
  }
  return out;
}
