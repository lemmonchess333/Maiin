import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { doc, onSnapshot, setDoc, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import { localDateString } from "@/lib/dateHelpers";

export interface WaterLog {
  glasses: number;
  targetGlasses: number;
  updatedAt: Timestamp;
}

export function useWaterLog() {
  const { user, profile } = useAuth();
  const [glasses, setGlasses] = useState(0);
  const [loading, setLoading] = useState(true);
  const saveTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);
  const skipNextSnapshot = useRef(false);

  const today = useMemo(() => localDateString(), []);
  const target = profile?.targetWaterGlasses || 8;

  useEffect(() => {
    if (!user) {
      const reset = () => {
        setGlasses(0);
        setLoading(false);
      };
      reset();
      return;
    }

    const ref = doc(db, "users", user.uid, "waterLog", today);
    const unsub = onSnapshot(ref, (snap) => {
      if (skipNextSnapshot.current) {
        skipNextSnapshot.current = false;
        setLoading(false);
        return;
      }
      if (snap.exists()) {
        setGlasses(snap.data().glasses || 0);
      } else {
        setGlasses(0);
      }
      setLoading(false);
    });

    return () => {
      unsub();
      clearTimeout(saveTimeout.current);
      skipNextSnapshot.current = false;
    };
  }, [user, today]);

  const debouncedSave = useCallback(
    (newGlasses: number) => {
      if (!user) return;
      clearTimeout(saveTimeout.current);
      saveTimeout.current = setTimeout(() => {
        const ref = doc(db, "users", user.uid, "waterLog", today);
        skipNextSnapshot.current = true;
        setDoc(ref, {
          glasses: newGlasses,
          targetGlasses: target,
          updatedAt: Timestamp.now(),
        }).catch(() => {
          skipNextSnapshot.current = false;
        });
      }, 500);
    },
    [user, today, target]
  );

  const logWater = useCallback(
    (amount = 1) => {
      if (!user) return;
      const newGlasses = glasses + amount;
      setGlasses(newGlasses);
      debouncedSave(newGlasses);
    },
    [user, glasses, debouncedSave]
  );

  const setWaterAmount = useCallback(
    (amount: number) => {
      if (!user) return;
      const newGlasses = Math.max(0, amount);
      setGlasses(newGlasses);
      debouncedSave(newGlasses);
    },
    [user, debouncedSave]
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
