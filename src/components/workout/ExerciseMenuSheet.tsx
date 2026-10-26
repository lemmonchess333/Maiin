/**
 * An exercise's menu in the session (Lift4 (11)): swap it for today, or
 * skip it. Both are today's alone; only a swap kept at Finish reaches the
 * plan (`KeepSwapSheet`).
 *
 * Swapping is offered while none of the exercise's sets is done, since done
 * sets belong to the exercise they were done as. Skipping keeps the sets
 * done so far, and "Don't skip" brings the rest back.
 */
import { ChoiceSheet, type Choice } from "@/components/ui/ChoiceSheet";

interface ExerciseMenuSheetProps {
  open: boolean;
  onClose: () => void;
  exerciseName: string;
  /** None of the exercise's sets is done yet. */
  nothingDone: boolean;
  /** The planned exercise's name, when this one was swapped in for it. */
  swappedFor?: string;
  skipped: boolean;
  onSwap: () => void;
  onSwapBack: () => void;
  onSkip: () => void;
  onUnskip: () => void;
}

export default function ExerciseMenuSheet({
  open,
  onClose,
  exerciseName,
  nothingDone,
  swappedFor,
  skipped,
  onSwap,
  onSwapBack,
  onSkip,
  onUnskip,
}: ExerciseMenuSheetProps) {
  // The sheet closes itself once a choice resolves (`ChoiceSheet`). Each
  // label says it is for today, so no choice carries a second line.
  const choice = (id: string, label: string, run: () => void): Choice => ({
    id,
    label,
    variant: "secondary",
    onSelect: async () => run(),
  });
  const choices: Choice[] = skipped
    ? [choice("unskip", "Don't skip", onUnskip)]
    : [
        ...(nothingDone
          ? [
              choice("swap", "Swap for today", onSwap),
              ...(swappedFor
                ? [choice("swap-back", `Back to ${swappedFor}`, onSwapBack)]
                : []),
            ]
          : []),
        choice("skip", "Skip today", onSkip),
      ];

  return (
    <ChoiceSheet
      open={open}
      onClose={onClose}
      title={exerciseName}
      choices={choices}
      logTag="exerciseMenu"
    />
  );
}
