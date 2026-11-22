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

/**
 * A day's bar: the food orange when the day went the goal's way, the
 * muted grey when it did not. Above or below the line already says
 * deficit or surplus. It was success green against the error red (or the
 * warning amber when bulking): green beside the fat bar was 7 apart in
 * normal vision, and neither is an error or a success (DS10 call 4).
 */
export function getBalanceColor(
  balance: number,
  goal: string | undefined
): string {
  const isDeficit = balance >= 0;
  const towardGoal = goal === "lean bulk" ? !isDeficit : isDeficit;
  return towardGoal ? THEME.semantic.nutrition : THEME.chrome.grey;
}
