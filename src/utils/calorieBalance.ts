import { THEME } from "@/lib/theme";

export function estimateBMR(
  weightKg: number,
  heightCm: number,
  age: number,
  sex: "male" | "female"
): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return Math.round(sex === "male" ? base + 5 : base - 161);
}

export interface DayBalance {
  date: string;
  day: string;
  consumed: number;
  burned: number;
  balance: number;
}

export function calcDayBalance(
  date: string,
  day: string,
  consumed: number,
  bmr: number,
  activityBurn: number
): DayBalance {
  const burned = bmr + activityBurn;
  return {
    date,
    day,
    consumed,
    burned,
    balance: burned - consumed,
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
