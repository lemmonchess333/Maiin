import { useEffect, useRef, type ReactNode } from "react";
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
   * edits. Reached by TAPPING the row (not a swipe action) — see below.
   */
  onEdit?: () => void;
  /**
   * Optional metadata caption under the food name (the timeline uses
   * it for "Breakfast · 8:12 AM"). Pure presentation — the swipe/tap
   * machinery is untouched, the row just grows a second line.
   */
  subLabel?: ReactNode;
  /**
   * Optional captured-meal photo — renders as a hero image above the
   * text row INSIDE the swipeable surface ("photos big, text compact"),
   * so photo cards keep the exact same tap-to-edit / swipe-to-delete
   * behaviour as text rows. Only AI-scanned meals carry one.
   */
  photoUrl?: string;
}

// Single destructive swipe action (Delete only). Editing is reached by
// TAPPING the row — it opens the edit sheet, which is the discoverable,
// full-form surface for changes. This mirrors the dominant calorie-app
// convention (MyFitnessPal / Lose It! / MacroFactor / Cronometer all
// tap-to-edit, swipe-to-delete) and Apple's native Mail/Reminders swipe
// (single trailing destructive action with full-swipe-to-commit).
//
// `OPEN_OFFSET` is the resting open position that reveals the Delete
// panel. `FULL_SWIPE_THRESHOLD` is the iOS "swipe all the way to delete"
// commit point — releasing past it deletes immediately (the undo toast
// is the safety net). The panel uses the app's `bg-destructive` token
// (not raw iOS red) so it matches every other destructive surface —
// ConfirmDialog, error toasts, the destructive Button variant.
const OPEN_OFFSET = -96;
const OPEN_THRESHOLD = -52;
const FULL_SWIPE_THRESHOLD = -200;

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
  subLabel,
  photoUrl,
}: FoodRowProps) {
  const reduce = useReducedMotion() === true;
  const hasFiredHapticRef = useRef(false);
  const hasFiredCommitRef = useRef(false);

  // Close the row externally (when another row opens) by resetting drag via key.
  // We use Framer Motion's animate prop to drive the x value directly.
  const targetX = isOpen ? OPEN_OFFSET : 0;

  // Reset the "fired haptic" flags whenever the row closes so the next drag
  // can fire again.
  useEffect(() => {
    if (!isOpen) {
      hasFiredHapticRef.current = false;
      hasFiredCommitRef.current = false;
    }
  }, [isOpen]);

  const handleDrag = (_e: unknown, info: PanInfo) => {
    // Peek haptic when the Delete panel first crosses into "will open".
    if (info.offset.x < OPEN_THRESHOLD && !hasFiredHapticRef.current) {
      haptic("light");
      hasFiredHapticRef.current = true;
    }
    // Distinct commit haptic when the gesture crosses the full-swipe line,
    // so the finger feels the "let go now to delete" point (iOS Mail feel).
    if (info.offset.x < FULL_SWIPE_THRESHOLD && !hasFiredCommitRef.current) {
      haptic("medium");
      hasFiredCommitRef.current = true;
    } else if (info.offset.x >= FULL_SWIPE_THRESHOLD) {
      hasFiredCommitRef.current = false;
    }
  };

  const handleDragEnd = (_e: unknown, info: PanInfo) => {
    // Full swipe → delete immediately (undo toast is the safety net).
    if (info.offset.x < FULL_SWIPE_THRESHOLD) {
      haptic("medium");
      onDelete();
      return;
    }
    onOpenChange(info.offset.x < OPEN_THRESHOLD);
  };

  // Tap on the row body: when open, a tap closes the swipe (iOS behaviour);
  // otherwise it opens the edit sheet. Framer suppresses onTap after a drag,
  // so a swipe-to-open won't also fire an edit.
  const handleTap = () => {
    if (isOpen) {
      onOpenChange(false);
      return;
    }
    onEdit?.();
  };

  const quantityLabel = formatQuantityLabel(group);
  const dot = dotColorFor(group);

  // Shared inner content (macro dot, name, quantity/edited pills, kcal).
  const rowBody = (
    <>
      <div className="flex-1 min-w-0 mr-2">
        <div className="flex items-center gap-2 min-w-0">
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
        {subLabel && (
          /* pl-4 tucks the caption under the name (dot 8px + gap 8px). */
          <p className="text-caption text-muted-foreground/80 truncate pl-4 mt-0.5">
            {subLabel}
          </p>
        )}
      </div>
      <span className="text-xs font-mono tabular-nums text-muted-foreground shrink-0">
        {formatCalories(group.totalCal)} {CALORIE_UNIT}
      </span>
    </>
  );

  // Photo cards stack the hero image above the meta row inside the same
  // swipeable surface. pointer-events-none keeps the browser's native
  // image drag / long-press callout from fighting the framer x-drag.
  const rowInner = photoUrl ? (
    <div className="flex-1 min-w-0">
      <img
        src={photoUrl}
        alt={group.foodName}
        className="w-full h-44 object-cover rounded-lg mb-2.5 pointer-events-none select-none"
        loading="lazy"
        draggable={false}
      />
      <div className="flex items-center justify-between">{rowBody}</div>
    </div>
  ) : (
    rowBody
  );

  // ── Reduced-motion fallback: no drag gesture. The row body is a tap
  //    target that opens the edit sheet (mirrors the swipe path's
  //    tap-to-edit); a single trailing Delete icon button stays for the
  //    destructive action since there's no swipe to reveal it. ─────────
  if (reduce) {
    return (
      <div className="flex items-center" data-food-row>
        {onEdit ? (
          <button
            type="button"
            onClick={onEdit}
            aria-label={`Edit ${group.foodName}`}
            className="flex items-center flex-1 min-w-0 px-3 py-2.5 text-left transition-colors active:bg-muted/40"
          >
            {rowInner}
          </button>
        ) : (
          <div className="flex items-center flex-1 min-w-0 px-3 py-2.5">
            {rowInner}
          </div>
        )}
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Delete ${group.foodName}`}
          className="p-2.5 mr-1 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors active:scale-90"
        >
          <Trash2 aria-hidden="true" className="size-4" />
        </button>
      </div>
    );
  }

  // ── Standard swipe row: tap to edit, swipe to delete ────────────────────
  return (
    <AnimatePresence>
      <motion.div
        className="relative overflow-hidden"
        data-food-row
        /* Swipe-to-delete owns the horizontal gesture here. Marking the
           row `data-swipe-card` makes useSwipeNavigation (the page-level
           swipe-between-tabs handler in Layout) hard-block when a swipe
           starts inside this row — without it, swiping to delete also
           navigated to the adjacent tab ("it just switches pages"). */
        data-swipe-card
        exit={{ height: 0, opacity: 0 }}
        transition={{ height: { duration: 0.25 }, opacity: { duration: 0.2 } }}
      >
        {/*
          Single Delete panel revealed from the right. The button spans
          the full width (so a full swipe floods red behind the row — the
          iOS Mail look) while its icon+label sit in a fixed slot at the
          right edge so they stay put as the row slides past OPEN_OFFSET.
          Tapping the exposed strip deletes.
        */}
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Delete ${group.foodName}`}
          className="absolute inset-0 flex items-center justify-end bg-destructive text-destructive-foreground active:opacity-90 transition-opacity"
        >
          <span
            className="flex flex-col items-center justify-center gap-1 text-caption font-medium tracking-wide"
            style={{ width: Math.abs(OPEN_OFFSET) }}
          >
            <Trash2
              className="size-[18px]"
              strokeWidth={1.75}
              aria-hidden="true"
            />
            Delete
          </span>
        </button>

        {/* Draggable row content on top. Tapping it opens the edit sheet
            (or closes the row when already swiped open). */}
        <motion.div
          drag="x"
          dragDirectionLock
          dragConstraints={{ left: OPEN_OFFSET, right: 0 }}
          dragElastic={{ left: 0.7, right: 0 }}
          onDrag={handleDrag}
          onDragEnd={handleDragEnd}
          onTap={handleTap}
          animate={{ x: targetX }}
          transition={{ type: "spring", stiffness: 400, damping: 35 }}
          role="button"
          tabIndex={0}
          aria-label={`Edit ${group.foodName}`}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onEdit?.();
            }
          }}
          className={cn(
            "relative bg-card flex items-center justify-between px-3 py-2.5 touch-pan-y cursor-pointer select-none"
          )}
        >
          {rowInner}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
