import { useState, useEffect, useCallback } from "react";
import {
  collection,
  doc,
  setDoc,
  query,
  where,
  orderBy,
  getDocs,
  onSnapshot,
  Timestamp,
} from "firebase/firestore";
import { db, isDemoMode } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import {
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  format,
  subDays,
} from "date-fns";

export interface DailyLog {
  id: string;
  date: string; // YYYY-MM-DD
  workouts: number;
  meals: number;
  hasPR: boolean;
  weightKg?: number;
  notes: string;
  createdAt: Timestamp | null;
}

// --- localStorage helpers for demo mode ---
const DEMO_LOGS_KEY = "adaptfit_demo_logs";

function loadDemoLogs(): DailyLog[] {
  try {
    const raw = localStorage.getItem(DEMO_LOGS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveDemoLogs(logs: DailyLog[]) {
  localStorage.setItem(DEMO_LOGS_KEY, JSON.stringify(logs));
}

// --- Hooks ---

export function useDailyLogs() {
  const { user } = useAuth();
  const [logs, setLogs] = useState<DailyLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setLogs([]);
      setLoading(false);
      return;
    }

    if (isDemoMode) {
      setLogs(loadDemoLogs().sort((a, b) => b.date.localeCompare(a.date)));
      setLoading(false);
      return;
    }

    const logsRef = collection(db!, "users", user.uid, "logs");
    const q = query(logsRef, orderBy("date", "desc"));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })) as DailyLog[];
      setLogs(data);
      setLoading(false);
    });

    return unsubscribe;
  }, [user]);

  const saveLog = useCallback(
    async (log: Omit<DailyLog, "id" | "createdAt">) => {
      if (!user) return;

      if (isDemoMode) {
        const existing = loadDemoLogs();
        const idx = existing.findIndex((l) => l.date === log.date);
        const newLog: DailyLog = { ...log, id: log.date, createdAt: null };
        if (idx >= 0) {
          existing[idx] = newLog;
        } else {
          existing.push(newLog);
        }
        saveDemoLogs(existing);
        setLogs(existing.sort((a, b) => b.date.localeCompare(a.date)));
        return;
      }

      const logRef = doc(db!, "users", user.uid, "logs", log.date);
      await setDoc(logRef, { ...log, createdAt: Timestamp.now() }, { merge: true });
    },
    [user]
  );

  return { logs, loading, saveLog };
}

export function useWeeklyStats() {
  const { user, profile } = useAuth();
  const [stats, setStats] = useState({
    workoutsDone: 0,
    workoutsTarget: 4,
    mealsDone: 0,
    mealsTarget: 10,
    hasPR: false,
  });

  useEffect(() => {
    if (!user) return;

    const now = new Date();
    const weekStart = format(startOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd");
    const weekEnd = format(endOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd");

    if (isDemoMode) {
      const logs = loadDemoLogs().filter(
        (l) => l.date >= weekStart && l.date <= weekEnd
      );
      let workouts = 0, meals = 0, pr = false;
      logs.forEach((l) => {
        workouts += l.workouts || 0;
        meals += l.meals || 0;
        if (l.hasPR) pr = true;
      });
      setStats({
        workoutsDone: workouts,
        workoutsTarget: profile?.weeklyWorkoutsTarget || 4,
        mealsDone: meals,
        mealsTarget: profile?.weeklyMealsTarget || 10,
        hasPR: pr,
      });
      return;
    }

    const logsRef = collection(db!, "users", user.uid, "logs");
    const q = query(
      logsRef,
      where("date", ">=", weekStart),
      where("date", "<=", weekEnd)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      let workouts = 0;
      let meals = 0;
      let pr = false;
      snapshot.docs.forEach((d) => {
        const data = d.data();
        workouts += data.workouts || 0;
        meals += data.meals || 0;
        if (data.hasPR) pr = true;
      });
      setStats({
        workoutsDone: workouts,
        workoutsTarget: profile?.weeklyWorkoutsTarget || 4,
        mealsDone: meals,
        mealsTarget: profile?.weeklyMealsTarget || 10,
        hasPR: pr,
      });
    });

    return unsubscribe;
  }, [user, profile]);

  return stats;
}

export function useMonthlyStats() {
  const { user, profile } = useAuth();
  const [stats, setStats] = useState({
    workoutsDone: 0,
    workoutsTarget: 16,
    mealsDone: 0,
    mealsTarget: 40,
    hasPR: false,
  });

  useEffect(() => {
    if (!user) return;

    const now = new Date();
    const monthStart = format(startOfMonth(now), "yyyy-MM-dd");
    const monthEnd = format(endOfMonth(now), "yyyy-MM-dd");

    if (isDemoMode) {
      const logs = loadDemoLogs().filter(
        (l) => l.date >= monthStart && l.date <= monthEnd
      );
      let workouts = 0, meals = 0, pr = false;
      logs.forEach((l) => {
        workouts += l.workouts || 0;
        meals += l.meals || 0;
        if (l.hasPR) pr = true;
      });
      setStats({
        workoutsDone: workouts,
        workoutsTarget: (profile?.weeklyWorkoutsTarget || 4) * 4,
        mealsDone: meals,
        mealsTarget: (profile?.weeklyMealsTarget || 10) * 4,
        hasPR: pr,
      });
      return;
    }

    const logsRef = collection(db!, "users", user.uid, "logs");
    const q = query(
      logsRef,
      where("date", ">=", monthStart),
      where("date", "<=", monthEnd)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      let workouts = 0;
      let meals = 0;
      let pr = false;
      snapshot.docs.forEach((d) => {
        const data = d.data();
        workouts += data.workouts || 0;
        meals += data.meals || 0;
        if (data.hasPR) pr = true;
      });
      setStats({
        workoutsDone: workouts,
        workoutsTarget: (profile?.weeklyWorkoutsTarget || 4) * 4,
        mealsDone: meals,
        mealsTarget: (profile?.weeklyMealsTarget || 10) * 4,
        hasPR: pr,
      });
    });

    return unsubscribe;
  }, [user, profile]);

  return stats;
}

export function useHistoryData(days: number = 30) {
  const { user } = useAuth();
  const [data, setData] = useState<DailyLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setData([]);
      setLoading(false);
      return;
    }

    const startDate = format(subDays(new Date(), days), "yyyy-MM-dd");

    if (isDemoMode) {
      const logs = loadDemoLogs()
        .filter((l) => l.date >= startDate)
        .sort((a, b) => a.date.localeCompare(b.date));
      setData(logs);
      setLoading(false);
      return;
    }

    const logsRef = collection(db!, "users", user.uid, "logs");
    const q = query(logsRef, where("date", ">=", startDate), orderBy("date", "asc"));

    getDocs(q).then((snapshot) => {
      const result = snapshot.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })) as DailyLog[];
      setData(result);
      setLoading(false);
    });
  }, [user, days]);

  return { data, loading };
}
