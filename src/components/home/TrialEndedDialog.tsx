import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";

/**
 * TrialEndedDialog — the one-time prompt on Home when the 7-day trial
 * lapses.
 *
 * Says what actually changed, in the house register: photo logging is
 * paused and the calorie target has stopped adapting — the two things
 * Pro gates (Sub2) — and what has not: typing, search and the programme.
 * Performance insights are NOT on the list: they are free (Sub2), and a
 * popup that names a free feature as the reason to pay is the
 * paywall-honesty failure in one sentence.
 *
 * "Keep Pro" lands on the offer page rather than a price list — the
 * product, then the plans. Home owns the surface-coordinator slot and
 * the `trialExpiryPromptShown` write; this is the presentation only.
 */
interface Props {
  onDismiss: () => void;
  onKeep: () => void;
}

export default function TrialEndedDialog({ onDismiss, onKeep }: Props) {
  /* The shared dialog: focus moves in (to Not now) and stays there,
     Escape and the device's Back mean Not now, and focus goes back where
     it was. Home mounts this only while the prompt is due. */
  return (
    <Dialog
      open
      onClose={onDismiss}
      labelledBy="trial-ended-title"
      size="md"
      className="p-6"
    >
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Sparkles className="size-5 text-primary" aria-hidden="true" />
          <p
            id="trial-ended-title"
            className="text-base font-semibold text-foreground"
          >
            Your free trial has ended
          </p>
        </div>
        <p className="text-sm text-muted-foreground">
          Photo logging is paused and your calorie target has stopped adapting.
          Typing, search and your programme work as before.
        </p>
        <div className="flex gap-3">
          <Button
            variant="ghost"
            className="flex-1 text-muted-foreground"
            onClick={onDismiss}
          >
            Not now
          </Button>
          <Button
            variant="primary"
            className="flex-1 font-bold"
            onClick={onKeep}
          >
            Keep Pro
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
