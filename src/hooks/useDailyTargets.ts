import { useMemo } from "react";
import { useAuth } from "@/lib/auth";
import { generateSchedule, type ScheduleDay } from "@/lib/scheduleUtils";
import { getAdjustedTargets, getDayAdjustment } from "@/lib/phaseNutrition";
import { buildCaption, type DailyTargetsCaption } from "@/lib/captionBuilder";
import type { DayType } from "@/lib/types";

// Re-export for backwards compatibility — existing consumers import
// DailyTargetsCaption from this module.
export type { DailyTargetsCaption };

export interface DailyTargets {
  /** Stored profile target (TDEE + phase modifier, or custom override) */
  baseTarget: number;
  /** Day-type calorie adjustment (e.g. +200 for run day) */
  activityBonus: number;
  /** Whether the given date is a run day */
  isRunDay: boolean;
  /** Day type from schedule */
  dayType: DayType;
  /** Final calorie target: baseTarget + activityBonus */
  finalTarget: number;
  /** Macro targets adjusted for the day */
  protein: number;
  carbs: number;
  fat: number;
  /** Human-readable annotation (e.g. "Run day — +200 cal for fuel") */
  annotation: string;
  /** Structured caption for the Food hero card. Null on rest days. */
  caption: DailyTargetsCaption | null;
}

/**
 * Get the schedule day type for a specific date.
 * Uses the weekly schedule from profile, or generates one from targets.
 */
function getDayTypeForDate(
  date: Date,
  schedule: ScheduleDay[],
): DayType {
  const dayOfWeek = date.getDay(); // 0=Sun, 6=Sat
  const entry = schedule.find((s) => s.day === dayOfWeek);
  return (entry?.type || "rest") as DayType;
}

/**
 * Single source of truth for daily calorie and macro targets.
 *
 * Reads profile targets from auth context (reactive via onAuthStateChanged).
 * Applies day-type adjustments from phaseNutrition for the given date.
 * Every screen must use this hook instead of computing its own values.
 *
 * @param date - The date to compute targets for. Defaults to today.
 */
export function useDailyTargets(date?: Date): DailyTargets {
  const { profile } = useAuth();

  return useMemo(() => {
    const targetDate = date || new Date();

    // Build weekly schedule
    const schedule =
      profile?.weekSchedule && profile.weekSchedule.length === 7
        ? profile.weekSchedule
        : generateSchedule(
            profile?.weeklyWorkoutsTarget || 3,
            profile?.weeklyRunsTarget || 2,
          );

    const dayType = getDayTypeForDate(targetDate, schedule);
    const isRunDay = dayType === "run" || dayType === "both";

    // Base targets from profile (set by Settings/onboarding via calculateTDEE)
    const baseTarget = profile?.targetCalories || 2200;

    // Day-type adjustments
    if (!profile) {
      return {
        baseTarget,
        activityBonus: 0,
        isRunDay,
        dayType,
        finalTarget: baseTarget,
        protein: 160,
        carbs: 250,
        fat: 60,
        annotation: "",
        caption: buildCaption(dayType, 0),
      };
    }

    const adjusted = getAdjustedTargets(profile, dayType);
    const phase = profile.program?.currentPhase || "base";
    const goal = profile.program?.goal;
    const adj = getDayAdjustment(dayType, phase, goal);

    return {
      baseTarget,
      activityBonus: adj.calorieAdjustment,
      isRunDay,
      dayType,
      finalTarget: adjusted.calories,
      protein: adjusted.protein,
      carbs: adjusted.carbs,
      fat: adjusted.fat,
      annotation: adjusted.annotation,
      caption: buildCaption(dayType, adj.calorieAdjustment),
    };
  }, [profile, date]);
}
