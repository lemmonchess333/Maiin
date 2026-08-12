import { useAuth } from "@/lib/auth";
import { useEffectiveTargets } from "@/hooks/useEffectiveTargets";
import { buildCalorieOverridePayload } from "@/lib/goalWeightPlan";
import { toast } from "@/lib/toast";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";

interface StallModalProps {
  exercise: { name: string; weight: number; isBodyweight?: boolean };
  onClose: () => void;
}

/**
 * Sprint 3: migrated onto the shared <Dialog> primitive. Pre-Sprint-3
 * this modal used role="button" on a backdrop <div> (Sprint 1 audit
 * anti-pattern — phantom Tab stop, inconsistent SR announcement) and
 * had no escape handler. Dialog provides escape, backdrop dismiss,
 * focus trap, and aria-labelledby out of the box. Buttons also
 * migrated to the Button primitive for the 44px touch-target +
 * focus-ring contract.
 *
 * Always-open while mounted: the parent controls visibility via
 * mount/unmount, so we pass open={true} statically. onClose is
 * routed to all dismissal paths (escape, backdrop, both buttons).
 */
export default function StallModal({ exercise, onClose }: StallModalProps) {
  const { profile, updateProfile } = useAuth();
  // Adaptive is only ON while there is no manual override, so a user who
  // already has one loses nothing here and shouldn't be warned.
  const adaptiveOn = !profile?.customCalorieTarget;
  // The number the user is actually LOOKING AT on Home and Food, which is
  // what "+150" has to mean. `profile.targetCalories` is the formula anchor
  // and deliberately never moves once the adaptive layer engages, so basing
  // the bump on it silently reset a Pro user to a stale figure — a target of
  // 2919 became 2500 under a toast reading "increased by 150".
  const { finalTarget } = useEffectiveTargets();

  const handleAdjust = async () => {
    if (profile) {
      // Through the shared recipe, so `targetCalories` and all three macro
      // targets follow the override. Writing `customCalorieTarget` alone
      // leaves every mirror stale — the exact failure documented on
      // buildGoalWeightPersistPayload's effectiveTdee block.
      const result = await updateProfile(
        buildCalorieOverridePayload({
          profile,
          overrideCalories: finalTarget + 150,
        })
      );
      // Success toast only fires when the write landed — without this
      // gate the modal cheerfully reported "increased by 150" even
      // when the Firestore write failed, and stamped the localStorage
      // suppression key so the user couldn't retry from this surface.
      // updateProfile already toasts on failure with its own copy.
      if (!result.ok) return;
      toast.success("Calorie target increased by 150");
    }
    localStorage.setItem(`tropos_stall_${exercise.name}`, String(Date.now()));
    onClose();
  };

  const handleDismiss = () => {
    localStorage.setItem(`tropos_stall_${exercise.name}`, String(Date.now()));
    onClose();
  };

  return (
    <Dialog
      open
      onClose={handleDismiss}
      title="Plateau detected"
      description={
        // A bodyweight lift stalls on REPS — saying "at 0kg" there would be
        // both meaningless and, on the uncalibrated case this modal used to
        // fire on, actively wrong.
        (exercise.isBodyweight
          ? `${exercise.name} has held the same reps for 3 sessions.`
          : `You've been at ${exercise.weight}kg on ${exercise.name} for 3 sessions.`) +
        ` A small calorie increase (~150 cal/day) could help you break through.` +
        // Naming the real consequence: this writes a MANUAL calorie override,
        // and a manual override is what switches adaptive calories off.
        (adaptiveOn
          ? " This sets a manual target, which turns off adaptive calories until you reset it in Settings."
          : "")
      }
      size="sm"
    >
      <div className="flex gap-3 pt-1">
        <Button onClick={handleAdjust} className="flex-1">
          Adjust target (+150 cal)
        </Button>
        <Button onClick={handleDismiss} variant="ghost">
          Not now
        </Button>
      </div>
    </Dialog>
  );
}
