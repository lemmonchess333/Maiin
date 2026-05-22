import { useEffect, useMemo, useState } from "react";
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  where,
} from "firebase/firestore";
import { format } from "date-fns";
import { useAuth } from "@/lib/auth";
import { db } from "@/lib/firebase";
import {
  getAdjustedTargets,
  getDayAdjustment,
} from "@/lib/phaseNutrition";
import {
  buildCaption,
  type DailyTargetsCaption,
} from "@/lib/captionBuilder";
import { computeEffectiveBonus } from "@/lib/effectiveTargets";
import { isWorkoutOnDate } from "@/lib/workoutDate";
import { isVolumeEligible } from "@/lib/runStatsEligibility";
import {
  generateSchedule,
  getWeeklyRunTarget,
  type ScheduleDay,
} from "@/lib/scheduleUtils";
import type { UserProfile } from "@/lib/auth";
import type { DayType } from "@/lib/types";

// Re-export so existing consumers can continue importing
// DailyTargetsCaption from this module.
export type { DailyTargetsCaption };

/**
 * Training-aware daily nutrition target.
 *
 * Single source of truth for "what is today's calorie + macro target."
 * Every surface (Home, Food, FoodHeroCard, TodayEnergy, HeroDrillDownSheet)
 * reads from here. See CONTEXT.md → Nutrition for term definitions
 * (baseTarget / strategicBonus / actualBurn / effectiveBonus / etc.).
 *
 * effectiveBonus = max(strategicBonus, actualBurn) — preserves strategic
 * over-feeds when actual burn is smaller, rewards over-performance, never
 * under-fuels. The user's `profile.adjustCaloriesForTraining = false`
 * toggle short-circuits this to `strategicBonus` only and skips the
 * Firestore subscriptions entirely.
 */
export interface EffectiveTargets {
  /** Stored profile target (TDEE + phase modifier, or custom override). */
  baseTarget: number;
  /** Planned day type derived from the user's weekly schedule. */
  dayType: DayType;
  /** True iff the planned dayType is `run` or `both`. */
  isRunDay: boolean;
  /** Strategic bonus for the EFFECTIVE day type (not the planned one). */
  strategicBonus: number;
  /** Total burned calories from completed activity on the date. */
  actualBurn: number;
  /** Lift burn alone — exposed for downstream toast source detection. */
  actualLiftBurn: number;
  /** Run burn alone — exposed for downstream toast source detection. */
  actualRunBurn: number;
  /** True if any workout or run is completed for the date. */
  hasCompletedActivity: boolean;
  /** Day type after applying actual activity (may differ from planned). */
  effectiveDayType: DayType;
  /** max(strategicBonus, actualBurn). */
  effectiveBonus: number;
  /** finalTarget = baseTarget + effectiveBonus. */
  finalTarget: number;
  /** Macro targets adjusted for the EFFECTIVE day type. */
  protein: number;
  carbs: number;
  fat: number;
  /** Human-readable annotation (e.g. "Run day — +200 cal for fuel"). */
  annotation: string;
  /** Structured caption for the Food hero card. Null on rest days. */
  caption: DailyTargetsCaption | null;
}

// ── Subscription window ──────────────────────────────────────────────────
// 30-day rolling window, limit 60 docs. Handles even high-volume users.
// Viewing a date older than 30 days falls back to actualBurn=0 — the
// strategic bonus still applies.
const WINDOW_DAYS = 30;
const DOC_LIMIT = 60;

interface WorkoutRow {
  date: string;
  totalCalories: number;
}

interface RunRow {
  completedAt: Timestamp | null;
  calories: number;
}

interface PlannedTargets {
  baseTarget: number;
  dayType: DayType;
  isRunDay: boolean;
  strategicBonus: number;
  protein: number;
  carbs: number;
  fat: number;
  annotation: string;
  caption: DailyTargetsCaption | null;
  finalTarget: number;
}

/**
 * Resolve the planned day type for a date from the user's weekly schedule.
 */
function getDayTypeForDate(date: Date, schedule: ScheduleDay[]): DayType {
  const dayOfWeek = date.getDay(); // 0=Sun, 6=Sat
  const entry = schedule.find((s) => s.day === dayOfWeek);
  return (entry?.type || "rest") as DayType;
}

/**
 * Compose the planned (pre-activity) daily target for `date`.
 *
 * Private to this module — exposed only through `useEffectiveTargets`,
 * which layers the actual-burn max() rule on top. Kept as a free function
 * (rather than a separate hook or pure module) because it has exactly one
 * caller (the useMemo below) and extracting it further would create a
 * shallow seam without earning leverage.
 *
 * Null-profile fallback returns the canonical "logged out / pre-onboarding"
 * defaults so consumers can render something coherent without branching.
 */
function computePlannedTargets(
  profile: UserProfile | null,
  date: Date,
): PlannedTargets {
  const schedule =
    profile?.weekSchedule && profile.weekSchedule.length === 7
      ? profile.weekSchedule
      : generateSchedule(
          profile?.weeklyWorkoutsTarget || 3,
          getWeeklyRunTarget(profile) || 2,
        );

  const dayType = getDayTypeForDate(date, schedule);
  const isRunDay = dayType === "run" || dayType === "both";
  const baseTarget = profile?.targetCalories || 2200;

  if (!profile) {
    return {
      baseTarget,
      dayType,
      isRunDay,
      strategicBonus: 0,
      protein: 160,
      carbs: 250,
      fat: 60,
      annotation: "",
      caption: buildCaption(dayType, 0),
      finalTarget: baseTarget,
    };
  }

  const adjusted = getAdjustedTargets(profile, dayType);
  const phase = profile.program?.currentPhase || "base";
  const goal = profile.program?.goal;
  const adj = getDayAdjustment(dayType, phase, goal);

  return {
    baseTarget,
    dayType,
    isRunDay,
    strategicBonus: adj.calorieAdjustment,
    protein: adjusted.protein,
    carbs: adjusted.carbs,
    fat: adjusted.fat,
    annotation: adjusted.annotation,
    caption: buildCaption(dayType, adj.calorieAdjustment),
    finalTarget: adjusted.calories,
  };
}

export function useEffectiveTargets(date?: Date): EffectiveTargets {
  const { user, profile } = useAuth();

  // Undefined treated as true for existing users without the field.
  const enabled = profile?.adjustCaloriesForTraining !== false;

  const [workouts, setWorkouts] = useState<WorkoutRow[]>([]);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [workoutsLoaded, setWorkoutsLoaded] = useState(false);
  const [runsLoaded, setRunsLoaded] = useState(false);

  // ── Subscribe to windowed workouts + runs (only when enabled) ──────────
  useEffect(() => {
    if (!user || !enabled) {
      /* eslint-disable react-hooks/set-state-in-effect */
      setWorkouts([]);
      setRuns([]);
      setWorkoutsLoaded(false);
      setRunsLoaded(false);
      /* eslint-enable react-hooks/set-state-in-effect */
      return;
    }

    const windowStart = new Date();
    windowStart.setDate(windowStart.getDate() - WINDOW_DAYS);
    const windowStartString = format(windowStart, "yyyy-MM-dd");
    const windowStartTs = Timestamp.fromDate(windowStart);

    const workoutsRef = collection(db, "users", user.uid, "workouts");
    const workoutsQ = query(
      workoutsRef,
      where("date", ">=", windowStartString),
      orderBy("date", "desc"),
      limit(DOC_LIMIT),
    );
    const unsubWorkouts = onSnapshot(workoutsQ, (snap) => {
      const rows: WorkoutRow[] = snap.docs
        .map((d) => d.data() as { date?: unknown; totalCalories?: unknown })
        .filter((d) => typeof d.date === "string")
        .map((d) => ({
          date: d.date as string,
          totalCalories:
            typeof d.totalCalories === "number" ? d.totalCalories : 0,
        }));
      setWorkouts(rows);
      setWorkoutsLoaded(true);
    });

    const runsRef = collection(db, "users", user.uid, "runs");
    const runsQ = query(
      runsRef,
      where("completedAt", ">=", windowStartTs),
      orderBy("completedAt", "desc"),
      limit(DOC_LIMIT),
    );
    const unsubRuns = onSnapshot(runsQ, (snap) => {
      // P0.5: drop non-countable runs at the snapshot stage so the
      // downstream `actualRunBurn` reduce can stay simple. A
      // saved-anyway "too-fast" 20km / 0:08 run with high calories
      // would otherwise lower the effective calorie target — telling
      // the user to eat less than they should based on a misclick.
      const rows: RunRow[] = snap.docs
        .map((d) => {
          const raw = d.data() as {
            completedAt?: unknown;
            calories?: unknown;
            isInvalid?: boolean;
            savedAnyway?: boolean;
            distance?: number;
            duration?: number;
          };
          if (!isVolumeEligible(raw)) return null;
          const ts = raw.completedAt instanceof Timestamp ? raw.completedAt : null;
          return {
            completedAt: ts,
            calories: typeof raw.calories === "number" ? raw.calories : 0,
          };
        })
        .filter((row): row is RunRow => row !== null);
      setRuns(rows);
      setRunsLoaded(true);
    });

    return () => {
      unsubWorkouts();
      unsubRuns();
    };
  }, [user, enabled]);

  // ── Derive effective targets ──────────────────────────────────────────
  return useMemo<EffectiveTargets>(() => {
    const targetDate = date || new Date();
    const planned = computePlannedTargets(profile, targetDate);

    // Passthrough when disabled or while still loading — return planned
    // values in the EffectiveTargets shape so consumers don't need branching.
    if (!enabled || !profile || !workoutsLoaded || !runsLoaded) {
      return {
        baseTarget: planned.baseTarget,
        dayType: planned.dayType,
        isRunDay: planned.isRunDay,
        strategicBonus: planned.strategicBonus,
        actualBurn: 0,
        actualLiftBurn: 0,
        actualRunBurn: 0,
        hasCompletedActivity: false,
        effectiveDayType: planned.dayType,
        effectiveBonus: planned.strategicBonus,
        finalTarget: planned.finalTarget,
        protein: planned.protein,
        carbs: planned.carbs,
        fat: planned.fat,
        annotation: planned.annotation,
        caption: planned.caption,
      };
    }

    const targetKey = format(targetDate, "yyyy-MM-dd");

    // Sum actual burn for this specific date. Date matching lives in the
    // shared isWorkoutOnDate helper so Home's workout-burn read (useHomeData)
    // uses the same rule.
    const actualLiftBurn = workouts
      .filter((w) => isWorkoutOnDate(w, targetDate))
      .reduce((sum, w) => sum + w.totalCalories, 0);

    const actualRunBurn = runs.reduce((sum, r) => {
      if (!r.completedAt) return sum;
      try {
        const runKey = format(r.completedAt.toDate(), "yyyy-MM-dd");
        return runKey === targetKey ? sum + r.calories : sum;
      } catch {
        return sum;
      }
    }, 0);

    // Delegate the "max of strategy and reality" rule to the pure helper
    // (see src/lib/effectiveTargets.ts — covered by 9-scenario unit tests).
    const phase = profile.program?.currentPhase || "base";
    const goal = profile.program?.goal;
    const {
      effectiveDayType,
      actualBurn,
      strategicBonus,
      effectiveBonus,
      hasCompletedActivity,
    } = computeEffectiveBonus({
      actualLiftBurn,
      actualRunBurn,
      plannedDayType: planned.dayType,
      phase,
      goal,
    });

    // Recompute macros for the effective day type. Note: protein is stable
    // across day types (depends on phase/goal, not dayType), so only carbs
    // actually change in practice.
    const adjusted = getAdjustedTargets(profile, effectiveDayType);

    const finalTarget = planned.baseTarget + effectiveBonus;

    return {
      baseTarget: planned.baseTarget,
      dayType: planned.dayType, // planned dayType preserved for consumers
      isRunDay: effectiveDayType === "run" || effectiveDayType === "both",
      strategicBonus,
      actualBurn,
      actualLiftBurn,
      actualRunBurn,
      hasCompletedActivity,
      effectiveDayType,
      effectiveBonus,
      finalTarget,
      protein: adjusted.protein,
      carbs: adjusted.carbs,
      fat: adjusted.fat,
      annotation: adjusted.annotation,
      caption: buildCaption(effectiveDayType, effectiveBonus),
    };
  }, [enabled, profile, workoutsLoaded, runsLoaded, workouts, runs, date]);
}
