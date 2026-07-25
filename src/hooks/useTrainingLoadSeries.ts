import { useEffect, useState } from "react";
import {
  collection,
  getDocs,
  orderBy,
  query,
  where,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { isVolumeEligible } from "@/lib/runStatsEligibility";
import { localDateString } from "@/lib/dateHelpers";
import {
  loadCurve,
  MINUTES_PER_SET,
  type LoadPoint,
  type TrainingSession,
} from "@/lib/trainingLoad";

/**
 * Data feed for the training-load (fitness/fatigue/form) curve. One-shot
 * getDocs over runs + workouts for the display window PLUS warmup history —
 * the 42-day fitness EWMA needs ~60 days of context before the window edge
 * or the curve fake-ramps from zero (loadCurve's warmup contract).
 *
 * Session → load mapping (the trainingLoad model):
 *  - runs: volume-eligible only (isVolumeEligible — invalid / saved-anyway /
 *    sub-threshold runs never train you); moving minutes; tempo/intervals/
 *    race flagged as quality
 *  - workouts: durationMinutes, falling back to 3 min per logged set for
 *    sessions saved without a duration
 *
 * Failures degrade to an empty series (error logged) so Analytics renders
 * the card's empty state rather than crashing the page.
 */
const WARMUP_DAYS = 60;
const QUALITY_TYPES = new Set(["tempo", "intervals", "race"]);

export function useTrainingLoadSeries(displayDays: number): {
  points: LoadPoint[];
  loading: boolean;
} {
  const { user } = useAuth();
  const [points, setPoints] = useState<LoadPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setPoints([]);
      setLoading(false);
      return;
    }
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const fetchDays = displayDays + WARMUP_DAYS;
        const since = new Date();
        since.setDate(since.getDate() - fetchDays);
        const sinceKey = localDateString(since);

        const runsQ = query(
          collection(db, "users", user.uid, "runs"),
          where("completedAt", ">=", Timestamp.fromDate(since)),
          orderBy("completedAt", "desc")
        );
        // Workout docs key their local day in a `date` string (YYYY-MM-DD),
        // which orders lexicographically.
        const workoutsQ = query(
          collection(db, "users", user.uid, "workouts"),
          where("date", ">=", sinceKey),
          orderBy("date", "desc")
        );
        const [runsSnap, workoutsSnap] = await Promise.all([
          getDocs(runsQ),
          getDocs(workoutsQ),
        ]);

        const sessions: TrainingSession[] = [];
        runsSnap.docs.forEach((d) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const data = d.data() as Record<string, any>;
          if (!isVolumeEligible(data)) return;
          const completed =
            data.completedAt instanceof Timestamp
              ? data.completedAt.toDate()
              : data.completedAt?.toDate?.();
          if (!completed) return;
          sessions.push({
            dateKey: localDateString(completed),
            discipline: "run",
            minutes: (data.duration ?? 0) / 60,
            quality: QUALITY_TYPES.has(data.activityType),
          });
        });
        workoutsSnap.docs.forEach((d) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const data = d.data() as Record<string, any>;
          if (typeof data.date !== "string") return;
          const setCount = Array.isArray(data.exercises)
            ? data.exercises.reduce(
                (c: number, ex: { sets?: unknown[] }) =>
                  c + (ex.sets?.length ?? 0),
                0
              )
            : 0;
          const minutes = data.durationMinutes || setCount * MINUTES_PER_SET;
          if (minutes <= 0) return;
          sessions.push({
            dateKey: data.date,
            discipline: "lift",
            minutes,
          });
        });

        if (cancelled) return;
        setPoints(
          loadCurve(sessions, {
            endDateKey: localDateString(new Date()),
            days: displayDays,
          })
        );
      } catch (e) {
        logger.error("[useTrainingLoadSeries] load failed", e);
        if (!cancelled) setPoints([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [user, displayDays]);

  return { points, loading };
}
