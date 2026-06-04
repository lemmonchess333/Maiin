import { useEffect, useMemo, useRef, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import { useSubscription } from "@/lib/subscription";
import { fetchBodyweightLogs } from "@/lib/api";
import { localDateString } from "@/lib/dateHelpers";
import { ADAPTIVE_TDEE_DEFAULTS } from "@/lib/adaptiveTdee";
import {
  resolveAdaptiveTarget,
  isAdaptiveActive,
  type AdaptiveTdeeView,
} from "@/lib/adaptiveTarget";

/**
 * Nutr2 / #981 + #982 — the client-side adaptive-TDEE plumbing.
 *
 * This hook is deliberately thin: it loads the trailing-window data, holds the
 * session display state (the high-water warmup latch), and persists cap state.
 * ALL of the decision logic — estimate → weekly cap → source precedence →
 * view assembly — lives in the pure `resolveAdaptiveTarget` engine
 * (`src/lib/adaptiveTarget.ts`), which is where the behaviour is table-tested.
 *
 * Active ONLY for Pro/trial users without a manual calorie override (Q4 lock
 * A) — everyone else gets `active: false`, `source: "formula"`, and ZERO extra
 * Firestore reads. `useEffectiveTargets` consumes this and is the single
 * source of truth that surfaces it everywhere.
 */
export type { AdaptiveTdeeView } from "@/lib/adaptiveTarget";

const WINDOW_DAYS = ADAPTIVE_TDEE_DEFAULTS.windowDays;

export function useAdaptiveTdee(): AdaptiveTdeeView {
  const { user, profile, updateProfile } = useAuth();
  const { isPro } = useSubscription(); // isPro is true during trial too

  // Formula target = the stored base (already customCalorieTarget || formula).
  const formulaTarget = profile?.targetCalories ?? 2200;
  const isManualOverride = !!profile?.customCalorieTarget;
  const active = isAdaptiveActive({ hasUser: !!user, isPro, isManualOverride });
  const capPrev = profile?.adaptiveCapState ?? null;

  const [intakeByDay, setIntakeByDay] = useState<
    { dateKey: string; kcal: number }[]
  >([]);
  const [weighIns, setWeighIns] = useState<
    { dateKey: string; weightKg: number }[]
  >([]);
  const [loaded, setLoaded] = useState(false);
  // High-water latch so the bar never visibly shrinks when the rolling window
  // churns (a missed day shouldn't read as the bar going backwards).
  const [latched, setLatched] = useState(0);
  const persistKeyRef = useRef("");

  // Assemble trailing-window intake (summed per date) + raw weigh-ins. Only
  // runs for active users — free/override users do no reads.
  useEffect(() => {
    let cancelled = false;
    // Inactive users fall through to the formula below before any of this
    // state is read, so there's nothing to reset here — just skip the reads.
    if (!active || !user) return;

    (async () => {
      const windowStart = new Date();
      windowStart.setDate(windowStart.getDate() - WINDOW_DAYS);
      const startKey = localDateString(windowStart);

      // Intake: sum meal totalCalories per date over the window.
      const mealsRef = collection(db, "users", user.uid, "meals");
      const mealsSnap = await getDocs(
        query(mealsRef, where("date", ">=", startKey))
      );
      const byDay = new Map<string, number>();
      mealsSnap.docs.forEach((d) => {
        const data = d.data() as { date?: unknown; totalCalories?: unknown };
        if (typeof data.date !== "string") return;
        const kcal =
          typeof data.totalCalories === "number" ? data.totalCalories : 0;
        byDay.set(data.date, (byDay.get(data.date) ?? 0) + kcal);
      });
      const intake = Array.from(byDay, ([dateKey, kcal]) => ({
        dateKey,
        kcal,
      }));

      // Weigh-ins: raw dated points within the window.
      const logs = await fetchBodyweightLogs(user.uid);
      const wi = logs
        .filter((l) => typeof l.date === "string" && l.date >= startKey)
        .map((l) => ({ dateKey: l.date, weightKg: l.weight }));

      if (cancelled) return;
      setIntakeByDay(intake);
      setWeighIns(wi);
      setLoaded(true);
    })().catch(() => {
      if (!cancelled) setLoaded(true);
    });

    return () => {
      cancelled = true;
    };
  }, [active, user]);

  // Mount-stable `now`. The weekly cap's cadence is measured in DAYS, so a
  // session-constant clock is correct — and crucially it can't churn when the
  // latch raises, which would otherwise re-fire cap persistence. After our own
  // persist, the reloaded capPrev is ~0 days old against this same `now`, so
  // the cap holds (no re-write loop).
  const now = useMemo(() => new Date(), []);

  // The whole decision is one pure call. Memoized for render stability; the
  // latch value flows in so `warmupFraction`/`stalled` stay pure.
  const resolved = useMemo(
    () =>
      resolveAdaptiveTarget({
        hasUser: !!user,
        isPro,
        isManualOverride,
        formulaTarget,
        intakeByDay,
        weighIns,
        loaded,
        capPrev,
        now,
        latched,
      }),
    [
      user,
      isPro,
      isManualOverride,
      formulaTarget,
      intakeByDay,
      weighIns,
      loaded,
      capPrev,
      now,
      latched,
    ]
  );

  // Persist the new cap state once (guarded so the resulting profile reload
  // doesn't re-trigger the write).
  useEffect(() => {
    if (!resolved.capChanged || !resolved.capState) return;
    const key = `${resolved.capState.lastApplied}@${resolved.capState.lastAppliedAt}`;
    if (persistKeyRef.current === key) return;
    persistKeyRef.current = key;
    void updateProfile({ adaptiveCapState: resolved.capState });
  }, [resolved, updateProfile]);

  // Raise the high-water latch (legitimate derived-state-from-prop case).
  // warmupFraction === max(latched, liveFraction), so it is the new high-water.
  useEffect(() => {
    const { warmupFraction } = resolved.view;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (warmupFraction > latched) setLatched(warmupFraction);
  }, [resolved.view, latched]);

  return resolved.view;
}
