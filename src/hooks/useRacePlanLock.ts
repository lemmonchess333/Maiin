import { useAuth } from "@/lib/auth";
import { useSubscription } from "@/lib/subscription";
import { racePlanLocked, type RacePlanLockInput } from "@/lib/racePlanAccess";

/**
 * Whether this account's half or full marathon plan has moved past its free
 * first week (whole-app grill Q85). `runPlan` is the caller's
 * `programState.runPlan`; the account's tier and race come from here.
 */
export function useRacePlanLocked(
  runPlan: RacePlanLockInput["runPlan"]
): boolean {
  const { profile } = useAuth();
  const { isPro } = useSubscription();
  return racePlanLocked({
    isPro,
    runPlan,
    raceDistance: profile?.raceGoal?.distance ?? null,
  });
}
