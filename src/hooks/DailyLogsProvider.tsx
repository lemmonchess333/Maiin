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
  where,
  onSnapshot,
  Timestamp,
} from "firebase/firestore";
import { startOfWeek, endOfWeek } from "date-fns";
import { localDateString, parseLocalDate } from "@/lib/dateHelpers";
import { useLocalDateKey } from "@/hooks/useLocalDateKey";
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

// Each surface writes only the fields it owns; a meal-count correction must
// not reset training, PRs or notes already kept on the same date.
type DailyLogPatch = Pick<DailyLog, "date"> &
  Partial<Omit<DailyLog, "id" | "date" | "createdAt">>;

/**
 * Single authoritative subscription on `users/{uid}/logs`, by date desc,
 * from this week's Monday: the week is all its one slice reads.
 * useDailyLogs and useWeeklyDayMap read this provider, one live listener
 * for the two. The window moves with the local day.
 *
 * It reached back to the month's first day for a monthly count, and kept
 * a weekly count beside it with its own target (`weeklyWorkoutsTarget`,
 * 4 without one). Neither had a reader, and a week's sessions are
 * counted in one place, `src/lib/trainingWeek.ts` (App1 Q14): both went
 * on 13 November 2026.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function dailyLogsFrom(todayKey: string): string {
  return localDateString(
    startOfWeek(parseLocalDate(todayKey), { weekStartsOn: 1 })
  );
}

interface WeeklyDayEntry {
  workouts: number;
  meals: number;
  caloriesHit: boolean;
}

interface DailyLogsValue {
  logs: DailyLog[];
  loading: boolean;
  saveLog: (log: DailyLogPatch) => Promise<void>;
  weeklyDayMap: Map<string, WeeklyDayEntry>;
}

const DailyLogsContext = createContext<DailyLogsValue | null>(null);

export function DailyLogsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const todayKey = useLocalDateKey();
  const [logs, setLogs] = useState<DailyLog[]>([]);
  const [loading, setLoading] = useState(true);

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
    const q = query(
      logsRef,
      where("date", ">=", dailyLogsFrom(todayKey)),
      orderBy("date", "desc")
    );

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
  }, [user, todayKey]);

  const saveLog = useCallback(
    async (log: DailyLogPatch) => {
      if (!user) return;
      await safeMerge(db, user.uid, `users/${user.uid}/logs`, log.date, {
        ...log,
        createdAt: Timestamp.now(),
      });
    },
    [user]
  );

  // The week's slice, memo'd on `logs`.
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
      "useDailyLogs/useWeeklyDayMap must be used inside <DailyLogsProvider>"
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
export function useWeeklyDayMap(): Map<string, WeeklyDayEntry> {
  return useDailyLogsContext().weeklyDayMap;
}
