/**
 * Persists today's macro-target snapshot to `users/{uid}/dailyNutrition/{date}`
 * so the target-dependent nutrition badges can read the target as it stood on
 * each day (see src/lib/dailyNutritionSnapshot.ts for the rationale).
 *
 * Mounted ONCE in the authenticated tree (App.tsx) via <DailyNutritionSnapshot/>
 * — a render-null component — so there's a single writer, not one per consumer.
 * It re-snapshots whenever today's target moves (e.g. logging a workout flips
 * the day-type and shifts the carb/fat split), deduped by signature so an
 * unchanged re-render is a no-op. ~1 write/day/active-session — the same order
 * as the existing daily streak/water writes.
 */
import { useEffect, useRef } from "react";
import { Timestamp, doc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import { useEffectiveTargets } from "@/hooks/useEffectiveTargets";
import { setDocGuarded } from "@/lib/firestoreWrite";
import { localDateString } from "@/lib/dateHelpers";
import {
  buildTargetSnapshot,
  snapshotSignature,
} from "@/lib/dailyNutritionSnapshot";
import { logger } from "@/lib/logger";

export function useDailyNutritionSnapshot(): void {
  const { user } = useAuth();
  const targets = useEffectiveTargets(); // today
  // Last signature written this session — skips redundant same-value writes.
  const lastSigRef = useRef<string | null>(null);

  const { finalTarget, protein, carbs, fat } = targets;

  useEffect(() => {
    if (!user) {
      lastSigRef.current = null;
      return;
    }
    const today = localDateString();
    const snapshot = buildTargetSnapshot(today, {
      finalTarget,
      protein,
      carbs,
      fat,
    });
    // Target not usable yet (profile not set up) — nothing honest to snapshot.
    if (!snapshot) return;

    const sig = snapshotSignature(snapshot);
    if (sig === lastSigRef.current) return;
    lastSigRef.current = sig;

    const ref = doc(db, "users", user.uid, "dailyNutrition", today);
    void setDocGuarded(
      ref,
      { ...snapshot, snappedAt: Timestamp.now() },
      { merge: true }
    ).catch((err) => {
      // Best-effort background reconciliation — never surface a toast. A
      // transient failure retries on the next target change / app open. Reset
      // the ref so the retry isn't suppressed by the dedup guard.
      lastSigRef.current = null;
      logger.error("[DailyNutritionSnapshot] write failed", err);
    });
  }, [user, finalTarget, protein, carbs, fat]);
}

/** Render-null mount point for the single session-wide snapshot writer. */
export function DailyNutritionSnapshot(): null {
  useDailyNutritionSnapshot();
  return null;
}
