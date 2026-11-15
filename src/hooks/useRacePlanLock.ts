import { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { useSubscription } from "@/lib/subscription";
import {
  racePlanFreeWeekToRecord,
  racePlanLocked,
  type RacePlanLockInput,
} from "@/lib/racePlanAccess";

/**
 * Whether this account's half or full marathon plan has moved past its free
 * first week (whole-app grill Q85). `runPlan` is the caller's
 * `programState.runPlan`; the account's tier and race come from here.
 *
 * The free week is once per account: the first time a free account's plan
 * passes it, this records it on the profile (`racePlanFreeWeekUsed`), so a
 * new race goal's plan does not start a second free week. Home, Train's Run
 * tab and the Run page all read this, so whichever opens first records it.
 */
export function useRacePlanLocked(
  runPlan: RacePlanLockInput["runPlan"]
): boolean {
  const { profile, updateProfile } = useAuth();
  const { isPro } = useSubscription();
  const input: RacePlanLockInput = {
    isPro,
    runPlan,
    raceDistance: profile?.raceGoal?.distance ?? null,
    freeWeekUsed: profile?.racePlanFreeWeekUsed === true,
  };
  const record = !!profile && racePlanFreeWeekToRecord(input);
  useEffect(() => {
    if (!record) return;
    const save = async () => {
      try {
        await updateProfile(
          { racePlanFreeWeekUsed: true },
          { throwOnError: true }
        );
      } catch (error) {
        // The plan is locked either way; the next visit tries again.
        logger.warn("[racePlan] free week not recorded", error);
      }
    };
    void save();
  }, [record, updateProfile]);
  return racePlanLocked(input);
}
