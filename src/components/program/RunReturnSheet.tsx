/**
 * The free runner's welcome back, offered from two weeks away
 * (`assessRunReturn`). A race plan's welcome back is the fell-behind sheet
 * in its welcome-back register, which can rebuild the plan; free running
 * has no plan to change, so this offers the one thing that helps, an easy
 * first run, and nothing else.
 *
 * Its register is `LiftReturnSheet`'s: the gap as a fact with no verdict
 * on it, no count of missed runs, no streak, nothing about what was lost.
 * The running coral is the sheet's identity, as on `FellBehindSheet`.
 */
import { useEffect, useRef } from "react";
import { Footprints } from "lucide-react";
import SectionLabel from "@/components/ui/SectionLabel";
import InlineNumerals from "@/components/ui/InlineNumerals";
import { ChoiceSheet, type Choice } from "@/components/ui/ChoiceSheet";
import { unlockSpeech } from "@/lib/speechUnlock";
import { RUN_TEMPLATES } from "@/lib/workoutTemplates";
import {
  RETURN_RUN_TEMPLATE_ID,
  returnGap,
} from "@/features/program/runReturn";
import {
  track as trackLifecycleEvent,
  type ReturnChoice,
} from "@/lib/lifecycleAnalytics";

/** The easy run's length, read from the run the button starts, so the
 *  sheet cannot describe one run and start another. */
const EASY_RUN_MINUTES =
  RUN_TEMPLATES.find((t) => t.id === RETURN_RUN_TEMPLATE_ID)
    ?.estimatedDuration ?? 20;

interface RunReturnSheetProps {
  open: boolean;
  /** Close without starting anything. Persists, so this absence is not
   *  raised again. */
  onClose: () => void;
  /** Open the Run page on the easy run, starting as it opens. */
  onEasyRun: () => void;
  /** Whole days since the last run that counts. */
  daysAway: number;
}

export default function RunReturnSheet({
  open,
  onClose,
  onEasyRun,
  daysAway,
}: RunReturnSheetProps) {
  // Reported at most once per opening, and re-armed per opening, as the
  // lift sheet does: the close that follows a choice would otherwise land a
  // second answer on top of the real one.
  const choiceReported = useRef(false);
  useEffect(() => {
    if (open) choiceReported.current = false;
  }, [open]);
  const reportChoice = (choice: ReturnChoice) => {
    if (choiceReported.current) return;
    choiceReported.current = true;
    trackLifecycleEvent("return_choice", { surface: "run-return", choice });
  };

  // The sheet closes itself once a choice resolves (`ChoiceSheet`).
  const choices: Choice[] = [
    {
      id: "easy-run",
      label: "Start with an easy run",
      variant: "sport",
      onSelect: async () => {
        // The run starts as the Run page opens, so its voice cues are
        // unlocked here, inside the tap, as the run card's Start does.
        unlockSpeech();
        reportChoice("easy_run");
        onEasyRun();
      },
    },
    {
      id: "skip",
      label: "Not now",
      variant: "ghost",
      onSelect: async () => {
        reportChoice("skip");
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
      description="Start again with an easy run"
      hideHeader
      choices={choices}
      logTag="runReturn"
    >
      <div className="flex items-center gap-3">
        <div className="size-10 rounded-lg flex items-center justify-center shrink-0 bg-running/10">
          <Footprints className="size-5 text-running" aria-hidden="true" />
        </div>
        <div>
          <SectionLabel>Welcome back</SectionLabel>
          <p className="text-base font-semibold text-foreground mt-0.5 text-pretty">
            <InlineNumerals>
              {`It's been ${returnGap(daysAway)} since your last run`}
            </InlineNumerals>
          </p>
        </div>
      </div>

      <p className="text-sm text-muted-foreground text-pretty">
        <InlineNumerals>
          {`A short, easy run is a good way back in: ${EASY_RUN_MINUTES} minutes at a pace you could talk at.`}
        </InlineNumerals>
      </p>
    </ChoiceSheet>
  );
}
