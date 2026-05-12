import { motion } from "framer-motion";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCalories, CALORIE_UNIT } from "@/utils/formatNutrition";
import FoodRow, { type FoodRowGroup } from "./FoodRow";
import MealMacroBar from "./MealMacroBar";
import { MEAL_LABELS, type MealKey } from "./mealConstants";
import type { Meal } from "@/hooks/useMeals";

function safeNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

interface FoodMealSectionProps {
  mealKey: MealKey;
  /** All persisted meal docs for this slot, in insertion order.
   *  The component groups them by foodName internally — the parent
   *  doesn't need to pre-aggregate. */
  meals: Meal[];
  /** Currently-active "Add to" pill in the composer. Used to tint
   *  the inline + button so the user sees which slot is targeted
   *  even after the composer pill is off-screen. */
  targetMeal: MealKey | null;
  /** Stable id of the row currently swiped open (state lifted to
   *  the parent so at most one row is open page-wide). */
  openRowId: string | null;
  setOpenRowId: (id: string | null) => void;
  onTargetMeal: (m: MealKey) => void;
  onDelete: (mealIds: string[], foodName: string) => void;
  onEdit: (group: {
    id: string;
    foodName: string;
    meals: Meal[];
  }) => void;
}

/**
 * One meal card (Breakfast / Lunch / Snacks / Dinner) rendered on
 * the Food page diary. Owns the foodName grouping logic so the
 * parent doesn't have to pre-aggregate; takes the raw Meal[] and
 * produces the diary rows. The framer-motion `layout` prop drives
 * height transitions when entries come and go.
 *
 * Extracted from src/pages/Food.tsx (was inlined inside a
 * .map(mealKey) loop ~130 lines deep). The parent still owns the
 * loop + the data sources; this component is per-card.
 */
export default function FoodMealSection({
  mealKey,
  meals,
  targetMeal,
  openRowId,
  setOpenRowId,
  onTargetMeal,
  onDelete,
  onEdit,
}: FoodMealSectionProps) {
  const mealCals = meals.reduce((s, m) => s + safeNum(m.totalCalories), 0);
  const totalPro = meals.reduce((s, m) => s + safeNum(m.totalProtein), 0);
  const totalCarb = meals.reduce((s, m) => s + safeNum(m.totalCarbs), 0);
  const totalFat = meals.reduce((s, m) => s + safeNum(m.totalFat), 0);

  // Group populated items by lowercased food name so multiple logs
  // of the same food collapse to a single diary row with a count.
  const grouped = new Map<
    string,
    {
      id: string;
      foodName: string;
      meals: Meal[];
      totalCal: number;
      totalPro: number;
      totalCarb: number;
      totalFat: number;
    }
  >();
  for (const m of meals) {
    const key = (m.foodName || "Meal").toLowerCase().trim();
    const existing = grouped.get(key);
    if (existing) {
      existing.meals.push(m);
      existing.totalCal += safeNum(m.totalCalories);
      existing.totalPro += safeNum(m.totalProtein);
      existing.totalCarb += safeNum(m.totalCarbs);
      existing.totalFat += safeNum(m.totalFat);
    } else {
      grouped.set(key, {
        id: `${mealKey}-${key}`,
        foodName: m.foodName || "Meal",
        meals: [m],
        totalCal: safeNum(m.totalCalories),
        totalPro: safeNum(m.totalProtein),
        totalCarb: safeNum(m.totalCarbs),
        totalFat: safeNum(m.totalFat),
      });
    }
  }
  const groupedEntries = Array.from(grouped.values());

  return (
    <motion.div
      layout
      transition={{ duration: 0.22, ease: "easeOut" }}
      className="bg-card rounded-xl overflow-hidden"
      style={{ boxShadow: "var(--ds-shadow-card)" }}
    >
      {/* Header caption — meal name · item count · total kcal.
          Item count is more glanceable than "BREAKFAST · 12:09 AM"
          (the pre-change copy was wall-clock time of the latest
          log, which read as redundant for cluster-logged meals).
          "Did I log all five things?" is answered at a glance. */}
      <div className="flex items-center justify-between px-3.5 pt-3.5 pb-2.5">
        <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground/90 font-semibold tabular-nums">
          <span className="font-semibold">{MEAL_LABELS[mealKey].toUpperCase()}</span>
          {groupedEntries.length > 0 && (
            <>
              {" · "}
              {groupedEntries.length}{" "}
              {groupedEntries.length === 1 ? "item" : "items"}
            </>
          )}
          {" · "}
          {formatCalories(mealCals)} {CALORIE_UNIT.toUpperCase()}
        </p>
        <button
          onClick={() => onTargetMeal(mealKey)}
          aria-label={`Add food to ${MEAL_LABELS[mealKey]}`}
          className={cn(
            "w-6 h-6 rounded-full flex items-center justify-center transition-all active:scale-90",
            targetMeal === mealKey
              ? "bg-primary text-white"
              : "border border-black/[0.12] text-muted-foreground",
          )}
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Macro micro-bar — 3 segments P/C/F directly under the
          caption with 4px breathing room. */}
      <div className="px-3.5 pb-1.5">
        <MealMacroBar
          totalProtein={totalPro}
          totalCarbs={totalCarb}
          totalFat={totalFat}
        />
      </div>

      {/* Food rows with swipe-to-delete. Each row receives the
          lifted `isOpen` + `onOpenChange` props so at most one
          row swipe is open across the page. */}
      <div className="divide-y divide-border/12">
        {groupedEntries.map((group) => {
          const rowGroup: FoodRowGroup = {
            id: group.id,
            foodName: group.foodName,
            items: group.meals.flatMap((m) => m.items ?? []),
            count: group.meals.length,
            totalCal: group.totalCal,
            totalPro: group.totalPro,
            totalCarb: group.totalCarb,
            totalFat: group.totalFat,
          };
          return (
            <FoodRow
              key={group.id}
              group={rowGroup}
              isOpen={openRowId === group.id}
              onOpenChange={(open) => setOpenRowId(open ? group.id : null)}
              onDelete={() =>
                onDelete(
                  group.meals.map((m) => m.id),
                  group.foodName,
                )
              }
              onEdit={() => {
                setOpenRowId(null);
                onEdit({
                  id: group.id,
                  foodName: group.foodName,
                  meals: group.meals,
                });
              }}
            />
          );
        })}
      </div>
    </motion.div>
  );
}
