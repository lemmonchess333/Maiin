/**
 * Pure derivation of the calorie ring's center value + label given
 * the user's selected mode and over-target state.
 *
 * Pre-F3.1 the label expression read
 *   `{isOver ? "over" : (isLeftMode ? "left" : <the other word>)}`
 * which forced "over" whenever isOver was true regardless of mode.
 * In the logged view + over target the ring then rendered the
 * logged amount with an "over" label — e.g. "5,700 KCAL OVER" when
 * the user had logged 5,700 against a 4,033 target. The 5,700 was
 * logged, not over; the actual over amount was 1,667.
 *
 * Correct mapping:
 *   isLeftMode && isOver  → label "over",   value = |remaining|
 *   isLeftMode && !isOver → label "left",   value = remaining
 *   !isLeftMode           → label "logged", value = consumed
 *
 * "logged", not "eaten": the number counts what is in the diary, not
 * what the person ate, so "0 kcal eaten" before lunch is logged would
 * be untrue (owner call; DS3's STATUS lines). The persisted MODE key
 * stays "eaten" — a stored preference, not copy.
 *
 * The component still renders the deeper overshoot lap whenever
 * isOver is true (both modes), and keeps the persisted ring mode
 * preference untouched. The ring shows the lens the user picked.
 */

export type CalorieRingLabel = "left" | "logged" | "over";

export interface CalorieRingDisplayInput {
  consumed: number;
  target: number;
  isLeftMode: boolean;
}

export interface CalorieRingDisplayResult {
  displayValue: number;
  labelMode: CalorieRingLabel;
  isOver: boolean;
}

export function getCalorieRingDisplay(
  input: CalorieRingDisplayInput
): CalorieRingDisplayResult {
  const { consumed, target, isLeftMode } = input;

  const hasTarget = target > 0;
  const remaining = hasTarget ? target - consumed : 0;
  const isOver = hasTarget && remaining < 0;

  let displayValue: number;
  let labelMode: CalorieRingLabel;

  if (isLeftMode) {
    displayValue = isOver ? Math.abs(remaining) : remaining;
    labelMode = isOver ? "over" : "left";
  } else {
    displayValue = consumed;
    labelMode = "logged";
  }

  return { displayValue, labelMode, isOver };
}
