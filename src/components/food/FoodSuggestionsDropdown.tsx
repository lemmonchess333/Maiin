import { forwardRef } from "react";
import { motion } from "framer-motion";
import { Plus } from "lucide-react";
import { THEME } from "@/lib/theme";
import type { FoodSuggestion } from "@/lib/nlFoodParser";

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

interface FoodSuggestionsDropdownProps {
  suggestions: FoodSuggestion[];
  offResults: OFFResult[];
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
  onLogManually: () => void;
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
const FoodSuggestionsDropdown = forwardRef<
  HTMLDivElement,
  FoodSuggestionsDropdownProps
>(function FoodSuggestionsDropdown(
  {
    suggestions,
    offResults,
    offEmpty,
    offSearchQuery,
    onSelectSuggestion,
    onSelectOff,
    onLogManually,
  },
  ref,
) {
  return (
    <div
      ref={ref}
      className="absolute z-20 left-0 right-0 mt-1 bg-card border border-border rounded-xl shadow-lg overflow-hidden max-h-80 overflow-y-auto"
    >
      {suggestions.length > 0 && (
        <div>
          {suggestions.map((s, i) => (
            <button
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
              <span className="text-xs text-muted-foreground tabular-nums shrink-0">
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
                    <span className="text-xs">per {food.servingSize}</span>
                  </div>
                </div>
                <Plus className="w-4 h-4 text-primary shrink-0 mt-1" />
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
});

export default FoodSuggestionsDropdown;
