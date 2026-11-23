import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { readRunHistory } from "@/lib/savedRuns";
import { runEffortSeconds } from "@/lib/runEfforts";
import { FASTEST_EFFORT_METERS } from "@/lib/postMoments";
import { isPaceEligible } from "@/lib/runStatsEligibility";
import {
  runPlacings,
  type PlacedRun,
  type RunPlacing,
} from "@/lib/runPlacings";
import {
  placingHistory,
  subscribePlacingHistory,
} from "@/lib/runPlacingHistory";

/** Whether a run could place at all: pace-eligible, with a 1K, 5K or 10K. */
function canPlace(run: PlacedRun | null): run is PlacedRun {
  return (
    run !== null &&
    isPaceEligible(run) &&
    FASTEST_EFFORT_METERS.some((m) => runEffortSeconds(run, m) !== null)
  );
}

/**
 * A saved run's top three (Run29) as its page shows them: the place its
 * 1K, 5K and 10K hold among the runs that started before it, as those runs
 * are now. A run deleted since, or saved since but started earlier, moves
 * it, so it need not be the place its finish showed.
 *
 * Ranked from the run history held for the session (`runPlacingHistory`),
 * which the finish and Bests fill as they read it, so a page opened after
 * either reads no runs. With none held, or only one that may be
 * incomplete, the page reads the history once (`readRunHistory`), and only
 * for a run that could place. Empty while that read is out, when it fails,
 * when the history may be incomplete (offline, or answered from this
 * phone's cache), and for a run that placed nowhere.
 */
export function useRunPlacings(
  uid: string | null | undefined,
  run: PlacedRun | null
): RunPlacing[] {
  const wanted = uid && canPlace(run) ? uid : null;
  const history = useSyncExternalStore(subscribePlacingHistory, () =>
    wanted ? placingHistory(wanted) : null
  );
  const known = history?.known === true;

  /* One read per account while the page is open: an offline read that
     comes back incomplete is not retried in a loop. */
  const askedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!wanted || known || askedFor.current === wanted) return;
    askedFor.current = wanted;
    void readRunHistory(wanted);
  }, [wanted, known]);

  /* Memoised: the route replay re-renders the page twenty times a
     second. */
  return useMemo(
    () =>
      wanted && run && history?.known ? runPlacings(run, history.runs) : [],
    [wanted, run, history]
  );
}
