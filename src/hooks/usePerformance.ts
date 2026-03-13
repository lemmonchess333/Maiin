import { useEffect, useMemo, useState } from "react";
import { collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import type { PerformanceWeekDoc } from "@/lib/performanceTypes";

function sortAsc(a: PerformanceWeekDoc, b: PerformanceWeekDoc) {
  return a.weekKey.localeCompare(b.weekKey);
}

export function usePerformanceWeeks(maxWeeks: number = 12) {
  const { user } = useAuth();
  const [weeks, setWeeks] = useState<PerformanceWeekDoc[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setWeeks([]);
      setLoading(false);
      return;
    }

    const ref = collection(db, "users", user.uid, "performance");
    const q = query(ref, orderBy("weekKey", "desc"), limit(maxWeeks));

    const unsub = onSnapshot(
      q,
      (snap) => {
        const docs = snap.docs
          .map((d) => {
            const data = d.data();
            const weekKey: string = (data.weekKey as string) || d.id;
            return { weekKey, ...data } as PerformanceWeekDoc;
          })
          .sort(sortAsc);

        setWeeks(docs);
        setLoading(false);
      },
      () => {
        setWeeks([]);
        setLoading(false);
      }
    );

    return unsub;
  }, [user, maxWeeks]);

  const currentWeek = useMemo(() => (weeks.length ? weeks[weeks.length - 1] : null), [weeks]);

  return { weeks, currentWeek, loading };
}
