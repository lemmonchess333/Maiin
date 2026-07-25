/* @untested: coverage gap. Straightforwardly testable against the fake; needs a fixed clock for the per-day doc id. */
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { doc, onSnapshot, Timestamp } from "firebase/firestore";
import { setDocGuarded } from "@/lib/firestoreWrite";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import { localDateString } from "@/lib/dateHelpers";
import {
  clampMl,
  resolveConsumedMl,
  resolveTargetMl,
  waterProgress,
} from "@/lib/waterUnits";

export interface WaterLog {
  /** Consumed millilitres today (Water "B" model). */
  ml: number;
  /** Daily target in millilitres. */
  targetMl: number;
  updatedAt: Timestamp;
}

export function useWaterLog() {
  const { user, profile } = useAuth();
  const [ml, setMl] = useState(0);
  const [loading, setLoading] = useState(true);
  const saveTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);
  const skipNextSnapshot = useRef(false);

  const today = useMemo(() => localDateString(), []);
  // Target stays derived from the legacy glasses field (× 250) until an
  // editable ml target ships — default 2 L. resolveTargetMl handles the
  // fallback chain (targetMl → targetWaterGlasses → default).
  const target = useMemo(
    () => resolveTargetMl({ targetWaterGlasses: profile?.targetWaterGlasses }),
    [profile?.targetWaterGlasses]
  );

  useEffect(() => {
    if (!user) {
      const reset = () => {
        setMl(0);
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
      // resolveConsumedMl migrates legacy `glasses`-only docs forward
      // (× 250) so pre-migration days still render.
      setMl(snap.exists() ? resolveConsumedMl(snap.data()) : 0);
      setLoading(false);
    });

    return () => {
      unsub();
      clearTimeout(saveTimeout.current);
      skipNextSnapshot.current = false;
    };
  }, [user, today]);

  const debouncedSave = useCallback(
    (newMl: number) => {
      if (!user) return;
      clearTimeout(saveTimeout.current);
      saveTimeout.current = setTimeout(() => {
        const ref = doc(db, "users", user.uid, "waterLog", today);
        skipNextSnapshot.current = true;
        setDocGuarded(ref, {
          ml: newMl,
          targetMl: target,
          updatedAt: Timestamp.now(),
        }).catch(() => {
          skipNextSnapshot.current = false;
        });
      }, 500);
    },
    [user, today, target]
  );

  /** Add (or, with a negative delta, remove) millilitres. Result is
   *  clamped at 0 so the − button can't drive the total negative. */
  const logWater = useCallback(
    (deltaMl: number) => {
      if (!user) return;
      const newMl = clampMl(ml + deltaMl);
      setMl(newMl);
      debouncedSave(newMl);
    },
    [user, ml, debouncedSave]
  );

  /** Set the absolute consumed millilitres (clamped ≥ 0). */
  const setWater = useCallback(
    (amountMl: number) => {
      if (!user) return;
      const newMl = clampMl(amountMl);
      setMl(newMl);
      debouncedSave(newMl);
    },
    [user, debouncedSave]
  );

  return {
    ml,
    target,
    loading,
    logWater,
    setWater,
    progress: waterProgress(ml, target),
  };
}
