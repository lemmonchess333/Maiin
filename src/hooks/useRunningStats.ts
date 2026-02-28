import { useEffect, useState } from 'react';
import { collection, getDocs, query, where, orderBy, Timestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../lib/auth';

export interface RunningWeekData {
  week: string;
  totalDistance: number;
  runCount: number;
  avgPace: number;
}

export function useRunningStats(days: number = 30) {
  const { user } = useAuth();
  const [weeklyData, setWeeklyData] = useState<RunningWeekData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setLoading(false); return; }

    const loadStats = async () => {
      const since = new Date();
      since.setDate(since.getDate() - days);

      const runsRef = collection(db, 'users', user.uid, 'runs');
      const q = query(
        runsRef,
        where('completedAt', '>=', Timestamp.fromDate(since)),
        orderBy('completedAt')
      );
      const snap = await getDocs(q);

      const weeks: Record<string, { distance: number; count: number; paceSum: number }> = {};
      snap.docs.forEach(d => {
        const data = d.data();
        const date = data.completedAt?.toDate?.();
        if (!date) return;
        const weekStart = new Date(date);
        weekStart.setDate(weekStart.getDate() - weekStart.getDay());
        const key = weekStart.toISOString().split('T')[0];
        if (!weeks[key]) weeks[key] = { distance: 0, count: 0, paceSum: 0 };
        weeks[key].distance += (data.distance || 0) / 1000;
        weeks[key].count += 1;
        weeks[key].paceSum += data.avgPace || 0;
      });

      const sorted = Object.entries(weeks)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([week, d]) => ({
          week,
          totalDistance: Math.round(d.distance * 10) / 10,
          runCount: d.count,
          avgPace: d.count > 0 ? Math.round(d.paceSum / d.count) : 0,
        }));

      setWeeklyData(sorted);
      setLoading(false);
    };

    loadStats();
  }, [user, days]);

  return { weeklyData, loading };
}
