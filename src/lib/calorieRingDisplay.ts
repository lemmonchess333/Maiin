/**
 * Pure derivation of the calorie ring's center value + label given
 * the user's selected mode and over-target state.
 *
 * Pre-F3.1 the label expression read
 *   `{isOver ? "over" : (isLeftMode ? "left" : "eaten")}`
 * which forced "over" whenever isOver was true regardless of mode.
 * In eaten mode + over target the ring then rendered the consumed
 * amount with an "over" label — e.g. "5,700 KCAL OVER" when the
 * user had eaten 5,700 against a 4,033 target. The 5,700 was
 * consumed, not over; the actual over amount was 1,667.
 *
 * Correct mapping:
 *   isLeftMode && isOver  → label "over",  value = |remaining|
 *   isLeftMode && !isOver → label "left",  value = remaining
 *   !isLeftMode           → label "eaten", value = consumed
 *
 * The component still renders the darker-purple overshoot arc
 * whenever isOver is true (both modes), keeps the persisted ring
 * mode preference untouched, and lets the today-at-a-glance line
 * below surface the over amount in words. The ring shows the
 * lens the user picked; the glance line surfaces the fact.
 */

export type CalorieRingLabel = 'left' | 'eaten' | 'over';

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
  input: CalorieRingDisplayInput,
): CalorieRingDisplayResult {
  const { consumed, target, isLeftMode } = input;

  const hasTarget = target > 0;
  const remaining = hasTarget ? target - consumed : 0;
  const isOver = hasTarget && remaining < 0;

  let displayValue: number;
  let labelMode: CalorieRingLabel;

  if (isLeftMode) {
    displayValue = isOver ? Math.abs(remaining) : remaining;
    labelMode = isOver ? 'over' : 'left';
  } else {
    displayValue = consumed;
    labelMode = 'eaten';
  }

  return { displayValue, labelMode, isOver };
}
