import { useMemo } from "react";
import { startOfWeek, addDays, format } from "date-fns";
import { cn } from "@/lib/utils";

const DAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];

interface DayData {
  date: string;
  hit: boolean;
}

interface RowProps {
  label: string;
  days: DayData[];
  color: string;
}

function DayFillRow({ label, days, color }: RowProps) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] text-muted-foreground w-24 shrink-0 truncate">
        {label}
      </span>
      <div className="flex gap-1.5 flex-1">
        {days.map((d, i) => (
          <div
            key={i}
            className={cn(
              "w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-medium transition-colors",
            )}
            style={
              d.hit
                ? { backgroundColor: color, color: "#fff" }
                : { backgroundColor: "hsl(var(--muted))" }
            }
          >
            {DAY_LABELS[i]}
          </div>
        ))}
      </div>
      <span className="text-[11px] font-medium text-foreground tabular-nums w-8 text-right">
        {days.filter((d) => d.hit).length}/7
      </span>
    </div>
  );
}

interface Props {
  /** Map of date string (YYYY-MM-DD) → { workouts, meals, caloriesHit } */
  dayMap: Map<
    string,
    { workouts: number; meals: number; caloriesHit: boolean }
  >;
  calorieTarget?: number;
}

export function WeeklyDayFill({ dayMap }: Props) {
  const weekDates = useMemo(() => {
    const monday = startOfWeek(new Date(), { weekStartsOn: 1 });
    return Array.from({ length: 7 }, (_, i) =>
      format(addDays(monday, i), "yyyy-MM-dd")
    );
  }, []);

  const calorieDays: DayData[] = weekDates.map((d) => ({
    date: d,
    hit: dayMap.get(d)?.caloriesHit ?? false,
  }));
  const workoutDays: DayData[] = weekDates.map((d) => ({
    date: d,
    hit: (dayMap.get(d)?.workouts ?? 0) > 0,
  }));
  const mealDays: DayData[] = weekDates.map((d) => ({
    date: d,
    hit: (dayMap.get(d)?.meals ?? 0) > 0,
  }));

  return (
    <div className="space-y-2">
      <DayFillRow label="Calories Goal" days={calorieDays} color="#22c55e" />
      <DayFillRow label="Workouts" days={workoutDays} color="#7c3aed" />
      <DayFillRow label="Meals Logged" days={mealDays} color="#3b82f6" />
    </div>
  );
}
