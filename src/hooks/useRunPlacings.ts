import { useEffect, useMemo, useState } from "react";
import { logger } from "@/lib/logger";
import { fetchSavedRuns, type SavedRun } from "@/lib/savedRuns";
import { runEffortSeconds } from "@/lib/runEfforts";
import { FASTEST_EFFORT_METERS } from "@/lib/postMoments";
import { isPaceEligible } from "@/lib/runStatsEligibility";
import {
  runPlacings,
  type PlacedRun,
  type RunPlacing,
} from "@/lib/runPlacings";

/** Whether a run could place at all: pace-eligible, with a 1K, 5K or 10K. */
function canPlace(run: PlacedRun | null): run is PlacedRun {
  return (
    run !== null &&
    isPaceEligible(run) &&
    FASTEST_EFFORT_METERS.some((m) => runEffortSeconds(run, m) !== null)
  );
}

/**
 * A saved run's top three (Run29) as its page shows them: where its 1K, 5K
 * and 10K placed among the runs before it, the place it took that day, as
 * its finish screen said. One read of every saved run, made only for a run
 * that could place; empty while it loads, when it fails, and for a run
 * that placed nowhere.
 */
export function useRunPlacings(
  uid: string | null | undefined,
  run: PlacedRun | null
): RunPlacing[] {
  const wanted = uid && canPlace(run) ? `${uid}/${run.id}` : null;
  const [read, setRead] = useState<{
    key: string;
    runs: SavedRun[];
  } | null>(null);

  useEffect(() => {
    if (!wanted || !uid) return;
    let live = true;
    fetchSavedRuns(uid, { all: true })
      .then((runs) => {
        if (live) setRead({ key: wanted, runs });
      })
      .catch((err) => {
        logger.warn("[runPlacings] the run history could not be read", err);
      });
    return () => {
      live = false;
    };
  }, [uid, wanted]);

  /* Memoised: the route replay re-renders the page twenty times a
     second. */
  const runs = read?.key === wanted ? read.runs : null;
  return useMemo(
    () => (wanted && run && runs ? runPlacings(run, runs) : []),
    [wanted, run, runs]
  );
}
