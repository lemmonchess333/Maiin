import { useMemo } from "react";
import { Check, Minus } from "lucide-react";
import { format } from "date-fns";
import type { UserProfile } from "@/lib/auth";
import type { ProgramState } from "@/features/program/programTypes";
import { resolveTrainingWindow } from "@/lib/trainingResolver";
import type { ClaimState } from "@/lib/scheduledRunCompletion";
import {
  localDateString,
  startOfLocalWeek,
  parseLocalDate,
} from "@/lib/dateHelpers";

/**
 * What the day's dots say, in words.
 *
 * The strip renders a purple dot for a lift day, a coral rhombus for a
 * planned run, a coral check for a completed one, and a faded rhombus for a
 * skipped one — none of which reached the accessible name. The label said
 * "(activity logged)" instead, which came from `dayMap` and is food: the one
 * signal in this component with NO visual counterpart, announced in place of
 * every signal that has one. A screen-reader user heard nothing for a day
 * they had trained, and "activity logged" for a day they had only eaten.
 */
function trainingLabel(day: {
  sType: string;
  liftCompleted: boolean;
  liftSkipped: boolean;
  runCompleted: boolean;
  runSkipped: boolean;
}): string {
  const hasLift = day.sType === "lift" || day.sType === "both";
  const hasRun = day.sType === "run" || day.sType === "both";
  if (!hasLift && !hasRun) return "rest day";
  const run = day.runCompleted
    ? "completed run"
    : day.runSkipped
      ? "skipped run"
      : "run day";
  const lift = day.liftCompleted
    ? "completed lift"
    : day.liftSkipped
      ? "skipped lift"
      : "lift day";
  if (hasLift && hasRun) return `${lift} and ${run}`;
  if (hasLift) return lift;
  return run;
}

export default function WeekStrip({
  dayMap,
  profile,
  programState,
  claimMap,
  selectedDate,
  onDayTap,
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

       Home and Programme share the Monday anchor with their resolver,
       so all seven cells belong to the same calendar week. */
    const weekStart = startOfLocalWeek(today);
    const resolved = resolveTrainingWindow({
      startDate: weekStart,
      days: 7,
      profile,
      programState,
      claimMap,
    });
    return resolved.map((r) => {
      const data = dayMap.get(r.dateKey);
      return {
        date: parseLocalDate(r.dateKey),
        key: r.dateKey,
        isToday: r.dateKey === todayKey,
        hasActivity: !!(data && (data.workouts > 0 || data.meals > 0)),
        sType: r.scheduleType,
        isSelected: r.dateKey === selectedDate,
        liftCompleted: r.lift.status === "completed",
        liftSkipped: r.lift.status === "skipped",
        runCompleted: r.run.isCompleted,
        runSkipped: r.run.status === "skipped",
      };
    });
  }, [dayMap, profile, programState, claimMap, selectedDate]);
  return (
    <div className="flex items-center justify-between px-1">
      {days.map(function (day) {
        /* Every cell is the same size, deliberately. In a `flex-col
           items-center` cell, a circle taller than its neighbours pushes
           its own weekday letter up and its indicator dot down, so sizing
           today differently breaks all three of the strip's baselines on
           the one day a user looks at most. Today is a colour and a ring,
           never a geometry — the reason iOS week rows stay ruled while
           still marking today.

           Day numbers are numeric displays → font-mono (Archivo) +
           tabular-nums per the design-system invariant. */
        let cls =
          "size-10 rounded-full flex items-center justify-center text-sm font-semibold font-mono tabular-nums transition-all relative";
        /* Fill says SELECTED, ring says TODAY, and they COMPOSE. An
           if/else here lets selection mask today: pick today — the
           likeliest day to pick — and its marker disappears, leaving it
           indistinguishable from any other selected day. */
        if (day.isSelected) {
          cls += " bg-primary-strong text-primary-foreground";
        } else if (day.isToday) {
          cls += " border-2 border-primary text-primary";
        } else {
          cls += " text-muted-foreground border-2 border-border";
        }
        if (day.isToday) {
          cls += " ring-2 ring-primary ring-offset-2 ring-offset-background";
        }
        return (
          <button
            type="button"
            key={day.key}
            onClick={function () {
              onDayTap(day.key);
            }}
            /* The strip is a 7-way selector whose selection was conveyed by
               fill colour alone — nothing in the accessible tree said which
               day was chosen. `aria-pressed` is the state; there is no
               textual equivalent to add to the label, and adding one would
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
              trainingLabel(day) +
              // Kept, but named for what it is: `dayMap` counts meals, and
              // Food.tsx is the only writer of the collection it comes from.
              (day.hasActivity ? " (food logged)" : "") +
              (day.isToday ? " (today)" : "")
            }
            className="flex flex-col items-center gap-1 active:scale-[0.95] min-w-[44px] min-h-[44px] justify-center"
          >
            {/* One letter, not two. The row is a fixed frame — these seven
                letters never move, because the strip is always the calendar
                week — so position disambiguates the two S's and the two T's
                exactly as it does on the iOS week row. */}
            <span className="text-xs text-muted-foreground">
              {format(day.date, "EEEEE")}
            </span>
            <div className={cls}>{day.date.getDate()}</div>
            <div className="flex h-3 items-center gap-1" aria-hidden="true">
              {(day.sType === "both" || day.sType === "lift") &&
                (day.liftCompleted ? (
                  <Check
                    className="size-3 text-lifting-strong"
                    strokeWidth={3}
                  />
                ) : day.liftSkipped ? (
                  <Minus
                    className="size-3 text-lifting-strong"
                    strokeWidth={3}
                  />
                ) : (
                  <div className="size-[7px] rounded-full bg-lifting" />
                ))}
              {/* Shape communicates status as well as sport colour. */}
              {(day.sType === "both" || day.sType === "run") &&
                day.runCompleted && (
                  <Check
                    className="size-3 text-running-strong"
                    strokeWidth={3}
                  />
                )}
              {(day.sType === "both" || day.sType === "run") &&
                !day.runCompleted &&
                (day.runSkipped ? (
                  <Minus
                    className="size-3 text-running-strong"
                    strokeWidth={3}
                  />
                ) : (
                  <div className="size-[7px] rotate-45 bg-running" />
                ))}
              {day.sType === "rest" && <div className="size-[7px]" />}
            </div>
          </button>
        );
      })}
    </div>
  );
}
