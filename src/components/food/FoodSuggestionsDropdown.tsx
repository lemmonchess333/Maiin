import {
  useRef,
  type Ref,
  type PointerEvent as ReactPointerEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { motion } from "framer-motion";
import { Plus, Star } from "lucide-react";
import { THEME } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptic";
import type { FoodSuggestion } from "@/lib/nlFoodParser";
import type { QuickAddItem } from "@/lib/quickAddOrder";

/* Long-press gesture constants — moved verbatim from the retired
   FoodQuickAddRow (wave2 D). Rationale unchanged: */
/** Long-press fires after this many ms held without moving. iOS
 *  text-selection callout starts ~500ms; we match so the gesture
 *  feels native. */
const LONG_PRESS_MS = 500;
/** Touch drift (px) that cancels a pending long-press — fingers
 *  rarely stay perfectly still. 10px is comfortably below the scroll
 *  threshold and above accidental jitter. */
const TOUCH_MOVE_CANCEL_PX = 10;
/** Window after a long-press where the trailing `click` event from
 *  finger-lift is swallowed. iOS Safari synthesises a click on
 *  touchend even when the long-press fired its own action, which
 *  without this guard would double-trigger (log meal AND open
 *  remove sheet). */
const GHOST_CLICK_SUPPRESS_MS = 400;

/** Subset of FoodFavourite used by the typeahead pantry section.
 *  Only the fields the dropdown needs to display + hand back to the
 *  parent on selection — no need to pull the full Firestore doc
 *  shape through the dropdown's contract. */
export interface PantrySuggestion {
  id: string;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  servingSize: string;
  useCount: number;
  source: "manual" | "photo" | "barcode" | "search" | "nl";
}

export interface OFFResult {
  name: string;
  brand: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  servingSize: string;
  /** F2: signal from the OFF mapper that a real serving size was
   *  available ('high') vs the fall-back per-100g default ('low').
   *  Drives the "Per-100g data only · Confirm serving size" banner
   *  in ServingSizeDrawer so the user knows the macro numbers are
   *  per 100g, not per actual serving. Optional for back-compat
   *  with existing fixtures. */
  unitConfidence?: "high" | "low";
}

/** Empty-query mode payload (wave2 D). Non-null ONLY while the input is
 *  focused and empty — the parent owns that decision. The dropdown then
 *  renders the user's Quick Add items as instant-add rows (the replacement
 *  for the retired FoodQuickAddRow chip strip). `asExamples` keeps the
 *  cold-start distinction: when the items are only seeded defaults rather
 *  than the user's own history, the section is framed as examples. */
export interface QuickAddSection {
  items: QuickAddItem[];
  asExamples: boolean;
  /** Lowercased food name of the meal currently being saved — when
   *  non-null every row is dimmed + disabled to prevent concurrent saves
   *  (same contract as the old chip strip). */
  adding: string | null;
  onAdd: (item: QuickAddItem) => void;
  /** Long-press remove for favourite-backed rows — preserved from the
   *  chip strip. Only rows with a `favouriteId` arm the gesture. */
  onRemove?: (favouriteId: string, name: string) => void;
}

interface FoodSuggestionsDropdownProps {
  suggestions: FoodSuggestion[];
  offResults: OFFResult[];
  /** Non-null = render the empty-query Quick Add section. */
  quickAdd?: QuickAddSection | null;
  /** F2d PR 4: matches from the user's own pantry (favourites). Renders
   *  at the TOP of the dropdown above local DB + OFF — when the user
   *  types a food they've eaten before, the one-tap log lands first.
   *  Header is omitted entirely when the array is empty. */
  pantryResults: PantrySuggestion[];
  /** True only when the OFF API completed with zero matches AND
   *  there are also no local suggestions. Drives the "No matches"
   *  fallback row that surfaces the manual-log escape hatch. */
  offEmpty: boolean;
  /** Null when offSearchQuery hasn't been computed yet (initial
   *  render after focus). The "no matches" fallback only fires
   *  when this is set so we don't briefly flash it during the
   *  parse → fetch → render gap. */
  offSearchQuery: string | null;
  onSelectSuggestion: (s: FoodSuggestion) => void;
  onSelectOff: (food: OFFResult) => void;
  onSelectPantry: (p: PantrySuggestion) => void;
  onLogManually: () => void;
  ref?: Ref<HTMLDivElement>;
}

/**
 * Suggestions dropdown that surfaces under the NL food input.
 * Three render branches, in priority order:
 *
 *   1. Local FOOD_DB matches (`suggestions`) — fast, free, exact.
 *   2. OpenFoodFacts results (`offResults`) — remote, branded foods.
 *   3. "No matches found" + manual-log escape — only when both of
 *      the above came back empty AND we know we attempted an OFF
 *      fetch (`offSearchQuery !== null && offEmpty`).
 *
 * The parent owns `suggestionsRef` because it uses the same handle
 * for outside-click detection; we accept it via forwardRef so the
 * parent's click-outside logic still resolves the dropdown's
 * bounding box.
 *
 * Extracted from src/pages/Food.tsx (PR follow-up). Keeps Food.tsx
 * shorter and the dropdown markup independently testable.
 */
function FoodSuggestionsDropdown({
  suggestions,
  offResults,
  quickAdd = null,
  pantryResults,
  offEmpty,
  offSearchQuery,
  onSelectSuggestion,
  onSelectOff,
  onSelectPantry,
  onLogManually,
  ref,
}: FoodSuggestionsDropdownProps) {
  /* Long-press gesture state for the Quick Add rows — moved verbatim from
     the retired FoodQuickAddRow. Refs (not state) so a long-press trigger
     doesn't re-render the list and tear down the timers mid-press. One
     finger at a time, so a single shared timer set is correct. */
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressNextClickRef = useRef<boolean>(false);
  const ghostClickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressStartRef = useRef<{ x: number; y: number } | null>(null);

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current !== null) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const armGhostClickSuppress = () => {
    suppressNextClickRef.current = true;
    if (ghostClickTimerRef.current !== null) {
      clearTimeout(ghostClickTimerRef.current);
    }
    ghostClickTimerRef.current = setTimeout(() => {
      suppressNextClickRef.current = false;
      ghostClickTimerRef.current = null;
    }, GHOST_CLICK_SUPPRESS_MS);
  };

  const beginPress = (
    e: ReactPointerEvent<HTMLButtonElement>,
    item: QuickAddItem
  ) => {
    // Only arm the timer for rows that CAN be removed.
    if (!item.favouriteId || !quickAdd?.onRemove) return;
    pressStartRef.current = { x: e.clientX, y: e.clientY };
    clearLongPressTimer();
    longPressTimerRef.current = setTimeout(() => {
      longPressTimerRef.current = null;
      armGhostClickSuppress();
      haptic("medium");
      quickAdd.onRemove!(item.favouriteId!, item.name);
    }, LONG_PRESS_MS);
  };

  const movePress = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const start = pressStartRef.current;
    if (!start || longPressTimerRef.current === null) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (dx * dx + dy * dy > TOUCH_MOVE_CANCEL_PX * TOUCH_MOVE_CANCEL_PX) {
      clearLongPressTimer();
    }
  };

  const endPress = () => {
    clearLongPressTimer();
    pressStartRef.current = null;
  };

  const handleQuickAddClick = (item: QuickAddItem) => {
    // Ghost-click suppression — see GHOST_CLICK_SUPPRESS_MS.
    if (suppressNextClickRef.current) {
      suppressNextClickRef.current = false;
      return;
    }
    haptic();
    quickAdd?.onAdd(item);
  };

  return (
    <div
      ref={ref}
      className="absolute z-20 left-0 right-0 mt-1 bg-card border border-border rounded-xl shadow-lg overflow-hidden max-h-80 overflow-y-auto"
    >
      {quickAdd && quickAdd.items.length > 0 && (
        <div>
          {/* Empty-focus Quick Add section (wave2 D) — the user's instant
              repeat-log items, shown while the input is focused + empty.
              Tap = instant log (same semantics as the old chip strip:
              haptic, instant save via the parent's handler, no portion
              drawer). Long-press on a favourite-backed row = remove.
              Cold-start accounts whose items are only seeded defaults get
              the same rows framed as EXAMPLES, not as their own history. */}
          <div className="px-4 pt-2 pb-1 flex items-center gap-1.5">
            {!quickAdd.asExamples && (
              <Star aria-hidden="true" className="size-3 text-amber-500" />
            )}
            <span className="text-caption uppercase tracking-wide text-muted-foreground font-medium">
              {quickAdd.asExamples ? "Examples" : "Quick Add"}
            </span>
          </div>
          {quickAdd.items.map((item) => (
            <button
              type="button"
              key={item.key}
              onMouseDown={(e) => e.preventDefault()}
              onPointerDown={(e) => beginPress(e, item)}
              onPointerMove={movePress}
              onPointerUp={endPress}
              onPointerCancel={endPress}
              onPointerLeave={endPress}
              onContextMenu={(e: ReactMouseEvent<HTMLButtonElement>) => {
                // Desktop right-click + iOS long-press both fire
                // contextmenu; suppressing it lets our pointer-based
                // long-press own the gesture without the browser also
                // opening its native menu.
                if (item.favouriteId) e.preventDefault();
              }}
              onClick={() => handleQuickAddClick(item)}
              disabled={quickAdd.adding !== null}
              style={{
                // iOS text-selection callout suppression — a held row
                // would otherwise pop Copy / Look Up over our remove flow.
                WebkitTouchCallout: "none",
                WebkitUserSelect: "none",
                userSelect: "none",
              }}
              className={cn(
                "w-full px-4 py-2.5 text-left hover:bg-muted/80 transition-colors flex items-center justify-between gap-2 border-b border-border/30 last:border-0",
                quickAdd.adding !== null && "opacity-60 cursor-not-allowed"
              )}
            >
              <span className="text-sm font-medium text-foreground truncate min-w-0">
                {item.name}
              </span>
              <span className="text-xs text-muted-foreground font-mono tabular-nums shrink-0">
                {item.cal} kcal
              </span>
            </button>
          ))}
        </div>
      )}
      {pantryResults.length > 0 && (
        <div>
          {/* Section header — only renders when there are matches.
              The header sits inline (not as a sticky banner) so the
              dropdown stays scannable as one continuous list when
              local DB + OFF results follow. */}
          <div className="px-4 pt-2 pb-1 flex items-center gap-1.5">
            <Star aria-hidden="true" className="size-3 text-amber-500" />
            <span className="text-caption uppercase tracking-wide text-muted-foreground font-medium">
              Your pantry
            </span>
          </div>
          {pantryResults.map((p) => (
            <button
              type="button"
              key={`pantry-${p.id}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onSelectPantry(p)}
              className="w-full px-4 py-2.5 text-left hover:bg-muted/80 transition-colors flex items-center justify-between gap-2 border-b border-border/30 last:border-0"
            >
              <span className="text-sm font-medium text-foreground truncate min-w-0">
                {p.name}
                <span className="text-muted-foreground font-normal ml-1.5">
                  · {p.servingSize}
                </span>
              </span>
              <span className="text-xs text-muted-foreground font-mono tabular-nums shrink-0">
                {Math.round(p.calories)} cal · P{Math.round(p.protein)}g · C
                {Math.round(p.carbs)}g · F{Math.round(p.fat)}g
              </span>
            </button>
          ))}
        </div>
      )}
      {suggestions.length > 0 && (
        <div>
          {suggestions.map((s, i) => (
            <button
              type="button"
              key={`ai-${i}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onSelectSuggestion(s)}
              className="w-full px-4 py-2.5 text-left hover:bg-muted/80 transition-colors flex items-center justify-between gap-2 border-b border-border/30 last:border-0"
            >
              <span className="text-sm font-medium text-foreground">
                {s.name} —{" "}
                <span className="text-muted-foreground font-normal">
                  {s.serving}
                </span>
              </span>
              <span className="text-xs text-muted-foreground font-mono tabular-nums shrink-0">
                {s.calories} cal · P{s.protein}g · C{s.carbs}g · F{s.fat}g
              </span>
            </button>
          ))}
        </div>
      )}
      {offResults.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
        >
          {offResults.map((food, i) => (
            <button
              type="button"
              key={`off-${i}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onSelectOff(food)}
              className="w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors border-b border-border/30 last:border-0"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {food.name}
                  </p>
                  {food.brand && (
                    <p className="text-xs text-muted-foreground truncate">
                      {food.brand}
                    </p>
                  )}
                  <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                    <span className="text-orange-500 font-medium">
                      {food.calories} cal
                    </span>
                    <span>&middot;</span>
                    <span>P {food.protein}g</span>
                    <span>C {food.carbs}g</span>
                    <span>F {food.fat}g</span>
                    {food.unitConfidence === "low" ? (
                      // OFF omitted a serving_size, so the macros above are
                      // per-100g and the ServingSizeDrawer will ask on select.
                      // Surface the reason inline so the follow-up isn't a
                      // surprise. text-warning = "needs your input", tokenized.
                      <span className="text-xs text-warning font-medium">
                        serving size needed
                      </span>
                    ) : (
                      <span className="text-xs">per {food.servingSize}</span>
                    )}
                  </div>
                </div>
                <Plus className="size-4 text-primary shrink-0 mt-1" />
              </div>
            </button>
          ))}
        </motion.div>
      )}
      {suggestions.length === 0 &&
        offResults.length === 0 &&
        offEmpty &&
        offSearchQuery !== null && (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={onLogManually}
            className="w-full px-4 py-3 text-left hover:bg-muted/50 transition-colors flex items-center justify-between gap-2"
          >
            <span className="text-sm text-muted-foreground">
              No matches found
            </span>
            <span
              className="text-xs font-medium"
              style={{ color: THEME.semantic.nutrition }}
            >
              Log manually
            </span>
          </button>
        )}
    </div>
  );
}

export default FoodSuggestionsDropdown;
