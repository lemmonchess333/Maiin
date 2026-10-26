import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  motion,
  useMotionValue,
  useTransform,
  type PanInfo,
} from "framer-motion";
import { Pencil, Trash2 } from "lucide-react";
import { MEAL_SLOT_ICONS, type MealKey } from "./mealConstants";
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
   * it for "Breakfast · 08:12"). Pure presentation — the swipe/tap
   * machinery is untouched, the row just grows a second line.
   */
  subLabel?: ReactNode;
  /** Identifies a portion when the diary has several rows with the same name. */
  accessibleFoodName?: string;
  /**
   * Optional captured-meal photo, as a 52 px thumbnail at the start of
   * the row (Pol1), inside the swipeable surface, so a photo meal keeps
   * the same tap-to-edit and swipe-to-delete as any other. Only scanned
   * meals carry one.
   */
  photoUrl?: string;
  /** The row's meal slot, drawn in a tile the thumbnail's size when the
   *  day has photos and this row has none. */
  slot?: MealKey;
  /**
   * The day has a photo somewhere, so every row keeps the thumbnail's
   * column (its photo, or its slot's tile) and every name starts in the
   * same place. A day without photos keeps the compact rows: most logs
   * have no photo, and a tile on each would only make them taller.
   */
  thumbnailColumn?: boolean;
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

/** Units that never take a plural: "120 g", not "120 gs". */
const UNPLURALISED_UNITS = new Set([
  "g",
  "kg",
  "mg",
  "ml",
  "l",
  "oz",
  "lb",
  "lbs",
  "tbsp",
  "tsp",
  "kcal",
  "cal",
  "fl",
]);

/** The plural of a unit's first word, leaving what follows it alone:
 *  "bar (60 g)" becomes "bars (60 g)", not "bar (60 g)s". */
function pluraliseUnit(unit: string): string {
  const match = unit.match(/^([A-Za-zÀ-ÿ]+)(.*)$/);
  if (!match) return unit;
  const [, word, rest] = match;
  const lower = word.toLowerCase();
  if (UNPLURALISED_UNITS.has(lower) || /s$/i.test(word)) return unit;
  if (/(x|z|ch|sh)$/i.test(word)) return `${word}es${rest}`;
  if (/[^aeiou]y$/i.test(word)) return `${word.slice(0, -1)}ies${rest}`;
  return `${word}s${rest}`;
}

/**
 * Quantity label formatter (change #5).
 *
 * Parse rule (strict):
 *   - Portion must match `^(\d+(?:\.\d+)?)\s+(.+)$`
 *   - Every item in the group must have the SAME portionSize string
 *   - Missing, fractional, or word-quantity portions fall back to `×N`
 *
 * When parse succeeds: `${qty * count} ${unit}`, the total rounded to two
 * places (0.1 × 3 is 0.30000000000000004 in floating point) and the
 * unit's first word made plural when the total is more than one.
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

  const totalQty = Math.round(qty * count * 100) / 100;
  return `${totalQty} ${totalQty > 1 ? pluraliseUnit(unit) : unit}`;
}

export default function FoodRow({
  group,
  isOpen,
  onOpenChange,
  onDelete,
  onEdit,
  subLabel,
  accessibleFoodName,
  photoUrl,
  slot,
  thumbnailColumn = false,
}: FoodRowProps) {
  const reduce = useReducedMotion() === true;
  const hasFiredHapticRef = useRef(false);
  const hasFiredCommitRef = useRef(false);

  // Close the row externally (when another row opens) by resetting drag via key.
  // We use Framer Motion's animate prop to drive the x value directly.
  const targetX = isOpen ? OPEN_OFFSET : 0;
  /* The row's offset, shared by the drag, the open/close animation and
     the Delete panel under it. The panel shows only while the row is off
     zero. At rest the row covers it exactly, but the card's rounded
     corner clips both layers with the same soft edge, and the red shows
     through that edge as a hairline along the last row's corners. */
  const x = useMotionValue(0);
  const deletePanelOpacity = useTransform(x, (v) => (v < -0.5 ? 1 : 0));

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
  const actionName = accessibleFoodName ?? group.foodName;

  /* Shared inner content (name, quantity/edited pills, kcal). The row
     used to open with a dot coloured by whichever macro gave the most
     calories. Nothing on the page said so, and a pink, yellow or green
     dot beside a food read as a status nobody could name, so it went in
     the Food pass. A food's macros are one tap away, in its edit sheet. */
  const rowBody = (
    <>
      {/* The calories drop under the name when the two no longer fit
          (larger text, and the reduced-motion row's delete button beside
          them), rather than leaving the name a column 24px wide. */}
      <div className="min-w-[min(100%,7em)] flex-1 mr-2">
        {/* flex-wrap: the name is what the row is for, so when it and
            the pills cannot share a line the pills move under it,
            rather than the name being cut to "Protei…" beside them.
            dir="auto" lets a right-to-left name truncate from its own
            end; text-left keeps it at the row's start. */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
          {/* Two lines before an ellipsis: product names often differ
              only at the end ("…Yogurt Strawberry" / "…Blueberry"). A
              word wider than the row (larger text on a narrow phone)
              breaks at a syllable with a hyphen, not at any letter. */}
          <p
            dir="auto"
            className="min-w-0 max-w-full text-left text-sm text-foreground line-clamp-2 break-words hyphens-auto"
          >
            {group.foodName}
          </p>
          {group.count > 1 && (
            <span className="max-w-full truncate text-xs font-medium px-2 py-0.5 rounded-full shrink-0 bg-muted text-muted-foreground font-mono tabular-nums">
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
          /* Wraps rather than truncates: it is short, and cutting it
             at large text sizes cut the time ("Dinner · 8:15 …"). */
          <p className="text-caption text-muted-foreground break-words mt-0.5">
            {subLabel}
          </p>
        )}
      </div>
      <span className="ml-auto text-xs font-mono tabular-nums text-muted-foreground shrink-0">
        {formatCalories(group.totalCal)} {CALORIE_UNIT}
      </span>
    </>
  );

  /* Remember WHICH src failed, not merely that one did. The device-local
     read is async, so a group's photo can arrive after the row has
     already rendered; keying on the src means a later, working source
     recovers on its own without an effect resetting a boolean (which is
     also what keeps this off `react-hooks/set-state-in-effect`). */
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const photoFailed = !!photoUrl && failedSrc === photoUrl;
  const hasPhoto = !!photoUrl && !photoFailed;
  const SlotIcon = slot ? MEAL_SLOT_ICONS[slot] : null;

  /* The thumbnail column (Pol1): the photo, 52 px and rounded, or on a
     day with photos the slot's tile in its place. A 176 px photo card
     above each row makes a day of photographed meals a screen and a half
     long. pointer-events-none keeps the browser's native image
     drag and long-press callout from fighting the row's swipe. The name
     is beside it, so the picture says nothing a reader needs. */
  const leading = hasPhoto ? (
    <img
      src={photoUrl}
      alt=""
      className="size-[52px] shrink-0 rounded-xl object-cover pointer-events-none select-none"
      loading="lazy"
      decoding="async"
      draggable={false}
      /* A meal photo can genuinely go missing underneath a rendered row:
         photos are device-local and age out at 90 days, a legacy Storage
         URL can 404, and browser storage can be evicted. The row falls
         back to the shape a row without a photo has on this day. */
      onError={() => setFailedSrc(photoUrl ?? null)}
    />
  ) : thumbnailColumn && SlotIcon ? (
    <span
      aria-hidden="true"
      data-slot-tile={slot}
      className="flex size-[52px] shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground @max-[11em]:hidden"
    >
      <SlotIcon className="size-5" strokeWidth={1.75} />
    </span>
  ) : null;

  /* Under 11em of row (larger text, a narrow phone) the column takes the
     name's room: the photo goes above the name, and the slot's tile, which
     is only there to line names up, gives way. Beside it, the names broke
     mid-word at double text on a 320 px phone. */
  const rowInner = leading ? (
    <div className="@container flex-1 min-w-0">
      <div className="flex items-center gap-3 @max-[11em]:flex-col @max-[11em]:items-start @max-[11em]:gap-2">
        {leading}
        <div className="flex w-full flex-1 min-w-0 flex-wrap items-center justify-between gap-y-1">
          {rowBody}
        </div>
      </div>
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
            aria-label={`Edit ${actionName}`}
            className="flex flex-wrap items-center gap-y-1 flex-1 min-w-0 px-3 py-2.5 text-left transition-colors active:bg-muted/40"
          >
            {rowInner}
          </button>
        ) : (
          <div className="flex flex-wrap items-center gap-y-1 flex-1 min-w-0 px-3 py-2.5">
            {rowInner}
          </div>
        )}
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Delete ${actionName}`}
          className="p-2.5 mr-1 rounded-lg text-muted-foreground hover:text-destructive-strong hover:bg-destructive/10 transition active:scale-90"
        >
          <Trash2 aria-hidden="true" className="size-4" />
        </button>
      </div>
    );
  }

  // ── Standard swipe row: tap to edit, swipe to delete ────────────────────
  /* The exit folds the row away when its meal is deleted. It plays
     because FoodTimeline's list holds the AnimatePresence: a presence of
     the row's own would unmount with the row, which would vanish in one
     frame while the rows below jumped up (Pol1). */
  return (
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
      <motion.button
        data-motion-driven
        type="button"
        onClick={onDelete}
        aria-label={`Delete ${actionName}`}
        className="absolute inset-0 flex items-center justify-end bg-destructive text-destructive-foreground active:brightness-90"
        style={{ opacity: deletePanelOpacity }}
      >
        <span
          className="flex flex-col items-center justify-center gap-1 text-caption font-medium"
          style={{ width: Math.abs(OPEN_OFFSET) }}
        >
          <Trash2
            className="size-[18px]"
            strokeWidth={1.75}
            aria-hidden="true"
          />
          Delete
        </span>
      </motion.button>

      {/* Draggable row content on top. Tapping it opens the edit sheet
            (or closes the row when already swiped open). */}
      <motion.div
        data-motion-driven
        drag="x"
        dragDirectionLock
        dragConstraints={{ left: OPEN_OFFSET, right: 0 }}
        dragElastic={{ left: 0.7, right: 0 }}
        onDrag={handleDrag}
        onDragEnd={handleDragEnd}
        onTap={handleTap}
        style={{ x }}
        animate={{ x: targetX }}
        transition={{ type: "spring", stiffness: 400, damping: 35 }}
        role="button"
        tabIndex={0}
        aria-label={`Edit ${actionName}`}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onEdit?.();
          }
        }}
        className={cn(
          "relative bg-card flex flex-wrap items-center justify-between gap-y-1 px-3 py-2.5 touch-pan-y cursor-pointer select-none"
        )}
      >
        {rowInner}
      </motion.div>
    </motion.div>
  );
}
