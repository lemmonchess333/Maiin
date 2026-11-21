import type { LayoutDay, LayoutLift, WeekLayout } from "@/lib/layOutWeek";

/**
 * What one day of Home's week strip shows (DS4: seven segments under the
 * hero). The segment carries the day's state on its own; there is no dot
 * row beneath it and no legend to learn. Its colour is the person's
 * training, the largest colour on Home (§14m).
 *
 *   lift-done / run-done  filled with the sport's colour
 *   both-done             split between the two
 *   planned               outlined in its sport's colour: still to do
 *   missed                a dashed outline: a planned run whose day has
 *                         passed. A lift is never missed: one whose day
 *                         passes moves to the next lift day (TrainWk1)
 *   rest                  the bare track
 *   before                the bare track, for a day before the account
 *                         began: a plan made on Friday did not miss Monday
 *
 * `WeekStrip` draws these and the Home Screen widget's week reads the same
 * seven (`homeWidgetSnapshot.ts`), so the two cannot disagree about a day.
 */
export type WeekDayState =
  | "lift-done"
  | "run-done"
  | "both-done"
  | "planned"
  | "missed"
  | "rest"
  | "before";

export interface WeekStripDay {
  key: string;
  /** The sport a planned day's outline is drawn in: a day with both takes
   *  the lift's, and its label names both sessions. */
  sType: "lift" | "run" | "both";
  isToday: boolean;
  isPast: boolean;
  state: WeekDayState;
  /** The day as the week lays it out, for its words. */
  day: LayoutDay;
  /** A passed lift day's own lift, done on another day: when. Its segment
   *  is bare, and its words say the lift was done, not missed. */
  liftDoneOn: string | null;
}

/**
 * The segment is a statement about the DATE, as the week lays it out
 * (`layOutWeek`, the one answer Home's card and day card read too). It
 * fills for what was done that day: a lift session saved on it, planned or
 * not, and a run done for it or on it. A lift or run still to do is
 * planned; a run whose day passed is missed; a day whose lift moved on, a
 * day of rest before a race, and a skipped run are bare, like rest.
 */
export function weekDayState(day: LayoutDay): WeekDayState {
  const { lift, run } = day.lanes;
  if (lift === "done" && run === "done") return "both-done";
  if (lift === "done") return "lift-done";
  if (run === "done") return "run-done";
  if (day.beforeStart) return "before";
  if (lift === "planned" || lift === "active") return "planned";
  if (run === "planned" || run === "active") return "planned";
  if (run === "missed") return "missed";
  return "rest";
}

/** The sport a planned day's outline is drawn in. */
function plannedSport(day: LayoutDay): WeekStripDay["sType"] {
  const lift = day.lanes.lift === "planned" || day.lanes.lift === "active";
  const run = day.lanes.run === "planned" || day.lanes.run === "active";
  return lift && run ? "both" : run ? "run" : "lift";
}

/**
 * The seven days of the calendar week holding today, each with what the
 * strip draws for it, from the week laid out (`layOutWeek`).
 *
 * The CALENDAR week containing today, not a rolling window that starts at
 * today. Home labels this section "This week" while the strip once ran
 * today..today+6, so on a Wednesday it read Wed-Tue and spanned two weeks
 * under a heading claiming one. The days already gone were simply absent,
 * which also put DayPeekCard's nutrition row out of reach: every date the
 * card could be given was in the future, and a future day has no meals to
 * summarise. The layout is that week, Monday to Sunday (`WEEK_STARTS_ON`),
 * resolved on one week key, so no day can inherit another week's status.
 */
export function weekStripDays(
  week: WeekLayout,
  /** Today, "yyyy-MM-dd": Home's day key (`useLocalDateKey`). */
  todayKey: string
): WeekStripDay[] {
  const doneLifts = week.entries.filter(
    (s): s is LayoutLift => s.sport === "lift" && s.plan && s.state === "done"
  );
  return week.days.map((day) => ({
    key: day.date,
    sType: plannedSport(day),
    isToday: day.date === todayKey,
    isPast: day.date < todayKey,
    state: weekDayState(day),
    day,
    liftDoneOn:
      day.date < todayKey
        ? (doneLifts.find(
            (l) => l.plannedOn === day.date && l.date && l.date !== day.date
          )?.date ?? null)
        : null,
  }));
}
