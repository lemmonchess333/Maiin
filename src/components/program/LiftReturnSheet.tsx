/**
 * The lifter's welcome back.
 *
 * The run side has greeted a returning runner since Run15; a lifter who
 * came back after three weeks got nothing at all, while the programme
 * carried on prescribing the loads of someone who had never stopped.
 *
 * Two rules shape what this sheet is allowed to be.
 *
 * It does not MUTATE. The Momentum check-in settled that a response maps
 * to a navigation and never to a plan change, on the reasoning that a plan
 * should not swing on one answer; an absence is the same case, and a sheet
 * that quietly halved next week's loads because someone was on holiday
 * would be worse than saying nothing. Both choices here either dismiss or
 * route.
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
import type { LayoffClass } from "@/features/program/layoffDetection";
import {
  track as trackLifecycleEvent,
  type ReturnChoice,
} from "@/lib/lifecycleAnalytics";

interface LiftReturnSheetProps {
  open: boolean;
  /** Dismiss without routing. Persists so this absence is not re-raised. */
  onClose: () => void;
  /** Route to the programme, where the easier-session option already lives. */
  onGoToProgramme: () => void;
  /** Whole days since the last session with work in it. */
  daysAway: number;
  /** `gap` or `detrained` — `none` never reaches this component. */
  layoff: LayoffClass;
}

export default function LiftReturnSheet({
  open,
  onClose,
  onGoToProgramme,
  daysAway,
  layoff,
}: LiftReturnSheetProps) {
  const detrained = layoff === "detrained";

  // Reported at most once per opening, and re-armed per opening: a ref that
  // survived one would silence every opening after the first, and an
  // outside-tap close after a button has run would otherwise land a second
  // answer on top of the real one.
  const choiceReported = useRef(false);
  useEffect(() => {
    if (open) choiceReported.current = false;
  }, [open]);
  const reportChoice = (choice: ReturnChoice) => {
    if (choiceReported.current) return;
    choiceReported.current = true;
    trackLifecycleEvent("return_choice", { surface: "lift-return", choice });
  };

  const choices: Choice[] = [
    {
      id: "pick-up",
      label: "Pick up where I left off",
      sublabel: "Your plan is unchanged",
      variant: "primary" as const,
      onSelect: async () => {
        reportChoice("acknowledge");
        onClose();
      },
    },
    {
      id: "ease-back",
      label: "Start easier →",
      // Names the real mechanism rather than promising a plan rewrite this
      // sheet is not allowed to make: "Easier today" already exists on the
      // session chooser and drops a set and the load on the day.
      sublabel: "Choose an easier session on your next lift",
      variant: "secondary" as const,
      onSelect: async () => {
        reportChoice("shift");
        onGoToProgramme();
      },
    },
  ];

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
      choices={choices}
      logTag="liftReturn"
    >
      <div className="flex items-center gap-3">
        <div className="size-10 rounded-lg flex items-center justify-center shrink-0 bg-primary/10">
          <Dumbbell className="size-5 text-primary" aria-hidden="true" />
        </div>
        <div>
          <SectionLabel>Welcome back</SectionLabel>
          <p className="text-base font-semibold text-foreground mt-0.5">
            {/* The gap as a fact. Weeks past a fortnight because "24 days"
                invites arithmetic where "3 weeks" reads at a glance. */}
            {daysAway >= 14
              ? `It's been about ${Math.round(daysAway / 7)} weeks`
              : `It's been ${daysAway} days`}
          </p>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        {detrained
          ? "Your plan still has the loads you left on. Starting a little lighter is the usual way back, and progression picks up from what you actually lift."
          : "Your plan is where you left it. Pick up as planned, or start easier and let progression catch up."}
      </p>
    </ChoiceSheet>
  );
}
