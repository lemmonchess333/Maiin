import { useMemo } from "react";
import { THEME } from "@/lib/theme";
import { Check } from "lucide-react";
import { format } from "date-fns";
import type { UserProfile } from "@/lib/auth";
import type { ProgramState } from "@/features/program/programTypes";
import { resolveTrainingWindow } from "@/lib/trainingResolver";
import type { ClaimState } from "@/lib/scheduledRunCompletion";
import { localDateString, parseLocalDate } from "@/lib/dateHelpers";

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
  if (hasLift && hasRun) return `lift and ${run}`;
  if (hasLift) return "lift day";
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
    // PR-0c: the resolver handles the rolling 7-day window. Each
    // resolved day already carries scheduleType + run status with
    // the date-inheritance guard baked in.
    const resolved = resolveTrainingWindow({
      startDate: today,
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
        runCompleted: r.run.isCompleted,
        runSkipped: r.run.status === "skipped",
      };
    });
  }, [dayMap, profile, programState, claimMap, selectedDate]);
  return (
    <div className="flex items-center justify-between px-1">
      {days.map(function (day) {
        // Today: 48px filled purple + halo (matches Program DayStepper's
        // Rule 3). Others: 40px. Selected-not-today: 40px filled purple
        // to match Program Rule 5. Default: 40px hollow ring (transparent
        // fill + 2px border) — matches Program's ProgrammeWeekSelector
        // default cell so the day-circle primitive reads identically on
        // Home and the Train Lift/Run selectors (the grey-fill default was
        // the last state that diverged; it encoded nothing — activity shows
        // via the dots below, not the circle).
        const isBig = day.isToday;
        // Day numbers are numeric displays → font-mono (Archivo) + tabular-nums
        // per the design-system invariant, and text-sm so the week's dates are
        // confidently scannable (was text-xs, and missing the numeral font).
        let cls =
          (isBig ? "size-12 " : "size-10 ") +
          "rounded-full flex items-center justify-center text-sm font-semibold font-mono tabular-nums transition-all relative";
        let st: React.CSSProperties = {};
        if (day.isToday) {
          cls += " text-white";
          st = {
            backgroundColor: THEME.brand,
            boxShadow: `0 0 0 4px ${THEME.brand}1A, 0 4px 14px ${THEME.brand}40`,
          };
        } else if (day.isSelected) {
          cls += " text-white";
          st = { backgroundColor: THEME.brand };
        } else {
          cls += " text-muted-foreground border-2 border-border";
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
            <span className="text-xs text-muted-foreground">
              {format(day.date, "EEE").charAt(0)}
            </span>
            <div className={cls} style={st}>
              {day.date.getDate()}
            </div>
            <div className="flex items-center gap-1">
              {(day.sType === "both" || day.sType === "lift") && (
                <div className="size-[7px] rounded-full bg-lifting" />
              )}
              {/* PR-0c: actual-state precedence on run indicator.
                  Resolver-aware: completed renders Check, skipped
                  fades to 40% opacity, planned stays as the
                  recurring rhombus. Future strip days that don't
                  have a matched runDay just show the rhombus from
                  the recurring weekSchedule. */}
              {(day.sType === "both" || day.sType === "run") &&
                day.runCompleted && (
                  <Check className="size-[10px] text-running" strokeWidth={3} />
                )}
              {(day.sType === "both" || day.sType === "run") &&
                !day.runCompleted && (
                  <div
                    className={`size-[7px] rotate-45 ${
                      day.runSkipped ? "bg-muted-foreground/40" : "bg-running"
                    }`}
                  />
                )}
              {day.sType === "rest" && <div className="size-[7px]" />}
            </div>
          </button>
        );
      })}
    </div>
  );
}
