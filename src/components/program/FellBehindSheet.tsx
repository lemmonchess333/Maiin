/**
 * PR-L L4 client UI — fell-behind prompt sheet (Q24 — adaptive plan).
 *
 * Surfaced when `programState.pendingFellBehindPrompt` is set by the
 * server-side `weeklyFellBehindCheck` Cloud Function (Mondays 05:00
 * UTC, after a week where the user ran <50% of their weekly target).
 *
 * Run9 phase-3 (Slice DE) reframe — the three plan actions collapse to one
 * primary + one route (matching Runna's one-tap realign tray):
 *
 *   1. Realign my plan — keep the race date, re-plan remaining weeks from
 *      today (compresses, or drops to finish-safely below the taper floor)
 *   2. My race moved → — route to /settings/training to edit the race date
 *   3. Not now — dismiss without plan change
 *
 * Realign + Not-now clear `pendingFellBehindPrompt` so the sheet won't
 * re-surface until next Monday's check writes a fresh flag. "My race moved"
 * also clears it (the user is going to fix the date directly).
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
  /** Re-anchor the plan to today (keep the race date). Already wrapped by the
   *  caller to clear the flag, persist, and toast the timing result. */
  realignRacePlan: () => Promise<void>;
  /** Route to /settings/training to edit the race date. Should also clear the
   *  flag (the user is fixing the date directly). */
  onRaceMoved: () => void;
  /** True when the user is in race_prep mode AND has a raceGoal.
   *  When false, the realign / race-moved actions are hidden — only the
   *  dismiss path applies (e.g. structured-mode users). */
  raceModeActive: boolean;
}

export default function FellBehindSheet({
  open,
  onClose,
  prompt,
  dismissFellBehindPrompt,
  realignRacePlan,
  onRaceMoved,
  raceModeActive,
}: FellBehindSheetProps) {
  const percent = Math.round(prompt.completedRatio * 100);

  const choices: Choice[] = [
    ...(raceModeActive
      ? [
          {
            id: "realign",
            label: "Realign my plan",
            pendingLabel: "Realigning…",
            variant: "primary" as const,
            onSelect: realignRacePlan,
          },
          {
            id: "race-moved",
            label: "My race moved →",
            variant: "secondary" as const,
            onSelect: async () => onRaceMoved(),
          },
        ]
      : []),
    {
      id: "skip",
      label: "Not now",
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
        <div className="size-10 rounded-lg flex items-center justify-center shrink-0 bg-running/10">
          <Footprints className="size-5 text-running" />
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
