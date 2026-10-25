import { useMemo } from "react";
import type { UserProfile } from "@/lib/auth";
import type { RunWindow } from "@/lib/savedRuns";
import { useSavedRuns } from "@/hooks/useSavedRuns";
import type { ProgramState } from "./programTypes";
import { datedRuns, RECENT_RUN_SCAN_LIMIT } from "./fetchRecentLayoff";
import {
  assessRunReturn,
  runningPlan,
  type RunReturnAssessment,
} from "./runReturn";

/** The runs the welcome back reads: the newest ones, as many as the race
 *  plan's re-entry reads (`fetchRecentLayoff`), so the two measure the same
 *  absence. Module-level, so the window keeps one identity. */
const RETURN_WINDOW: RunWindow = { latest: RECENT_RUN_SCAN_LIMIT };

const NOT_YET: RunReturnAssessment = {
  daysAway: null,
  dismissKey: null,
  offer: null,
};

/**
 * Home's run return (`runReturn.ts`), read live through the saved-run
 * reader.
 *
 * A plan with no running reads no runs at all. The answer waits for two
 * things: the programme, which can say a race is over or in its recovery
 * weeks and so change the offer; and a server-confirmed read, since a
 * cached list can be missing yesterday's run from another phone. Offline,
 * or with a run waiting to sync, it greets no one, which is the safe way
 * round.
 */
export function useRunReturn(input: {
  profile: UserProfile | null;
  programState: ProgramState | null;
  programLoading: boolean;
  todayKey: string;
}): RunReturnAssessment {
  const { profile, programState, programLoading, todayKey } = input;
  const plan = useMemo(
    () => runningPlan(profile, programState, todayKey),
    [profile, programState, todayKey]
  );
  const read = useSavedRuns(plan === "none" ? null : RETURN_WINDOW);
  return useMemo(() => {
    if (programLoading || plan === "none") return NOT_YET;
    return assessRunReturn({
      plan,
      runs: read.evidenceReady ? datedRuns(read.runs) : null,
      todayKey,
    });
  }, [programLoading, plan, read.evidenceReady, read.runs, todayKey]);
}
