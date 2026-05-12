import { forwardRef } from "react";
import { motion } from "framer-motion";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptic";
import type { QuickAddItem } from "@/lib/quickAddOrder";

const TAP_EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];

interface FoodQuickAddRowProps {
  meals: QuickAddItem[];
  /** Lowercased food name of the meal currently being saved
   *  (debounce key) — when non-null, every pill is dimmed +
   *  disabled to prevent concurrent saves. */
  adding: string | null;
  onAdd: (meal: QuickAddItem) => void;
}

/**
 * Horizontal-scroll strip of Quick Add chips — favourites + recents
 * merged into one row. Extracted from src/pages/Food.tsx so the
 * 1659-line page sheds an isolated visual unit (no shared state with
 * the composer / meal sections). Scroll-on-content-change reset
 * stays in Food.tsx because it touches the same `quickAddScrollRef`
 * elsewhere; the parent forwards the ref via `ref`.
 */
const FoodQuickAddRow = forwardRef<HTMLDivElement, FoodQuickAddRowProps>(
  function FoodQuickAddRow({ meals, adding, onAdd }, ref) {
    return (
      <div>
        <p className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
          <Star className="w-3.5 h-3.5 text-amber-500" aria-hidden="true" />
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
                onClick={() => {
                  haptic();
                  onAdd(meal);
                }}
                disabled={adding !== null}
                className={cn(
                  "shrink-0 snap-start min-h-[44px] px-4 rounded-full bg-card border border-border text-[13px] text-foreground whitespace-nowrap transition-all active:scale-95 max-w-[240px] flex items-center",
                  adding !== null && "opacity-60 cursor-not-allowed",
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
  },
);

export default FoodQuickAddRow;
