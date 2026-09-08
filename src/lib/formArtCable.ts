/** Travel is cable payout through the pulley, not the handle's screen Y. */
export interface CableMachineLadder {
  routing: string;
  payoutPerStackRise: number;
  initialStackLiftMm: number;
  totalPlates: number;
  selectedPlates: number;
  states: { payoutMm: number; stackLiftMm: number }[];
}

export function validateCableLadder(ladder: CableMachineLadder): string[] {
  const errors: string[] = [];
  const nonnegative = (n: number) => Number.isFinite(n) && n >= 0;
  if (!ladder.routing?.trim()) errors.push("Cable routing must be described.");
  if (
    !Number.isFinite(ladder.payoutPerStackRise) ||
    ladder.payoutPerStackRise <= 0
  )
    errors.push("Pulley travel ratio must be positive.");
  if (!nonnegative(ladder.initialStackLiftMm))
    errors.push("Invalid initial stack gap.");
  if (
    !Number.isInteger(ladder.totalPlates) ||
    !Number.isInteger(ladder.selectedPlates) ||
    ladder.selectedPlates < 1 ||
    ladder.selectedPlates > ladder.totalPlates
  )
    errors.push("Keep a valid, fixed selected and total plate count.");
  if (!Array.isArray(ladder.states) || ladder.states.length !== 6)
    return [...errors, "Cable ladder requires exactly six states."];
  ladder.states.forEach((state, i) => {
    if (
      !state ||
      !nonnegative(state.payoutMm) ||
      !nonnegative(state.stackLiftMm)
    ) {
      errors.push(`Frame ${i + 1}: invalid cable travel or stack gap.`);
      return;
    }
    const expected =
      ladder.initialStackLiftMm + state.payoutMm / ladder.payoutPerStackRise;
    if (Math.abs(state.stackLiftMm - expected) > 0.5)
      errors.push(`Frame ${i + 1}: stack gap contradicts cable payout.`);
  });
  return errors;
}
