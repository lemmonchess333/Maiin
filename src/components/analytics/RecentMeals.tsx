import { useState } from "react";
import { Link } from "react-router-dom";
import { UtensilsCrossed, ChevronRight } from "lucide-react";
import { type Meal } from "@/hooks/useMeals";
import { THEME } from "@/lib/theme";

const HARD_MAX = 30;
const COLLAPSED = 5;

interface RecentMealsProps {
  meals: Meal[];
  /** Active analytics window in days, used to cap the expanded list. */
  rangeDays: number;
  /** Human-readable label for the range, e.g. "1M". Used in the
   *  expander button copy. */
  rangeLabel?: string;
}

interface DayBucket {
  date: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  mealCount: number;
}

/**
 * Aggregates meals by date because the meal-level view (3–4 entries
 * a day) is too dense to scan. The day-level view echoes how users
 * actually think about eating: "yesterday I had 2,100 kcal, the day
 * before 1,800". Mirrors Recent Runs / Recent Lifts in cadence but
 * with a day rather than a session as the unit.
 */
function bucketByDay(meals: Meal[]): DayBucket[] {
  const map = new Map<string, DayBucket>();
  for (const m of meals) {
    if (!m.date) continue;
    const existing = map.get(m.date);
    if (existing) {
      existing.calories += m.totalCalories || 0;
      existing.protein += m.totalProtein || 0;
      existing.carbs += m.totalCarbs || 0;
      existing.fat += m.totalFat || 0;
      existing.mealCount += 1;
    } else {
      map.set(m.date, {
        date: m.date,
        calories: m.totalCalories || 0,
        protein: m.totalProtein || 0,
        carbs: m.totalCarbs || 0,
        fat: m.totalFat || 0,
        mealCount: 1,
      });
    }
  }
  return [...map.values()].sort((a, b) => b.date.localeCompare(a.date));
}

function MacroBar({ p, c, f }: { p: number; c: number; f: number }) {
  const pKcal = p * 4;
  const cKcal = c * 4;
  const fKcal = f * 9;
  const sum = pKcal + cKcal + fKcal;
  if (sum <= 0) return null;
  const pPct = (pKcal / sum) * 100;
  const cPct = (cKcal / sum) * 100;
  const fPct = (fKcal / sum) * 100;
  return (
    <div className="h-1 w-full rounded-sm flex overflow-hidden" aria-hidden="true">
      <div style={{ width: `${pPct}%`, background: THEME.macros.protein, opacity: 0.85 }} />
      <div style={{ width: `${cPct}%`, background: THEME.macros.carbs, opacity: 0.85 }} />
      <div style={{ width: `${fPct}%`, background: THEME.macros.fat, opacity: 0.85 }} />
    </div>
  );
}

export default function RecentMeals({ meals, rangeDays, rangeLabel }: RecentMealsProps) {
  const [expanded, setExpanded] = useState(false);

  // Cap to days inside the active analytics window so "Show all"
  // can't surface ancient days when the user has 1W selected. Then
  // cap further at HARD_MAX (30) to keep the list scannable.
  const since = new Date();
  since.setDate(since.getDate() - rangeDays);
  const inWindow = meals.filter(
    (m) => m.date && new Date(m.date + "T00:00:00") >= since,
  );
  const allDays = bucketByDay(inWindow).slice(0, HARD_MAX);
  if (allDays.length === 0) return null;

  const visibleCount = expanded ? allDays.length : Math.min(COLLAPSED, allDays.length);
  const visible = allDays.slice(0, visibleCount);
  const hiddenCount = allDays.length - visibleCount;

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground font-medium">Recent Days</p>
      {visible.map((d) => {
        const dateObj = new Date(d.date + "T12:00:00");
        const dateLabel = dateObj.toLocaleDateString("en-GB", {
          day: "numeric",
          month: "short",
        });
        const dayName = dateObj.toLocaleDateString("en-GB", { weekday: "short" });

        return (
          <Link
            key={d.date}
            to="/food"
            className="block rounded-xl bg-card p-3 active:scale-[0.98] transition-transform"
            style={{ boxShadow: "var(--ds-shadow-card)" }}
          >
            <div className="flex items-center gap-3">
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: `${THEME.success}18` }}
              >
                <UtensilsCrossed
                  className="w-4 h-4"
                  style={{ color: THEME.success }}
                />
              </div>
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-baseline gap-2">
                  <p className="text-sm font-semibold text-foreground">
                    {dayName}
                  </p>
                  <p className="text-xs font-mono tabular-nums text-foreground">
                    {Math.round(d.calories).toLocaleString()}{" "}
                    <span className="text-muted-foreground">kcal</span>
                  </p>
                  <p className="text-[10px] text-muted-foreground ml-auto">
                    {d.mealCount} {d.mealCount === 1 ? "meal" : "meals"}
                  </p>
                </div>
                <MacroBar p={d.protein} c={d.carbs} f={d.fat} />
              </div>
              <div className="text-right shrink-0 flex items-center gap-1.5">
                <p className="text-xs text-muted-foreground">{dateLabel}</p>
                <ChevronRight
                  className="w-4 h-4 text-muted-foreground/60"
                  aria-hidden="true"
                />
              </div>
            </div>
          </Link>
        );
      })}
      {hiddenCount > 0 && !expanded && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="w-full text-center text-xs font-semibold py-2 active:scale-[0.98] transition-all"
          style={{ color: THEME.success }}
        >
          Show all{rangeLabel ? ` in ${rangeLabel}` : ""} ({allDays.length})
        </button>
      )}
      {expanded && allDays.length > COLLAPSED && (
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="w-full text-center text-xs font-medium text-muted-foreground py-2 active:scale-[0.98] transition-all"
        >
          Show less
        </button>
      )}
    </div>
  );
}
