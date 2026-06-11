import { useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth";
import { useRunningStats } from "./useRunningStats";
import { isPaceEligible } from "@/lib/runStatsEligibility";
import { deriveBenchmarkFromRuns, vdotFromRace } from "@/lib/runPaces";
import { logger } from "@/lib/logger";

/**
 * Adaptive Paces — silent benchmark auto-derive (the "derive" half of the
 * locked capture decision §10). When a user has NO `runFitness` set but has
 * enough credible outdoor runs, derive a benchmark from their best effort and
 * persist it (`source: "derived"`) so personalized paces activate without them
 * having to enter a race in Settings.
 *
 * Mounted once on the Programme page. Conservative + guarded:
 *  - only when the profile is loaded and `runFitness` is absent
 *  - only outdoor-GPS, non-invalid runs (`isPaceEligible`), ≥ MIN_RUNS of them
 *  - writes exactly once per mount (`firedRef`) and never overwrites a
 *    user-set benchmark (the absence check + the manual "manual" source win,
 *    since once written `runFitness` is set and this early-returns).
 */
const MIN_RUNS = 3;

/** Pure policy: the benchmark to auto-derive, or null (already has fitness /
 *  too few eligible runs). Extracted for unit testing. */
export function resolveAutoDeriveBenchmark(
  hasFitness: boolean,
  eligible: { distanceM: number; durationS: number }[]
): { distanceM: number; timeS: number } | null {
  if (hasFitness) return null;
  if (eligible.length < MIN_RUNS) return null;
  return deriveBenchmarkFromRuns(eligible);
}

export function useRunFitnessAutoDerive(): void {
  const { profile, updateProfile } = useAuth();
  const { runs, loading } = useRunningStats(90);
  const firedRef = useRef(false);

  useEffect(() => {
    if (firedRef.current) return;
    if (!profile || loading) return;
    if (profile.runFitness) return; // user-set or already derived

    const eligible = runs
      .filter((r) => isPaceEligible(r))
      .map((r) => ({ distanceM: r.distance, durationS: r.duration }));

    const benchmark = resolveAutoDeriveBenchmark(false, eligible);
    if (!benchmark) return;

    firedRef.current = true;
    const vdot = vdotFromRace(benchmark.distanceM, benchmark.timeS);
    void updateProfile({
      runFitness: {
        benchmark,
        vdot: Math.round(vdot * 10) / 10,
        source: "derived",
        updatedAt: new Date().toISOString(),
      },
    }).catch((e) => logger.error("[useRunFitnessAutoDerive] failed", e));
  }, [profile, runs, loading, updateProfile]);
}
