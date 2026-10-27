import type { ProgramState } from "@/features/program/programTypes";
import { nextUpIndex } from "@/features/program/nextUpCursor";
import { liftCardTitle, liftDayNameIn } from "@/lib/liftDayLabel";
import { localDateString, addLocalDays } from "@/lib/dateHelpers";
import { formatTimeOfDay, formatWeekday } from "@/utils/formatters";

/**
 * What the training-day reminder says, and when it next goes off.
 *
 * The reminder is one weekly-repeating notification per training weekday
 * (`useWorkoutReminders`). A lift day names the programme's next workout:
 * lifts run in order whatever the weekday (ADR-0002), so the next one is
 * the session the person will do on any lift day, and it changes only when
 * a workout is logged or chosen with "Make this next", both of which run
 * the reminders again. A run is pinned to its date and changes week to
 * week, so a weekly-repeating notification cannot carry this week's run
 * into the next one: a run day says it is a run, not which. Setup's
 * reminder row previews the same words (`reminderPreview`).
 */

/** One id per weekday, Sunday = 2001 and Saturday = 2007, so each
 *  training day repeats weekly on its own and Settings can find them by
 *  id: the title names the session, so no word search could. */
export const WORKOUT_REMINDER_IDS = [
  2001, 2002, 2003, 2004, 2005, 2006, 2007,
] as const;

/** The time setup's reminder row starts on. */
export const SETUP_REMINDER_TIME = "07:30";

type DayType = "lift" | "run" | "both" | "rest" | string;
type Schedule = ReadonlyArray<{ day: number; type: DayType }> | undefined;

/** The next workout's name as Home's session card titles it ("Upper A"),
 *  or null with no programme or nothing left to do this week. */
export function nextLiftName(
  programme:
    Pick<ProgramState, "workouts" | "nextWorkoutOverride"> | null | undefined
): string | null {
  const index = nextUpIndex(programme);
  const workouts = programme?.workouts;
  if (!workouts || index < 0) return null;
  const workout = workouts[index];
  return liftCardTitle(
    workout.dayName,
    liftDayNameIn(
      workouts.map((w) => w.dayName),
      index,
      workout.dayName
    )
  );
}

/** A day the reminder goes off: any day but rest. A schedule that is not
 *  seven days long is not trusted, and every day counts. */
export function isReminderDay(weekday: number, schedule: Schedule): boolean {
  if (!schedule || schedule.length !== 7) return true;
  const entry = schedule.find((s) => s.day === weekday);
  if (!entry) return false;
  return entry.type !== "rest";
}

/** The weekday's type in the schedule, or null when it cannot be read. */
function dayTypeOf(weekday: number, schedule: Schedule): DayType | null {
  if (!schedule || schedule.length !== 7) return null;
  return schedule.find((s) => s.day === weekday)?.type ?? null;
}

/** The notification for a weekday: the next lift by name on a lift day,
 *  a run on a run day, and the plain reminder when neither is known. */
export function workoutReminderCopy(
  weekday: number,
  schedule: Schedule,
  liftName: string | null | undefined
): { title: string; body: string } {
  const type = dayTypeOf(weekday, schedule);
  if ((type === "lift" || type === "both") && liftName) {
    return {
      title: `${liftName} today`,
      body: "Your session is ready when you are.",
    };
  }
  if (type === "run") {
    return { title: "Time to run", body: "Your run is ready when you are." };
  }
  return {
    title: "Time to train",
    body: "Your session is ready when you are.",
  };
}

/**
 * The next time on `weekday` (0 = Sunday) at "HH:mm": today when the time
 * is still ahead, otherwise that weekday next. Null for a time that is not
 * "HH:mm".
 */
export function nextWeekdayOccurrence(
  timeHHMM: string,
  weekday: number,
  now: Date = new Date()
): Date | null {
  const match = /^(\d{2}):(\d{2})$/.exec(timeHHMM);
  if (!match) return null;
  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  if (hours > 23 || minutes > 59) return null;
  const target = new Date(now);
  target.setHours(hours, minutes, 0, 0);
  let daysAhead = (weekday - target.getDay() + 7) % 7;
  if (daysAhead === 0 && target.getTime() <= now.getTime()) daysAhead = 7;
  target.setDate(target.getDate() + daysAhead);
  return target;
}

/** When the reminder next goes off, across the week's training days. */
export function nextReminderAt(
  timeHHMM: string,
  schedule: Schedule,
  now: Date = new Date()
): { at: Date; weekday: number } | null {
  let soonest: { at: Date; weekday: number } | null = null;
  for (let weekday = 0; weekday < 7; weekday++) {
    if (!isReminderDay(weekday, schedule)) continue;
    const at = nextWeekdayOccurrence(timeHHMM, weekday, now);
    if (at && (!soonest || at.getTime() < soonest.at.getTime()))
      soonest = { at, weekday };
  }
  return soonest;
}

/** "today at 07:30", "tomorrow at 07:30", "on Thursday at 07:30". */
export function reminderWhen(at: Date, now: Date = new Date()): string {
  const day = localDateString(at);
  const time = formatTimeOfDay(at);
  if (day === localDateString(now)) return `today at ${time}`;
  if (day === localDateString(addLocalDays(now, 1)))
    return `tomorrow at ${time}`;
  return `on ${formatWeekday(at)} at ${time}`;
}

/**
 * Setup's preview of the first reminder: "Upper A tomorrow at 07:30" on a
 * lift day, "A run tomorrow at 07:30" on a run day, "A reminder tomorrow at
 * 07:30" when the day's session cannot be named. Null when the reminder
 * would never go off (a time that is not "HH:mm").
 */
export function reminderPreview(
  timeHHMM: string,
  schedule: Schedule,
  liftName: string | null | undefined,
  now: Date = new Date()
): string | null {
  const next = nextReminderAt(timeHHMM, schedule, now);
  if (!next) return null;
  const when = reminderWhen(next.at, now);
  const type = dayTypeOf(next.weekday, schedule);
  if ((type === "lift" || type === "both") && liftName)
    return `${liftName} ${when}`;
  if (type === "run") return `A run ${when}`;
  return `A reminder ${when}`;
}
