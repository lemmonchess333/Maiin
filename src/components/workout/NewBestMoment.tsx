import { AnimatePresence, motion } from "framer-motion";
import { RotateCcw, Trophy } from "lucide-react";
import ExerciseThumb from "@/components/program/ExerciseThumb";
import { Button } from "@/components/ui/Button";
import { cardClasses } from "@/components/ui/cardClasses";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { localDateString, parseLocalDate } from "@/lib/dateHelpers";
import type { ExercisePR, SetPR } from "@/lib/prTracking";
import { formatDayMonth } from "@/utils/formatters";
import { cn } from "@/lib/utils";

/** A set that just beat the lifter's best, as the workout screen shows it. */
export interface NewBest {
  /** The set that earned it, "exerciseIndex:setIndex", so undoing or
   *  correcting that set can take the moment away with its record. */
  setKey: string;
  exerciseId: string;
  exerciseName: string;
  result: SetPR;
}

/** When the beaten best was set: "today" for an earlier set of this
 *  session, else "11 Jun". Nothing for a date that does not parse. */
function whenSet(record: ExercisePR): string | null {
  if (record.date === localDateString()) return "today";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(record.date)) return null;
  const day = parseLocalDate(record.date);
  return Number.isNaN(day.getTime()) ? null : formatDayMonth(day);
}

function repsWord(reps: number): string {
  return reps === 1 ? "rep" : "reps";
}

/** What a screen reader hears: the figures in words, not "80 kg × 8". */
function spoken({ exerciseName, result }: NewBest): string {
  const previous = result.previousBest;
  const beat = previous
    ? ` Previous best ${previous.weight} kg for ${previous.reps} ${repsWord(previous.reps)}.`
    : "";
  return `New best on ${exerciseName}: ${result.weight} kg for ${result.reps} ${repsWord(result.reps)}.${beat}`;
}

/**
 * DS3's new-best moment: the set the lifter just finished beat their
 * best, so it is said on the spot, in gold, for a few seconds, rather
 * than waiting for the finish screen. It is the finish screen's New
 * bests row, the same picture, figure and trophy, arriving as it
 * happens.
 *
 * The card sits on the ordinary card surface and only its accents are
 * gold, because every text colour here has been measured on a card: a
 * gold wash under the muted line took it below 4.5:1 in light mode.
 *
 * The announcement is a separate status line that is always present,
 * because a live region that arrives with its text is not reliably
 * read. It is visually hidden, and absolutely positioned, so it takes
 * no room where the card is docked while it is empty.
 *
 * Under Reduce Motion the card appears and goes without moving.
 */
export default function NewBestMoment({
  moment,
  onUndo,
  className,
}: {
  moment: NewBest | null;
  /** Undo for the set the card names, while its undo window is open.
   *  Docked over the bottom of the list, the card hides the list's own
   *  Undo, which is where a mistyped best would be taken back. */
  onUndo?: () => void;
  /** Placement for the card: its margins where it is docked. */
  className?: string;
}) {
  const reducedMotion = useReducedMotion();
  const previous = moment?.result.previousBest ?? null;
  const when = previous ? whenSet(previous) : null;
  return (
    <>
      <p role="status" className="sr-only">
        {moment ? spoken(moment) : ""}
      </p>
      <AnimatePresence>
        {moment && (
          <motion.div
            key={moment.setKey}
            data-testid="new-best-moment"
            initial={reducedMotion ? false : { opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={reducedMotion ? undefined : { opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.25, ease: [0.2, 0, 0, 1] }}
            className={cardClasses({
              className: cn(
                "flex shrink-0 items-center gap-3 ring-1 ring-achievement/40",
                className
              ),
            })}
          >
            <ExerciseThumb exerciseId={moment.exerciseId} />
            <div className="min-w-0 flex-1">
              <span className="inline-flex items-center rounded-full bg-achievement/15 px-2 py-0.5 text-xs font-semibold text-achievement-strong">
                New best
              </span>
              <p className="mt-1 truncate text-sm font-semibold text-foreground">
                {moment.exerciseName}
              </p>
              <p className="text-lg font-extrabold font-mono tabular-nums text-achievement-strong">
                {moment.result.weight} kg × {moment.result.reps}
              </p>
              {previous && (
                <p className="text-xs text-muted-foreground">
                  {/* The finish screen's word for it, and short enough
                      to hold one line beside the Undo. */}
                  Was{" "}
                  <span className="whitespace-nowrap font-mono tabular-nums">
                    {previous.weight} kg × {previous.reps}
                  </span>
                  {when && (
                    <>
                      , <span className="whitespace-nowrap">{when}</span>
                    </>
                  )}
                </p>
              )}
            </div>
            <div className="flex shrink-0 flex-col items-end justify-between gap-2 self-stretch">
              <Trophy
                className="size-5 text-achievement-strong"
                aria-hidden="true"
              />
              {onUndo && (
                <Button
                  variant="secondary"
                  aria-label="Undo this set"
                  onClick={onUndo}
                  leftIcon={<RotateCcw className="size-3.5" />}
                >
                  Undo
                </Button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
