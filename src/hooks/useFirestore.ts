import type { Timestamp } from "firebase/firestore";

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
} from "@/hooks/DailyLogsProvider";
