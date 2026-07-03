/**
 * Data layer for the Weekly Review (Rev1). Fetch-on-open assembly — no
 * listeners, no new storage. All behavioural rules live in the pure
 * view-model (src/lib/weeklyReviewViewModel.ts); this module only reads
 * Firestore and adapts doc shapes.
 *
 * Cost profile (per the lock): the full review fetch runs only when the
 * page opens (~a week of small docs + two perf docs + PR baseline). The
 * ENTRY eligibility check is a handful of limit(1) probes, cached in
 * sessionStorage per (uid, week) so Home/Analytics mounts don't re-read.
 */
import { useEffect, useState } from "react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import { getWeekKey, weekKeyMinusN } from "@/lib/performanceEngine";
import {
  buildWeeklyReview,
  weekBounds,
  inWeek,
  type WeeklyReview,
  type WeeklyReviewData,
} from "@/lib/weeklyReviewViewModel";
import { workoutTonnageKg } from "@/hooks/useWorkouts";
import { isVolumeEligible } from "@/lib/runStatsEligibility";
import { buildPRMap, checkSetPR } from "@/lib/prTracking";
import { fetchBodyweightLogs } from "@/lib/api";
import { resolveRunPlanSurface } from "@/lib/runProgrammeViewModel";
import { logger } from "@/lib/logger";

/** Sunday key of the last COMPLETED week (the reviewed week). */
export function reviewedWeekKey(now: Date = new Date()): string {
  return weekKeyMinusN(getWeekKey(now), 1);
}

/** localStorage key for the Home entry's viewed state (useDismissOnce). */
export function reviewViewedKey(uid: string, weekKey: string): string {
  return `tropos-review-viewed:${uid}:${weekKey}`;
}

/* Matches useUserPRMap's bound — ~3 months of heavy logging. The PR
 * baseline is honest within the same window the rest of the app uses. */
const PR_BASELINE_LIMIT = 200;

interface WorkoutDocLite {
  date: string;
  exercises: {
    exerciseName: string;
    sets: { weightKg: number; reps: number }[];
  }[];
}

function isWorkoutDoc(d: unknown): d is WorkoutDocLite {
  const w = d as WorkoutDocLite;
  return typeof w?.date === "string" && Array.isArray(w?.exercises);
}

/** PRs fired inside the week, judged against a pre-week baseline map. */
export function countWeekPRs(
  baseline: WorkoutDocLite[],
  weekWorkouts: WorkoutDocLite[]
): number {
  const map = buildPRMap(baseline);
  const sessionCounts: Record<string, number> = {};
  for (const w of baseline) {
    for (const ex of w.exercises) {
      sessionCounts[ex.exerciseName] =
        (sessionCounts[ex.exerciseName] || 0) + 1;
    }
  }
  let fired = 0;
  const chronological = [...weekWorkouts].sort((a, b) =>
    a.date.localeCompare(b.date)
  );
  for (const w of chronological) {
    for (const ex of w.exercises) {
      for (const set of ex.sets) {
        const bucket = checkSetPR(
          ex.exerciseName,
          set.weightKg,
          set.reps,
          map,
          sessionCounts
        );
        if (bucket) {
          fired++;
          if (!map[ex.exerciseName]) {
            map[ex.exerciseName] = {
              "1rm": null,
              "3rm": null,
              "5rm": null,
              "8rm": null,
              "10rm": null,
            };
          }
          map[ex.exerciseName][bucket] = {
            weight: set.weightKg,
            reps: set.reps,
            date: w.date,
          };
        }
      }
    }
    for (const ex of w.exercises) {
      sessionCounts[ex.exerciseName] =
        (sessionCounts[ex.exerciseName] || 0) + 1;
    }
  }
  return fired;
}

/* ── Entry eligibility (Home row + Analytics row) ─────────────── */

export type ReviewEligibility = "unknown" | "none" | "eligible";

function eligCacheKey(uid: string, weekKey: string): string {
  return `tropos.review.elig:${uid}:${weekKey}`;
}

async function probeHasDoc(
  uid: string,
  coll: string,
  start: string,
  end: string | null
): Promise<boolean> {
  const parts = [
    end === null
      ? where("date", "<", start)
      : where("date", ">=", start),
  ];
  if (end !== null) parts.push(where("date", "<=", end));
  const snap = await getDocs(
    query(collection(db, "users", uid, coll), ...parts, limit(1))
  );
  return !snap.empty;
}

/**
 * Would the review render for the reviewed week? "eligible" covers both
 * the normal AND quiet variants (quiet needs the established check).
 * Cached per (uid, week) in sessionStorage so the probes run about once
 * per device per week.
 */
export function useReviewEligibility(): {
  eligibility: ReviewEligibility;
  weekKey: string;
} {
  const { user } = useAuth();
  const weekKey = reviewedWeekKey();
  const [eligibility, setEligibility] = useState<ReviewEligibility>(() => {
    if (!user) return "unknown";
    try {
      const cached = sessionStorage.getItem(eligCacheKey(user.uid, weekKey));
      if (cached === "none" || cached === "eligible") return cached;
    } catch {
      /* private mode — probe below */
    }
    return "unknown";
  });

  useEffect(() => {
    if (!user || eligibility !== "unknown") return;
    let cancelled = false;
    (async () => {
      try {
        const { start, end } = weekBounds(weekKey);
        const [w, r, m] = await Promise.all([
          probeHasDoc(user.uid, "workouts", start, end),
          probeHasDoc(user.uid, "runs", start, end),
          probeHasDoc(user.uid, "meals", start, end),
        ]);
        let result: ReviewEligibility;
        if (w || r || m) {
          result = "eligible";
        } else {
          // Quiet variant: only for established users.
          const [pw, pr, pm] = await Promise.all([
            probeHasDoc(user.uid, "workouts", start, null),
            probeHasDoc(user.uid, "runs", start, null),
            probeHasDoc(user.uid, "meals", start, null),
          ]);
          result = pw || pr || pm ? "eligible" : "none";
        }
        if (!cancelled) {
          setEligibility(result);
          try {
            sessionStorage.setItem(eligCacheKey(user.uid, weekKey), result);
          } catch {
            /* private mode — recompute next mount */
          }
        }
      } catch (err) {
        logger.warn("[useReviewEligibility] probe failed", err);
        if (!cancelled) setEligibility("none"); // fail closed for a nicety row
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, weekKey, eligibility]);

  return { eligibility, weekKey };
}

/* ── Full review fetch (the page) ─────────────────────────────── */

interface UseWeeklyReviewResult {
  loading: boolean;
  review: WeeklyReview | null;
  weekKey: string;
}

export function useWeeklyReview(): UseWeeklyReviewResult {
  const { user, profile } = useAuth();
  const weekKey = reviewedWeekKey();
  const [state, setState] = useState<UseWeeklyReviewResult>({
    loading: true,
    review: null,
    weekKey,
  });

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const { start, end } = weekBounds(weekKey);
        const prevKey = weekKeyMinusN(weekKey, 1);

        const [
          workoutsSnap,
          runsSnap,
          mealsSnap,
          weighIns,
          perfSnap,
          prevPerfSnap,
          baselineSnap,
          programStateSnap,
        ] = await Promise.all([
          getDocs(
            query(
              collection(db, "users", user.uid, "workouts"),
              where("date", ">=", start),
              where("date", "<=", end)
            )
          ),
          getDocs(
            query(
              collection(db, "users", user.uid, "runs"),
              where("date", ">=", start),
              where("date", "<=", end)
            )
          ),
          getDocs(
            query(
              collection(db, "users", user.uid, "meals"),
              where("date", ">=", start),
              where("date", "<=", end)
            )
          ),
          fetchBodyweightLogs(user.uid),
          getDoc(doc(db, "users", user.uid, "performance", weekKey)),
          getDoc(doc(db, "users", user.uid, "performance", prevKey)),
          getDocs(
            query(
              collection(db, "users", user.uid, "workouts"),
              where("date", "<", start),
              orderBy("date", "desc"),
              limit(PR_BASELINE_LIMIT)
            )
          ),
          getDoc(doc(db, "users", user.uid, "programState", "current")),
        ]);
        if (cancelled) return;

        const weekWorkoutDocs = workoutsSnap.docs
          .map((d) => d.data())
          .filter(isWorkoutDoc);
        const baselineDocs = baselineSnap.docs
          .map((d) => d.data())
          .filter(isWorkoutDoc);

        // WorkoutDocLite carries only the fields tonnage needs (sets'
        // weightKg×reps); the wider Workout type wants presentation
        // fields this computation never reads — hence the unknown hop.
        const workouts = weekWorkoutDocs.map((w) => ({
          date: w.date,
          tonnageKg: workoutTonnageKg(
            w as unknown as Parameters<typeof workoutTonnageKg>[0]
          ),
        }));

        const runs = runsSnap.docs
          .map((d) => d.data() as Record<string, unknown>)
          .filter((r) => typeof r.date === "string")
          .map((r) => ({
            date: r.date as string,
            distanceMeters:
              typeof r.distance === "number" ? r.distance : 0,
            eligible: isVolumeEligible(
              r as Parameters<typeof isVolumeEligible>[0]
            ),
          }));

        // One entry per day with ≥1 active (non-deleted) meal.
        const byDay = new Map<string, number>();
        for (const d of mealsSnap.docs) {
          const m = d.data() as Record<string, unknown>;
          if (m.deletedAt) continue;
          if (typeof m.date !== "string") continue;
          const cals =
            typeof m.totalCalories === "number" ? m.totalCalories : 0;
          byDay.set(m.date, (byDay.get(m.date) || 0) + cals);
        }
        const mealDays = [...byDay.entries()].map(([date, calories]) => ({
          date,
          calories,
        }));

        const perfData = perfSnap.exists()
          ? (perfSnap.data() as Record<string, unknown>)
          : null;
        const prevPerfData = prevPerfSnap.exists()
          ? (prevPerfSnap.data() as Record<string, unknown>)
          : null;
        const perf =
          perfData && typeof perfData.performanceIndex === "number"
            ? {
                pi: perfData.performanceIndex,
                loadBand:
                  typeof perfData.loadBand === "string"
                    ? perfData.loadBand
                    : null,
                deloadRecommended: Boolean(
                  (perfData.flags as Record<string, unknown> | undefined)
                    ?.deloadRecommended ??
                    (perfData.signals as Record<string, unknown> | undefined)
                      ?.deloadFlag
                ),
              }
            : null;
        const prevPi =
          prevPerfData && typeof prevPerfData.performanceIndex === "number"
            ? prevPerfData.performanceIndex
            : null;

        // Established = any deliberate event before the reviewed week.
        // The PR baseline query already answers it for workouts; probe
        // runs/meals only if needed.
        let established = baselineDocs.length > 0;
        if (!established) {
          const [pr, pm] = await Promise.all([
            probeHasDoc(user.uid, "runs", start, null),
            probeHasDoc(user.uid, "meals", start, null),
          ]);
          established = pr || pm;
        }
        if (cancelled) return;

        // Plan context (Run9a): freeform substrate has no planned runs.
        const programState = programStateSnap.exists()
          ? (programStateSnap.data() as Record<string, unknown>)
          : null;
        const surface = resolveRunPlanSurface(
          profile as Parameters<typeof resolveRunPlanSurface>[0],
          programState as Parameters<typeof resolveRunPlanSurface>[1]
        );
        const schedule = Array.isArray(profile?.weekSchedule)
          ? (profile.weekSchedule as { type?: string }[])
          : [];
        const liftDays = schedule.filter(
          (s) => s.type === "lift" || s.type === "both"
        ).length;
        const runScheduleDays = schedule.filter(
          (s) => s.type === "run" || s.type === "both"
        ).length;

        const runPlan = programState?.runPlan as
          | { runDays?: { date?: string }[]; phase?: string | null }
          | undefined;
        const raceRunDaysIn = (from: string): number | null => {
          if (surface.kind !== "race_goal") return null;
          if (!Array.isArray(runPlan?.runDays)) return null;
          return runPlan.runDays.filter(
            (d) => typeof d.date === "string" && inWeek(d.date, from)
          ).length;
        };

        const plannedRuns = raceRunDaysIn(weekKey);
        const currentWeekKey = getWeekKey(new Date());
        const weekAheadRuns =
          surface.kind === "race_goal"
            ? raceRunDaysIn(currentWeekKey)
            : runScheduleDays > 0
              ? runScheduleDays
              : null;
        const phaseNote =
          surface.kind === "race_goal"
            ? runPlan?.phase
              ? `Race prep — ${runPlan.phase}`
              : "Race prep"
            : null;

        // Adaptive-TDEE retune inside the reviewed week?
        const appliedAt = profile?.adaptiveCapState?.lastAppliedAt;
        let retuned = false;
        if (typeof appliedAt === "string") {
          const t = Date.parse(appliedAt);
          const startT = new Date(`${start}T00:00:00`).getTime();
          const endT = new Date(`${end}T23:59:59.999`).getTime();
          retuned = Number.isFinite(t) && t >= startT && t <= endT;
        }

        const data: WeeklyReviewData = {
          weekKey,
          workouts,
          runs,
          mealDays,
          weighIns,
          prsHit: countWeekPRs(baselineDocs, weekWorkoutDocs) || null,
          perf,
          prevPi,
          plannedLifts: liftDays > 0 ? liftDays : null,
          plannedRuns,
          calorieTarget:
            typeof profile?.targetCalories === "number"
              ? profile.targetCalories
              : null,
          adaptiveRetunedInWeek: retuned,
          hideWeightNumber: Boolean(profile?.hideWeightNumber),
          established,
          weekAhead: {
            lifts: liftDays > 0 ? liftDays : null,
            runs: weekAheadRuns,
            phaseNote,
          },
          goalProgram: profile?.program ?? null,
        };

        setState({ loading: false, review: buildWeeklyReview(data), weekKey });
      } catch (err) {
        logger.error("[useWeeklyReview] fetch failed", err);
        if (!cancelled) setState({ loading: false, review: null, weekKey });
      }
    })();
    return () => {
      cancelled = true;
    };
    // profile identity churns; the review is a point-in-time snapshot per week.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid, weekKey]);

  return state;
}
