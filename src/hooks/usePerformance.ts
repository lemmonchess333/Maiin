import { useState, useEffect } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";

interface PerformanceDoc {
  aggregates: {
    liftSessions: number;
    runSessions: number;
    liftTonnage: number;
    runKm: number;
  };
  adherenceScore: number | null;
  insight?: {
    title: string;
    bullets: string[];
  };
  loadBand: "overreach" | "high" | "moderate" | "low";
}

export function usePerformance() {
  const { user } = useAuth();
  const [current, setCurrent] = useState<PerformanceDoc | null>(null);

  useEffect(() => {
    if (!user?.uid) {
      setCurrent(null);
      return;
    }

    const ref = doc(db, "users", user.uid, "performance", "current");
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          setCurrent(snap.data() as PerformanceDoc);
        } else {
          setCurrent(null);
        }
      },
      () => setCurrent(null)
    );

    return unsub;
  }, [user?.uid]);

  return { current };
}
