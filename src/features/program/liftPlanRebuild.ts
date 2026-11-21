/**
 * Building and saving a person's lift plan from their setup, as the lift
 * plan editor's Save changes does and as Train's "Rebuild for 45 min" does
 * (slice 4 of `docs/training-deep-dive-2026-11/build-plan.md`). One place
 * assembles the builder's input from the stored profile
 * (`liftPlanInput.ts`), so the two never build a plan from different
 * readings of the same setup.
 */

import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";
import {
  describeRejection,
  isRateLimitedRejection,
  PLAN_SAVES_TOO_OFTEN,
} from "@/lib/callableErrors";
import type { UserProfile } from "@/lib/auth";
import type { DatedRun, LayoffClass } from "./layoffDetection";
import { buildPlan } from "./planBuilder";
import type { ProgramState } from "./programTypes";
import { liftPlanInput, savedLiftPlan } from "./liftPlanInput";

export {
  liftPlanInput,
  savedLiftPlan,
  VALID_SPLIT_CHOICES,
  type LiftPlanDraft,
  type SavedLiftPlan,
  type SplitChoice,
} from "./liftPlanInput";

/**
 * Saves a built plan through the `configurePlan` callable, against the
 * programme and profile it was built on, so a change made elsewhere in
 * between is refused rather than overwritten.
 */
export async function configureLiftPlan(
  plan: ReturnType<typeof buildPlan>,
  profile: UserProfile,
  programState: ProgramState | null
): Promise<void> {
  // A lift plan save never changes the race. configurePlan stores the goal
  // it is sent whole, so it gets the stored one, with the race link and goal
  // time buildPlan does not carry.
  if (plan.profileUpdates.raceGoal && profile.raceGoal) {
    plan.profileUpdates.raceGoal = profile.raceGoal;
  }
  const configurePlan = httpsCallable(functions, "configurePlan");
  await configurePlan({
    baseProgramState: programState ?? null,
    baseProfile: Object.fromEntries(
      Object.keys(plan.profileUpdates)
        .filter(
          (key) =>
            (profile as unknown as Record<string, unknown>)[key] !== undefined
        )
        .map((key) => [
          key,
          (profile as unknown as Record<string, unknown>)[key],
        ])
    ),
    profileUpdates: plan.profileUpdates,
    programState: plan.programState,
    weekSchedule: plan.weekSchedule,
  });
}

/**
 * Train's "Rebuild for N min" (slice 4): the lift days built again from the
 * saved setup to fit `length`, the session length the plan is fitted to,
 * and saved. The week, its done days and the history stay; each lift keeps
 * its weight where a new day holds it. `length` is the one the notice
 * names, so the button builds what it says.
 */
export async function rebuildLiftDaysFor(
  length: number,
  {
    profile,
    programState,
    recentLayoff,
    recentRuns,
  }: {
    profile: UserProfile;
    programState: ProgramState;
    recentLayoff: LayoffClass;
    recentRuns: readonly DatedRun[] | null;
  }
): Promise<void> {
  const saved = savedLiftPlan(profile);
  const plan = buildPlan(
    liftPlanInput({
      profile,
      programState,
      saved,
      draft: { ...saved, sessionMinutes: length },
      recentLayoff,
      recentRuns,
      rebuildLiftDays: true,
    })
  );
  await configureLiftPlan(plan, profile, programState);
}

/**
 * What a refused plan save says, for the lift plan editor and Train's
 * rebuild alike. A plan changed elsewhere since it was read (`refresh`)
 * reloads the profile first; the server's own sentence wins when it wrote
 * one, else `changed`, the caller's words for that case.
 */
export function planSaveRejection(
  err: unknown,
  changed: string
): { message: string; refresh: boolean } {
  const code = (err as { code?: string } | null)?.code;
  if (code === "functions/unauthenticated" || code === "unauthenticated") {
    return { message: "Sign in again to update your plan.", refresh: false };
  }
  if (code?.endsWith("failed-precondition")) {
    return { message: describeRejection(err) ?? changed, refresh: true };
  }
  if (code === "functions/invalid-argument" || code === "invalid-argument") {
    return {
      message: "Plan didn’t validate. Try a different combination.",
      refresh: false,
    };
  }
  if (isRateLimitedRejection(err)) {
    return { message: PLAN_SAVES_TOO_OFTEN, refresh: false };
  }
  return { message: "Couldn’t save your plan. Try again.", refresh: false };
}
