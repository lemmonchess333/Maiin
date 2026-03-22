import { useMemo } from "react";
import { motion } from "framer-motion";

interface ProgressBarProps {
  label: string;
  done: number;
  total: number;
  color: string;
  bgColor: string;
}

function ProgressBar({ label, done, total, color, bgColor }: ProgressBarProps) {
  const safeDone = Math.max(0, done);
  const safeTotal = Math.max(1, total);
  const pct = Math.min(Math.round((safeDone / safeTotal) * 100), 100);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-foreground">{label}</span>
        <span className="text-xs tabular-nums text-muted-foreground">
          {safeDone}/{safeTotal}
        </span>
      </div>
      <div
        className="h-2.5 rounded-full overflow-hidden"
        style={{ backgroundColor: bgColor }}
      >
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: "easeOut", delay: 0.1 }}
          className="h-full rounded-full"
          style={{ backgroundColor: color }}
        />
      </div>
    </div>
  );
}

interface Props {
  /** Map of date string (YYYY-MM-DD) -> { workouts, meals, caloriesHit } */
  dayMap: Map<
    string,
    { workouts: number; meals: number; caloriesHit: boolean }
  >;
  workoutsTarget?: number;
}

export function WeeklyDayFill({ dayMap, workoutsTarget = 4 }: Props) {
  const stats = useMemo(() => {
    let workoutDays = 0;
    let caloriesDaysMet = 0;
    let mealDays = 0;

    for (const [, val] of dayMap) {
      if (val.workouts > 0) workoutDays++;
      if (val.caloriesHit) caloriesDaysMet++;
      if (val.meals > 0) mealDays++;
    }

    return { workoutDays, caloriesDaysMet, mealDays };
  }, [dayMap]);

  return (
    <div className="space-y-3">
      <ProgressBar
        label="Workouts"
        done={stats.workoutDays}
        total={workoutsTarget}
        color="#22c55e"
        bgColor="#dcfce7"
      />
      <ProgressBar
        label="Calories Met"
        done={stats.caloriesDaysMet}
        total={7}
        color="#e87316"
        bgColor="#ffedd5"
      />
      <ProgressBar
        label="Meals Logged"
        done={stats.mealDays}
        total={7}
        color="#3b82f6"
        bgColor="#dbeafe"
      />
    </div>
  );
}
