import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";

interface StallModalProps {
  exercise: { name: string; weight: number };
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

  const handleAdjust = async () => {
    if (profile) {
      const current = profile.customCalorieTarget || profile.targetCalories || 2200;
      await updateProfile({ customCalorieTarget: current + 150 });
      toast.success('Calorie target increased by 150');
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
      description={`You've been at ${exercise.weight}kg on ${exercise.name} for 3 sessions. A small calorie increase (~150 cal/day) could help you break through.`}
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
