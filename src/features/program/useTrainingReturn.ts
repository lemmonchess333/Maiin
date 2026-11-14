import { useMemo } from "react";
import type { UserProfile } from "@/lib/auth";
import type { RunWindow } from "@/lib/savedRuns";
import { useSavedRuns } from "@/hooks/useSavedRuns";
import type { ProgramState } from "./programTypes";
import { datedRuns, RECENT_RUN_SCAN_LIMIT } from "./fetchRecentLayoff";
import type { DatedWorkout } from "./liftLayoff";
import { runningPlan } from "./runReturn";
import {
  assessTrainingReturn,
  liftingPlan,
  type TrainingReturn,
} from "./trainingReturn";

/** The runs the return reads: the newest ones, as many as the race plan's
 *  re-entry reads (`fetchRecentLayoff`), so the two measure the same
 *  absence. Module-level, so the window keeps one identity. */
const RETURN_WINDOW: RunWindow = { latest: RECENT_RUN_SCAN_LIMIT };

/**
 * Home's one return check (`trainingReturn.ts`, App1 Q35): the logged lifts
 * Home already holds and the saved runs, read live through the saved-run
 * reader.
 *
 * A plan with no running reads no runs at all. The run side waits for two
 * things: the programme, which can say a race is over or in its recovery
 * weeks and so change the offer; and a server-confirmed read, since a
 * cached list can be missing yesterday's run from another phone. Offline,
 * or with a run waiting to sync, it greets no runner, which is the safe
 * way round. The lift side answers from the lifts as they stand, as it
 * always has.
 */
export function useTrainingReturn(input: {
  profile: UserProfile | null;
  programState: ProgramState | null;
  programLoading: boolean;
  todayKey: string;
  /** The logged lifts Home holds (`useWorkouts`). */
  workouts: readonly DatedWorkout[];
}): TrainingReturn {
  const { profile, programState, programLoading, todayKey, workouts } = input;
  const running = useMemo(
    () => runningPlan(profile, programState, todayKey),
    [profile, programState, todayKey]
  );
  const lifting = useMemo(() => liftingPlan(profile), [profile]);
  const read = useSavedRuns(running === "none" ? null : RETURN_WINDOW);
  return useMemo(
    () =>
      assessTrainingReturn({
        workouts,
        runs:
          programLoading || !read.evidenceReady ? null : datedRuns(read.runs),
        todayKey,
        lifting,
        running,
      }),
    [
      workouts,
      programLoading,
      read.evidenceReady,
      read.runs,
      todayKey,
      lifting,
      running,
    ]
  );
}
