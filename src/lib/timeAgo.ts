import { formatDayMonth, formatDayMonthYear } from "@/utils/formatters";

export function getTimeAgo(date: Date): string {
  const s = Math.floor((Date.now() - date.getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
  /* Past a week, the date — with its year when it is not this one. A
     post from three Octobers ago read "6 Oct", which says this month. */
  return date.getFullYear() === new Date().getFullYear()
    ? formatDayMonth(date)
    : formatDayMonthYear(date);
}
