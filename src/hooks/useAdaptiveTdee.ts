import { useEffect, useMemo, useState } from "react";
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

/**
 * Nutr2 / #981 — assembles the trailing-window data for the adaptive-TDEE
 * estimator and exposes the warmup state for the "Personalizing your
 * metabolism" bar (the #981 deliverable).
 *
 * Active ONLY for Pro/trial users without a manual calorie override (Q4 lock
 * A) — everyone else gets `active: false` and ZERO extra Firestore reads.
 *
 * Scope note: this is the WARMUP half of the locked #981+#982 unit. The
 * learned-value takeover (cap + persistence + flipping the live target in
 * useEffectiveTargets) is the #982 half and is deliberately not wired here —
 * the target stays on the formula throughout warmup, which is correct
 * pre-gate (no learned number is ever shown below the gate).
 */
export interface AdaptiveWarmupView {
  /** True when adaptive is active (Pro/trial, no manual override). */
  active: boolean;
  /** Estimator gate — true once enough data has accumulated. */
  ready: boolean;
  /** Render the warmup bar (active, loaded, gate not yet cleared). */
  showWarmup: boolean;
  /** 0..1 bar fill — high-water latched within the session so it never shrinks. */
  warmupFraction: number;
  /** True when live progress has slipped behind the rolling window. */
  stalled: boolean;
}

const WINDOW_DAYS = ADAPTIVE_TDEE_DEFAULTS.windowDays;

const INACTIVE: AdaptiveWarmupView = {
  active: false,
  ready: false,
  showWarmup: false,
  warmupFraction: 0,
  stalled: false,
};

export function useAdaptiveTdee(): AdaptiveWarmupView {
  const { user, profile } = useAuth();
  const { isPro } = useSubscription(); // isPro is true during trial too

  const isManualOverride = !!profile?.customCalorieTarget;
  const active = !!user && isPro && !isManualOverride;

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

  // Assemble trailing-window intake (summed per date) + raw weigh-ins. Only
  // runs for active users — free/override users do no reads.
  useEffect(() => {
    let cancelled = false;
    // Inactive users return INACTIVE below before any of this state is read,
    // so there's nothing to reset here — just skip the reads.
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

  const liveFraction = active ? computeWarmupProgress(result).fraction : 0;

  // Raise the high-water latch (legitimate derived-state-from-prop case).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (liveFraction > latched) setLatched(liveFraction);
  }, [liveFraction, latched]);

  if (!active) return INACTIVE;

  const warmupFraction = Math.max(latched, liveFraction);
  const stalled = loaded && !result.ready && liveFraction + 0.001 < latched;

  return {
    active: true,
    ready: result.ready,
    showWarmup: loaded && !result.ready,
    warmupFraction,
    stalled,
  };
}
