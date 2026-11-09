import { useMemo } from "react";
import { format } from "date-fns";
import type { UserProfile } from "@/lib/auth";
import type { ProgramState } from "@/features/program/programTypes";
import type { ClaimState } from "@/lib/scheduledRunCompletion";
import { cn } from "@/lib/utils";
import { beforeStart } from "@/lib/startDay";
import { parseLocalDate } from "@/lib/dateHelpers";
import {
  weekStripDays,
  type StripDay,
  type WeekDayState,
} from "@/lib/weekStripDays";
import { formatDayMonthLong, formatWeekdayDayMonth } from "@/utils/formatters";

/* What each day shows, and why the strip is the calendar week holding
   today, are `weekStripDays`'s (weekStripDays.ts): the Home Screen
   widget's week reads the same seven days. Today is outlined in the
   foreground on top of whichever state it is in, so a finished today
   still reads as today. */

/**
 * What the day's circle says, in words.
 *
 * The accessible name once said "(activity logged)", which came from
 * `dayMap` and is food: the one signal in this component with NO visual
 * counterpart, announced in place of every signal that has one. It now
 * names the training the circle shows, including a planned session whose
 * day has passed.
 *
 * A lift slot completed by a session on another day (lifts are
 * split-ordered, ADR-0002) leaves this day's circle bare, so the day is
 * named as done on another day. "Completed lift" belongs to the day whose
 * circle the session filled, and one session is announced once.
 */
function trainingLabel(
  day: StripDay,
  isPast: boolean,
  startKey: string | null
): string {
  if (!day.liftLogged && !day.runDone && beforeStart(day.key, startKey))
    return "before you started";
  const hasLift =
    day.sType === "lift" || day.sType === "both" || day.liftLogged;
  const hasRun = day.sType === "run" || day.sType === "both" || day.runDone;
  if (!hasLift && !hasRun) return "rest day";
  const run = day.runDone
    ? "completed run"
    : day.runSkipped
      ? "skipped run"
      : isPast
        ? "missed run"
        : "run day";
  const lift = day.liftLogged
    ? "completed lift"
    : day.liftCompleted
      ? "lift done on another day"
      : day.liftSkipped
        ? "skipped lift"
        : isPast
          ? "missed lift"
          : "lift day";
  if (hasLift && hasRun) return `${lift} and ${run}`;
  if (hasLift) return lift;
  return run;
}

const STATE_CLASSES: Record<WeekDayState, string> = {
  "lift-done": "bg-lifting",
  "run-done": "bg-running",
  "both-done": "",
  planned: "border-2",
  missed: "border-2 border-dashed border-foreground/30",
  rest: "bg-muted",
  before: "bg-muted/50",
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
  profile,
  programState,
  claimMap,
  selectedDate,
  onDayTap,
  loggedLiftDates,
  extraRunDates,
  startKey = null,
}: {
  /** Today, "yyyy-MM-dd": Home's day key (`useLocalDateKey`), so the strip
   *  turns over with the rest of the page. It read `new Date()` inside a
   *  memo that nothing re-ran at midnight, and kept yesterday as today. */
  todayKey: string;
  dayMap: Map<
    string,
    { workouts: number; meals: number; caloriesHit: boolean }
  >;
  /** P1-4 / PR-0c: profile + programState replace the previous
   *  `schedule` + `runDays` props. The strip resolves a 7-day
   *  window via the shared training resolver — every day inherits
   *  one currentWeekKey anchored at today, so a strip-future
   *  Monday no longer borrows this-Monday's runDay status (the
   *  old `inSameWeek` heuristic + dayIndex-only match bug). */
  profile: UserProfile | null;
  programState: ProgramState | null;
  /** PR-J Q3 chunk B3c — derived completion source of truth.
   *  Forwarded to `resolveTrainingWindow` so the strip's run-day ✅
   *  reflects manual / saved-run-claim / legacy completions
   *  uniformly. Wired via `useClaimMapForProgram` in Home. */
  claimMap: Map<string, ClaimState>;
  selectedDate: string | null;
  onDayTap: (dk: string) => void;
  /** Dates ("yyyy-MM-dd") with a logged lift session. */
  loggedLiftDates?: ReadonlySet<string>;
  /** Dates with a logged run that claimed no planned day. */
  extraRunDates?: ReadonlySet<string>;
  /** The day the account began (startDay.ts); earlier days plan nothing. */
  startKey?: string | null;
}) {
  const days = useMemo(
    () =>
      weekStripDays({
        todayKey,
        profile,
        programState,
        claimMap,
        loggedLiftDates,
        extraRunDates,
        startKey,
      }).map((day) => {
        const data = dayMap.get(day.key);
        return {
          ...day,
          date: parseLocalDate(day.key),
          hasActivity: !!(data && (data.workouts > 0 || data.meals > 0)),
          isSelected: day.key === selectedDate,
        };
      }),
    [
      todayKey,
      dayMap,
      profile,
      programState,
      claimMap,
      selectedDate,
      loggedLiftDates,
      extraRunDates,
      startKey,
    ]
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
        const sport =
          day.sType === "both" ? "both" : day.sType === "run" ? "run" : "lift";
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
              trainingLabel(day, day.isPast, startKey) +
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
