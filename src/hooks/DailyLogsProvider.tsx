import {
  createContext,
  use,
  useEffect,
  useMemo,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import {
  collection,
  query,
  orderBy,
  limit,
  onSnapshot,
  Timestamp,
} from "firebase/firestore";
import { startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";
import { localDateString } from "@/lib/dateHelpers";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import { safeMerge } from "@/lib/offlineQueue";
import { parseDailyLog } from "@/lib/firestoreGuards";
import { logger } from "@/lib/logger";
export interface DailyLog {
  id: string;
  date: string; // YYYY-MM-DD
  workouts: number;
  meals: number;
  hasPR: boolean;
  weightKg?: number;
  notes: string;
  createdAt: Timestamp;
}

/**
 * Single authoritative subscription on `users/{uid}/logs`, last 90 days
 * by date desc. All the dashboard surfaces that used to subscribe to
 * this collection independently (useDailyLogs, useWeeklyStats,
 * useMonthlyStats, useWeeklyDayMap) now read from this provider — four
 * live listeners collapse to one.
 *
 * The 90-day window is a superset: the widest consumer (useDailyLogs)
 * wanted exactly that, and the narrower consumers (current week, current
 * month) sit strictly inside it. Weekly and monthly aggregates are
 * derived from the same in-memory array via useMemo so adding more
 * dashboard slices later costs nothing extra on the network path.
 */

interface WeeklyStats {
  workoutsDone: number;
  workoutsTarget: number;
  mealsDone: number;
  mealsTarget: number;
  hasPR: boolean;
}

interface WeeklyDayEntry {
  workouts: number;
  meals: number;
  caloriesHit: boolean;
}

interface DailyLogsValue {
  logs: DailyLog[];
  loading: boolean;
  saveLog: (log: Omit<DailyLog, "id" | "createdAt">) => Promise<void>;
  weeklyStats: WeeklyStats;
  monthlyStats: WeeklyStats;
  weeklyDayMap: Map<string, WeeklyDayEntry>;
}

const DailyLogsContext = createContext<DailyLogsValue | null>(null);

export function DailyLogsProvider({ children }: { children: ReactNode }) {
  const { user, profile } = useAuth();
  const [logs, setLogs] = useState<DailyLog[]>([]);
  const [loading, setLoading] = useState(true);

  // Single subscription. Mirrors the original useDailyLogs window (90
  // docs, date desc) exactly so the migrated hook shape is identical.
  useEffect(() => {
    if (!user) {
      const reset = () => {
        setLogs([]);
        setLoading(false);
      };
      reset();
      return;
    }

    const logsRef = collection(db, "users", user.uid, "logs");
    const q = query(logsRef, orderBy("date", "desc"), limit(90));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map((d) =>
          parseDailyLog(d.id, d.data())
        ) as DailyLog[];
        setLogs(data);
        setLoading(false);
      },
      (error) => {
        logger.error("[DailyLogsProvider] subscribe failed:", error);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [user]);

  const saveLog = useCallback(
    async (log: Omit<DailyLog, "id" | "createdAt">) => {
      if (!user) return;
      await safeMerge(db, user.uid, `users/${user.uid}/logs`, log.date, {
        ...log,
        createdAt: Timestamp.now(),
      });
    },
    [user]
  );

  // Derived slices — all memo'd on `logs` + profile targets. Re-derivation
  // only fires when the underlying snapshot or targets change.

  const weeklyStats = useMemo<WeeklyStats>(() => {
    const now = new Date();
    const start = localDateString(startOfWeek(now, { weekStartsOn: 1 }));
    const end = localDateString(endOfWeek(now, { weekStartsOn: 1 }));
    let workouts = 0;
    let meals = 0;
    let pr = false;
    for (const l of logs) {
      if (l.date < start || l.date > end) continue;
      workouts += l.workouts || 0;
      meals += l.meals || 0;
      if (l.hasPR) pr = true;
    }
    return {
      workoutsDone: workouts,
      workoutsTarget: profile?.weeklyWorkoutsTarget || 4,
      mealsDone: meals,
      mealsTarget: profile?.weeklyMealsTarget || 10,
      hasPR: pr,
    };
  }, [logs, profile?.weeklyWorkoutsTarget, profile?.weeklyMealsTarget]);

  const monthlyStats = useMemo<WeeklyStats>(() => {
    const now = new Date();
    const start = localDateString(startOfMonth(now));
    const end = localDateString(endOfMonth(now));
    let workouts = 0;
    let meals = 0;
    let pr = false;
    for (const l of logs) {
      if (l.date < start || l.date > end) continue;
      workouts += l.workouts || 0;
      meals += l.meals || 0;
      if (l.hasPR) pr = true;
    }
    return {
      workoutsDone: workouts,
      workoutsTarget: (profile?.weeklyWorkoutsTarget || 4) * 4,
      mealsDone: meals,
      mealsTarget: (profile?.weeklyMealsTarget || 10) * 4,
      hasPR: pr,
    };
  }, [logs, profile?.weeklyWorkoutsTarget, profile?.weeklyMealsTarget]);

  const weeklyDayMap = useMemo(() => {
    const now = new Date();
    const start = localDateString(startOfWeek(now, { weekStartsOn: 1 }));
    const end = localDateString(endOfWeek(now, { weekStartsOn: 1 }));
    const map = new Map<string, WeeklyDayEntry>();
    for (const l of logs) {
      if (l.date < start || l.date > end) continue;
      map.set(l.date, {
        workouts: l.workouts || 0,
        meals: l.meals || 0,
        caloriesHit: false, // field not stored on DailyLog; preserved for
        // shape compatibility with the legacy useWeeklyDayMap hook, which
        // also always returned false here.
      });
    }
    return map;
  }, [logs]);

  const value: DailyLogsValue = {
    logs,
    loading,
    saveLog,
    weeklyStats,
    monthlyStats,
    weeklyDayMap,
  };

  return (
    <DailyLogsContext.Provider value={value}>
      {children}
    </DailyLogsContext.Provider>
  );
}

function useDailyLogsContext(): DailyLogsValue {
  const ctx = use(DailyLogsContext);
  if (!ctx) {
    throw new Error(
      "useDailyLogs/useWeeklyStats/useMonthlyStats/useWeeklyDayMap must be used inside <DailyLogsProvider>"
    );
  }
  return ctx;
}

/* ────────── Public consumer hooks ──────────
   Re-export the old hook names as thin context readers so every existing
   call site (`const { logs, saveLog } = useDailyLogs()`, etc.) keeps
   working with zero churn. */

// eslint-disable-next-line react-refresh/only-export-components
export function useDailyLogs() {
  const { logs, loading, saveLog } = useDailyLogsContext();
  return { logs, loading, saveLog };
}

// eslint-disable-next-line react-refresh/only-export-components
export function useWeeklyStats(): WeeklyStats {
  return useDailyLogsContext().weeklyStats;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useMonthlyStats(): WeeklyStats {
  return useDailyLogsContext().monthlyStats;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useWeeklyDayMap(): Map<string, WeeklyDayEntry> {
  return useDailyLogsContext().weeklyDayMap;
}
