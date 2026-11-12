import { useCallback, useEffect, useState } from "react";
import { fetchSavedRuns } from "@/lib/savedRuns";
import { fetchSavedWorkouts } from "@/lib/savedWorkouts";
import { useUid } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { isVolumeEligible } from "@/lib/runStatsEligibility";
import { localDateString } from "@/lib/dateHelpers";
import {
  loadCurve,
  evaluateLoadGuardrails,
  type LoadGuardrails,
  MINUTES_PER_SET,
  type LoadPoint,
  type TrainingSession,
} from "@/lib/trainingLoad";

/**
 * Data feed for the training-load (fitness/fatigue/form) curve. One-shot
 * getDocs over runs + workouts with a consistent history floor: the longest
 * supported chart range (one year) plus warmup. Changing the display window
 * must not change today's estimated fitness by changing its starting state.
 * This reads more history for shorter charts, but remains bounded at the
 * amount already needed by the one-year chart.
 *
 * Session → load mapping (the trainingLoad model):
 *  - runs: through the saved-run reader, on their Lift3 day (the day they
 *    started, as History's weekly bins and the streak count them);
 *    volume-eligible only (isVolumeEligible — invalid / saved-anyway /
 *    sub-threshold runs never train you); moving minutes; tempo/intervals/
 *    race flagged as quality
 *  - workouts: durationMinutes, falling back to 3 min per logged set for
 *    sessions saved without a duration
 *
 * Failed reads are reported separately from an empty training history.
 *
 * A series is stored with the uid and window it was computed for, and
 * `points` / `loading` are read off that during render: another account's
 * series is never returned (signed out, or switched and still loading), and
 * the hook is loading until a series for the current uid AND window lands.
 * A same-account window change keeps the previous points until then, as
 * the card shows its skeleton while loading anyway.
 *
 * `enabled` (default true): History shows the curve only inside the
 * score's details on the overview, and reads nothing for it while they
 * are closed or another page is open.
 */
const WARMUP_DAYS = 60;
const MIN_HISTORY_DAYS = 365 + WARMUP_DAYS;
const QUALITY_TYPES = new Set(["tempo", "intervals", "race"]);

interface LoadedSeries {
  uid: string | null;
  displayDays: number | null;
  request: number;
  failed: boolean;
  guardrails?: LoadGuardrails;
  points: LoadPoint[];
}

const NO_POINTS: LoadPoint[] = [];

export function useTrainingLoadSeries(
  displayDays: number,
  { enabled = true }: { enabled?: boolean } = {}
): {
  points: LoadPoint[];
  loading: boolean;
  failed: boolean;
  refresh: () => void;
  guardrails?: LoadGuardrails;
} {
  const uid = useUid();
  const [request, setRequest] = useState(0);
  const refresh = useCallback(() => setRequest((value) => value + 1), []);
  const [loaded, setLoaded] = useState<LoadedSeries>({
    uid: null,
    displayDays: null,
    request: -1,
    failed: false,
    points: NO_POINTS,
  });

  useEffect(() => {
    if (!uid || !enabled) return;
    let cancelled = false;

    const load = async () => {
      try {
        const fetchDays = Math.max(displayDays + WARMUP_DAYS, MIN_HISTORY_DAYS);
        const since = new Date();
        since.setDate(since.getDate() - fetchDays);
        const sinceKey = localDateString(since);

        const [runs, workouts] = await Promise.all([
          fetchSavedRuns(uid, { since: sinceKey }),
          fetchSavedWorkouts(uid, { since: sinceKey }),
        ]);

        const sessions: TrainingSession[] = [];
        for (const run of runs) {
          if (!isVolumeEligible(run)) continue;
          sessions.push({
            dateKey: run.day,
            discipline: "run",
            minutes: run.duration / 60,
            quality: QUALITY_TYPES.has(run.activityType),
          });
        }
        for (const workout of workouts) {
          const setCount = workout.exercises.reduce(
            (c, ex) => c + (ex.sets?.length ?? 0),
            0
          );
          const minutes = workout.durationMinutes || setCount * MINUTES_PER_SET;
          if (minutes <= 0) continue;
          sessions.push({
            dateKey: workout.date,
            discipline: "lift",
            minutes,
          });
        }

        if (cancelled) return;
        const history = loadCurve(sessions, {
          endDateKey: localDateString(new Date()),
          days: fetchDays + 1,
        });
        setLoaded({
          uid,
          displayDays,
          request,
          failed: false,
          guardrails: evaluateLoadGuardrails(history),
          points: history.slice(-displayDays),
        });
      } catch (e) {
        logger.error("[useTrainingLoadSeries] load failed", e);
        if (!cancelled)
          setLoaded({
            uid,
            displayDays,
            request,
            failed: true,
            points: NO_POINTS,
          });
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [uid, displayDays, enabled, request]);

  const ownSeries = enabled && uid !== null && loaded.uid === uid;
  const currentSeries =
    ownSeries &&
    loaded.displayDays === displayDays &&
    loaded.request === request;
  return {
    failed: currentSeries && loaded.failed,
    refresh,
    guardrails: currentSeries ? loaded.guardrails : undefined,
    points: ownSeries ? loaded.points : NO_POINTS,
    loading: enabled && uid !== null && !currentSeries,
  };
}
