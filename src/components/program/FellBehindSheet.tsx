/**
 * PR-L L4 client UI — fell-behind prompt sheet (Q24 — adaptive plan).
 *
 * Surfaced when `programState.pendingFellBehindPrompt` is set by the
 * server-side `weeklyFellBehindCheck` Cloud Function (Mondays 05:00
 * UTC, after a week where the user ran <50% of their weekly target).
 *
 * Three choices per the Q24 lock — matches NRC's adaptive-plan
 * pattern:
 *
 *   1. Shift plan back 1 week — race date +7d, regen plan
 *   2. Compress remaining weeks — keep date, accept compressed prep
 *   3. Skip and continue — dismiss without plan change
 *
 * All three clear `pendingFellBehindPrompt` so the sheet won't
 * re-surface until next Monday's check writes a fresh flag.
 *
 * Mounted from Home so the prompt lands on the user's first app
 * open after Monday's sweep.
 *
 * The choice machine (pending state + double-tap guard + opacity
 * dim on non-active siblings + "Verb…" label idiom) lives in the
 * `ChoiceSheet` primitive; this file owns only the prompt copy +
 * which buttons appear when.
 */

import { Footprints } from "lucide-react";
import { ChoiceSheet, type Choice } from "@/components/ui/ChoiceSheet";
import { THEME } from "@/lib/theme";

interface FellBehindSheetProps {
  open: boolean;
  /** Closes the sheet without writing — leaves the flag in place so
   *  the sheet re-opens on next app launch. Use sparingly; the
   *  three action buttons are the intended dismissal path. */
  onClose: () => void;
  /** Server-written flag payload — drives the body copy. */
  prompt: {
    weekKey: string;
    completedRatio: number;
    realRunCount: number;
    weeklyTarget: number;
  };
  /** Writers from useProgram. */
  dismissFellBehindPrompt: () => Promise<void>;
  shiftRacePlanBackOneWeek: () => Promise<void>;
  compressRacePlan: () => Promise<void>;
  /** True when the user is in race_prep mode AND has a raceGoal.
   *  When false, the shift / compress buttons are hidden — only the
   *  dismiss path applies (e.g. structured-mode users). */
  raceModeActive: boolean;
}

export default function FellBehindSheet({
  open,
  onClose,
  prompt,
  dismissFellBehindPrompt,
  shiftRacePlanBackOneWeek,
  compressRacePlan,
  raceModeActive,
}: FellBehindSheetProps) {
  const percent = Math.round(prompt.completedRatio * 100);

  const choices: Choice[] = [
    ...(raceModeActive
      ? [
          {
            id: "shift",
            label: "Shift plan back 1 week",
            pendingLabel: "Shifting…",
            variant: "primary" as const,
            onSelect: shiftRacePlanBackOneWeek,
          },
          {
            id: "compress",
            label: "Compress remaining weeks",
            pendingLabel: "Compressing…",
            variant: "secondary" as const,
            onSelect: compressRacePlan,
          },
        ]
      : []),
    {
      id: "skip",
      label: "Skip and continue",
      pendingLabel: "Dismissing…",
      variant: "ghost" as const,
      onSelect: dismissFellBehindPrompt,
    },
  ];

  return (
    <ChoiceSheet
      open={open}
      onClose={onClose}
      title="Last week didn't go to plan"
      description="Pick how you want to adjust"
      hideHeader
      choices={choices}
      logTag="fellBehind"
    >
      <div className="flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
          style={{ backgroundColor: `${THEME.running}1A` }}
        >
          <Footprints className="w-5 h-5" style={{ color: THEME.running }} />
        </div>
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            Last week
          </p>
          <p className="text-base font-semibold text-foreground mt-0.5">
            {prompt.realRunCount} of {prompt.weeklyTarget} runs ({percent}%)
          </p>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        {raceModeActive
          ? "Want to adjust the plan to match where you are now?"
          : "No worries — your weekly target stays the same."}
      </p>
    </ChoiceSheet>
  );
}
