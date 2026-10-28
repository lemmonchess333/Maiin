/**
 * An exercise's menu in the session (Lift4 (11)): swap it for today, or
 * skip it. Both are today's alone; only a swap kept at Finish reaches the
 * plan (`KeepSwapSheet`).
 *
 * Swapping is offered while none of the exercise's sets is done, since done
 * sets belong to the exercise they were done as. Skipping keeps the sets
 * done so far, and "Don't skip" brings the rest back.
 *
 * It also puts the exercise in a superset with the one after it, or takes
 * it out of one (Mob1 call 2). A superset is the session's too: it is saved
 * with the workout and never reaches the plan.
 *
 * An exercise added today can be removed from the workout (Mob2 call 11);
 * a planned one keeps Skip.
 */
import { ChoiceSheet, type Choice } from "@/components/ui/ChoiceSheet";
import {
  canSupersetWithNext,
  supersetAt,
  type SessionSuperset,
} from "@/features/program/superset";

interface ExerciseMenuSheetProps {
  open: boolean;
  onClose: () => void;
  exerciseName: string;
  /** None of the exercise's sets is done yet. */
  nothingDone: boolean;
  /** The planned exercise's name, when this one was swapped in for it. */
  swappedFor?: string;
  skipped: boolean;
  /** Absent for an exercise added today, which stands in for no planned
   *  lift. */
  onSwap?: () => void;
  onSwapBack: () => void;
  onSkip: () => void;
  onUnskip: () => void;
  /** The session and this exercise's place in it, for its supersets
   *  (Mob1 call 2): with the exercise after it, or out of one. */
  session?: {
    exercises: readonly { instanceId?: string; name: string }[];
    supersets?: readonly SessionSuperset[];
    index: number;
  };
  /** Puts this exercise in a superset with the next one (true), or takes
   *  it out of its superset (false). */
  onSuperset?: (withNext: boolean) => void;
  /** Present for an exercise added today: takes it out of the workout. */
  onRemove?: () => void;
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
  session,
  onSuperset,
  onRemove,
}: ExerciseMenuSheetProps) {
  const supersetNextName =
    session &&
    canSupersetWithNext(session.exercises, session.supersets, session.index)
      ? session.exercises[session.index + 1]?.name
      : undefined;
  const inSuperset =
    !!session &&
    supersetAt(session.exercises, session.supersets, session.index) !== null;
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
        ...(nothingDone && onSwap
          ? [
              choice("swap", "Swap for today", onSwap),

              ...(swappedFor
                ? [choice("swap-back", `Back to ${swappedFor}`, onSwapBack)]
                : []),
            ]
          : []),
        ...(supersetNextName && onSuperset
          ? [
              choice("superset", `Superset with ${supersetNextName}`, () =>
                onSuperset(true)
              ),
            ]
          : []),
        ...(inSuperset && onSuperset
          ? [
              choice("unsuperset", "Remove from superset", () =>
                onSuperset(false)
              ),
            ]
          : []),

        choice("skip", "Skip today", onSkip),
        ...(onRemove
          ? [choice("remove", "Remove from workout", onRemove)]
          : []),
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
