/**
 * Shared meal constants for the Food page extraction sweep.
 *
 * MEAL_ORDER drives the canonical render order of meal cards on
 * the diary page (breakfast → lunch → snacks → dinner). The
 * matching MEAL_LABELS map provides the display strings used in
 * card headers, the "Add to" composer pills, and any toast copy
 * that names the slot.
 *
 * Previously declared as module-scoped consts inside Food.tsx
 * (PR follow-up); lifted here so the extracted child components
 * (FoodComposerCard, the upcoming meal-sections extraction) can
 * share the same identity without prop-drilling.
 */

export type MealKey = "breakfast" | "lunch" | "snacks" | "dinner";

export const MEAL_ORDER: readonly MealKey[] = [
  "breakfast",
  "lunch",
  "snacks",
  "dinner",
];

export const MEAL_LABELS: Record<MealKey, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snacks: "Snacks",
};

/**
 * Layout for both meal-slot pickers, the composer's row and the edit
 * sheet's: the four slots on one row from 360px up, two by two below
 * that. Left to the solid SegmentedControl's own wrapping, the sheet's
 * pills fit three to a line and leave "Dinner" on a line of its own.
 */
export const MEAL_PICKER_LAYOUT =
  "grid grid-cols-2 min-[360px]:grid-cols-4 [&>button]:min-w-0 [&>button]:px-2 [&>button]:text-xs sm:[&>button]:text-sm";

/**
 * Best-guess meal slot for "now" (local hour), used to pre-select the
 * logging destination so the common case doesn't force a breakfast/
 * lunch/snacks/dinner decision before every save. Kept here with the
 * other meal-slot identity so it's pure + unit-testable without
 * loading the Food page.
 */
export function inferMostLikelyMealSlot(hour: number): MealKey {
  if (hour < 10) return "breakfast";
  if (hour < 15) return "lunch";
  if (hour < 17) return "snacks";
  return "dinner";
}
