import { weekPosition } from "@/lib/dateHelpers";
import type { DayType, ScheduleDay } from "@/lib/scheduleUtils";

export interface WeekLayoutChange {
  day: number;
  before: DayType;
  after: DayType;
}

export interface WeekLayoutPreview {
  before: { lifts: number; runs: number };
  after: { lifts: number; runs: number };
  changes: WeekLayoutChange[];
  rebuildsLifts: boolean;
}

function counts(schedule: readonly ScheduleDay[]) {
  return {
    lifts: schedule.filter((s) => s.type === "lift" || s.type === "both")
      .length,
    runs: schedule.filter((s) => s.type === "run" || s.type === "both").length,
  };
}

function validWeek(schedule: readonly ScheduleDay[]): boolean {
  return (
    schedule.length === 7 &&
    new Set(schedule.map((s) => s.day)).size === 7 &&
    schedule.every(
      (s) =>
        Number.isInteger(s.day) &&
        s.day >= 0 &&
        s.day <= 6 &&
        (s.type === "lift" ||
          s.type === "run" ||
          s.type === "both" ||
          s.type === "rest")
    )
  );
}

/** The editor's review uses the same two schedule snapshots it will save. */
export function previewWeekLayout(
  before: readonly ScheduleDay[],
  after: readonly ScheduleDay[]
): WeekLayoutPreview | null {
  if (!validWeek(before) || !validWeek(after)) return null;
  const previous = new Map(before.map((s) => [s.day, s.type]));
  const changes = after
    .filter((s) => previous.has(s.day) && previous.get(s.day) !== s.type)
    .map((s) => ({
      day: s.day,
      before: previous.get(s.day)!,
      after: s.type,
    }))
    .sort((a, b) => weekPosition(a.day) - weekPosition(b.day));
  if (after.some((s) => !previous.has(s.day))) return null;
  const beforeCounts = counts(before);
  const afterCounts = counts(after);
  return {
    before: beforeCounts,
    after: afterCounts,
    changes,
    rebuildsLifts:
      beforeCounts.lifts !== afterCounts.lifts && afterCounts.lifts > 0,
  };
}
