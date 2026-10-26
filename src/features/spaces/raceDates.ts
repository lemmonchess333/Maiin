import { parseLocalDate } from "@/lib/dateHelpers";
import {
  formatDayMonthYear,
  formatDayMonthYearLong,
  formatWeekdayDayMonthYear,
} from "@/utils/formatters";
import type { SpaceEventInfo } from "./spaceDefs";

export function validRaceDateKeys(
  value: unknown,
  lastDate: unknown
): value is string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 2)
    return false;
  if (
    !value.every((d) => {
      if (typeof d !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
      const date = new Date(`${d}T12:00:00Z`);
      return (
        Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === d
      );
    })
  )
    return false;
  return (
    value.at(-1) === lastDate &&
    (value.length === 1 ||
      Date.parse(value[1]) - Date.parse(value[0]) === 86_400_000)
  );
}

export function raceEventDates(
  event: Pick<SpaceEventInfo, "dateKey" | "dateKeys">
): string[] {
  return validRaceDateKeys(event.dateKeys, event.dateKey)
    ? event.dateKeys
    : [event.dateKey];
}

export function formatRaceEventDate(
  event: SpaceEventInfo,
  long = false
): string {
  const dates = raceEventDates(event).map(parseLocalDate);
  if (dates.length === 1)
    return long
      ? formatWeekdayDayMonthYear(dates[0])
      : formatDayMonthYear(dates[0]);
  const dated = long ? formatDayMonthYearLong : formatDayMonthYear;
  if (
    dates[0].getFullYear() === dates[1].getFullYear() &&
    dates[0].getMonth() === dates[1].getMonth()
  )
    return `${dates[0].getDate()}–${dated(dates[1])}`;
  return dates.map(dated).join(" / ");
}
