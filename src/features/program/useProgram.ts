import { useMemo } from "react";
import { generateWeek, adjustForPerformance } from "./programEngine";
import { WeeklyPrescription } from "./programTypes";

export function useProgram({
  currentWeek,
  primaryTrend,
  fatigueScore,
}: {
  currentWeek: number;
  primaryTrend: number;
  fatigueScore: number;
}): WeeklyPrescription {

  return useMemo(() => {
    const base = generateWeek(currentWeek);
    return adjustForPerformance(base, primaryTrend, fatigueScore);
  }, [currentWeek, primaryTrend, fatigueScore]);
}