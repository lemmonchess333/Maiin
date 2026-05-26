/**
 * PR-J Q3 P77 — Memoised claim map for the soft-link reframe.
 *
 * Subscribes to the user's saved runs + reads programState (via
 * useProgram + the existing useRunningStats subscription) and
 * produces a single `Map<runDayId, ClaimState>` via
 * `computeClaims` from `@/lib/scheduledRunCompletion`.
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

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import { useProgram } from "@/features/program/useProgram";
import { RUN_TEMPLATES } from "@/lib/workoutTemplates";
import { localDateString } from "@/lib/dateHelpers";
import {
  computeClaims,
  type ClaimState,
  type CompletionDeps,
  type SavedRunLike,
} from "@/lib/scheduledRunCompletion";

/**
 * Pre-computed template-quality lookup. Keyed by `RUN_TEMPLATES[i].id`.
 * `tempo` / `intervals` / `race` are quality; everything else is easy.
 * Q3 P41: helper is template-agnostic — we supply this lookup so the
 * helper doesn't import RUN_TEMPLATES itself.
 */
const TEMPLATE_QUALITY_BUCKET: Record<string, "quality" | "easy"> = (() => {
  const map: Record<string, "quality" | "easy"> = {};
  for (const t of RUN_TEMPLATES) {
    map[t.id] =
      t.type === "tempo" || t.type === "intervals" || t.type === "race"
        ? "quality"
        : "easy";
  }
  return map;
})();

/**
 * Default pace-bucket classifier. Saved runs with avgPace under
 * 270 sec/km (4:30/km) read as "quality"; otherwise "easy". This
 * is a v1 best-guess; a future PR can pull from `paceTrends.ts`
 * once user-specific baselines are stable.
 */
function defaultPaceBucketFor(saved: SavedRunLike): "quality" | "easy" {
  if (typeof saved.avgPace !== "number") return "easy";
  return saved.avgPace < 270 ? "quality" : "easy";
}

/**
 * Default planned-distance lookup from RUN_TEMPLATES. Returns 0
 * when the template isn't in the registry (triggers Q1 P29 fallback
 * — date + template-bucket match, distance branch skipped).
 */
const PLANNED_DISTANCE_BY_TEMPLATE: Record<string, number> = (() => {
  const map: Record<string, number> = {};
  for (const t of RUN_TEMPLATES) {
    const d = t.config?.targetDistance;
    if (typeof d === "number" && d > 0) {
      map[t.id] = d;
    }
  }
  return map;
})();

function defaultPlannedDistanceFor(runDay: { templateId?: string }): number {
  if (!runDay.templateId) return 0;
  return PLANNED_DISTANCE_BY_TEMPLATE[runDay.templateId] ?? 0;
}

const DEFAULT_DEPS: CompletionDeps = {
  paceBucketFor: defaultPaceBucketFor,
  templateQualityBucket: TEMPLATE_QUALITY_BUCKET,
  plannedDistanceFor: defaultPlannedDistanceFor,
};

/**
 * Stable-by-content fingerprint per Q3 P37. Multiple cheap signals
 * to defeat Firestore's new-array-ref churn on metadata-only events:
 *   - length (catches additions / deletions)
 *   - Σ updatedAt seconds (catches content changes)
 *   - manual key count
 *   - today string
 * NOT JSON.stringify (O(S) serialise per render).
 */
function computeFingerprint(
  savedRuns: SavedRunLike[],
  manualKeys: number,
  today: string
): string {
  let sumUpdated = 0;
  for (const sr of savedRuns) {
    if (sr.createdAt && typeof sr.createdAt === "object") {
      const c = sr.createdAt as { seconds?: number };
      if (typeof c.seconds === "number") sumUpdated += c.seconds;
    }
  }
  return `${savedRuns.length}|${sumUpdated}|${manualKeys}|${today}`;
}

/**
 * Saved-run row as the hook exposes it — the `SavedRunLike` shape
 * the helper consumes, plus the Firestore-shaped extras (duration,
 * type) the UI reads when rendering Q5 "extras" pills. Exported so
 * RunWeekStrip / DayPeekCard / DayActionSheet can type their own
 * extras-display props without importing the shape twice.
 */
export interface SavedRunDoc extends SavedRunLike {
  duration?: number;
  type?: string;
}

interface UseClaimMapResult {
  claimMap: Map<string, ClaimState>;
  /** Saved runs that don't claim any runDay slot. Keyed by date for
   *  Q5 extras display in RunWeekStrip / DayPeekCard. */
  unclaimedByDate: Map<string, SavedRunDoc[]>;
  /** Local YYYY-MM-DD used to compute the claim map. Callers
   *  watching midnight rollover key off this. */
  today: string;
  loading: boolean;
}

/**
 * @param dateAnchor optional override for "today" (test fixtures,
 *   future midnight-rollover effect). Defaults to the local date.
 */
export function useClaimMap(dateAnchor?: string): UseClaimMapResult {
  const { user } = useAuth();
  const { programState } = useProgram();
  const [savedRuns, setSavedRuns] = useState<SavedRunDoc[]>([]);
  const [loading, setLoading] = useState(true);

  const today = dateAnchor ?? localDateString(new Date());

  useEffect(
    function () {
      if (!user) {
        setSavedRuns([]);
        setLoading(false);
        return;
      }
      const runsRef = collection(db, "users", user.uid, "runs");
      const q = query(runsRef, orderBy("createdAt", "desc"));
      const unsub = onSnapshot(
        q,
        (snap) => {
          const rows: SavedRunDoc[] = snap.docs.map(function (d) {
            const data = d.data() as Record<string, unknown>;
            const ca = data.createdAt;
            return {
              id: d.id,
              date: typeof data.date === "string" ? data.date : undefined,
              distance:
                typeof data.distance === "number" ? data.distance : undefined,
              avgPace:
                typeof data.avgPace === "number" ? data.avgPace : undefined,
              templateId:
                typeof data.templateId === "string"
                  ? data.templateId
                  : undefined,
              createdAt:
                ca instanceof Timestamp
                  ? { seconds: ca.seconds }
                  : ca instanceof Date
                    ? { seconds: Math.floor(ca.getTime() / 1000) }
                    : undefined,
              duration:
                typeof data.duration === "number" ? data.duration : undefined,
              type: typeof data.type === "string" ? data.type : undefined,
            };
          });
          setSavedRuns(rows);
          setLoading(false);
        },
        () => {
          setLoading(false);
        }
      );
      return unsub;
    },
    [user]
  );

  const runDays = programState?.runDays ?? [];
  const manualCompletions = programState?.manualCompletions ?? {};

  // Stable-by-content fingerprint catches Firestore's new-array-ref
  // churn. Recompute the claim map only when the fingerprint
  // changes — not on every Firestore tick.
  const fingerprint = computeFingerprint(
    savedRuns,
    Object.keys(manualCompletions).length,
    today
  );

  // Memo deps include runDays array reference (its identity changes
  // when programState updates) + the fingerprint above. The
  // fingerprint dominates for saved-run / manual / today changes;
  // runDays identity covers plan-shape changes.
  const claimMap = useMemo(
    function () {
      return computeClaims(
        runDays,
        savedRuns,
        manualCompletions,
        today,
        DEFAULT_DEPS
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  return { claimMap, unclaimedByDate, today, loading };
}
