import { useState } from "react";
import { motion } from "framer-motion";
import { useReducedMotion } from "@/hooks/useReducedMotion";

/** The overshoot the box lands with, and the ease the check is drawn on. */
const POP = [0.34, 1.56, 0.64, 1] as const;
const DRAW = [0.23, 1, 0.32, 1] as const;

/**
 * The tick at the end of a set row: an empty box that completes the set,
 * or the done set's green check, which opens the set to correct it.
 *
 * A set ticked while its row is on screen pops its box (0.72 to 1 with a
 * slight overshoot) and draws its check, short stroke first (Pol1). A
 * check that is already there when the row mounts (a resumed session, a
 * return to an earlier exercise) just shows: the parent keys this by
 * exercise and set, so a remount starts from the set's current state and
 * only a change seen while mounted counts as a tick. Under Reduce Motion
 * the check shows without moving; `pathLength` is not one of the values
 * `MotionConfig` settles, so this asks for itself.
 */
export default function SetCheck({
  completed,
  editLabel,
  best,
  guideAnchor,
  onComplete,
  onEdit,
}: {
  completed: boolean;
  /** "Edit completed set 2": what the done set's button says. */
  editLabel: string;
  /** This set holds a best the session has kept. */
  best: boolean;
  guideAnchor?: string;
  onComplete: () => void;
  onEdit: () => void;
}) {
  const reduce = useReducedMotion();
  /* React's adjust-state-while-rendering pattern: a tick is the moment
     `completed` turns true under a mounted check, counted so each one
     remounts the mark and plays once. */
  const [wasCompleted, setWasCompleted] = useState(completed);
  const [ticks, setTicks] = useState(0);
  if (completed !== wasCompleted) {
    setWasCompleted(completed);
    if (completed) setTicks((n) => n + 1);
  }
  const fresh = ticks > 0 && !reduce;

  if (!completed) {
    return (
      <button
        type="button"
        aria-label="Mark set complete"
        data-guide-anchor={guideAnchor}
        onClick={onComplete}
        className="group mx-auto flex size-[44px] items-center justify-center transition-transform active:scale-90"
      >
        {/* Light draws the 3:1 boundary. Dark draws a filled square on the
            hairline, as the dark field does: a bright ring there was the
            loudest edge on the screen, and the set's number and fields
            beside it already say what the box is for. */}
        <span className="size-[32px] rounded-lg border-2 border-muted-foreground/80 transition-colors group-hover:border-primary/60 dark:border dark:border-border dark:bg-muted" />
      </button>
    );
  }

  return (
    <button
      type="button"
      aria-label={editLabel}
      onClick={onEdit}
      className="mx-auto flex min-h-[44px] w-[44px] flex-col items-center justify-center gap-0.5 rounded-xl transition-transform active:scale-95"
    >
      <motion.span
        key={ticks}
        data-testid="set-check-mark"
        initial={fresh ? { scale: 0.72 } : false}
        animate={{ scale: 1 }}
        transition={{ duration: 0.3, ease: POP }}
        className="flex size-[32px] items-center justify-center rounded-lg bg-success text-success-foreground"
      >
        {/* Lucide's Check, drawn from its short stroke: the same two
            lines a hand writes, in the order it writes them. */}
        <svg
          viewBox="0 0 24 24"
          className="size-4"
          fill="none"
          stroke="currentColor"
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <motion.path
            d="M4 12l5 5L20 6"
            initial={fresh ? { pathLength: 0 } : false}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.22, ease: DRAW, delay: 0.09 }}
          />
        </svg>
      </motion.span>
      {best && (
        <span className="text-caption font-semibold leading-none text-achievement-strong">
          PR
        </span>
      )}
    </button>
  );
}
