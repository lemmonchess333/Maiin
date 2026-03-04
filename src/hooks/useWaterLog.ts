import { useState, useEffect, useCallback } from "react";
import { doc, onSnapshot, setDoc, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import { format } from "date-fns";

export interface WaterLog {
  glasses: number;
  targetGlasses: number;
  updatedAt: Timestamp;
}

export function useWaterLog() {
  const { user, profile } = useAuth();
  const [glasses, setGlasses] = useState(0);
  const [loading, setLoading] = useState(true);

  const today = format(new Date(), "yyyy-MM-dd");
  const target = profile?.targetWaterGlasses || 8;

  useEffect(() => {
    if (!user) {
      setGlasses(0);
      setLoading(false);
      return;
    }

    const ref = doc(db, "users", user.uid, "waterLog", today);
    const unsub = onSnapshot(ref, (snap) => {
      if (snap.exists()) {
        setGlasses(snap.data().glasses || 0);
      } else {
        setGlasses(0);
      }
      setLoading(false);
    });

    return unsub;
  }, [user, today]);

  const logWater = useCallback(
    async (amount = 1) => {
      if (!user) return;
      const newGlasses = glasses + amount;
      const ref = doc(db, "users", user.uid, "waterLog", today);
      await setDoc(ref, {
        glasses: newGlasses,
        targetGlasses: target,
        updatedAt: Timestamp.now(),
      });
    },
    [user, glasses, today, target]
  );

  const setWaterAmount = useCallback(
    async (amount: number) => {
      if (!user) return;
      const ref = doc(db, "users", user.uid, "waterLog", today);
      await setDoc(ref, {
        glasses: Math.max(0, amount),
        targetGlasses: target,
        updatedAt: Timestamp.now(),
      });
    },
    [user, today, target]
  );

  return {
    glasses,
    target,
    loading,
    logWater,
    setWaterAmount,
    progress: target > 0 ? Math.min(glasses / target, 1) : 0,
  };
}
