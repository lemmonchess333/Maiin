import { useCallback, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { readString, scopedKey, writeString } from "@/lib/localStore";
import { auth } from "@/lib/firebase";
import { useSubscription } from "@/lib/subscription";
import { useRunningStats } from "./useRunningStats";
import { benchmarkEfforts, type EffortRun } from "@/lib/benchmarkEfforts";
import {
  resolveFirstPaces,
  resolvePaceInsight,
  type PaceInsight,
} from "@/lib/runPaces";
import { paceUpdateLocked } from "@/lib/paceUpdateAccess";
import { logger } from "@/lib/logger";

/**
 * Adaptive Paces — Pace Insights (Phase 2, PRO). The adaptive recalibration
 * loop: when a Pro user's recent efforts imply a meaningfully different
 * fitness than their stored benchmark, surface a suggestion they can accept
 * (recompute the benchmark) or dismiss. Mirrors the Adaptive TDEE
 * measure→suggest→approve pattern; we never silently change the benchmark.
 * Since Pgm8 R1 the efforts are a race, a time trial or a tempo's work, read
 * by `benchmarkEfforts` as for the benchmark the app derives.
 *
 * The run summary works it out for every account (Run24 (4), deep dive
 * D4). Slower paces are every account's to take; faster ones are Pro
 * (owner, 13 November 2026: `paceUpdateLocked`), so a free account sees a
 * faster offer as `locked` and cannot accept it. The continuous form,
 * `usePaceInsight` on Settings, stays Pro (§10), and there free users get
 * `insight: null`.
 *
 * `usePaceInsightFromRuns` is the reusable controller — it consumes an
 * already-loaded run list so a caller (RunSummary) that already queried the
 * history can feed it in without a second Firestore read. `usePaceInsight`
 * is the standalone form that fetches its own 90-day window.
 */

/** A run as the insight reads it: what decides whether it was an effort
 *  (`EffortRun`; a `SavedRun` carries it all), and when it was run. */
export interface PaceInsightRun extends EffortRun {
  completedAt: Date | null;
}

export interface PaceInsightController {
  insight: PaceInsight | null;
  /** The insight is faster paces on a free account: shown, Pro to take. */
  locked: boolean;
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
const dismissKey = (uid: string) =>
  scopedKey("tropos.dismiss.paceInsight", uid);

/** The stored dismissed VDOT for `uid`, or null when none (or unreadable). */
function readStoredDismissal(uid: string | null): number | null {
  if (!uid) return null;
  const stored = Number(readString(dismissKey(uid)));
  return Number.isFinite(stored) && stored > 0 ? stored : null;
}

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

export function usePaceInsightFromRuns(
  runs: PaceInsightRun[],
  opts: {
    enabled?: boolean;
    loading?: boolean;
    /** Offer it whatever the plan (Run24 (4)): the run summary's one tap. */
    everyAccount?: boolean;
  } = {}
): PaceInsightController {
  const { enabled = true, loading = false, everyAccount = false } = opts;
  const { user, profile, updateProfile } = useAuth();
  const { isPro } = useSubscription();
  const uid = user?.uid ?? null;
  // The signed-in account's stored dismissal, re-read when the account
  // changes — never another account's.
  const storedDismissal = useMemo(() => readStoredDismissal(uid), [uid]);
  // A dismissal made in this session. It stands for its own account only,
  // and still suppresses the suggestion when storage refused the write.
  const [sessionDismissal, setSessionDismissal] = useState<DismissalState>({
    uid: null,
    vdot: null,
  });
  const dismissedVdot =
    uid && sessionDismissal.uid === uid
      ? sessionDismissal.vdot
      : storedDismissal;
  // The 90-day evidence window is measured from when this surface mounted.
  // Both callers are short-lived (the post-run summary, a settings page),
  // and `usePaceInsight`'s own runs are already clipped to a 90-date window
  // that rolls at midnight, so a frozen instant can only widen RunSummary's
  // window by however long that page has been open.
  const [mountedAtMs] = useState(Date.now);

  const profileIsCurrent = Boolean(user && profile?.uid === user.uid);
  const runFitness = profile?.runFitness ?? null;

  const insight = useMemo<PaceInsight | null>(() => {
    // Run24 (4): the run summary offers a runner with no confirmed paces
    // their first, after the plan's time trial or another effort; taking
    // them is Pro's (`paceUpdateLocked`).
    const firstPaces =
      everyAccount && (!runFitness || runFitness.pendingConfirmation === true);
    if (
      !enabled ||
      !(isPro || everyAccount) ||
      loading ||
      !profileIsCurrent ||
      (!runFitness && !firstPaces)
    ) {
      return null;
    }

    const cutoffMs = mountedAtMs - NINETY_DAYS_MS;
    // A race, a time trial or a tempo's work (Pgm8 R1); never an easy run,
    // a long run or a run-walk, whose time includes its walks (Run20 (5)).
    const efforts = benchmarkEfforts(
      runs.filter(
        (run) =>
          run.completedAt instanceof Date &&
          Number.isFinite(run.completedAt.getTime()) &&
          run.completedAt.getTime() >= cutoffMs
      )
    );

    const next = firstPaces
      ? resolveFirstPaces(runFitness, efforts)
      : resolvePaceInsight(runFitness, efforts);
    if (!next) return null;
    return dismissedVdot !== null &&
      Math.round(next.suggestedVdot) === Math.round(dismissedVdot)
      ? null
      : next;
  }, [
    enabled,
    isPro,
    everyAccount,
    loading,
    profileIsCurrent,
    dismissedVdot,
    runFitness,
    runs,
    mountedAtMs,
  ]);

  const locked = insight !== null && paceUpdateLocked(insight.direction, isPro);

  const accept = useCallback(async (): Promise<PaceInsightAcceptResult> => {
    if (!insight || !user || locked) return "failure";
    const writeUid = user.uid;
    const { benchmark, vdot, sourceRunId, sourceRunAt } = insight.suggested;

    try {
      // throwOnError so a failed persistence is a real failure, not a silent
      // { ok: false } the UI would announce as success.
      await updateProfile(
        {
          runFitness: {
            // A tempo's suggestion stores no race result (`DerivedFitness`).
            benchmark,
            vdot,
            source: "derived",
            updatedAt: new Date().toISOString(),
            // RUN-EV-08: this path IS the explicit acceptance — the flag is
            // written as literal false (not omitted; merge writes deep-merge
            // maps, so omission would leave a stale pending true).
            pendingConfirmation: false,
            ...(sourceRunId ? { sourceRunId } : {}),
            ...(sourceRunAt ? { sourceRunAt } : {}),
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
  }, [insight, locked, updateProfile, user]);

  const dismiss = useCallback(() => {
    if (!insight || !user) return;
    setSessionDismissal({ uid: user.uid, vdot: insight.suggestedVdot });
    // In-memory state still suppresses the current suggestion.
    writeString(dismissKey(user.uid), String(insight.suggestedVdot));
  }, [insight, user]);

  return { insight, locked, accept, dismiss };
}

export function usePaceInsight(): PaceInsightController {
  const { runs, loading } = useRunningStats(90);
  return usePaceInsightFromRuns(runs, { loading });
}
