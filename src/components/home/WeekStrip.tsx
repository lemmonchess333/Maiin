import { useMemo } from "react";
import { format } from "date-fns";
import type { LayoutDay, WeekLayout } from "@/lib/layOutWeek";
import { cn } from "@/lib/utils";
import { parseLocalDate } from "@/lib/dateHelpers";
import {
  formatDayMonthLong,
  formatWeekday,
  formatWeekdayDayMonth,
} from "@/utils/formatters";

/**
 * What one day of the strip shows (DS4: seven segments under Home's hero,
 * where DS3 drew seven circles). The segment carries the day's state on
 * its own; there is no dot row beneath it and no legend to learn. Its
 * colour is the person's training, the largest colour on Home (§14m).
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
 * Today is outlined in the foreground on top of whichever state it is in,
 * so a finished today still reads as today.
 */
export type WeekDayState =
  | "lift-done"
  | "run-done"
  | "both-done"
  | "planned"
  | "missed"
  | "rest"
  | "before";

/**
 * The segment is a statement about the DATE, as the week lays it out
 * (`layOutWeek`, the one answer Home's card and day card read too). It
 * fills for what was done that day: a lift session saved on it, planned or
 * not, and a run done for it or on it. A lift or run still to do is
 * planned; a run whose day passed is missed; a day whose lift moved on, a
 * day of rest before a race, and a skipped run are bare, like rest.
 */
function weekDayState(day: LayoutDay): WeekDayState {
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

/**
 * What the day's segment says, in words: the training it shows, a planned
 * session whose day has passed included. A lift is named by where the week
 * put it: a day whose lift moved says where it went, so a passed lift day
 * is never read out as missed. One session is announced once.
 */
function trainingLabel(day: LayoutDay): string {
  const lifts = day.sessions.filter((s) => s.sport === "lift");
  const runs = day.sessions.filter((s) => s.sport === "run");
  if (lifts.length === 0 && runs.length === 0 && day.beforeStart)
    return "before you started";
  const lift = lifts.some((s) => s.state === "done")
    ? "completed lift"
    : lifts.length > 0
      ? "lift day"
      : liftLeft(day);
  const run =
    runs.length === 0
      ? null
      : day.lanes.run === "done"
        ? "completed run"
        : runs.some((s) => s.state === "skipped")
          ? "skipped run"
          : runs.some((s) => s.state === "not-recorded")
            ? "race day passed"
            : day.lanes.run === "missed"
              ? "missed run"
              : "run day";
  if (lift && run) return `${lift} and ${run}`;
  return lift ?? run ?? "rest day";
}

/** What a day with no lift on it says of the lift it was given: where it
 *  went, or that it rests before a race. Null for a day it gave none. */
function liftLeft(day: LayoutDay): string | null {
  const gone = day.slidOut[0];
  if (gone)
    return gone.to === "skipped"
      ? "skipped lift"
      : gone.to === "still-to-do"
        ? "lift still to do"
        : `lift moved to ${formatWeekday(parseLocalDate(gone.to))}`;
  return day.rest === "race" ? "rest before your race" : null;
}

/* A segment that holds nothing yet is a track (DESIGN_GUIDE §14o): in the
 * dark theme it is cut into the week card, so a done day's colour sits in
 * something. `track-cut` equals `bg-muted` in the light theme, so only
 * the states with no fill there name the theme. */
const STATE_CLASSES: Record<WeekDayState, string> = {
  "lift-done": "bg-lifting",
  "run-done": "bg-running",
  "both-done": "",
  planned: "border-2 dark:track-cut",
  missed: "border-2 border-dashed border-foreground/30 dark:track-cut",
  rest: "track-cut",
  before: "bg-muted/50 dark:bg-track/60 dark:shadow-[var(--ds-shadow-track)]",
};

/** A planned day's outline, in the colour of what it plans. A day with
 *  both takes the lift's: the outline says "still to do", and the label
 *  names both sessions. */
function plannedSport(day: LayoutDay): "lift" | "run" | "both" {
  const lift = day.lanes.lift === "planned" || day.lanes.lift === "active";
  const run = day.lanes.run === "planned" || day.lanes.run === "active";
  return lift && run ? "both" : run ? "run" : "lift";
}

const PLANNED_EDGE: Record<string, string> = {
  lift: "border-lifting/70",
  run: "border-running/70",
  both: "border-lifting/70",
};

export default function WeekStrip({
  todayKey,
  dayMap,
  week,
  selectedDate,
  onDayTap,
}: {
  /** Today, "yyyy-MM-dd": Home's day key (`useLocalDateKey`), so the strip
   *  turns over with the rest of the page. It read `new Date()` inside a
   *  memo that nothing re-ran at midnight, and kept yesterday as today. */
  todayKey: string;
  dayMap: Map<
    string,
    { workouts: number; meals: number; caloriesHit: boolean }
  >;
  /** The calendar week holding today, laid out (`layOutWeek`): the days
   *  the strip draws, Monday to Sunday. Home's session card and day card
   *  read the same layout, so the strip never puts a lift on a day another
   *  surface gives another. */
  week: WeekLayout;
  selectedDate: string | null;
  onDayTap: (dk: string) => void;
}) {
  const days = useMemo(
    () =>
      /* The CALENDAR week containing today, from its first day: the days
         already gone are where a week's done sessions are, and where
         DayPeekCard's nutrition row has meals to summarise. The weekday
         letters come from each date via `format`, so they move with the
         days rather than being a fixed M-T-W row. */
      week.days.map((d) => {
        const data = dayMap.get(d.date);
        return {
          key: d.date,
          day: d,
          date: parseLocalDate(d.date),
          isToday: d.date === todayKey,
          hasActivity: !!(data && (data.workouts > 0 || data.meals > 0)),
          isSelected: d.date === selectedDate,
          state: weekDayState(d),
          sport: plannedSport(d),
        };
      }),
    [week, dayMap, todayKey, selectedDate]
  );
  return (
    /* Seven equal columns, each segment its column's width less the gap.
       The gap is px, so it does not grow with the text and squeeze "W"
       past its column at double size on a 320px phone. Fixed 44px buttons
       needed more than a 320px phone has once the text is larger, and
       pushed Sunday off the screen. The 44px height stays
       the tap target. Named as Food's strip is, so a screen reader hears
       seven days as one week rather than seven loose buttons. */
    <div
      role="group"
      aria-label={
        days[0] ? `Week of ${formatDayMonthLong(days[0].date)}` : undefined
      }
      className="grid grid-cols-7 items-center gap-x-[6px]"
    >
      {days.map(function (day) {
        /* Every segment is the same size, deliberately: a larger today
           breaks the row on the one day a user looks at most. Today is an
           outline, selection a ring outside it, and the two compose. */
        const style =
          day.state === "both-done"
            ? {
                background:
                  "linear-gradient(90deg, hsl(var(--lifting)) 50%, hsl(var(--running)) 50%)",
              }
            : undefined;
        const sport = day.sport;
        return (
          <button
            type="button"
            key={day.key}
            onClick={function () {
              onDayTap(day.key);
            }}
            /* The strip is a 7-way selector. `aria-pressed` is the
               selection state; adding it to the label as well would
               double-announce against it. */
            aria-pressed={day.isSelected}
            aria-current={day.isToday ? "date" : undefined}
            aria-label={
              // en-GB day-before-month, the app's one date treatment —
              // "Saturday 23 August", not "Saturday, August 23". The
              // capture spec's day-cell selector parses this shape;
              // weekStripCaptureSelector.test.tsx pins the two together.
              formatWeekdayDayMonth(day.date) +
              ", " +
              trainingLabel(day.day) +
              // Kept, but named for what it is: `dayMap` counts meals, and
              // Food.tsx is the only writer of the collection it comes from.
              (day.hasActivity ? " (food logged)" : "") +
              (day.isToday ? " (today)" : "")
            }
            className="flex flex-col items-stretch gap-1.5 active:scale-[0.95] transition-transform w-full min-w-0 min-h-[44px] justify-center"
          >
            <div
              data-state={day.state}
              data-sport={day.state === "planned" ? sport : undefined}
              data-today={day.isToday || undefined}
              className={cn(
                "h-2.5 w-full rounded-full transition-colors",
                STATE_CLASSES[day.state],
                day.state === "planned" && PLANNED_EDGE[sport],
                day.isToday && "border-2 border-foreground border-solid",
                day.isSelected &&
                  "ring-2 ring-foreground ring-offset-2 ring-offset-card"
              )}
              style={style}
            />
            {/* One letter, not two. The row is a fixed frame — the strip
                is always the calendar week — so position disambiguates the
                two S's and the two T's, as on the iOS week row. */}
            <span
              className={cn(
                "text-center text-xs",
                day.isToday
                  ? "font-bold text-foreground"
                  : "font-medium text-muted-foreground"
              )}
            >
              {format(day.date, "EEEEE")}
            </span>
          </button>
        );
      })}
    </div>
  );
}
