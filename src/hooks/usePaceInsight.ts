import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { auth } from "@/lib/firebase";
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
 * `usePaceInsightFromRuns` is the reusable controller — it consumes an
 * already-loaded run list so a caller (RunSummary) that already queried the
 * history can feed it in without a second Firestore read. `usePaceInsight`
 * is the standalone form that fetches its own 90-day window.
 */

export interface PaceInsightRun {
  id?: string;
  distance: number;
  duration: number;
  avgPace: number;
  completedAt: Date | null;
  activityType?: string;
  isInvalid?: boolean;
  savedAnyway?: boolean;
}

export interface PaceInsightController {
  insight: PaceInsight | null;
  accept: () => Promise<PaceInsightAcceptResult>;
  dismiss: () => void;
}

export type PaceInsightAcceptResult = "success" | "failure" | "stale";

interface DismissalState {
  uid: string | null;
  vdot: number | null;
}

// Dismissals are UID-scoped (localStorage) so on a shared device account A
// can't suppress account B's suggestion, and keyed by suggested VDOT so a
// *new* suggestion re-surfaces but the same one doesn't nag.
const dismissKey = (uid: string) => `tropos.dismiss.paceInsight:${uid}`;

export function usePaceInsightFromRuns(
  runs: PaceInsightRun[],
  opts: { enabled?: boolean; loading?: boolean } = {}
): PaceInsightController {
  const { enabled = true, loading = false } = opts;
  const { user, profile, updateProfile } = useAuth();
  const { isPro } = useSubscription();
  const [dismissal, setDismissal] = useState<DismissalState>({
    uid: null,
    vdot: null,
  });

  useEffect(() => {
    const uid = user?.uid ?? null;
    if (!uid) {
      setDismissal({ uid: null, vdot: null });
      return;
    }

    let vdot: number | null = null;
    try {
      const stored = Number(window.localStorage.getItem(dismissKey(uid)));
      if (Number.isFinite(stored) && stored > 0) vdot = stored;
    } catch {
      // In-memory dismissal remains available when storage is unavailable.
    }
    setDismissal({ uid, vdot });
  }, [user?.uid]);

  const dismissalReady = Boolean(user && dismissal.uid === user.uid);
  const profileIsCurrent = Boolean(user && profile?.uid === user.uid);
  const runFitness = profile?.runFitness ?? null;

  const insight = useMemo<PaceInsight | null>(() => {
    if (
      !enabled ||
      !isPro ||
      loading ||
      !dismissalReady ||
      !profileIsCurrent ||
      !runFitness
    ) {
      return null;
    }

    const cutoffMs = Date.now() - 90 * 24 * 60 * 60 * 1000;
    const eligible = runs
      .filter(
        (run) =>
          run.completedAt instanceof Date &&
          Number.isFinite(run.completedAt.getTime()) &&
          run.completedAt.getTime() >= cutoffMs &&
          isPaceEligible(run)
      )
      .map((run) => ({
        distanceM: run.distance,
        durationS: run.duration,
      }));

    const next = resolvePaceInsight(runFitness, eligible);
    if (!next) return null;
    return dismissal.vdot !== null &&
      Math.round(next.suggestedVdot) === Math.round(dismissal.vdot)
      ? null
      : next;
  }, [
    enabled,
    isPro,
    loading,
    dismissalReady,
    profileIsCurrent,
    dismissal.vdot,
    runFitness,
    runs,
  ]);

  const accept = useCallback(async (): Promise<PaceInsightAcceptResult> => {
    if (!insight || !user) return "failure";
    const writeUid = user.uid;
    const { distanceM, timeS } = insight.suggestedBenchmark;
    const vdot = vdotFromRace(distanceM, timeS);

    try {
      // throwOnError so a failed persistence is a real failure, not a silent
      // { ok: false } the UI would announce as success.
      await updateProfile(
        {
          runFitness: {
            benchmark: { distanceM, timeS },
            vdot: Math.round(vdot * 10) / 10,
            source: "derived",
            updatedAt: new Date().toISOString(),
          },
        },
        { throwOnError: true }
      );
      // If the account switched during the write, stay silent (no A feedback
      // under B) — the write itself still landed for A.
      return auth.currentUser?.uid === writeUid ? "success" : "stale";
    } catch (error) {
      if (auth.currentUser?.uid !== writeUid) return "stale";
      logger.error("[usePaceInsight] accept failed", error);
      return "failure";
    }
  }, [insight, updateProfile, user]);

  const dismiss = useCallback(() => {
    if (!insight || !user) return;
    setDismissal({ uid: user.uid, vdot: insight.suggestedVdot });
    try {
      window.localStorage.setItem(
        dismissKey(user.uid),
        String(insight.suggestedVdot)
      );
    } catch {
      // In-memory state still suppresses the current suggestion.
    }
  }, [insight, user]);

  return { insight, accept, dismiss };
}

export function usePaceInsight(): PaceInsightController {
  const { runs, loading } = useRunningStats(90);
  return usePaceInsightFromRuns(runs, { loading });
}
