import { useEffect, useRef } from "react";
import { motion, AnimatePresence, type PanInfo } from "framer-motion";
import { Trash2, Pencil } from "lucide-react";
import { THEME } from "@/lib/theme";
import { haptic } from "@/lib/haptic";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { cn } from "@/lib/utils";
import { formatCalories } from "@/utils/formatNutrition";
import { CALORIE_UNIT } from "@/utils/formatNutrition";

export interface FoodRowGroup {
  /** Stable id for the row — we key/open-state against this. */
  id: string;
  foodName: string;
  items: { portionSize?: string }[];
  count: number;
  totalCal: number;
  totalPro: number;
  totalCarb: number;
  totalFat: number;
  /** Food6 ci7 / F5b — true when any meal in the group has been
   *  manually edited via useMeals.editMeal (userEditCount > 0).
   *  AI-refinement writes bump revisionCount but NOT userEditCount,
   *  so the pill reads as "the user touched this" rather than
   *  "anything has touched this doc". */
  wasEdited?: boolean;
}

interface FoodRowProps {
  group: FoodRowGroup;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onDelete: () => void;
  /**
   * Open a servings stepper sheet so the user can bump the count
   * up or down. Handles both "I had more" (stepper +) and exact-count
   * edits.
   */
  onEdit?: () => void;
}

// Two action columns (edit + delete). Was wider when there was a
// redundant "Copy" action; removed because Copy just added +1 serving,
// which the Edit stepper does natively and which Quick Add / the NL
// composer do in fewer taps anyway.
//
// Colours are iOS-system aligned (Apple's HIG swipe-action palette):
// system red for destructive, neutral dark-grey for the secondary
// edit. They sit better against the warm light surfaces than the
// previous saturated #EF4444 / slate #4B5563 pair.
const OPEN_OFFSET = -144;
const OPEN_THRESHOLD = -88;
const DELETE_COLOR = THEME.swipe.destructive;
const EDIT_COLOR = THEME.swipe.neutral;
const ACTION_WIDTH = 72;

/**
 * Quantity label formatter (change #5).
 *
 * Parse rule (strict):
 *   - Portion must match `^(\d+(?:\.\d+)?)\s+(.+)$`
 *   - Every item in the group must have the SAME portionSize string
 *   - Missing, fractional, or word-quantity portions fall back to `×N`
 *
 * When parse succeeds: `${qty * count} ${unit}` with naive English plural
 * (append "s" to the unit when count > 1 and unit doesn't already end in "s").
 */
function formatQuantityLabel(group: FoodRowGroup): string {
  const count = group.count;
  const fallback = `×${count}`;
  if (count <= 1) return fallback;

  const firstPortion = group.items[0]?.portionSize ?? "";
  const match = firstPortion.match(/^(\d+(?:\.\d+)?)\s+(.+)$/);
  if (!match) return fallback;

  // Every item must share the same portionSize
  for (const item of group.items) {
    if ((item.portionSize ?? "") !== firstPortion) return fallback;
  }

  const qty = parseFloat(match[1]);
  const unit = match[2];
  if (!Number.isFinite(qty) || qty <= 0) return fallback;

  const totalQty = qty * count;
  // Strip trailing zero on whole totals: "2.0 cup" -> "2 cups"
  const qtyStr = Number.isInteger(totalQty)
    ? String(totalQty)
    : String(totalQty);

  const pluralUnit =
    totalQty > 1 && !unit.endsWith("s") && !unit.endsWith("S")
      ? `${unit}s`
      : unit;

  return `${qtyStr} ${pluralUnit}`;
}

/**
 * Primary macro dot colour based on which macro provides the most calories.
 */
function dotColorFor(group: FoodRowGroup): string {
  const proCal = group.totalPro * 4;
  const carbCal = group.totalCarb * 4;
  const fatCal = group.totalFat * 9;
  if (proCal === 0 && carbCal === 0 && fatCal === 0) return THEME.neutral[300];
  if (proCal >= carbCal && proCal >= fatCal) return THEME.macros.protein;
  if (carbCal >= proCal && carbCal >= fatCal) return THEME.macros.carbs;
  return THEME.macros.fat;
}

export default function FoodRow({
  group,
  isOpen,
  onOpenChange,
  onDelete,
  onEdit,
}: FoodRowProps) {
  const reduce = useReducedMotion() === true;
  const hasFiredHapticRef = useRef(false);

  // Close the row externally (when another row opens) by resetting drag via key.
  // We use Framer Motion's animate prop to drive the x value directly.
  const targetX = isOpen ? OPEN_OFFSET : 0;

  // Reset the "fired haptic" flag whenever the row closes so the next drag
  // can fire again.
  useEffect(() => {
    if (!isOpen) hasFiredHapticRef.current = false;
  }, [isOpen]);

  const handleDrag = (_e: unknown, info: PanInfo) => {
    if (info.offset.x < OPEN_THRESHOLD && !hasFiredHapticRef.current) {
      haptic("light");
      hasFiredHapticRef.current = true;
    }
  };

  const handleDragEnd = (_e: unknown, info: PanInfo) => {
    if (info.offset.x < OPEN_THRESHOLD) {
      onOpenChange(true);
    } else {
      onOpenChange(false);
    }
  };

  const quantityLabel = formatQuantityLabel(group);
  const dot = dotColorFor(group);

  // ── Reduced-motion fallback: static trash icon, no drag gesture ─────────
  if (reduce) {
    return (
      <div
        className="flex items-center justify-between px-3 py-2.5"
        data-food-row
      >
        <div className="flex items-center gap-2 flex-1 min-w-0 mr-2">
          <span
            className="size-2 rounded-full shrink-0"
            style={{ backgroundColor: dot }}
            aria-hidden="true"
          />
          <p className="text-sm text-foreground truncate">{group.foodName}</p>
          {group.count > 1 && (
            <span className="text-xs font-medium px-2 py-0.5 rounded-full shrink-0 bg-muted text-muted-foreground font-mono tabular-nums">
              {quantityLabel}
            </span>
          )}
          {group.wasEdited && (
            <span
              className="flex items-center gap-0.5 text-caption font-semibold px-1.5 py-0.5 rounded-full shrink-0 bg-muted/70 text-muted-foreground"
              aria-label="Edited"
              title="Edited"
            >
              <Pencil className="size-2.5" aria-hidden="true" />
              Edited
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <span className="text-xs font-mono tabular-nums text-muted-foreground mr-1">
            {formatCalories(group.totalCal)} {CALORIE_UNIT}
          </span>
          {onEdit && (
            <button
              type="button"
              onClick={onEdit}
              aria-label={`Edit ${group.foodName}`}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors active:scale-90"
            >
              <Pencil aria-hidden="true" className="size-3" />
            </button>
          )}
          <button
            type="button"
            onClick={onDelete}
            aria-label={`Delete ${group.foodName}`}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors active:scale-90"
          >
            <Trash2 aria-hidden="true" className="size-3" />
          </button>
        </div>
      </div>
    );
  }

  // ── Standard swipe-to-delete row ────────────────────────────────────────
  return (
    <AnimatePresence>
      <motion.div
        className="relative overflow-hidden"
        data-food-row
        /* Swipe-to-delete owns the horizontal gesture here. Marking the
           row `data-swipe-card` makes useSwipeNavigation (the page-level
           swipe-between-tabs handler in Layout) hard-block when a swipe
           starts inside this row — without it, revealing Edit/Delete also
           navigated to the adjacent tab ("it just switches pages"). */
        data-swipe-card
        exit={{ height: 0, opacity: 0 }}
        transition={{ height: { duration: 0.25 }, opacity: { duration: 0.2 } }}
      >
        {/*
          Action buttons revealed from the right: Edit (neutral) +
          Delete (red). `onEdit` is optional — when not provided the
          row collapses to a single wider delete button for back-
          compat with callers that only want the original behaviour.
        */}
        <div
          className="absolute right-0 top-0 bottom-0 flex"
          style={{ width: Math.abs(OPEN_OFFSET) }}
        >
          {onEdit && (
            <button
              type="button"
              onClick={onEdit}
              aria-label={`Edit ${group.foodName}`}
              className="flex flex-col items-center justify-center gap-1 text-white text-caption font-medium tracking-wide active:opacity-80 transition-opacity"
              style={{ background: EDIT_COLOR, width: ACTION_WIDTH }}
            >
              <Pencil
                className="size-[18px]"
                strokeWidth={1.75}
                aria-hidden="true"
              />
              Edit
            </button>
          )}
          <button
            type="button"
            onClick={onDelete}
            aria-label={`Delete ${group.foodName}`}
            className="flex flex-col items-center justify-center gap-1 text-white text-caption font-medium tracking-wide flex-1 active:opacity-80 transition-opacity"
            style={{ background: DELETE_COLOR }}
          >
            <Trash2
              className="size-[18px]"
              strokeWidth={1.75}
              aria-hidden="true"
            />
            Delete
          </button>
        </div>

        {/* Draggable row content sitting on top */}
        <motion.div
          drag="x"
          dragDirectionLock
          dragConstraints={{ left: OPEN_OFFSET, right: 0 }}
          dragElastic={0.1}
          onDrag={handleDrag}
          onDragEnd={handleDragEnd}
          animate={{ x: targetX }}
          transition={{ type: "spring", stiffness: 400, damping: 35 }}
          className={cn(
            "relative bg-card flex items-center justify-between px-3 py-2.5 touch-pan-y"
          )}
        >
          <div className="flex items-center gap-2 flex-1 min-w-0 mr-2">
            <span
              className="size-2 rounded-full shrink-0"
              style={{ backgroundColor: dot }}
              aria-hidden="true"
            />
            <p className="text-sm text-foreground truncate">{group.foodName}</p>
            {group.count > 1 && (
              <span className="text-xs font-medium px-2 py-0.5 rounded-full shrink-0 bg-muted text-muted-foreground font-mono tabular-nums">
                {quantityLabel}
              </span>
            )}
            {group.wasEdited && (
              <span
                className="flex items-center gap-0.5 text-caption font-semibold px-1.5 py-0.5 rounded-full shrink-0 bg-muted/70 text-muted-foreground"
                aria-label="Edited"
                title="Edited"
              >
                <Pencil className="size-2.5" aria-hidden="true" />
                Edited
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs font-mono tabular-nums text-muted-foreground">
              {formatCalories(group.totalCal)} {CALORIE_UNIT}
            </span>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
