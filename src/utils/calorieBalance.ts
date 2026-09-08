import { THEME } from "@/lib/theme";

export interface DayBalance {
  date: string;
  day: string;
  consumed: number;
  burned: number;
  balance: number;
}

/**
 * Daily energy balance. `expenditure` is the user's MAINTENANCE TDEE
 * (BMR × activity multiplier) — expenditure-inclusive per the Nutr1 model, so
 * logged exercise is NOT added on top (the multiplier already accounts for it;
 * adding it again double-counts and, with a bare-BMR baseline, understated
 * expenditure by ~20-40% — showing a "surplus" to someone eating at
 * maintenance, NUTR-H1). Positive balance = deficit (burned more than eaten).
 */
export function calcDayBalance(
  date: string,
  day: string,
  consumed: number,
  expenditure: number
): DayBalance {
  return {
    date,
    day,
    consumed,
    burned: expenditure,
    balance: expenditure - consumed,
  };
}

export function getBalanceColor(
  balance: number,
  goal: string | undefined
): string {
  const isDeficit = balance >= 0;

  if (goal === "lean bulk") {
    return isDeficit ? THEME.warning : THEME.success;
  }
  // cut, recomp, or default
  return isDeficit ? THEME.success : THEME.danger;
}
