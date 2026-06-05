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

/**
 * Reconcile fitness phase (profile.program.goal) with the user's
 * actual 14-day calorie balance trend. Surfaces the phase-vs-reality
 * relationship as an explicit alignment state instead of letting
 * the user read two contradictory raw facts ("Bulk" chip + deficit
 * body text) and synthesise the conflict themselves.
 *
 * Hist5c pin 5 (audit E1 fix) — locked phase × trend reconciliation
 * table. Balance convention: positive avgBalance = deficit (burning
 * more than eating), matching `calcDayBalance` above.
 *
 *   Bulk + Deficit  → at-odds (amber warning — undermining the bulk)
 *   Bulk + Surplus  → on-track
 *   Cut  + Surplus  → at-odds (amber warning — undermining the cut)
 *   Cut  + Deficit  → on-track
 *   Recomp (any)    → maintaining
 *   Maintain / none → null (no goal-aware framing)
 *
 * Near-maintenance is defined by `NEAR_MAINTENANCE_THRESHOLD` (±200
 * cal/day average), matching the existing recomp "near maintenance"
 * heuristic in CalorieBalanceChart.
 */
export const NEAR_MAINTENANCE_THRESHOLD = 200;

export type PhaseAlignmentState = "on-track" | "at-odds" | "maintaining";

export interface PhaseAlignment {
  state: PhaseAlignmentState;
  message: string;
}

export function getPhaseAlignment(
  goal: string | undefined,
  avgBalance: number
): PhaseAlignment | null {
  if (goal === "lean bulk") {
    if (avgBalance > NEAR_MAINTENANCE_THRESHOLD) {
      return {
        state: "at-odds",
        message: "At odds with your phase — eating below maintenance",
      };
    }
    if (avgBalance < -NEAR_MAINTENANCE_THRESHOLD) {
      return { state: "on-track", message: "On track — gaining as planned" };
    }
    return {
      state: "maintaining",
      message: "Holding — eating near maintenance",
    };
  }

  if (goal === "cut") {
    if (avgBalance < -NEAR_MAINTENANCE_THRESHOLD) {
      return {
        state: "at-odds",
        message: "At odds with your phase — eating above maintenance",
      };
    }
    if (avgBalance > NEAR_MAINTENANCE_THRESHOLD) {
      return { state: "on-track", message: "On track — losing as planned" };
    }
    return {
      state: "maintaining",
      message: "Holding — eating near maintenance",
    };
  }

  if (goal === "recomp") {
    return {
      state: "maintaining",
      message: "Holding — small fluctuations expected",
    };
  }

  /* Maintain goal or no goal selected — no phase-aware framing.
     The chart's own colour still tells the data story; we just
     don't editorialise about alignment with a goal that isn't set. */
  return null;
}
