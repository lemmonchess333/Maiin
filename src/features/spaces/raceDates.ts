import { format } from "date-fns";
import { parseLocalDate } from "@/lib/dateHelpers";
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
  const dates = raceEventDates(event);
  const pattern = long ? "EEEE d MMMM yyyy" : "d MMM yyyy";
  if (dates.length === 1) return format(parseLocalDate(dates[0]), pattern);
  if (dates[0].slice(0, 7) === dates[1].slice(0, 7))
    return `${format(parseLocalDate(dates[0]), "d")}–${format(parseLocalDate(dates[1]), long ? "d MMMM yyyy" : "d MMM yyyy")}`;
  return dates
    .map((d) => format(parseLocalDate(d), long ? "d MMMM yyyy" : "d MMM yyyy"))
    .join(" / ");
}
