import { useMemo, useState, useCallback } from "react";
import { useAuth } from "@/lib/auth";
import { useSubscription } from "@/lib/subscription";
import { useRunningStats } from "./useRunningStats";
import { isPaceEligible } from "@/lib/runStatsEligibility";
import {
  resolvePaceInsight,
  vdotFromRace,
  type PaceInsight,
} from "@/lib/runPaces";
import { logger } from "@/lib/logger";

/**
 * Adaptive Paces — Pace Insights (Phase 2, PRO). The adaptive recalibration
 * loop: when a Pro user's recent runs imply a meaningfully different fitness
 * than their stored benchmark, surface a suggestion they can accept (recompute
 * the benchmark) or dismiss. Mirrors the Adaptive TDEE measure→suggest→approve
 * pattern; we never silently change the benchmark.
 *
 * PRO-gated per the locked decision (§10): personalized paces are free, the
 * adaptive loop is Pro. Free users get `insight: null`.
 *
 * Dismissals are keyed by the suggested VDOT (localStorage) so a *new*
 * suggestion (different fitness) re-surfaces, but the same one doesn't nag.
 */
const DISMISS_KEY = "tropos.dismiss.paceInsight";

export function usePaceInsight(): {
  insight: PaceInsight | null;
  accept: () => Promise<void>;
  dismiss: () => void;
} {
  const { profile, updateProfile } = useAuth();
  const { isPro } = useSubscription();
  const { runs, loading } = useRunningStats(90);

  const [dismissedVdot, setDismissedVdot] = useState<number | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const v = Number(window.localStorage.getItem(DISMISS_KEY));
      return Number.isFinite(v) && v > 0 ? v : null;
    } catch {
      return null;
    }
  });

  const runFitness = profile?.runFitness ?? null;
  const insight = useMemo<PaceInsight | null>(() => {
    if (!isPro || loading || !runFitness) return null;
    const eligible = runs
      .filter((r) => isPaceEligible(r))
      .map((r) => ({ distanceM: r.distance, durationS: r.duration }));
    const ins = resolvePaceInsight(runFitness, eligible);
    if (!ins) return null;
    // Suppress a suggestion the user already dismissed (rounded so tiny
    // re-computations don't re-prompt).
    if (
      dismissedVdot !== null &&
      Math.round(ins.suggestedVdot) === Math.round(dismissedVdot)
    ) {
      return null;
    }
    return ins;
  }, [isPro, loading, runFitness, runs, dismissedVdot]);

  const accept = useCallback(async () => {
    if (!insight) return;
    const { distanceM, timeS } = insight.suggestedBenchmark;
    const vdot = vdotFromRace(distanceM, timeS);
    try {
      await updateProfile({
        runFitness: {
          benchmark: { distanceM, timeS },
          vdot: Math.round(vdot * 10) / 10,
          source: "derived",
          updatedAt: new Date().toISOString(),
        },
      });
    } catch (e) {
      logger.error("[usePaceInsight] accept failed", e);
    }
  }, [insight, updateProfile]);

  const dismiss = useCallback(() => {
    if (!insight) return;
    setDismissedVdot(insight.suggestedVdot);
    try {
      window.localStorage.setItem(DISMISS_KEY, String(insight.suggestedVdot));
    } catch {
      /* localStorage unavailable — in-memory state still suppresses it */
    }
  }, [insight]);

  return { insight, accept, dismiss };
}
