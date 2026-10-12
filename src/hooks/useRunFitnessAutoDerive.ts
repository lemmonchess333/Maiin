import { useEffect, useRef } from "react";
import { useAuth, type UserProfile } from "@/lib/auth";
import { useRunningStats } from "./useRunningStats";
import {
  benchmarkEffortOf,
  benchmarkEfforts,
  type EffortRun,
} from "@/lib/benchmarkEfforts";
import {
  bestEffort,
  derivedFitness,
  type BenchmarkEffort,
  type DerivedFitness,
} from "@/lib/runPaces";
import { logger } from "@/lib/logger";

/**
 * Adaptive Paces — the benchmark the app derives, the "derive" half of the
 * capture decision (adaptive paces §10.2). Pgm8 R1 (owner-delegated)
 * narrowed "derive silently from early runs" to early efforts: a
 * race, a time trial or a tempo's work segments (`benchmarkEfforts.ts`),
 * never easy runs, and setup's optional recent 5K or 10K time (R11) gives a
 * new runner one from the start. When a runner has no `runFitness`, the best
 * effort of their last 90 days becomes one (`source: "derived"`), so
 * personalised paces can start without them entering a race in Settings.
 *
 * Mounted once on the Programme page. Conservative and guarded:
 *  - only once the profile and the runs are loaded;
 *  - never over a benchmark the person set: setup's recent race time and
 *    Settings' entry are `source: "manual"`, and a derived one they accepted
 *    is theirs;
 *  - writes at most once per mount (`firedRef`).
 *
 * One effort is enough. The old gate, three runs, was there to pick the best
 * of a few easy runs, which were all it had to read; a race or a tempo is a
 * reading on its own, as the race time a person types in Settings is. What
 * it derives lands pending (RUN-EV-08), so no prescription changes until the
 * person accepts it, and Settings can remove it.
 */
const WINDOW_DAYS = 90;

type RunFitness = NonNullable<UserProfile["runFitness"]>;

/** What the derive writes. */
export interface AutoDerive {
  /** The new `runFitness`: a pending derived benchmark, or null to clear one
   *  the old rule set when no effort is left to derive one from. */
  runFitness: RunFitness | null;
  /** The effort it came from; null when clearing. */
  effort: BenchmarkEffort | null;
}

/** Whether a stored benchmark is the one the effort rule gives. */
function sameBenchmark(stored: RunFitness, derived: DerivedFitness): boolean {
  const a = stored.benchmark;
  const b = derived.benchmark;
  const sameRace =
    a == null
      ? b === null
      : b !== null && a.distanceM === b.distanceM && a.timeS === b.timeS;
  return sameRace && stored.vdot === derived.vdot;
}

/**
 * A pending derived benchmark the effort rule wouldn't set: one derived from
 * an easy run before R1, or from a tempo read whole as a race. It was never
 * accepted, so it is measurement-only, and RUN-EV-08 lets those change with
 * their provenance shown; it follows the rule like a new one. Judged on
 * positive evidence only: its run is among the runs loaded, and the rule
 * reads that run differently. One whose run is out of the window stays.
 */
function setByAnOldRule(
  fitness: RunFitness,
  runs: readonly EffortRun[]
): boolean {
  if (fitness.source !== "derived" || fitness.pendingConfirmation !== true)
    return false;
  const run = fitness.sourceRunId
    ? runs.find((r) => r.id === fitness.sourceRunId)
    : undefined;
  if (!run) return false;
  const effort = benchmarkEffortOf(run);
  const best = effort ? bestEffort([effort]) : null;
  return !best || !sameBenchmark(fitness, derivedFitness(best));
}

/**
 * Pure policy: what the derive writes for this profile's `runFitness` and
 * these runs (the window's, as loaded), or null for nothing. The simulator
 * calls it too, so it can't drift from the app.
 */
export function resolveAutoDerive(
  fitness: UserProfile["runFitness"] | undefined,
  runs: readonly EffortRun[],
  now: Date
): AutoDerive | null {
  if (fitness && !setByAnOldRule(fitness, runs)) return null;
  const best = bestEffort(benchmarkEfforts(runs));
  if (!best) return fitness ? { runFitness: null, effort: null } : null;
  return {
    runFitness: {
      ...derivedFitness(best),
      source: "derived",
      updatedAt: now.toISOString(),
      // RUN-EV-08 two-tier consent (owner decision 2026-08-09): the derive
      // lands PENDING, with its provenance (which run set it). Measurement
      // surfaces use it at once; prescriptions (pace targets, prefills)
      // stay on template paces until the person accepts it in Settings →
      // Run fitness. `prescriptivePaceTableFromFitness` enforces the split.
      pendingConfirmation: true,
    },
    effort: best.effort,
  };
}

export function useRunFitnessAutoDerive(): void {
  const { profile, updateProfile } = useAuth();
  const { runs, loading } = useRunningStats(WINDOW_DAYS);
  const firedRef = useRef(false);

  useEffect(() => {
    if (firedRef.current) return;
    if (!profile || loading) return;
    const next = resolveAutoDerive(profile.runFitness, runs, new Date());
    if (!next) return;
    firedRef.current = true;
    void updateProfile({ runFitness: next.runFitness }).catch((e) =>
      logger.error("[useRunFitnessAutoDerive] failed", e)
    );
  }, [profile, runs, loading, updateProfile]);
}
