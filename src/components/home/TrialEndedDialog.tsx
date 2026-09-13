import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";

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
  /** The card trial is still available: Keep Pro means 7 more free days. */
  extensionAvailable?: boolean;
}

export default function TrialEndedDialog({
  onDismiss,
  onKeep,
  extensionAvailable = false,
}: Props) {
  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 z-40"
        onClick={onDismiss}
        data-testid="trial-ended-backdrop"
      />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="trial-ended-title"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-50 max-w-sm mx-auto rounded-2xl bg-card p-6 space-y-4 shadow-xl border border-border/50"
      >
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
          {extensionAvailable
            ? " Keep Pro to carry on, with 7 more days free before anything is charged."
            : null}
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
      </motion.div>
    </>
  );
}
