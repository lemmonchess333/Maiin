import { motion } from "framer-motion";
import { useEffect, useRef } from "react";
import { UtensilsCrossed } from "lucide-react";
import { format } from "date-fns";
import FoodRow, { type FoodRowGroup } from "./FoodRow";
import EmptyState from "@/components/ui/EmptyState";
import { MEAL_LABELS } from "./mealConstants";
import { mealSlotFor, mealLoggedAt } from "@/lib/mealSlots";
import { THEME } from "@/lib/theme";
import { track as trackFoodEvent } from "@/lib/foodAnalytics";
import type { Meal } from "@/hooks/useMeals";

/**
 * The Food diary feed — a single chronological timeline (newest first),
 * Cal-AI-style. Replaces the four fixed slot sections (FoodMealSection /
 * Food6d): the slot is now row METADATA — auto-derived by `mealSlotFor`,
 * shown in each row's caption ("Breakfast · 8:12 AM") and editable
 * through the row's edit sheet (the existing move-slot path with its
 * "Moved X to Y" toast). Slot targeting for NEW logs lives on in the
 * composer pills; this surface is purely the record of the day.
 *
 * Grouping is unchanged from the sections era — same-name logs within
 * one slot collapse to a "×N" row with the same `${slot}-${name}` id, so
 * the lifted openRowId, group delete, and the edit sheet's count/slot/
 * macro semantics all carry over untouched.
 *
 * Photo seam (commit 2 of the timeline arc): when meal docs gain a
 * persisted `photoUrl` (Storage upload — not stored today, the camera
 * flow discards the image), photo-backed groups render as BIG image
 * cards in this list while text logs stay compact rows ("mixed feed"
 * locked decision). The branch point is the row map below.
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
  // Group same-name logs within a slot (identical key shape to the
  // sections era so row ids — and therefore openRowId — are stable
  // across the migration). Each group tracks its LATEST log time,
  // which drives both the timeline order and the row's time caption.
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
    const key = `${slot}-${nameKey}`;
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
          sub="Log a meal above — everything you eat lands here as the day's timeline."
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
        <p className="text-caption uppercase tracking-[0.14em] text-muted-foreground/90 font-semibold">
          Food log {" · "}
          {entries.length} {entries.length === 1 ? "item" : "items"}
        </p>
      </div>

      <div className="divide-y divide-border/12">
        {entries.map((group) => {
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
          /* Photo-card branch lands here (commit 2): a group whose docs
             carry photoUrl renders as a big image card instead of the
             compact row. */
          return (
            <FoodRow
              key={group.id}
              group={rowGroup}
              subLabel={
                <>
                  {MEAL_LABELS[group.slot]}
                  {group.latestMs > 0 && (
                    <>
                      {" · "}
                      <span className="font-mono tabular-nums">
                        {format(new Date(group.latestMs), "h:mm a")}
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
      </div>
    </motion.div>
  );
}
