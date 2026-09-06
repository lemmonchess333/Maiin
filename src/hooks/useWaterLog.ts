import { recentWaterSizes, rememberWaterSize } from "@/lib/recentWaterSizes";
import { useState, useEffect, useCallback, useMemo } from "react";
import { doc, onSnapshot, type Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import { localDateString } from "@/lib/dateHelpers";
import {
  clampMl,
  resolveConsumedMl,
  resolveTargetMl,
  waterProgress,
  GLASS_ML,
  MAX_SINGLE_LOG_ML,
} from "@/lib/waterUnits";
import {
  applyWaterAction,
  flushWater,
  pendingWater,
  queueWater,
  waterSyncError,
  WATER_CHANGED,
  type WaterReceipt,
} from "@/lib/waterActions";
import { readJson, scopedKey, writeJson } from "@/lib/localStore";
import { toast } from "@/lib/toast";
export interface WaterLog {
  ml: number;
  targetMl: number;
  updatedAt: Timestamp;
}
export function useWaterLog() {
  const { user, profile } = useAuth();
  const uid = user?.uid ?? null;
  const [today, setToday] = useState(localDateString);
  const [snapshot, setSnapshot] = useState<{
    key: string;
    ml: number;
    receipts: Record<string, WaterReceipt>;
  } | null>(null);
  const [, refresh] = useState(0);
  const [readVersion, setReadVersion] = useState(0);
  const [readError, setReadError] = useState(false);
  const target = useMemo(
    () => resolveTargetMl({ targetWaterGlasses: profile?.targetWaterGlasses }),
    [profile?.targetWaterGlasses]
  );
  useEffect(() => {
    const update = () => {
      setToday(localDateString());
      refresh((v) => v + 1);
    };
    const timer = window.setInterval(update, 30000);
    window.addEventListener(WATER_CHANGED, update);
    window.addEventListener("focus", update);
    window.addEventListener("storage", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener(WATER_CHANGED, update);
      window.removeEventListener("focus", update);
      window.removeEventListener("storage", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);
  const key = `${uid}/${today}`;
  useEffect(() => {
    if (!uid) return;
    return onSnapshot(
      doc(db, "users", uid, "waterLog", today),
      (snap) => {
        const data = snap.data() ?? {};
        setSnapshot({
          key: `${uid}/${today}`,
          ml: resolveConsumedMl(data),
          receipts: data.waterReceipts ?? {},
        });
        setReadError(false);
      },
      () => setReadError(true)
    );
  }, [uid, today, readVersion]);
  const pending = uid ? pendingWater(uid) : [];
  let state = snapshot?.key === key ? snapshot : { ml: 0, receipts: {} };
  for (const action of pending.filter((a) => a.date === today)) {
    try {
      state = {
        ...state,
        ...applyWaterAction(state.ml, state.receipts, action),
      };
    } catch {
      /* A malformed stored action cannot hide the current total. */
    }
  }
  const logWater = useCallback(
    (delta: number) => {
      if (!uid || !Number.isFinite(delta) || delta === 0) return;
      const action = {
        id: crypto.randomUUID(),
        date: localDateString(),
        delta: Math.round(delta),
        targetMl: target,
        queuedAt: Date.now(),
      };
      if (!queueWater(uid, action)) {
        toast.error(
          "Couldn't keep this water entry. Free some storage and try again."
        );
        return;
      }
      if (delta > 0) rememberWaterSize(uid, Math.round(delta));
      if (delta > 0)
        toast.success(`Added ${Math.round(delta)} ml`, {
          duration: 5000,
          action: {
            label: "Undo",
            onClick: () => {
              if (
                !queueWater(uid, {
                  ...action,
                  id: crypto.randomUUID(),
                  queuedAt: Date.now(),
                  delta: -action.delta,
                  undoOf: action.id,
                })
              )
                toast.error("Couldn't keep the undo. Try again.");
            },
          },
        });
    },
    [uid, target]
  );
  const preferenceKey = uid ? scopedKey("tropos-water-serving", uid) : "";
  const storedServing = uid
    ? readJson<number>(preferenceKey, GLASS_ML)
    : GLASS_ML;
  const servingMl =
    Number.isFinite(storedServing) &&
    storedServing > 0 &&
    storedServing <= MAX_SINGLE_LOG_ML
      ? storedServing
      : GLASS_ML;
  const setServingMl = (value: number) => {
    if (!uid || value <= 0 || value > MAX_SINGLE_LOG_ML) return;
    if (!writeJson(preferenceKey, clampMl(value))) {
      toast.error("Couldn't save your usual serving.");
      return;
    }
    refresh((v) => v + 1);
  };
  return {
    ml: state.ml,
    target,
    loading: !!uid && snapshot?.key !== key,
    logWater,
    setWater: (value: number) => logWater(clampMl(value) - state.ml),
    progress: waterProgress(state.ml, target),
    servingMl,
    recentSizes: recentWaterSizes(uid),
    setServingMl,
    syncStatus:
      readError || (uid && waterSyncError(uid))
        ? "Couldn't sync water. Your pending entries are kept."
        : pending.length
          ? "Waiting to sync water…"
          : "",
    retry: () => {
      setReadVersion((v) => v + 1);
      if (uid) void flushWater(uid);
    },
  };
}
