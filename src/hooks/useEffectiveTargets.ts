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
import { localDateString } from "@/lib/dateHelpers";
import { useAuth } from "@/lib/auth";
import { db } from "@/lib/firebase";
import { getAdjustedTargets } from "@/lib/phaseNutrition";
import { buildCaption, type DailyTargetsCaption } from "@/lib/captionBuilder";
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
 * reads from here. See CONTEXT.md → Nutrition for term definitions.
 *
 * Nutr1 (expenditure-inclusive): the daily CALORIE target is FLAT —
 * `finalTarget === baseTarget`. The stored TDEE already accounts for the
 * user's activity, so completed exercise is NEVER added back (no eat-back).
 * Day-type fuelling lives entirely in the macro split (net-neutral fat→carb
 * periodization in phaseNutrition), driven by the PLANNED day type.
 *
 * `actualBurn` / `actualLiftBurn` / `actualRunBurn` are still computed from
 * completed activity, but PURELY for informational display (the Today's
 * Energy "burned X" tiles and the Food drill-down). They do not move the
 * target.
 */
export interface EffectiveTargets {
  /** Stored profile target (TDEE + phase modifier, or custom override). */
  baseTarget: number;
  /** Planned day type derived from the user's weekly schedule. */
  dayType: DayType;
  /** True iff the planned dayType is `run` or `both`. */
  isRunDay: boolean;
  /** Total burned calories from completed activity — DISPLAY ONLY. */
  actualBurn: number;
  /** Lift burn alone — DISPLAY ONLY (informational tiles). */
  actualLiftBurn: number;
  /** Run burn alone — DISPLAY ONLY (informational tiles). */
  actualRunBurn: number;
  /** True if any workout or run is completed for the date. */
  hasCompletedActivity: boolean;
  /** finalTarget === baseTarget (flat — no eat-back, no calorie bonus). */
  finalTarget: number;
  /** Macro targets for the planned day type (net-neutral carb periodization). */
  protein: number;
  carbs: number;
  fat: number;
  /** Human-readable annotation (e.g. "Run day — extra carbs for fuel"). */
  annotation: string;
  /** Structured caption for the Food hero card. Null on rest days. */
  caption: DailyTargetsCaption | null;
}

// ── Subscription window ──────────────────────────────────────────────────
// 30-day rolling window, limit 60 docs. Handles even high-volume users.
// Viewing a date older than 30 days falls back to actualBurn=0 (display only).
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
 * Compose the (flat-calorie) daily target for `date` from the planned day
 * type. Private to this module.
 *
 * Null-profile fallback returns the canonical "logged out / pre-onboarding"
 * defaults so consumers can render something coherent without branching.
 */
function computePlannedTargets(
  profile: UserProfile | null,
  date: Date
): PlannedTargets {
  const schedule =
    profile?.weekSchedule && profile.weekSchedule.length === 7
      ? profile.weekSchedule
      : generateSchedule(
          profile?.weeklyWorkoutsTarget || 3,
          getWeeklyRunTarget(profile) || 2
        );

  const dayType = getDayTypeForDate(date, schedule);
  const isRunDay = dayType === "run" || dayType === "both";
  const baseTarget = profile?.targetCalories || 2200;

  if (!profile) {
    return {
      baseTarget,
      dayType,
      isRunDay,
      protein: 160,
      carbs: 250,
      fat: 60,
      annotation: "",
      caption: buildCaption(dayType, 0),
      finalTarget: baseTarget,
    };
  }

  const adjusted = getAdjustedTargets(profile, dayType);

  return {
    baseTarget,
    dayType,
    isRunDay,
    protein: adjusted.protein,
    carbs: adjusted.carbs,
    fat: adjusted.fat,
    annotation: adjusted.annotation,
    // Nutr1: no calorie bonus to surface — the caption is just the day label.
    caption: buildCaption(dayType, 0),
    // Flat calories. adjusted.calories === baseTarget by construction; we use
    // baseTarget directly so the no-eat-back invariant is explicit.
    finalTarget: baseTarget,
  };
}

export function useEffectiveTargets(date?: Date): EffectiveTargets {
  const { user, profile } = useAuth();

  const [workouts, setWorkouts] = useState<WorkoutRow[]>([]);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [workoutsLoaded, setWorkoutsLoaded] = useState(false);
  const [runsLoaded, setRunsLoaded] = useState(false);

  // ── Subscribe to windowed workouts + runs (for informational burn) ──────
  // Nutr1: burn no longer drives the target, but the Today's Energy tiles and
  // Food drill-down still display it, so the windowed subscriptions remain.
  useEffect(() => {
    if (!user) {
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
    const windowStartString = localDateString(windowStart);
    const windowStartTs = Timestamp.fromDate(windowStart);

    const workoutsRef = collection(db, "users", user.uid, "workouts");
    const workoutsQ = query(
      workoutsRef,
      where("date", ">=", windowStartString),
      orderBy("date", "desc"),
      limit(DOC_LIMIT)
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
      limit(DOC_LIMIT)
    );
    const unsubRuns = onSnapshot(runsQ, (snap) => {
      // Drop non-countable runs (saved-anyway "too-fast" misclicks) so a bad
      // GPS reading can't inflate the informational burn tiles.
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
          const ts =
            raw.completedAt instanceof Timestamp ? raw.completedAt : null;
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
  }, [user]);

  // ── Derive effective targets ──────────────────────────────────────────
  return useMemo<EffectiveTargets>(() => {
    const targetDate = date || new Date();
    const planned = computePlannedTargets(profile, targetDate);

    // Burn is DISPLAY ONLY (Nutr1) — it never feeds finalTarget. Compute it
    // once the windowed subscriptions have loaded; show zeros until then.
    let actualLiftBurn = 0;
    let actualRunBurn = 0;
    if (profile && workoutsLoaded && runsLoaded) {
      const targetKey = localDateString(targetDate);
      actualLiftBurn = workouts
        .filter((w) => isWorkoutOnDate(w, targetDate))
        .reduce((sum, w) => sum + w.totalCalories, 0);
      actualRunBurn = runs.reduce((sum, r) => {
        if (!r.completedAt) return sum;
        try {
          const runKey = localDateString(r.completedAt.toDate());
          return runKey === targetKey ? sum + r.calories : sum;
        } catch {
          return sum;
        }
      }, 0);
    }
    const actualBurn = actualLiftBurn + actualRunBurn;

    return {
      baseTarget: planned.baseTarget,
      dayType: planned.dayType,
      isRunDay: planned.isRunDay,
      actualBurn,
      actualLiftBurn,
      actualRunBurn,
      hasCompletedActivity: actualBurn > 0,
      finalTarget: planned.finalTarget, // === baseTarget
      protein: planned.protein,
      carbs: planned.carbs,
      fat: planned.fat,
      annotation: planned.annotation,
      caption: planned.caption,
    };
  }, [profile, workoutsLoaded, runsLoaded, workouts, runs, date]);
}
