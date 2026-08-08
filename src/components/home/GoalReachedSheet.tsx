/**
 * Goal-reached prompt — the moment the nutrition engine acknowledges arrival.
 *
 * The gap this closes (probe sweep 2026-08-05, verifier-confirmed): the
 * nutrition direction was re-resolved ONLY inside a Settings edit session, so
 * a cutter who reached their goal kept the full −550 deficit indefinitely —
 * including through the adaptive-TDEE path, which re-applies the stale signed
 * rate to the learned maintenance estimate. MacroFactor and MFP both surface
 * a "goal reached" moment and ASK; neither silently flips, and neither
 * silently keeps cutting. Asking is also this repo's standing rule: never
 * silently rewrite a user decision.
 *
 * Asked ONCE per goal value (uid- and goal-scoped dismissal): the deadband
 * means weight wobbles in and out of "arrived", and a prompt that re-fires on
 * every wobble is a nag, not a coach. Changing the goal in Settings re-arms
 * the ask for the new goal.
 *
 * "Switch to maintenance" applies the SAME persist recipe Settings uses
 * (buildGoalWeightPersistPayload → buildMaintenancePayload) plus the same
 * programState.goal mirror — one source of truth, so this sheet cannot drift
 * from what the Settings surface would write.
 */
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { setDocGuarded } from "@/lib/firestoreWrite";
import { toast } from "@/lib/toast";
import { logger } from "@/lib/logger";
import { ChoiceSheet, type Choice } from "@/components/ui/ChoiceSheet";
import {
  buildMaintenancePayload,
  type GoalReachedOffer,
} from "@/lib/goalWeightPlan";
import { resolveProgramGoalMirror } from "@/pages/settings/resolveProgramGoalMirror";
import type { FitnessGoal } from "@/lib/tdee";
import type { UserProfile, UpdateProfileResult } from "@/lib/auth";

interface GoalReachedSheetProps {
  open: boolean;
  offer: GoalReachedOffer;
  profile: UserProfile;
  uid: string;
  updateProfile: (
    patch: Partial<UserProfile>,
    options?: { throwOnError?: boolean }
  ) => Promise<UpdateProfileResult>;
  /** Fires on ANY resolution — both choices and outside-tap. The caller
   *  persists the once-per-goal dismissal here, so the ask never nags. */
  onResolved: () => void;
}

export default function GoalReachedSheet({
  open,
  offer,
  profile,
  uid,
  updateProfile,
  onResolved,
}: GoalReachedSheetProps) {
  const arrivedWord = offer.storedDirection === "lose" ? "down" : "up";

  const switchToMaintenance = async () => {
    const payload = buildMaintenancePayload(profile);
    if (!payload) throw new Error("no current weight to anchor maintenance");
    await updateProfile(payload, { throwOnError: true });
    // Same programState.goal mirror as SettingsNutrition — the profile copy
    // (macros) and the programState copy (lift rep scheme / header) must not
    // drift after a phase change. Best-effort with the same error discipline.
    try {
      const programRef = doc(db, "users", uid, "programState", "current");
      const snap = await getDoc(programRef);
      const storedGoal = snap.exists()
        ? (snap.data().goal as FitnessGoal | undefined)
        : undefined;
      const mirror = resolveProgramGoalMirror(payload.program.goal, storedGoal);
      if (mirror !== null) {
        await setDocGuarded(programRef, { goal: mirror }, { merge: true });
      }
    } catch (error) {
      logger.error("[GoalReachedSheet] programState goal mirror failed", error);
    }
    onResolved();
    toast.success("Maintenance calories set. Nice work.");
  };

  const keepPlan = async () => {
    onResolved();
  };

  const choices: Choice[] = [
    {
      id: "maintain",
      label: "Switch to maintenance",
      pendingLabel: "Switching…",
      variant: "primary",
      onSelect: switchToMaintenance,
    },
    {
      id: "keep",
      label: "Keep my current plan",
      variant: "secondary",
      onSelect: keepPlan,
    },
  ];

  return (
    <ChoiceSheet
      open={open}
      // Outside-tap / Escape / swipe resolve as "keep" — the ask is once per
      // goal either way, so dismissing is a decision, not a snooze.
      onClose={onResolved}
      title="You've reached your goal weight"
      description={`You set ${offer.goalWeightKg.toFixed(1).replace(/\.0$/, "")} kg and you're there. Keep pushing ${arrivedWord}, or hold steady at maintenance calories?`}
      choices={choices}
      logTag="goalReached"
    />
  );
}
