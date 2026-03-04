import { format, startOfWeek, addDays } from "date-fns";

/**
 * Calculate rollover calories based on weekly budget.
 * Unused calories from previous days carry forward (only positive, no debt).
 */
export function calculateRollover(
  targetDailyCalories: number,
  dailyCalories: Record<string, number> // date string → consumed calories
): {
  adjustedTarget: number;
  rolloverAmount: number;
  weeklyBudget: number;
  weeklyConsumed: number;
  weeklyRemaining: number;
} {
  const today = new Date();
  const weekStart = startOfWeek(today, { weekStartsOn: 1 }); // Monday start
  const todayStr = format(today, "yyyy-MM-dd");

  const weeklyBudget = targetDailyCalories * 7;

  // Calculate consumed Mon-yesterday
  let weeklyConsumed = 0;
  let daysElapsed = 0;

  for (let i = 0; i < 7; i++) {
    const d = format(addDays(weekStart, i), "yyyy-MM-dd");
    if (d === todayStr) break;
    daysElapsed++;
    weeklyConsumed += dailyCalories[d] || 0;
  }

  // Add today's consumption
  weeklyConsumed += dailyCalories[todayStr] || 0;

  // Expected consumption through yesterday
  const expectedThroughYesterday = targetDailyCalories * daysElapsed;

  // Rollover = expected - actual (positive only)
  const rolloverAmount = Math.max(0, expectedThroughYesterday - (weeklyConsumed - (dailyCalories[todayStr] || 0)));

  const adjustedTarget = targetDailyCalories + rolloverAmount;
  const weeklyRemaining = weeklyBudget - weeklyConsumed;

  return {
    adjustedTarget,
    rolloverAmount: Math.round(rolloverAmount),
    weeklyBudget,
    weeklyConsumed: Math.round(weeklyConsumed),
    weeklyRemaining: Math.round(weeklyRemaining),
  };
}
