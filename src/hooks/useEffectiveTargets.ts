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
import { getAdjustedTargets } from "@/lib/phaseNutrition";
import { buildCaption, type DailyTargetsCaption } from "@/lib/captionBuilder";
import { computeEffectiveBonus } from "@/lib/effectiveTargets";
import { isWorkoutOnDate } from "@/lib/workoutDate";
import {
  useDailyTargets,
  type DailyTargets,
} from "@/hooks/useDailyTargets";
import type { DayType } from "@/lib/types";

/**
 * Training-aware calorie target.
 *
 * effectiveBonus = max(strategicBonus, actualBurn)
 *
 * STRATEGIC BONUS: the program's prescribed adjustment for the EFFECTIVE day
 * type (derived from completed activity, not from the schedule). Strength
 * phase lift day = +400 (a deliberate hypertrophy over-feed, not a burn
 * estimate), etc.
 *
 * ACTUAL BURN: sum of `totalCalories` from workouts and `calories` from runs
 * on the given date.
 *
 * MAX (not add, not replace) preserves strategic over-feeds when actual burn
 * is smaller, rewards over-performance when actual burn exceeds strategy, and
 * never under-fuels.
 */
export interface EffectiveTargets
  extends Omit<DailyTargets, "finalTarget" | "caption" | "activityBonus"> {
  /** effectiveBonus = max(strategicBonus, actualBurn) */
  effectiveBonus: number;
  /** Total burned calories from completed activity on the date */
  actualBurn: number;
  /** Lift burn alone — exposed for downstream toast source detection */
  actualLiftBurn: number;
  /** Run burn alone — exposed for downstream toast source detection */
  actualRunBurn: number;
  /** Strategic bonus computed for the EFFECTIVE day type */
  strategicBonus: number;
  /** True if any workout or run is completed for the date */
  hasCompletedActivity: boolean;
  /** Day type after applying actual activity (may differ from planned) */
  effectiveDayType: DayType;
  /** finalTarget = baseTarget + effectiveBonus */
  finalTarget: number;
  /** Caption reflecting the effective state */
  caption: DailyTargetsCaption | null;
}

// ── Subscription window ──────────────────────────────────────────────────
// 30-day rolling window, limit 60 docs. Handles even high-volume users.
// Viewing a date older than 30 days falls back to actualBurn=0 — the
// strategic bonus still applies via useDailyTargets.
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

export function useEffectiveTargets(date?: Date): EffectiveTargets {
  const planned = useDailyTargets(date);
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
      const rows: RunRow[] = snap.docs.map((d) => {
        const raw = d.data() as { completedAt?: unknown; calories?: unknown };
        const ts = raw.completedAt instanceof Timestamp ? raw.completedAt : null;
        return {
          completedAt: ts,
          calories: typeof raw.calories === "number" ? raw.calories : 0,
        };
      });
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
    // Passthrough when disabled or while still loading — return planned
    // values in the EffectiveTargets shape so consumers don't need branching.
    if (!enabled || !profile || !workoutsLoaded || !runsLoaded) {
      return {
        baseTarget: planned.baseTarget,
        isRunDay: planned.isRunDay,
        dayType: planned.dayType,
        protein: planned.protein,
        carbs: planned.carbs,
        fat: planned.fat,
        annotation: planned.annotation,
        strategicBonus: planned.activityBonus,
        actualBurn: 0,
        actualLiftBurn: 0,
        actualRunBurn: 0,
        hasCompletedActivity: false,
        effectiveDayType: planned.dayType,
        effectiveBonus: planned.activityBonus,
        finalTarget: planned.finalTarget,
        caption: planned.caption,
      };
    }

    const targetDate = date || new Date();
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
      isRunDay: effectiveDayType === "run" || effectiveDayType === "both",
      dayType: planned.dayType, // planned dayType preserved for consumers
      protein: adjusted.protein,
      carbs: adjusted.carbs,
      fat: adjusted.fat,
      annotation: adjusted.annotation,
      strategicBonus,
      actualBurn,
      actualLiftBurn,
      actualRunBurn,
      hasCompletedActivity,
      effectiveDayType,
      effectiveBonus,
      finalTarget,
      caption: buildCaption(effectiveDayType, effectiveBonus),
    };
  }, [enabled, profile, workoutsLoaded, runsLoaded, workouts, runs, date, planned]);
}
