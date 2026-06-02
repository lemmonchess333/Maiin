import { useEffect, useMemo, useRef, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import { useSubscription } from "@/lib/subscription";
import { fetchBodyweightLogs } from "@/lib/api";
import { localDateString } from "@/lib/dateHelpers";
import {
  estimateAdaptiveTDEE,
  computeWarmupProgress,
  ADAPTIVE_TDEE_DEFAULTS,
} from "@/lib/adaptiveTdee";
import {
  applyWeeklyCap,
  resolveTargetSource,
  type TargetSource,
} from "@/lib/adaptiveTarget";

/**
 * Nutr2 / #981 + #982 — the client-side adaptive-TDEE brain.
 *
 * Assembles the trailing-window data, runs the pure estimator, and resolves
 * which calorie number the user sees:
 *   - WARMUP (#981): the "Personalizing your metabolism" bar state while the
 *     gate is still filling.
 *   - TARGET (#982): the resolved { source, value } — the formula until the
 *     gate clears, then the learned TDEE smoothed by the ±150/7-day cap (seeded
 *     from the formula so it never jumps). Cap state is persisted on the
 *     profile so the smoothing is stable across sessions/devices.
 *
 * Active ONLY for Pro/trial users without a manual calorie override (Q4 lock
 * A) — everyone else gets `active: false`, `source: "formula"`, and ZERO extra
 * Firestore reads. `useEffectiveTargets` consumes this and is the single
 * source of truth that surfaces it everywhere.
 */
export interface AdaptiveTdeeView {
  /** True when adaptive is active (Pro/trial, no manual override). */
  active: boolean;
  /** Estimator gate — true once enough data has accumulated. */
  ready: boolean;
  /** Which number wins: "formula" (default) or "learned". */
  source: TargetSource;
  /** The resolved calorie target to use. */
  value: number;
  /** Render the warmup bar (active, loaded, gate not yet cleared). */
  showWarmup: boolean;
  /** 0..1 bar fill — high-water latched within the session so it never shrinks. */
  warmupFraction: number;
  /** True when live progress has slipped behind the rolling window. */
  stalled: boolean;
}

const WINDOW_DAYS = ADAPTIVE_TDEE_DEFAULTS.windowDays;

export function useAdaptiveTdee(): AdaptiveTdeeView {
  const { user, profile, updateProfile } = useAuth();
  const { isPro } = useSubscription(); // isPro is true during trial too

  // Formula target = the stored base (already customCalorieTarget || formula).
  const formulaTarget = profile?.targetCalories ?? 2200;
  const isManualOverride = !!profile?.customCalorieTarget;
  const active = !!user && isPro && !isManualOverride;
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

  const result = useMemo(
    () => estimateAdaptiveTDEE({ intakeByDay, weighIns }),
    [intakeByDay, weighIns]
  );

  // Apply the weekly rate cap once the gate is ready (seeded from formula on
  // first engage → no jump). Memoized so `now` doesn't churn every render.
  const cap = useMemo(() => {
    if (!active || !result.ready || result.learnedTDEE == null) return null;
    return applyWeeklyCap({
      rawLearned: result.learnedTDEE,
      formulaTarget,
      prev: capPrev,
      now: new Date(),
    });
  }, [active, result, formulaTarget, capPrev]);

  // Persist the new cap state once (guarded so the resulting profile reload
  // doesn't re-trigger the write).
  useEffect(() => {
    if (!cap || !cap.changed) return;
    const key = `${cap.capState.lastApplied}@${cap.capState.lastAppliedAt}`;
    if (persistKeyRef.current === key) return;
    persistKeyRef.current = key;
    void updateProfile({ adaptiveCapState: cap.capState });
  }, [cap, updateProfile]);

  const liveFraction = active ? computeWarmupProgress(result).fraction : 0;

  // Raise the high-water latch (legitimate derived-state-from-prop case).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (liveFraction > latched) setLatched(liveFraction);
  }, [liveFraction, latched]);

  const resolved = resolveTargetSource({
    isPro,
    ready: result.ready,
    formulaTarget,
    learnedApplied: cap?.applied ?? null,
    isManualOverride,
  });

  if (!active) {
    return {
      active: false,
      ready: false,
      source: "formula",
      value: formulaTarget,
      showWarmup: false,
      warmupFraction: 0,
      stalled: false,
    };
  }

  const warmupFraction = Math.max(latched, liveFraction);
  const stalled = loaded && !result.ready && liveFraction + 0.001 < latched;

  return {
    active: true,
    ready: result.ready,
    source: resolved.source,
    value: resolved.value,
    showWarmup: loaded && resolved.showWarmup,
    warmupFraction,
    stalled,
  };
}
