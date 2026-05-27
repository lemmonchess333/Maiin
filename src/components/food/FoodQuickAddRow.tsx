import {
  forwardRef,
  useRef,
  type PointerEvent as ReactPointerEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { motion } from "framer-motion";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptic";
import type { QuickAddItem } from "@/lib/quickAddOrder";

const TAP_EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];

/** Long-press fires after this many ms held without moving. iOS
 *  text-selection callout starts ~500ms; we match so the gesture
 *  feels native. */
const LONG_PRESS_MS = 500;
/** Touch drift (px) that cancels a pending long-press — fingers
 *  rarely stay perfectly still, but scrolling the chip row is a
 *  clear horizontal swipe. 10px is comfortably below the scroll
 *  threshold and above accidental jitter. */
const TOUCH_MOVE_CANCEL_PX = 10;
/** Window after a long-press where the trailing `click` event from
 *  finger-lift is swallowed. iOS Safari synthesises a click on
 *  touchend even when the long-press fired its own action, which
 *  without this guard would double-trigger (log meal AND open
 *  remove sheet). */
const GHOST_CLICK_SUPPRESS_MS = 400;

interface FoodQuickAddRowProps {
  meals: QuickAddItem[];
  /** Lowercased food name of the meal currently being saved
   *  (debounce key) — when non-null, every pill is dimmed +
   *  disabled to prevent concurrent saves. */
  adding: string | null;
  onAdd: (meal: QuickAddItem) => void;
  /** Long-press handler. Fires only when the user holds a chip
   *  with a `favouriteId` (i.e. a chip backed by the pantry). The
   *  parent owns the undo-toast flow so the cache-shape knowledge
   *  (FoodFavourite docs) doesn't leak into this presentational
   *  row. */
  onRemoveFavourite?: (favouriteId: string, name: string) => void;
}

/**
 * Horizontal-scroll strip of Quick Add chips — favourites + recents
 * merged into one row. Extracted from src/pages/Food.tsx so the
 * 1659-line page sheds an isolated visual unit (no shared state with
 * the composer / meal sections). Scroll-on-content-change reset
 * stays in Food.tsx because it touches the same `quickAddScrollRef`
 * elsewhere; the parent forwards the ref via `ref`.
 *
 * Long-press → remove (F2d PR 3): pointer-based gesture detection
 * with three guards documented inline (touchmove cancel, ghost-click
 * suppression, contextmenu preventDefault). iOS text-selection
 * callout is suppressed via `WebkitTouchCallout: none` on the chip
 * style so a held chip doesn't pop the Copy/Look Up menu over the
 * top of our handler.
 */
const FoodQuickAddRow = forwardRef<HTMLDivElement, FoodQuickAddRowProps>(
  function FoodQuickAddRow({ meals, adding, onAdd, onRemoveFavourite }, ref) {
    /* Per-chip gesture state. Refs (not state) so a long-press
       trigger doesn't re-render the row and tear down the timers
       mid-press. */
    const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
      null
    );
    /** True for GHOST_CLICK_SUPPRESS_MS after a long-press fired.
     *  Set via setTimeout (no clock reads) so the trailing
     *  iOS-synthesised click is swallowed without a "log AND
     *  remove" double-fire. */
    const suppressNextClickRef = useRef<boolean>(false);
    const ghostClickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
      null
    );
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
      meal: QuickAddItem
    ) => {
      // Only arm the timer for chips that CAN be removed. Avoids
      // the gesture-conflict cost on non-favourite chips entirely.
      if (!meal.favouriteId || !onRemoveFavourite) return;
      pressStartRef.current = { x: e.clientX, y: e.clientY };
      clearLongPressTimer();
      longPressTimerRef.current = setTimeout(() => {
        longPressTimerRef.current = null;
        armGhostClickSuppress();
        haptic("medium");
        onRemoveFavourite(meal.favouriteId!, meal.name);
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

    const handleClick = (meal: QuickAddItem) => {
      // Ghost-click suppression: iOS Safari fires a synthesized
      // `click` on touchend even when the long-press fired. Without
      // this guard, releasing after a long-press would also log the
      // meal in addition to opening the remove flow.
      if (suppressNextClickRef.current) {
        suppressNextClickRef.current = false;
        return;
      }
      haptic();
      onAdd(meal);
    };

    return (
      <div>
        <p className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
          <Star className="size-3.5 text-amber-500" aria-hidden="true" />
          Quick Add
        </p>
        <div className="relative">
          <div
            ref={ref}
            className="flex gap-2 pb-1 -mx-1 px-1 snap-x snap-mandatory"
            style={{
              overflowX: "auto",
              scrollbarWidth: "none",
              WebkitOverflowScrolling: "touch",
            }}
          >
            {meals.map((meal, i) => (
              /* Pill structure: outer pill caps width via `max-w-[240px]`,
                 inside an inline-flex with the food name (truncate +
                 min-w-0 so the ellipsis works inside flex) and the
                 calorie suffix (shrink-0 so it stays visible even when
                 the name truncates). CSS truncation replaces an
                 earlier JS char-count approach that was brittle across
                 viewport widths. */
              <motion.button
                key={`${meal.name}-${i}`}
                whileTap={{ scale: 0.97 }}
                transition={{ duration: 0.16, ease: TAP_EASE }}
                onPointerDown={(e) => beginPress(e, meal)}
                onPointerMove={movePress}
                onPointerUp={endPress}
                onPointerCancel={endPress}
                onPointerLeave={endPress}
                onContextMenu={(e: ReactMouseEvent<HTMLButtonElement>) => {
                  // Desktop right-click + iOS long-press both fire
                  // contextmenu; suppressing it lets our pointer-based
                  // long-press own the gesture without the browser
                  // also opening its native menu.
                  if (meal.favouriteId) e.preventDefault();
                }}
                onClick={() => handleClick(meal)}
                disabled={adding !== null}
                style={{
                  // iOS text-selection callout suppression — a held
                  // chip would otherwise pop Copy / Look Up on top
                  // of our remove flow.
                  WebkitTouchCallout: "none",
                  WebkitUserSelect: "none",
                  userSelect: "none",
                }}
                className={cn(
                  "shrink-0 snap-start min-h-[44px] px-4 rounded-full bg-card border border-border text-[13px] text-foreground whitespace-nowrap transition-all active:scale-95 max-w-[240px] flex items-center",
                  adding !== null && "opacity-60 cursor-not-allowed"
                )}
              >
                <span className="inline-flex items-center gap-1 max-w-full min-w-0">
                  <span className="truncate min-w-0 text-foreground">
                    {meal.name}
                  </span>
                  <span className="shrink-0 text-muted-foreground">
                    · {meal.cal} kcal
                  </span>
                </span>
              </motion.button>
            ))}
            <div className="shrink-0 w-4" aria-hidden="true" />
          </div>
          {/* Right-edge fade gradient was deliberately removed earlier
              because in practice it sat on top of the rightmost chip's
              text and read as a layout bug ("text covered by a grey
              overlay") rather than a "more content scroll right" cue.
              The horizontal-scroll affordance is enough on its own. */}
        </div>
      </div>
    );
  }
);

export default FoodQuickAddRow;
