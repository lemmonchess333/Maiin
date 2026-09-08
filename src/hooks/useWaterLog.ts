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
    /* Connectivity is read at render time (below) to decide whether a
       queued entry is in flight or stranded, so it has to re-render when
       connectivity changes rather than waiting on the 30s interval. */
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener(WATER_CHANGED, update);
      window.removeEventListener("focus", update);
      window.removeEventListener("storage", update);
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
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
      /* No confirmation toast on a water add.
         The card is the confirmation: the number and the fill both move
         the moment you tap. An undo affordance is redundant beside a
         minus button that sits next to the plus and does the same thing
         in one tap, and a 5-second overlay covering the surface below is
         a real cost for the most repeated, most trivially reversible
         action in the app. Errors still surface — only the success
         confirmation goes. */
      if (delta > 0) rememberWaterSize(uid, Math.round(delta));
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
    /* A write that is merely in flight says nothing.
       queueWater notifies before flushWater's transaction resolves, so
       every tap opens a window where the queue is non-empty. Reporting
       that window grows the card by a status line plus a 44px Retry
       button for the length of a Firestore round-trip, and items-stretch
       on the tile grid resizes the weight tile with it — a whole-row jump
       on the most repeated action in the app. The optimistic total and
       the fill are the feedback; a successful write needs no commentary.
       A write that cannot proceed does speak: a sync error, or an entry
       queued with no connection to carry it. The offline arm is
       load-bearing rather than decorative — flushWater's loop is gated on
       navigator.onLine, so without it an offline entry would sit in the
       queue indefinitely and silently. */
    syncStatus:
      readError || (uid && waterSyncError(uid))
        ? "Couldn't sync water. Your pending entries are kept."
        : pending.length && !navigator.onLine
          ? "Saved on this device. It'll sync when you're back online."
          : "",
    retry: () => {
      setReadVersion((v) => v + 1);
      if (uid) void flushWater(uid);
    },
  };
}
