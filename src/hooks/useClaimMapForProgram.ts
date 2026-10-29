/**
 * PR-J Q3 P77 — Memoised claim map for the soft-link reframe.
 *
 * Subscribes to the user's saved runs, reads the programState its caller
 * already holds (Train's engine, Home's snapshot), and produces a single `Map<runDayId, ClaimState>` via
 * `claimMapFor` (`@/lib/runClaims`), which supplies `computeClaims` its
 * catalogue lookups and pace bar.
 *
 * Why a hook (not raw useMemo at the call site):
 *   - The fingerprint guard (Q3 P37) needs subscription-aware
 *     dep stability — Firestore returns a new array reference on
 *     every event even when content is unchanged. A hook centralises
 *     the fingerprint pattern + the saved-runs subscription so
 *     downstream consumers (RunWeekStrip, DayPeekCard, recovery-
 *     entry effect) don't re-implement it.
 *   - Q3 P77 + P90: single source of truth — the claim map AND the
 *     unclaimed-runs selector (extras display) derive from the
 *     same memoised computation.
 *
 * Returns:
 *   - claimMap: Map<runDayId, ClaimState>
 *   - unclaimedByDate: Map<date, SavedRun[]>  // Q5 extras
 *   - today: string  // local YYYY-MM-DD used to compute the map
 *
 * The hook is read-only — writers (markManualComplete /
 * unmarkManualComplete / skipRunDay) live on useProgram itself.
 * The claim map updates reactively when:
 *   - The saved-runs subscription emits (any user run write).
 *   - programState changes (runDays, manualCompletions).
 *   - `today` rolls over at midnight (caller responsibility — see
 *     the `dateAnchor` arg).
 */

import { useMemo } from "react";
import type { ProgramState } from "@/features/program/programTypes";
import {
  addLocalDays,
  localDateString,
  localWeekKey,
  parseLocalDate,
} from "@/lib/dateHelpers";
import type { ClaimState, SavedRunLike } from "@/lib/scheduledRunCompletion";
import type { RunWindow, SavedRun } from "@/lib/savedRuns";
import { claimableRuns, claimMapFor, type SavedRunDoc } from "@/lib/runClaims";
import { useSavedRuns } from "./useSavedRuns";

/**
 * Stable-by-content key for the bounded claim window. Include every claim
 * input, so a distance/quality/date correction invalidates the map even when
 * the saved record's id and creation time stay unchanged. Serialise only
 * these small tuples, never route coordinates or whole saved documents.
 */
function computeFingerprint(
  savedRuns: SavedRunLike[],
  manualCompletions: NonNullable<ProgramState["manualCompletions"]>,
  today: string
): string {
  return JSON.stringify([
    today,
    savedRuns.map((run) => [
      run.id,
      run.date,
      run.distance,
      run.avgPace,
      run.templateId,
      run.activityType,
      run.createdAt instanceof Date
        ? run.createdAt.getTime()
        : typeof run.createdAt === "object"
          ? run.createdAt?.seconds
          : run.createdAt,
    ]),
    Object.entries(manualCompletions).sort(([a], [b]) => a.localeCompare(b)),
  ]);
}

interface UseClaimMapResult {
  claimMap: Map<string, ClaimState>;
  /** Saved runs that don't claim any runDay slot. Keyed by date for
   *  Q5 extras display in RunWeekStrip / DayPeekCard. */
  unclaimedByDate: Map<string, SavedRunDoc[]>;
  /** The saved runs from `claimWindowStart` on, as read: the week's counts
   *  (`trainingWeek`) apply their own rule to them. */
  runs: readonly SavedRun[];
  /** Local YYYY-MM-DD used to compute the claim map. Callers
   *  watching midnight rollover key off this. */
  today: string;
  loading: boolean;
  /** Whether the saved-run read failed, so an empty map cannot be
   *  mistaken for proof that a scheduled run is uncompleted. */
  failed: boolean;
  /** All completion evidence has answered from the server. Writers that
   *  depend on absence of a claim must wait for this. */
  evidenceReady: boolean;
  /** Retry the canonical saved-run subscription. */
  refresh: () => void;
}

/**
 * The runs that can matter here. A planned day is claimed only by a run on
 * its date or the day after (computeClaims), and the week's counts read
 * this week (trainingWeek), so nothing before the earlier of this week's
 * first day and the earliest planned day can claim or count. Reading every
 * run the account has, each with its route, on every Home visit, read
 * years of them for nothing.
 */
export function claimWindowStart(
  today: string,
  runDays: readonly { date?: string }[]
): string {
  let since = localWeekKey(parseLocalDate(today));
  for (const day of runDays) {
    if (typeof day.date === "string" && day.date.length === 10)
      if (day.date < since) since = day.date;
  }
  // A day early: the window is read by completion time from local
  // midnight, and a run recorded east of here completed before this
  // zone's midnight of the day it belongs to.
  return localDateString(addLocalDays(parseLocalDate(since), -1));
}

/**
 * @param dateAnchor optional override for "today" (test fixtures,
 *   future midnight-rollover effect). Defaults to the local date.
 */
export function useClaimMapForProgram(
  programState: ProgramState | null,
  dateAnchor?: string
): UseClaimMapResult {
  /* The account's saved runs, through the one reader (`useSavedRuns`):
     ordered by `completedAt`, which every saved run carries, scoped to the
     signed-in account (another account's runs never claim this plan's
     slots, not even for the render before the new listener lands), and
     with runs saved on this phone but not yet synced, so an offline run
     fills its day on Home at once. */
  const today = dateAnchor ?? localDateString(new Date());
  const runDays = programState?.runDays ?? [];
  const since = claimWindowStart(today, runDays);
  const window = useMemo<RunWindow>(() => ({ since }), [since]);
  const { runs, loading, failed, evidenceReady, refresh } = useSavedRuns(window);
  /* Only runs that count fill a planned day or show as an extra
     (`claimableRuns`). */
  const savedRuns = useMemo(() => claimableRuns(runs), [runs]);

  const manualCompletions = programState?.manualCompletions ?? {};

  // Stable-by-content fingerprint catches Firestore's new-array-ref
  // churn. Recompute the claim map only when the fingerprint
  // changes — not on every Firestore tick.
  const fingerprint = computeFingerprint(
    savedRuns,
    manualCompletions,
    today
  );

  // Memo deps include runDays array reference (its identity changes
  // when programState updates) + the fingerprint above. The
  // fingerprint dominates for saved-run / manual / today changes;
  // runDays identity covers plan-shape changes.
  const claimMap = useMemo(
    function () {
      return claimMapFor(runDays, savedRuns, manualCompletions, today);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `fingerprint` stands in for savedRuns / manualCompletions / today (see above); listing them directly would recompute on every reference change
    [runDays, fingerprint]
  );

  // Q3 P90: unclaimed-runs selector + claim map share the same
  // memoised computation. Derive the unclaimed map from the same
  // savedRuns + claimMap pair, not from a parallel scan.
  const unclaimedByDate = useMemo(
    function () {
      const claimedIds = new Set<string>();
      for (const cs of claimMap.values()) {
        if (cs.claimedSavedRunId) claimedIds.add(cs.claimedSavedRunId);
      }
      const out = new Map<string, SavedRunDoc[]>();
      for (const sr of savedRuns) {
        if (claimedIds.has(sr.id)) continue;
        if (!sr.date) continue;
        const list = out.get(sr.date) ?? [];
        list.push(sr);
        out.set(sr.date, list);
      }
      return out;
    },
    [claimMap, savedRuns]
  );

  return {
    claimMap,
    unclaimedByDate,
    runs,
    today,
    loading,
    failed,
    evidenceReady,
    refresh,
  };
}
