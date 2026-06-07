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
