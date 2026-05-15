import { useMemo } from "react";
import { THEME } from "@/lib/theme";
import { Check } from "lucide-react";
import { format } from "date-fns";
import type { ScheduleDay } from "@/lib/scheduleUtils";
import type { ScheduledRunDay } from "@/features/program/programTypes";

export default function WeekStrip({ dayMap, schedule, runDays, selectedDate, onDayTap }: {
  dayMap: Map<string, { workouts: number; meals: number; caloriesHit: boolean }>;
  schedule: ScheduleDay[];
  /** P1-4: programState.runDays for the current week. Used to
   *  reconcile the recurring weekSchedule type with actual run
   *  completion / skip status. Only matches against today + future
   *  strip days within the current calendar week — runDays beyond
   *  the current week haven't been generated yet. */
  runDays?: ScheduledRunDay[];
  selectedDate: string | null;
  onDayTap: (dk: string) => void;
}) {
  const days = useMemo(() => {
    const today = new Date();
    const todayKey = format(today, "yyyy-MM-dd");
    const todayDow = today.getDay();
    // Left-aligned rolling 7-day window: today at index 0, then 6
    // future days. The Home strip is forward-facing — the past is done,
    // what matters is today's progress and what's coming. Follows
    // Apple Fitness / Fitbit convention.
    return Array.from({ length: 7 }, function(_, i) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const k = format(d, "yyyy-MM-dd");
      const data = dayMap.get(k);
      const isToday = k === todayKey;
      const hasAct = !!(data && (data.workouts > 0 || data.meals > 0));
      const dow = d.getDay();
      const st = schedule.find(function(s) { return s.day === dow; })?.type || "rest";
      // P1-4: recurring-vs-actual precedence.
      //   - inSameWeek: i < 7 days from today AND d.getDay() >= today.getDay()
      //     ensures runDays only match strip days inside the current
      //     week. A "Monday" strip day three days from now (when today
      //     is Friday) is NEXT week's Monday, not the current
      //     runDays[Monday].
      //   - runDay completion / skip overrides the recurring dot.
      const inSameWeek = i === 0 || dow > todayDow || (i === 0 && dow === todayDow);
      const rd = inSameWeek
        ? runDays?.find(function(r) { return r.dayIndex === dow; })
        : undefined;
      const runCompleted = !!rd?.completed;
      const runSkipped = rd?.status === "skipped";
      return {
        date: d,
        key: k,
        isToday: isToday,
        hasActivity: hasAct,
        sType: st,
        isSelected: k === selectedDate,
        runCompleted,
        runSkipped,
      };
    });
  }, [dayMap, schedule, runDays, selectedDate]);
  return (
    <div className="flex items-center justify-between px-1">
      {days.map(function(day) {
        // Today: 48px filled purple + halo (matches Program DayStepper's
        // Rule 3). Others: 40px. Selected-not-today: 40px filled purple
        // to match Program Rule 5. Default: 40px filled grey.
        const isBig = day.isToday;
        let cls = (isBig ? "size-12 " : "size-10 ") + "rounded-full flex items-center justify-center text-xs font-medium transition-all relative";
        let st: React.CSSProperties = {};
        if (day.isToday) {
          cls += " text-white font-semibold";
          st = { backgroundColor: THEME.brand, boxShadow: `0 0 0 4px ${THEME.brand}1A, 0 4px 14px ${THEME.brand}40` };
        } else if (day.isSelected) {
          cls += " text-white font-semibold";
          st = { backgroundColor: THEME.brand };
        } else {
          cls += " text-muted-foreground bg-muted";
        }
        return (
          <button key={day.key} onClick={function() { onDayTap(day.key); }} aria-label={format(day.date, "EEEE, MMMM d") + (day.hasActivity ? " (activity logged)" : "") + (day.isToday ? " (today)" : "")} className="flex flex-col items-center gap-1 active:scale-[0.95] min-w-[44px] min-h-[44px] justify-center">
            <span className="text-xs text-muted-foreground">{format(day.date, "EEE").charAt(0)}</span>
            <div className={cls} style={st}>
              {day.date.getDate()}
            </div>
            <div className="flex items-center gap-1">
              {(day.sType === "both" || day.sType === "lift") && (
                <div className="w-[7px] h-[7px] rounded-full" style={{ backgroundColor: THEME.lifting }} />
              )}
              {/* P1-4: actual-state precedence on run indicator.
                  Completed run renders the recurring rhombus with a
                  Check overlay. Skipped run fades it to 40% opacity
                  + drops the colour. Planned (no actual state) stays
                  as the original recurring rhombus. */}
              {(day.sType === "both" || day.sType === "run") && day.runCompleted && (
                <Check className="w-[10px] h-[10px]" style={{ color: THEME.running }} strokeWidth={3} />
              )}
              {(day.sType === "both" || day.sType === "run") && !day.runCompleted && (
                <div
                  className="w-[7px] h-[7px] rotate-45"
                  style={{
                    backgroundColor: day.runSkipped ? "hsl(var(--muted-foreground))" : THEME.running,
                    opacity: day.runSkipped ? 0.4 : 1,
                  }}
                />
              )}
              {day.sType === "rest" && (
                <div className="w-[7px] h-[7px]" />
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
