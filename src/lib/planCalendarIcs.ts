import {
  addLocalDays,
  localDateString,
  startOfLocalWeek,
} from "@/lib/dateHelpers";
import type { ScheduleDay } from "@/lib/scheduleUtils";
import type { WorkoutDay } from "@/features/program/programTypes";

export interface BuildWeekPlanIcsOptions {
  schedule: readonly ScheduleDay[];
  workouts?: readonly WorkoutDay[];
  /** Any local date inside the target week (defaults to today). */
  referenceDate?: Date;
}

/** RFC 5545 TEXT escaping: backslash, semicolon, comma, and newlines. */
function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

function icsDate(date: Date): string {
  return localDateString(date).replace(/-/g, "");
}

function icsUtcStamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  );
}

/**
 * Generates an RFC 5545 `.ics` calendar string containing all-day `VEVENT`s
 * for every active training day (Lift, Run, or Lift + Run) in the local
 * Monday–Sunday week containing `referenceDate`. Rest days are skipped.
 */
export function buildWeekPlanIcs({
  schedule,
  workouts = [],
  referenceDate = new Date(),
}: BuildWeekPlanIcsOptions): string {
  const weekStart = startOfLocalWeek(referenceDate);
  const byDay = new Map<number, ScheduleDay>();
  for (const entry of schedule) {
    byDay.set(entry.day, entry);
  }

  const stamp = icsUtcStamp(referenceDate);
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Tropos//Training Plan//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];

  let liftIdx = 0;
  for (let offset = 0; offset < 7; offset += 1) {
    const date = addLocalDays(weekStart, offset);
    const entry = byDay.get(date.getDay());
    if (!entry || entry.type === "rest") continue;

    let workout: WorkoutDay | undefined;
    if (entry.type === "lift" || entry.type === "both") {
      workout = workouts[liftIdx];
      liftIdx += 1;
    }

    const liftName = workout?.dayName || "Lift session";
    const summary =
      entry.type === "lift"
        ? liftName
        : entry.type === "run"
          ? "Run session"
          : `${liftName} + Run`;

    const descriptionParts: string[] = [];
    if (workout && workout.exercises.length > 0) {
      const exerciseList = workout.exercises
        .map((ex) => `${ex.name} (${ex.sets}×${ex.reps})`)
        .join(", ");
      descriptionParts.push(`Lift: ${exerciseList}`);
    }
    if (entry.type === "run" || entry.type === "both") {
      descriptionParts.push("Scheduled run session in Tropos");
    }

    const dateKey = localDateString(date);
    const nextDate = addLocalDays(date, 1);

    lines.push("BEGIN:VEVENT");
    lines.push(`UID:tropos-${dateKey}-${entry.type}@troposfit.com`);
    lines.push(`DTSTAMP:${stamp}`);
    lines.push(`DTSTART;VALUE=DATE:${icsDate(date)}`);
    lines.push(`DTEND;VALUE=DATE:${icsDate(nextDate)}`);
    lines.push(`SUMMARY:${escapeIcsText(summary)}`);
    if (descriptionParts.length > 0) {
      lines.push(`DESCRIPTION:${escapeIcsText(descriptionParts.join("\n"))}`);
    }
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return `${lines.join("\r\n")}\r\n`;
}

/** Wraps an `.ics` string as a calendar File for `shareFile`. */
export function icsFile(content: string, filename: string): File {
  return new File([content], filename, {
    type: "text/calendar;charset=utf-8",
  });
}
