import { useMemo } from "react";
import { THEME } from "@/lib/theme";
import { Check } from "lucide-react";
import { format } from "date-fns";
import type { UserProfile } from "@/lib/auth";
import type { ProgramState } from "@/features/program/programTypes";
import { resolveTrainingWindow } from "@/lib/trainingResolver";
import type { ClaimState } from "@/lib/scheduledRunCompletion";
import { localDateString, parseLocalDate } from "@/lib/dateHelpers";

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
        // to match Program Rule 5. Default: 40px filled grey.
        const isBig = day.isToday;
        let cls =
          (isBig ? "size-12 " : "size-10 ") +
          "rounded-full flex items-center justify-center text-xs font-medium transition-all relative";
        let st: React.CSSProperties = {};
        if (day.isToday) {
          cls += " text-white font-semibold";
          st = {
            backgroundColor: THEME.brand,
            boxShadow: `0 0 0 4px ${THEME.brand}1A, 0 4px 14px ${THEME.brand}40`,
          };
        } else if (day.isSelected) {
          cls += " text-white font-semibold";
          st = { backgroundColor: THEME.brand };
        } else {
          cls += " text-muted-foreground bg-muted";
        }
        return (
          <button
            key={day.key}
            onClick={function () {
              onDayTap(day.key);
            }}
            aria-label={
              format(day.date, "EEEE, MMMM d") +
              (day.hasActivity ? " (activity logged)" : "") +
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
                <div
                  className="w-[7px] h-[7px] rounded-full"
                  style={{ backgroundColor: THEME.lifting }}
                />
              )}
              {/* PR-0c: actual-state precedence on run indicator.
                  Resolver-aware: completed renders Check, skipped
                  fades to 40% opacity, planned stays as the
                  recurring rhombus. Future strip days that don't
                  have a matched runDay just show the rhombus from
                  the recurring weekSchedule. */}
              {(day.sType === "both" || day.sType === "run") &&
                day.runCompleted && (
                  <Check
                    className="w-[10px] h-[10px]"
                    style={{ color: THEME.running }}
                    strokeWidth={3}
                  />
                )}
              {(day.sType === "both" || day.sType === "run") &&
                !day.runCompleted && (
                  <div
                    className="w-[7px] h-[7px] rotate-45"
                    style={{
                      backgroundColor: day.runSkipped
                        ? "hsl(var(--muted-foreground))"
                        : THEME.running,
                      opacity: day.runSkipped ? 0.4 : 1,
                    }}
                  />
                )}
              {day.sType === "rest" && <div className="w-[7px] h-[7px]" />}
            </div>
          </button>
        );
      })}
    </div>
  );
}
