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
import { weekKeyMinusN } from "@/lib/performanceEngine";
import { localWeekKey } from "@/lib/dateHelpers";
import {
  buildWeeklyReview,
  weekBounds,
  inWeek,
  type WeekBest,
  type WeeklyReview,
  type WeeklyReviewData,
} from "@/lib/weeklyReviewViewModel";
import { epley1RMExact } from "@/lib/analytics";
import { workoutTonnageKg } from "@/hooks/useWorkouts";
import { resolveSnapshotCalorieTarget } from "@/lib/adaptiveTarget";
import { useSubscription } from "@/lib/subscription";
import { isVolumeEligible } from "@/lib/runStatsEligibility";
import { fetchSavedRuns } from "@/lib/savedRuns";
import { fetchSavedWorkouts } from "@/lib/savedWorkouts";
import {
  buildPRMap,
  checkSetPR,
  recordSetBest,
  type ExercisePR,
  type PRMap,
} from "@/lib/prTracking";
import { isSetEligibleForStrengthPr } from "@/features/program/sessionSetPolicy";
import { fetchBodyweightLogs } from "@/lib/api";
import { resolveRunPlanSurface } from "@/lib/runProgrammeViewModel";
import { isActiveMealDoc } from "@/lib/mealTotals";
import { logger } from "@/lib/logger";
import { scheduledDaysSinceStart, startDayKey } from "@/lib/startDay";
import {
  resolveDeloadRecommended,
  resolveLoadBand,
} from "@/lib/performanceDocFields";

/** Monday key of the last COMPLETED week (the reviewed week). */
export function reviewedWeekKey(now: Date = new Date()): string {
  return weekKeyMinusN(localWeekKey(now), 1);
}

/** localStorage key for the Home entry's viewed state (useDismissOnce). */
/* No uid segment: `useDismissOnce` prefixes one, and it is the only
   consumer. Both surfaces that share this key (the Home entry reads it,
   the review page writes it) go through that hook, so they stay in step. */
export function reviewViewedKey(weekKey: string): string {
  return `tropos-review-viewed:${weekKey}`;
}

/* Matches useUserPRMap's bound — ~3 months of heavy logging. The PR
 * baseline is honest within the same window the rest of the app uses. */
const PR_BASELINE_LIMIT = 200;

interface WorkoutDocLite {
  date: string;
  exercises: {
    exerciseId?: string;
    exerciseName: string;
    repUnit?: "reps" | "seconds";
    sets: { weightKg: number; reps: number; type?: string }[];
  }[];
}

/** The exercise's best across every rep range, as `checkSetPR` finds it. */
function exerciseBest(map: PRMap, exerciseName: string): ExercisePR | null {
  let top: ExercisePR | null = null;
  for (const record of Object.values(map[exerciseName] ?? {})) {
    if (
      record &&
      (!top ||
        epley1RMExact(record.weight, record.reps) >
          epley1RMExact(top.weight, top.reps))
    ) {
      top = record;
    }
  }
  return top;
}

/**
 * The week's new bests: how many the sessions set, and the one that
 * moved furthest past the exercise's best from before the week (by
 * estimated one-rep max, the measure the bests are judged on), for the
 * recap's Best moment card. Ties go to the later session.
 *
 * The recap speaks for the whole week, so it counts bests as the finish
 * screen does, once per exercise and rep range, and measures each one
 * against where the week started. Beating the bench best on Monday and
 * again on Thursday is one new best, and the card names Thursday's.
 *
 * Whether a set fired is still judged against the running record, as
 * its session judged it, so a set the week had already beaten counts
 * for nothing even when it clears the best from before the week.
 */
export function weekNewBests(
  baseline: WorkoutDocLite[],
  weekWorkouts: WorkoutDocLite[]
): { count: number; best: WeekBest | null } {
  const beforeWeek = buildPRMap(baseline);
  let map = beforeWeek;
  const sessionCounts: Record<string, number> = {};
  for (const w of baseline) {
    for (const ex of w.exercises) {
      sessionCounts[ex.exerciseName] =
        (sessionCounts[ex.exerciseName] || 0) + 1;
    }
  }
  /* `${exerciseName}:${bucket}`, the finish screen's key for a best. */
  const fired = new Set<string>();
  let best: WeekBest | null = null;
  let bestGain = -Infinity;
  const chronological = [...weekWorkouts].sort((a, b) =>
    a.date.localeCompare(b.date)
  );
  for (const w of chronological) {
    for (const ex of w.exercises) {
      for (const set of ex.sets) {
        /* The gate the live session applies before celebrating a PR —
           replayed here because this count is a CLAIM about that week's
           sessions. Without it the recap counted PRs the sessions
           themselves refused to fire: a warm-up that happened to beat a
           bucket, and a hold whose longer duration read as
           same-weight-more-reps. Absent `type` means working (pre-D2
           docs; export.ts's documented default). */
        if (!isSetEligibleForStrengthPr(set.type ?? "working", ex.repUnit)) {
          continue;
        }
        const bucket = checkSetPR(
          ex.exerciseName,
          set.weightKg,
          set.reps,
          map,
          sessionCounts
        );
        if (bucket?.kind === "best") {
          fired.add(`${ex.exerciseName}:${bucket.bucket}`);
          /* A later best of an exercise had to beat the earlier ones to
             fire, so against this fixed starting point the week's top
             best of each exercise is also its biggest gain. */
          const previous = exerciseBest(beforeWeek, ex.exerciseName);
          const gain = previous
            ? epley1RMExact(set.weightKg, set.reps) /
                epley1RMExact(previous.weight, previous.reps) -
              1
            : 0;
          if (gain >= bestGain) {
            bestGain = gain;
            best = {
              exerciseId: ex.exerciseId ?? null,
              exerciseName: ex.exerciseName,
              weight: set.weightKg,
              reps: set.reps,
              date: w.date,
              previous: previous
                ? {
                    weight: previous.weight,
                    reps: previous.reps,
                    date: previous.date,
                  }
                : null,
            };
          }
        }
        map = recordSetBest(map, ex.exerciseName, {
          weight: set.weightKg,
          reps: set.reps,
          date: w.date,
        });
      }
    }
    for (const ex of w.exercises) {
      sessionCounts[ex.exerciseName] =
        (sessionCounts[ex.exerciseName] || 0) + 1;
    }
  }
  return { count: fired.size, best };
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
    end === null ? where("date", "<", start) : where("date", ">=", start),
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
  const { isPro } = useSubscription();
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
        // Performance docs are keyed by COMPUTE date (PI1a), not week
        // start. The doc named after this week's Monday is the compute
        // from the week's first morning — LAST week's number — and on
        // many days no doc carries that exact id at all. The compute that
        // summarises the reviewed week landed after it ended: the latest
        // in (weekKey, weekKey + 7d]. The previous week's is the latest
        // at or before weekKey. Read by range, never by id.
        const nextKey = weekKeyMinusN(weekKey, -1);

        const [
          weekWorkoutDocs,
          savedRuns,
          mealsSnap,
          weighIns,
          perfSnap,
          prevPerfSnap,
          baselineDocs,
          programStateSnap,
        ] = await Promise.all([
          // The week's workouts and runs through their one readers, with
          // any finished on this phone and not yet synced.
          fetchSavedWorkouts(user.uid, { since: start, until: end }),
          // The week's runs by their Lift3 day, through the saved-run
          // reader: runs saved before `date` existed are no longer left out.
          fetchSavedRuns(user.uid, { since: start, until: end }),
          getDocs(
            query(
              collection(db, "users", user.uid, "meals"),
              where("date", ">=", start),
              where("date", "<=", end)
            )
          ),
          fetchBodyweightLogs(user.uid),
          getDocs(
            query(
              collection(db, "users", user.uid, "performance"),
              where("weekKey", ">", weekKey),
              where("weekKey", "<=", nextKey),
              orderBy("weekKey", "desc"),
              limit(1)
            )
          ),
          getDocs(
            query(
              collection(db, "users", user.uid, "performance"),
              where("weekKey", "<=", weekKey),
              orderBy("weekKey", "desc"),
              limit(1)
            )
          ),
          fetchSavedWorkouts(user.uid, {
            latest: PR_BASELINE_LIMIT,
            before: start,
          }),
          getDoc(doc(db, "users", user.uid, "programState", "current")),
        ]);
        if (cancelled) return;

        const workouts = weekWorkoutDocs.map((w) => ({
          date: w.date,
          tonnageKg: workoutTonnageKg(w),
        }));

        const runs = savedRuns.map((run) => ({
          date: run.day,
          distanceMeters: run.distance,
          eligible: isVolumeEligible(run),
        }));

        // One entry per day with ≥1 active (non-deleted) meal.
        const byDay = new Map<string, number>();
        for (const d of mealsSnap.docs) {
          const m = d.data() as Record<string, unknown>;
          // HOME-MEALS-01 via the shared predicate — this was a correct
          // hand-written copy of the rule, which is exactly how a rule
          // ends up with several owners and one of them drifts.
          if (!isActiveMealDoc(m)) continue;
          if (typeof m.date !== "string") continue;
          const cals =
            typeof m.totalCalories === "number" ? m.totalCalories : 0;
          byDay.set(m.date, (byDay.get(m.date) || 0) + cals);
        }
        const mealDays = [...byDay.entries()].map(([date, calories]) => ({
          date,
          calories,
        }));

        const perfData = perfSnap.empty
          ? null
          : (perfSnap.docs[0].data() as Record<string, unknown>);
        const prevPerfData = prevPerfSnap.empty
          ? null
          : (prevPerfSnap.docs[0].data() as Record<string, unknown>);
        const perf =
          perfData && typeof perfData.performanceIndex === "number"
            ? {
                pi: perfData.performanceIndex,
                // Canonical read, BOTH fields. The deload half was moved to
                // the resolver on 2026-08-09; the band beside it kept its
                // raw `typeof === "string"` read, under a comment that said
                // "canonical" and made the pair look finished. Half a fix
                // reads worse than none, because it stops anyone looking.
                //
                // Three things the raw read got wrong, all of which end as
                // Weekly Review disagreeing with Home about the same week:
                //   - no derivation. `resolveLoadBand` is TOTAL — it falls
                //     back to `computeLoadBand(pi)`, the same pure function
                //     every writer used to produce the stored value. The
                //     raw read yields null on a doc that predates the
                //     field, and `verdictFor` then drops to delta copy
                //     ("Steady week.") while Home says "Backing off".
                //   - no validation. "Overreach" or a renamed enum passes
                //     `typeof === "string"` and then matches none of the
                //     `=== "overreach"` comparisons, so it silently reads
                //     as an unbanded week rather than being rejected.
                //   - no `labels.loadBand` legacy fallback.
                loadBand: resolveLoadBand(
                  perfData as Parameters<typeof resolveLoadBand>[0]
                ),
                deloadRecommended: resolveDeloadRecommended(
                  perfData as Parameters<typeof resolveDeloadRecommended>[0]
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
          ? (profile.weekSchedule as { day?: number; type?: string }[])
          : [];
        // The week the account began counts from the day it began
        // (startDay.ts): a Friday sign-up planned no Monday lift.
        const startKey = startDayKey(profile?.createdAt);
        const liftDaysReviewed = scheduledDaysSinceStart(
          schedule,
          ["lift", "both"],
          weekKey,
          startKey
        );
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
        const currentWeekKey = localWeekKey(new Date());
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
          ...(() => {
            const bests = weekNewBests(baselineDocs, weekWorkoutDocs);
            return { prsHit: bests.count || null, bestMoment: bests.best };
          })(),
          perf,
          prevPi,
          plannedLifts: liftDaysReviewed > 0 ? liftDaysReviewed : null,
          plannedRuns,
          startKey,
          /* Resolved through the SAME precedence the PI's adherence
             scoring uses (adaptiveTarget's snapshot resolver, the pinned
             client copy of calorieTargetResolution.js) — not raw
             `targetCalories`, which for an engaged adaptive-TDEE user is
             the number the app deliberately stopped showing. This surface
             already knows the adaptive layer exists (adaptiveRetunedInWeek
             below); quoting the pre-adaptive target beside that would have
             the recap contradict both the app's guidance and the PI it
             sits next to. */
          calorieTarget:
            resolveSnapshotCalorieTarget(profile, isPro)?.value ?? null,
          adaptiveRetunedInWeek: retuned,
          hideWeightNumber: Boolean(profile?.hideWeightNumber),
          established,
          weekAhead: {
            lifts: liftDays > 0 ? liftDays : null,
            runs: weekAheadRuns,
            phaseNote,
          },
          goalProfile: profile
            ? {
                goalWeightKg: profile.goalWeightKg,
                weeklyRateKg: profile.weeklyRateKg,
                program: profile.program,
              }
            : null,
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
