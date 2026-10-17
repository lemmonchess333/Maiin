import { AnimatePresence, motion } from "framer-motion";
import SectionLabel from "@/components/ui/SectionLabel";
import { useEffect, useMemo, useRef } from "react";
import { UtensilsCrossed } from "lucide-react";
import FoodRow, { type FoodRowGroup } from "./FoodRow";
import EmptyState from "@/components/ui/EmptyState";
import { MEAL_LABELS } from "./mealConstants";
import { mealSlotFor, mealLoggedAt } from "@/lib/mealSlots";
import { THEME } from "@/lib/theme";
import { track as trackFoodEvent } from "@/lib/foodAnalytics";
import type { Meal } from "@/hooks/useMeals";
import { useFoodPhotoUrls } from "@/hooks/useFoodPhotoUrls";
import { formatTimeOfDay } from "@/utils/formatters";
import {
  CALORIE_UNIT,
  formatCalories,
  formatMacro,
} from "@/utils/formatNutrition";

/**
 * The Food diary feed — a single chronological timeline (newest first),
 * Cal-AI-style. Replaces the four fixed slot sections (FoodMealSection /
 * Food6d): the slot is now row METADATA — auto-derived by `mealSlotFor`,
 * shown in each row's caption ("Breakfast · 08:12") and editable
 * through the row's edit sheet (the existing move-slot path with its
 * "Moved X to Y" toast). Slot targeting for NEW logs lives on in the
 * composer pills; this surface is purely the record of the day.
 *
 * Identical portions within one slot collapse to a "×N" row. A shared
 * name alone does not make two portions interchangeable: the edit sheet
 * repeats or removes a whole recorded portion, so different nutrition or
 * item quantities stay separately editable instead of becoming an average.
 *
 * Mixed feed (Food8): AI-scanned meals keep their capture and show it;
 * text, barcode and manual logs have none. Pol1 made the photo a 52 px
 * thumbnail at the start of its row, in place of Food8's 176 px photo
 * card, and on a day with any photo every other row carries its slot's
 * tile in the same column, so the names line up. A day without photos
 * keeps the compact rows. Every shape shares FoodRow's swipe and tap.
 *
 * Food9 moved that persistence off Firebase Storage and onto the device
 * (`foodPhotoStore.ts`), so the photo source is now resolved
 * ASYNCHRONOUSLY by `useFoodPhotoUrls` rather than read off the meal doc.
 * Docs written before the swap still carry a `photoUrl` pointing at a
 * Storage blob; that stays the fallback so nothing already on screen
 * disappears. A photo the retention sweep has since dropped simply
 * resolves to nothing and the row renders in its ordinary compact form —
 * the shape most rows already have, so the degrade needs no design.
 */

/* Render-perf telemetry, throttled to once per day per user — the
   timeline succeeds FoodMealSection's per-slot probe (Food6e) as the
   Food-page list-render signal. */
function shouldEmitTimelinePerf(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const today = new Date().toISOString().slice(0, 10);
    const storageKey = `tropos-food-timeline-perf-${today}`;
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

/** Only the serving's contents belong in this identity. Timestamps,
 * revision counters and record ids describe its history, not its size. */
function portionIdentity(meal: Meal): string {
  return JSON.stringify([
    safeNum(meal.totalCalories),
    safeNum(meal.totalProtein),
    safeNum(meal.totalCarbs),
    safeNum(meal.totalFat),
    (meal.items ?? []).map((item) => [
      item.name,
      item.portionSize,
      safeNum(item.calories),
      safeNum(item.protein),
      safeNum(item.carbs),
      safeNum(item.fat),
      item.fiber ?? null,
      item.sugar ?? null,
      item.sodium ?? null,
    ]),
  ]);
}

interface FoodTimelineProps {
  /** All visible meal docs for the selected day (pending deletes
   *  already filtered by the parent). */
  meals: Meal[];
  /** Stable id of the row currently swiped open (lifted so at most
   *  one row is open page-wide). */
  openRowId: string | null;
  setOpenRowId: (id: string | null) => void;
  onDelete: (mealIds: string[], foodName: string) => void;
  onEdit: (group: { id: string; foodName: string; meals: Meal[] }) => void;
}

export default function FoodTimeline({
  meals,
  openRowId,
  setOpenRowId,
  onDelete,
  onEdit,
}: FoodTimelineProps) {
  // A serving step must copy/remove an equivalent recorded portion.
  // Include its contents in the stable key so adding/removing another
  // portion cannot make an open row switch to a different portion size.
  // Each group tracks its latest log time for the timeline and caption.
  const grouped = new Map<
    string,
    {
      id: string;
      foodName: string;
      slot: ReturnType<typeof mealSlotFor>;
      meals: Meal[];
      latestMs: number;
      totalCal: number;
      totalPro: number;
      totalCarb: number;
      totalFat: number;
    }
  >();
  for (const m of meals) {
    const slot = mealSlotFor(m);
    const nameKey = (m.foodName || "Meal").toLowerCase().trim();
    const key = `${slot}-${nameKey}-${portionIdentity(m)}`;
    const loggedMs = mealLoggedAt(m.createdAt)?.getTime() ?? 0;
    const existing = grouped.get(key);
    if (existing) {
      existing.meals.push(m);
      existing.latestMs = Math.max(existing.latestMs, loggedMs);
      existing.totalCal += safeNum(m.totalCalories);
      existing.totalPro += safeNum(m.totalProtein);
      existing.totalCarb += safeNum(m.totalCarbs);
      existing.totalFat += safeNum(m.totalFat);
    } else {
      grouped.set(key, {
        id: key,
        foodName: m.foodName || "Meal",
        slot,
        meals: [m],
        latestMs: loggedMs,
        totalCal: safeNum(m.totalCalories),
        totalPro: safeNum(m.totalProtein),
        totalCarb: safeNum(m.totalCarbs),
        totalFat: safeNum(m.totalFat),
      });
    }
  }
  // Newest first; entries with no readable timestamp sink to the bottom.
  const entries = Array.from(grouped.values()).sort(
    (a, b) => b.latestMs - a.latestMs
  );
  const nameCounts = new Map<string, number>();
  for (const group of entries) {
    const name = group.foodName.toLowerCase().trim();
    nameCounts.set(name, (nameCounts.get(name) ?? 0) + 1);
  }

  /* Device-local photo resolution (Food9). One id per group is enough:
     grouping collapses same-name logs in one slot, and the card shows a
     single hero — the FIRST group member that has a photo, matching what
     the legacy `photoUrl` derive below already did. Hooks must run before
     the empty-list early return, so this sits above it. */
  const photoCandidateIds = useMemo(
    () => entries.map((g) => g.meals[0]?.id).filter((id): id is string => !!id),
    [entries]
  );
  const localPhotoUrls = useFoodPhotoUrls(photoCandidateIds);
  /* Local first, legacy Storage URL second. Pre-Food9 docs keep rendering
     from `photoUrl`; new ones never write that field at all, so the
     fallback drains on its own as those meals age out of the 90-day diary
     window. */
  const photoUrlOf = (group: (typeof entries)[number]) =>
    localPhotoUrls[group.meals[0]?.id ?? ""] ??
    group.meals.find((m) => m.photoUrl)?.photoUrl;
  const dayHasPhotos = entries.some((group) => !!photoUrlOf(group));

  /* Same render-timing shape as the FoodMealSection probe it replaces —
     see that pattern's rationale in the Food6e lock. */
  // eslint-disable-next-line react-hooks/purity
  const renderStartRef = useRef<number>(performance.now());
  useEffect(() => {
    const elapsed = performance.now() - renderStartRef.current;
    renderStartRef.current = performance.now();
    if (shouldEmitTimelinePerf()) {
      trackFoodEvent("food_timeline_perf", {
        itemCount: entries.length,
        renderDurationMs: Math.round(elapsed),
      });
    }
  });

  if (entries.length === 0) {
    return (
      <div className="bg-card rounded-xl card-shadow">
        <EmptyState
          compact
          icon={UtensilsCrossed}
          accent={THEME.semantic.nutrition}
          headline="Nothing logged yet"
          sub="Log a meal above — everything you eat shows up here."
        />
      </div>
    );
  }

  return (
    <motion.div
      layout
      transition={{ duration: 0.22, ease: "easeOut" }}
      className="bg-card rounded-xl overflow-hidden card-shadow"
      style={{ contain: "layout paint" }}
    >
      {/* Header caption — item count answers "did I log all five
          things?" at a glance; totals stay the hero card's job. */}
      <div className="px-3.5 pt-3.5 pb-2">
        <SectionLabel>
          Food log {" · "}
          {entries.length} {entries.length === 1 ? "item" : "items"}
        </SectionLabel>
      </div>

      <div className="divide-y divide-border/12">
        {/* One presence for the list, so a deleted meal's row folds away
            and the rows below slide up into its place (Pol1). Not on the
            first paint: the day's rows are simply there. */}
        <AnimatePresence initial={false}>
          {entries.map((group) => {
            // aria-label replaces the row's visible text. Name collisions
            // therefore need the portion details in both action labels.
            const accessibleFoodName =
              (nameCounts.get(group.foodName.toLowerCase().trim()) ?? 0) > 1
                ? [
                    group.foodName,
                    MEAL_LABELS[group.slot],
                    `${formatCalories(group.totalCal)} ${CALORIE_UNIT}`,
                    `${group.meals.length} ${group.meals.length === 1 ? "serving" : "servings"}`,
                    `${formatMacro(group.totalPro)} g protein`,
                    `${formatMacro(group.totalCarb)} g carbs`,
                    `${formatMacro(group.totalFat)} g fat`,
                    ...(group.meals[0].items ?? []).map((item) =>
                      [
                        item.name,
                        item.portionSize ? `(${item.portionSize})` : "",
                      ]
                        .filter(Boolean)
                        .join(" ")
                    ),
                  ]
                    .filter(Boolean)
                    .join(", ")
                : undefined;
            const rowGroup: FoodRowGroup = {
              id: group.id,
              foodName: group.foodName,
              items: group.meals.flatMap((m) => m.items ?? []),
              count: group.meals.length,
              totalCal: group.totalCal,
              totalPro: group.totalPro,
              totalCarb: group.totalCarb,
              totalFat: group.totalFat,
              // Food6 ci7: only USER edits flip the pill (userEditCount,
              // not revisionCount — AI refinement doesn't count).
              wasEdited: group.meals.some((m) => (m.userEditCount ?? 0) > 0),
            };
            return (
              <FoodRow
                key={group.id}
                group={rowGroup}
                accessibleFoodName={accessibleFoodName}
                photoUrl={photoUrlOf(group)}
                slot={group.slot}
                thumbnailColumn={dayHasPhotos}
                subLabel={
                  <>
                    {MEAL_LABELS[group.slot]}
                    {group.latestMs > 0 && (
                      <>
                        {" · "}
                        <span className="font-mono tabular-nums">
                          {formatTimeOfDay(new Date(group.latestMs))}
                        </span>
                      </>
                    )}
                  </>
                }
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
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
