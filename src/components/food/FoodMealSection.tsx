import { m as motion } from "framer-motion";
import { Plus } from "lucide-react";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { formatCalories, CALORIE_UNIT } from "@/utils/formatNutrition";
import FoodRow, { type FoodRowGroup } from "./FoodRow";
import MealMacroBar from "./MealMacroBar";
import { MEAL_LABELS, type MealKey } from "./mealConstants";
import { track as trackFoodEvent } from "@/lib/foodAnalytics";
import type { Meal } from "@/hooks/useMeals";

/* Food6e: render-perf telemetry throttled to once per slot per day
   per user. Key shape: tropos-food-slot-perf-<slotKey>-<YYYY-MM-DD>.
   Without throttle the event fires 10-50 times/session per slot,
   drowning the P95 signal the Food6e lock's re-evaluation triggers
   depend on. */
function shouldEmitSlotPerf(slotKey: MealKey): boolean {
  if (typeof window === "undefined") return false;
  try {
    const today = new Date().toISOString().slice(0, 10);
    const storageKey = `tropos-food-slot-perf-${slotKey}-${today}`;
    if (sessionStorage.getItem(storageKey)) return false;
    sessionStorage.setItem(storageKey, "1");
    return true;
  } catch {
    /* private-mode / disabled storage — silently skip */
    return false;
  }
}

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
  onEdit: (group: { id: string; foodName: string; meals: Meal[] }) => void;
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
  // Single pass over the meal docs accumulates all four macro totals at once
  // (was four independent .reduce() passes over the same array).
  const totals = meals.reduce(
    (acc, m) => {
      acc.cals += safeNum(m.totalCalories);
      acc.pro += safeNum(m.totalProtein);
      acc.carb += safeNum(m.totalCarbs);
      acc.fat += safeNum(m.totalFat);
      return acc;
    },
    { cals: 0, pro: 0, carb: 0, fat: 0 }
  );
  const mealCals = totals.cals;
  const totalPro = totals.pro;
  const totalCarb = totals.carb;
  const totalFat = totals.fat;

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

  /* Food6e telemetry foundation (Food6e-S1 + Food6e-S2). Captures
     render-start with performance.now() at render-call time and
     emits in a post-mount useEffect with the elapsed delta. Throttled
     to once per slot per day per user via the helper above. The
     metric is order-of-magnitude (not microsecond-precise) because
     the post-mount useEffect runs after React's commit phase, not at
     exact paint time — accept this for the order-of-magnitude
     signal we need for the Food6e re-evaluation triggers.
     react-hooks/purity rule disabled here: `performance.now()` is
     impure but the ref-initialiser pattern is the canonical way to
     time render duration; the existing Home2 `home_initial_render_ms`
     instrumentation uses the same shape via a post-mount effect to
     side-step the rule, but here we need PER-RENDER timing, not
     mount-only. */
  // eslint-disable-next-line react-hooks/purity
  const renderStartRef = useRef<number>(performance.now());
  useEffect(() => {
    /* Re-stamp on every render so the useEffect's elapsed delta
       reflects THIS render cycle, not the first mount. The ref
       initialiser runs once. */
    const elapsed = performance.now() - renderStartRef.current;
    renderStartRef.current = performance.now();
    if (shouldEmitSlotPerf(mealKey)) {
      trackFoodEvent("food_meal_slot_perf", {
        slot: mealKey,
        itemCount: groupedEntries.length,
        renderDurationMs: Math.round(elapsed),
      });
    }
  });

  return (
    <motion.div
      layout
      transition={{ duration: 0.22, ease: "easeOut" }}
      className="bg-card rounded-xl overflow-hidden"
      /* Food6e-S3: CSS `contain: layout paint` scopes layout/paint
         invalidation to this slot so a re-render of one section
         doesn't trigger reflow on siblings. Cheap browser-native
         perf hint per Hist5f-pattern freebie value-add. */
      style={{ boxShadow: "var(--ds-shadow-card)", contain: "layout paint" }}
    >
      {/* Header caption — meal name · item count · total kcal.
          Item count is more glanceable than "BREAKFAST · 12:09 AM"
          (the pre-change copy was wall-clock time of the latest
          log, which read as redundant for cluster-logged meals).
          "Did I log all five things?" is answered at a glance. */}
      <div className="flex items-center justify-between px-3.5 pt-3.5 pb-2.5">
        <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground/90 font-semibold tabular-nums">
          <span className="font-semibold">
            {MEAL_LABELS[mealKey].toUpperCase()}
          </span>
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
          type="button"
          onClick={() => onTargetMeal(mealKey)}
          aria-label={`Add food to ${MEAL_LABELS[mealKey]}`}
          className="size-11 -m-2.5 flex items-center justify-center transition-transform active:scale-90"
        >
          <span
            className={cn(
              "size-6 rounded-full flex items-center justify-center",
              targetMeal === mealKey
                ? "bg-primary text-white"
                : "border border-black/[0.12] text-muted-foreground"
            )}
          >
            <Plus className="size-3.5" />
          </span>
        </button>
      </div>

      {/* Macro micro-bar — 3 segments P/C/F directly under the
          caption with 4px breathing room. Hidden in empty state
          (a flat zero bar reads as noise — the empty CTA is the
          real signal). */}
      {groupedEntries.length > 0 && (
        <div className="px-3.5 pb-1.5">
          <MealMacroBar
            totalProtein={totalPro}
            totalCarbs={totalCarb}
            totalFat={totalFat}
          />
        </div>
      )}

      {/* Food6d-1: empty slot shows a muted "+ Add to [slot]" CTA in
          place of food rows. Per-slot empty state replaces the
          single centered prompt that used to sit below all sections
          — mixed states (breakfast logged, lunch empty) now read as
          intentional independent slots rather than "page is half
          broken". Tapping routes through onTargetMeal so it shares
          the composer-focus path with the header + pill. */}
      {groupedEntries.length === 0 ? (
        <button
          type="button"
          onClick={() => onTargetMeal(mealKey)}
          aria-label={`Add to ${MEAL_LABELS[mealKey]}`}
          className="w-full flex items-center justify-center gap-1.5 p-3.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors active:scale-[0.99]"
        >
          <Plus className="size-3.5" aria-hidden="true" />
          Add to {MEAL_LABELS[mealKey]}
        </button>
      ) : (
        <>
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
                // Food6 ci7: any underlying meal manually edited via
                // useMeals.editMeal flips the pill on. AI-refinement
                // writes bump revisionCount but NOT userEditCount, so
                // a refined-only group reads as un-edited (correct).
                wasEdited: group.meals.some((m) => (m.userEditCount ?? 0) > 0),
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
                      group.foodName
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
          {/* Food6d-3: smaller "+ Add another" affordance at the
              bottom of a populated slot — section-level CTA, not
              an in-list row, so it doesn't shift swipe targets or
              compete with the header + button or the per-slot pill. */}
          <button
            type="button"
            onClick={() => onTargetMeal(mealKey)}
            aria-label={`Add another to ${MEAL_LABELS[mealKey]}`}
            className="w-full flex items-center justify-center gap-1.5 px-3.5 py-2.5 text-[11px] font-medium text-muted-foreground/80 hover:text-foreground hover:bg-muted/40 transition-colors active:scale-[0.99]"
          >
            <Plus className="size-3" aria-hidden="true" />
            Add another
          </button>
        </>
      )}
    </motion.div>
  );
}
