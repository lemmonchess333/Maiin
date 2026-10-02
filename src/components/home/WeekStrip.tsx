import { useMemo } from "react";
import { format } from "date-fns";
import type { UserProfile } from "@/lib/auth";
import type { ProgramState } from "@/features/program/programTypes";
import { resolveTrainingWindow } from "@/lib/trainingResolver";
import type { ClaimState } from "@/lib/scheduledRunCompletion";
import { cn } from "@/lib/utils";
import { beforeStart } from "@/lib/startDay";
import {
  localDateString,
  localWeekKey,
  parseLocalDate,
} from "@/lib/dateHelpers";

/**
 * What one day of the strip shows (DS3). The circle carries the day's
 * state on its own; there is no dot row beneath it and no legend to learn.
 *
 *   lift-done / run-done  filled with the sport's colour
 *   both-done             split between the two
 *   planned               an outlined circle: something is still to do
 *   missed                a dashed outline: a planned day that has passed
 *   rest                  the bare date
 *   before                the bare date, for a day before the account
 *                         began: a plan made on Friday did not miss Monday
 *
 * Today adds the purple ring on top of whichever state it is in, so a
 * finished today still reads as today.
 */
export type WeekDayState =
  | "lift-done"
  | "run-done"
  | "both-done"
  | "planned"
  | "missed"
  | "rest"
  | "before";

interface StripDay {
  key: string;
  sType: string;
  /** The planned lift slot's status. Lifts are split-ordered (ADR-0002),
   *  so a slot can be completed by a session on another day. */
  liftCompleted: boolean;
  liftSkipped: boolean;
  /** A lift session was logged ON this date. */
  liftLogged: boolean;
  /** A run was done on this date: the planned run's derived completion,
   *  or a logged run that claimed no planned day. */
  runDone: boolean;
  runSkipped: boolean;
}

/**
 * The circle is a statement about the DATE. It fills for what was done
 * that day: a logged lift session (planned or not) and a completed or
 * extra run. A planned day with nothing done is planned while ahead and
 * missed once passed, unless its plan was settled some other way — the
 * lift slot completed by a session on another day, or either session
 * skipped — in which case the day is bare, like rest.
 */
function weekDayState(
  day: StripDay,
  todayKey: string,
  startKey: string | null
): WeekDayState {
  const hasLift = day.sType === "lift" || day.sType === "both";
  const hasRun = day.sType === "run" || day.sType === "both";
  if (day.liftLogged && day.runDone) return "both-done";
  if (day.liftLogged) return "lift-done";
  if (day.runDone) return "run-done";
  if (beforeStart(day.key, startKey)) return "before";
  const liftOpen = hasLift && !day.liftSkipped && !day.liftCompleted;
  const runOpen = hasRun && !day.runSkipped;
  if (!liftOpen && !runOpen) return "rest";
  return day.key < todayKey ? "missed" : "planned";
}

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
  "lift-done": "bg-lifting/30 text-foreground",
  "run-done": "bg-running/30 text-foreground",
  "both-done": "text-foreground",
  planned: "border-2 border-foreground/20 text-foreground",
  missed: "border-2 border-dashed border-foreground/25 text-muted-foreground",
  rest: "text-muted-foreground",
  before: "text-muted-foreground",
};

export default function WeekStrip({
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
   *  uniformly. Wired via `useClaimMap` in Home. */
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
  const days = useMemo(() => {
    const today = new Date();
    const todayKey = localDateString(today);
    /* The CALENDAR week containing today, not a rolling window that
       starts at today. Home labels this section "This week" while the
       strip ran today..today+6, so on a Wednesday it read Wed-Tue and
       spanned two weeks under a heading claiming one. The days already
       gone were simply absent, which also put DayPeekCard's nutrition
       row out of reach: every date the card could be given was in the
       future, and a future day has no meals to summarise.

       Starting on the week's FIRST day is forced by the data model,
       not a style choice — and note the argument never names a
       weekday. `resolveTrainingWindow` derives `currentWeekKey` from
       `startDate`, the anchor gating the resolver's legacy run-day
       fallback, which its docstring says must be today's. Starting on
       `localWeekKey(today)` keeps that true for free: all seven days
       share that one key, so no day can inherit another week's status.
       Any strip starting mid-week would straddle two keys and break
       exactly the guard PR-0c installed. The strip follows
       `WEEK_STARTS_ON`, so the Monday flip cost it nothing; the
       weekday letters come from each date via `format`, so they move
       with the days rather than being a fixed S-M-T-W row. */
    const weekStart = parseLocalDate(localWeekKey(today));
    const resolved = resolveTrainingWindow({
      startDate: weekStart,
      days: 7,
      profile,
      programState,
      claimMap,
    });
    return resolved.map((r) => {
      const data = dayMap.get(r.dateKey);
      const day: StripDay = {
        key: r.dateKey,
        sType: r.scheduleType,
        liftCompleted: r.lift.status === "completed",
        liftSkipped: r.lift.status === "skipped",
        liftLogged: loggedLiftDates?.has(r.dateKey) ?? false,
        runDone: r.run.isCompleted || (extraRunDates?.has(r.dateKey) ?? false),
        runSkipped: r.run.status === "skipped",
      };
      return {
        ...day,
        date: parseLocalDate(r.dateKey),
        isToday: r.dateKey === todayKey,
        isPast: r.dateKey < todayKey,
        hasActivity: !!(data && (data.workouts > 0 || data.meals > 0)),
        isSelected: r.dateKey === selectedDate,
        state: weekDayState(day, todayKey, startKey),
      };
    });
  }, [
    dayMap,
    profile,
    programState,
    claimMap,
    selectedDate,
    loggedLiftDates,
    extraRunDates,
    startKey,
  ]);
  return (
    <div className="flex items-center justify-between">
      {days.map(function (day) {
        /* Every circle is the same size, deliberately: a larger today
           breaks the row's baselines on the one day a user looks at
           most. Today is a ring, selection a second ring outside it, and
           the two compose.

           Day numbers are numeric displays → font-mono (Archivo) +
           tabular-nums per the design-system invariant. */
        const style =
          day.state === "both-done"
            ? {
                background:
                  "linear-gradient(135deg, hsl(var(--lifting) / 0.3) 50%, hsl(var(--running) / 0.3) 50%)",
              }
            : undefined;
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
              format(day.date, "EEEE d MMMM") +
              ", " +
              trainingLabel(day, day.isPast, startKey) +
              // Kept, but named for what it is: `dayMap` counts meals, and
              // Food.tsx is the only writer of the collection it comes from.
              (day.hasActivity ? " (food logged)" : "") +
              (day.isToday ? " (today)" : "")
            }
            className="flex flex-col items-center gap-1.5 active:scale-[0.95] transition-transform min-w-[44px] min-h-[44px] justify-center"
          >
            {/* One letter, not two. The row is a fixed frame — the strip
                is always the calendar week — so position disambiguates the
                two S's and the two T's, as on the iOS week row. */}
            <span
              className={cn(
                "text-xs",
                day.isToday
                  ? "font-bold text-foreground"
                  : "font-medium text-muted-foreground"
              )}
            >
              {format(day.date, "EEEEE")}
            </span>
            <div
              data-state={day.state}
              data-today={day.isToday || undefined}
              className={cn(
                "size-10 rounded-full flex items-center justify-center text-sm font-semibold font-mono tabular-nums transition-colors",
                STATE_CLASSES[day.state],
                day.isToday && "border-2 border-primary border-solid",
                day.isSelected &&
                  "ring-2 ring-foreground ring-offset-2 ring-offset-background"
              )}
              style={style}
            >
              {day.date.getDate()}
            </div>
          </button>
        );
      })}
    </div>
  );
}
