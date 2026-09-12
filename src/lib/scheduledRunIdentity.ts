import type { ScheduledRunDay } from "@/features/program/programTypes";

/** Resolve saved links/configuration from before a one-time ID migration. */
export function matchesScheduledRunId(
  day: ScheduledRunDay,
  id: string
): boolean {
  return day.id === id || (day.legacyIds?.includes(id) ?? false);
}
