/**
 * The lifter's welcome back, and the one way back in after a break
 * (Lift4 (11)).
 *
 * Offered from two weeks away (`assessLiftReturn`). It asks one thing: ease
 * back in, or keep the old weights. Easing back is the only plan change
 * here, and it happens on the person's yes: the loads come down 10%, or 20%
 * after more than eight weeks away, this week has one set fewer, and each
 * lift climbs back a step a session to where it was (`easeBackIn`). From
 * three weeks away it is the choice put first; under that, keeping the
 * weights is. Either way the sheet says what will happen before it does.
 *
 * It does not SCOLD. The register is `FellBehindSheet`'s "Welcome back",
 * and the body states the gap as a fact without a verdict on it. There is
 * no streak language, no "you've lost", no count of missed sessions — the
 * standing constraint against loss framing applies most exactly to the
 * person who has just come back.
 */
import { useEffect, useRef } from "react";
import { Dumbbell } from "lucide-react";
import SectionLabel from "@/components/ui/SectionLabel";
import { ChoiceSheet, type Choice } from "@/components/ui/ChoiceSheet";
import {
  track as trackLifecycleEvent,
  type ReturnChoice,
} from "@/lib/lifecycleAnalytics";

interface LiftReturnSheetProps {
  open: boolean;
  /** Close without changing the plan. Persists so this absence is not
   *  raised again. */
  onClose: () => void;
  /** Ease the plan back (`easeBackIn`). Throws when it couldn't, which
   *  keeps the sheet open for another try. */
  onEaseBack: () => Promise<void>;
  /** Whole days since the last session with work in it. */
  daysAway: number;
  /** Whether "Ease back in" is the choice put first: three weeks or more. */
  easeBackFirst: boolean;
  /** What easing back takes off the loads: 0.1 or 0.2. */
  easeBackShare: number;
}

export default function LiftReturnSheet({
  open,
  onClose,
  onEaseBack,
  daysAway,
  easeBackFirst,
  easeBackShare,
}: LiftReturnSheetProps) {
  const percent = Math.round(easeBackShare * 100);

  // Reported at most once per opening, and re-armed per opening: a ref that
  // survived one would silence every opening after the first, and the close
  // that follows a choice would otherwise land a second answer on top of
  // the real one.
  const choiceReported = useRef(false);
  useEffect(() => {
    if (open) choiceReported.current = false;
  }, [open]);
  const reportChoice = (choice: ReturnChoice) => {
    if (choiceReported.current) return;
    choiceReported.current = true;
    trackLifecycleEvent("return_choice", { surface: "lift-return", choice });
  };

  // The sheet closes itself once a choice resolves (`ChoiceSheet`).
  const easeBack: Choice = {
    id: "ease-back",
    label: "Ease back in",
    sublabel: `${percent}% lighter, then back up a step each session`,
    pendingLabel: "Easing back…",
    variant: easeBackFirst ? "primary" : "secondary",
    onSelect: async () => {
      await onEaseBack();
      reportChoice("ease_back");
    },
  };
  const keep: Choice = {
    id: "keep",
    label: "Keep my old weights",
    sublabel: "Your plan is unchanged",
    variant: easeBackFirst ? "secondary" : "primary",
    onSelect: async () => {
      reportChoice("acknowledge");
    },
  };

  return (
    <ChoiceSheet
      open={open}
      onClose={() => {
        reportChoice("dismissed");
        onClose();
      }}
      title="Welcome back"
      description="Pick how you want to start again"
      hideHeader
      choices={easeBackFirst ? [easeBack, keep] : [keep, easeBack]}
      logTag="liftReturn"
    >
      <div className="flex items-center gap-3">
        <div className="size-10 rounded-lg flex items-center justify-center shrink-0 bg-primary/10">
          <Dumbbell className="size-5 text-primary" aria-hidden="true" />
        </div>
        <div>
          <SectionLabel>Welcome back</SectionLabel>
          <p className="text-base font-semibold text-foreground mt-0.5">
            {/* The gap as a fact, in weeks: "24 days" invites arithmetic
                where "3 weeks" reads at a glance. */}
            {`It's been about ${Math.round(daysAway / 7)} weeks`}
          </p>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        {easeBackFirst
          ? "Your plan still has the weights you left on. "
          : "Your plan is where you left it. "}
        {`Easing back takes ${percent}% off each lift and a set off this week's sessions, then each lift climbs back a step a session to where it was.`}
      </p>
    </ChoiceSheet>
  );
}
