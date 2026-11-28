import { useState } from "react";
import type { CalorieRingMode } from "@/lib/calorieRingFill";

/**
 * What last moved the calorie wheel's arc or a macro's bar: the left and
 * logged switch, or the food (a log, a delete, a new target).
 *
 * A tap on the switch moves the drawing to the other view's fill at once
 * and briskly (`VIEW_SWITCH_SEC`); food moves it on the page's own timing,
 * which on Food waits for the logged food's flight. The answer is kept
 * until the next change, since the render that sees a change is not the
 * one React commits (adjust-state idiom).
 */
export function useRingMoveCause(
  mode: CalorieRingMode,
  consumed: number,
  target: number
): "switch" | "food" {
  const [seen, setSeen] = useState({ mode, consumed, target });
  const [cause, setCause] = useState<"switch" | "food">("food");
  if (
    seen.mode !== mode ||
    seen.consumed !== consumed ||
    seen.target !== target
  ) {
    setSeen({ mode, consumed, target });
    setCause(seen.mode !== mode ? "switch" : "food");
  }
  return cause;
}
