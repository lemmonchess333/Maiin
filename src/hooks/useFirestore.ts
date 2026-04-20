import { useState, useEffect } from "react";
import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { format, subDays } from "date-fns";

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

// useDailyLogs, useWeeklyStats, useMonthlyStats, useWeeklyDayMap used to
// live here — each owning its own `onSnapshot(users/{uid}/logs, ...)`.
// They collapsed into a single subscription behind <DailyLogsProvider>;
// re-exporting from this barrel keeps every existing call site
// (`import { ... } from "@/hooks/useFirestore"`) working untouched.
export {
  useDailyLogs,
  useWeeklyStats,
  useMonthlyStats,
  useWeeklyDayMap,
  useRolling7DayMap,
} from "@/hooks/DailyLogsProvider";

/**
 * One-shot read of the last `days` of daily logs for the History page.
 * Not hoisted into the provider because it's a point-in-time getDocs
 * fetch, not a live subscription — it doesn't contribute to the ambient
 * listener count that motivated the consolidation.
 */
export function useHistoryData(days: number = 30) {
  const { user } = useAuth();
  const [data, setData] = useState<DailyLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      const reset = () => { setData([]); setLoading(false); };
      reset();
      return;
    }

    const startDate = format(subDays(new Date(), days), "yyyy-MM-dd");
    const logsRef = collection(db, "users", user.uid, "logs");
    const q = query(logsRef, where("date", ">=", startDate), orderBy("date", "asc"));

    getDocs(q)
      .then((snapshot) => {
        const result = snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        })) as DailyLog[];
        setData(result);
        setLoading(false);
      })
      .catch((error) => {
        logger.error("useHistoryData error:", error);
        setLoading(false);
      });
  }, [user, days]);

  return { data, loading };
}
