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
        let cls = "w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium transition-all";
        let st: React.CSSProperties = {};
        if (day.isSelected) {
          cls += " text-white";
          st = { backgroundColor: THEME.brand };
        } else if (day.isToday) {
          cls += " text-foreground font-semibold";
          st = { border: `2px solid ${THEME.brand}` };
        } else {
          cls += " text-muted-foreground";
          st = { backgroundColor: THEME.neutral[100] };
        }
        return (
          <button key={day.key} onClick={function() { onDayTap(day.key); }} aria-label={format(day.date, "EEEE, MMMM d") + (day.hasActivity ? " (activity logged)" : "") + (day.isToday ? " (today)" : "")} className="flex flex-col items-center gap-1.5 transition-transform active:scale-[0.93] focus-visible:outline-2 focus-visible:outline-primary focus-visible:rounded-lg">
            <span className="text-[10px] text-muted-foreground">{format(day.date, "EEE").charAt(0)}</span>
            <div className={cls} style={st}>{day.date.getDate()}</div>
            <div className="w-1.5 h-1.5" />
          </button>
        );
      })}
    </div>
  );
}
