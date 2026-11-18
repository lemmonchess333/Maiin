import { useMemo } from "react";
import { format } from "date-fns";
import type { WeekLayout } from "@/lib/layOutWeek";
import { cn } from "@/lib/utils";
import { parseLocalDate } from "@/lib/dateHelpers";
import {
  weekStripDays,
  type WeekDayState,
  type WeekStripDay,
} from "@/lib/weekStripDays";
import {
  formatDayMonthLong,
  formatWeekday,
  formatWeekdayDayMonth,
} from "@/utils/formatters";

/* What each day shows, and why the strip is the calendar week holding
   today, are `weekStripDays`'s (weekStripDays.ts), from the week laid out
   (`layOutWeek`): the Home Screen widget's week reads the same seven days.
   Today is outlined in the foreground on top of whichever state it is in,
   so a finished today still reads as today. */

/**
 * What the day's segment says, in words: the training it shows, a planned
 * session whose day has passed included. A lift is named by where the week
 * put it: a day whose lift moved says where it went, so a passed lift day
 * is never read out as missed. One session is announced once.
 *
 * The accessible name once said "(activity logged)", which came from
 * `dayMap` and is food: the one signal in this component with NO visual
 * counterpart, announced in place of every signal that has one.
 */
function trainingLabel(strip: WeekStripDay): string {
  const { day } = strip;
  const lifts = day.sessions.filter((s) => s.sport === "lift");
  const runs = day.sessions.filter((s) => s.sport === "run");
  if (lifts.length === 0 && runs.length === 0 && day.beforeStart)
    return "before you started";
  const lift = lifts.some((s) => s.state === "done")
    ? "completed lift"
    : lifts.length > 0
      ? "lift day"
      : liftLeft(strip);
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
 *  went, that it was done on another day, or that it rests before a race.
 *  Null for a day it gave none. */
function liftLeft({ day, liftDoneOn }: WeekStripDay): string | null {
  if (liftDoneOn) return "lift done on another day";
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
      weekStripDays(week, todayKey).map((day) => {
        const data = dayMap.get(day.key);
        return {
          ...day,
          date: parseLocalDate(day.key),
          hasActivity: !!(data && (data.workouts > 0 || data.meals > 0)),
          isSelected: day.key === selectedDate,
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
        const sport = day.sType;
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
              trainingLabel(day) +
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
