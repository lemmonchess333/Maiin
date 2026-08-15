import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";

/**
 * One-time steps priming modal (surface B of the HealthKit steps work,
 * POST_LAUNCH.md "Steps tile"). Fires at most once per account: whichever
 * choice the user makes, the caller persists `primingShown: true` so it never
 * nags again — the same rationale as the notification-priming pattern in
 * NotificationsSection.
 *
 * Copy follows docs/voice-and-tone.md: plain and calm, action copy is a verb,
 * no hype. Built on the shared Dialog primitive (focus trap, escape, backdrop,
 * scroll-lock, aria) with the canonical two-button footer.
 */
export default function StepsPrimingModal({
  open,
  onConnect,
  onDismiss,
}: {
  open: boolean;
  /** Connect Apple Health — persists primingShown + connected, then closes. */
  onConnect: () => Promise<void>;
  /** "Not now" / backdrop / escape — persists primingShown, then closes. */
  onDismiss: () => void;
}) {
  const [connecting, setConnecting] = useState(false);

  return (
    <Dialog
      open={open}
      onClose={onDismiss}
      title="Count your steps"
      description="See your daily step count on Home, pulled from Apple Health."
      size="sm"
    >
      <div className="flex gap-2 pt-1">
        <Button
          onClick={onDismiss}
          variant="secondary"
          className="flex-1"
          disabled={connecting}
        >
          Not now
        </Button>
        <Button
          onClick={async () => {
            setConnecting(true);
            try {
              await onConnect();
            } finally {
              setConnecting(false);
            }
          }}
          variant="primary"
          className="flex-1"
          loading={connecting}
        >
          Connect Apple Health
        </Button>
      </div>
    </Dialog>
  );
}
