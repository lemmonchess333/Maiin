import { parseLocalDate } from "@/lib/dateHelpers";

const DAY_MS = 86_400_000;

/**
 * How long ago a dated log was, in calendar days, as Home's weight tile
 * says it: "Logged today", "Logged yesterday", "Logged 3d ago".
 *
 * It counted 24-hour periods from midday on the logged date, so before
 * midday yesterday's weigh-in read "Logged today" and, on a Friday
 * morning, Wednesday's read "Logged yesterday".
 */
export function loggedAgo(dateKey: string, todayKey: string): string {
  const days = Math.round(
    (parseLocalDate(todayKey).getTime() - parseLocalDate(dateKey).getTime()) /
      DAY_MS
  );
  if (days <= 0) return "Logged today";
  if (days === 1) return "Logged yesterday";
  if (days < 7) return `Logged ${days}d ago`;
  if (days < 28) return `Logged ${Math.floor(days / 7)}w ago`;
  return `Logged ${Math.floor(days / 30)}mo ago`;
}
