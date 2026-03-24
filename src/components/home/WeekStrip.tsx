import { useMemo } from "react";
import { THEME } from "@/lib/theme";
import { format } from "date-fns";
import type { ScheduleDay } from "@/lib/scheduleUtils";

export default function WeekStrip({ dayMap, schedule, selectedDate, onDayTap }: {
  dayMap: Map<string, { workouts: number; meals: number; caloriesHit: boolean }>;
  schedule: ScheduleDay[];
  selectedDate: string | null;
  onDayTap: (dk: string) => void;
}) {
  const days = useMemo(() => {
    const today = new Date();
    const sow = new Date(today);
    sow.setDate(today.getDate() - ((today.getDay() + 6) % 7));
    return Array.from({ length: 7 }, function(_, i) {
      const d = new Date(sow); d.setDate(sow.getDate() + i);
      const k = format(d, "yyyy-MM-dd");
      const data = dayMap.get(k);
      const isToday = k === format(today, "yyyy-MM-dd");
      const hasAct = !!(data && (data.workouts > 0 || data.meals > 0));
      const st = schedule.find(function(s) { return s.day === d.getDay(); })?.type || "rest";
      const isPast = !isToday && k < format(today, "yyyy-MM-dd");
      return { date: d, key: k, isToday: isToday, isPast: isPast, hasActivity: hasAct, sType: st, isSelected: k === selectedDate };
    });
  }, [dayMap, schedule, selectedDate]);
  return (
    <div className="flex items-center justify-between px-1">
      {days.map(function(day) {
        let cls = "size-11 rounded-full flex items-center justify-center text-xs font-medium transition-all relative";
        let st: React.CSSProperties = {};
        if (day.isToday) {
          cls += " text-white font-semibold";
          st = { backgroundColor: THEME.brand };
        } else if (day.isSelected) {
          cls += " text-foreground";
          st = { backgroundColor: "rgba(142,142,147,0.20)" };
        } else {
          cls += " text-muted-foreground";
          cls += " bg-muted";
        }
        return (
          <button key={day.key} onClick={function() { onDayTap(day.key); }} aria-label={format(day.date, "EEEE, MMMM d") + (day.hasActivity ? " (activity logged)" : "") + (day.isToday ? " (today)" : "")} className={`flex flex-col items-center gap-1 active:scale-[0.95] ${day.isPast && !day.isToday ? "opacity-60" : ""}`}>
            <span className="text-xs text-muted-foreground">{format(day.date, "EEE").charAt(0)}</span>
            <div className={cls} style={st}>
              {day.date.getDate()}
            </div>
            <div className="flex items-center gap-1">
              {(day.sType === "both" || day.sType === "lift") && (
                <div className="w-[7px] h-[7px] rounded-full" style={{ backgroundColor: THEME.lifting }} />
              )}
              {(day.sType === "both" || day.sType === "run") && (
                <div className="w-[7px] h-[7px] rotate-45" style={{ backgroundColor: THEME.running }} />
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
