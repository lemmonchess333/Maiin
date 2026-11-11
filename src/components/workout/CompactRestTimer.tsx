// The display register's wide italic cut, as FinishHero loads it.
import "@fontsource-variable/archivo/wdth-italic.css";
import ExerciseThumb from "@/components/program/ExerciseThumb";
import { Button } from "@/components/ui/Button";
import { SECONDARY_ON_CARD_EDGE } from "@/components/ui/buttonClasses";
import { cardClasses } from "@/components/ui/cardClasses";
import { cn } from "@/lib/utils";

/** Circumference of the countdown ring (r = 15 in a 36-unit box). */
const RING = 2 * Math.PI * 15;

/** "1:05" from 65. A rest is minutes and seconds, not a count of seconds. */
function clock(total: number): string {
  const s = Math.max(0, Math.round(total));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** The set the rest leads to: "Set 2" or "Warm-up 3", its weight and
 *  reps as planned ("15 kg × 10"), and its exercise for the drawing. */
export interface RestNextSet {
  exerciseId: string;
  name: string;
  load: string;
}

/** The rest band, docked above the workout's bottom bar (Pol1): resting
 * never changes the set action's label, and nothing above the band moves
 * when it arrives.
 *
 * DS4: while it runs, the rest is the screen's hero, not a footnote. The
 * time left is the live screen's one display figure (rule 6), 64-72 px in
 * Archivo's wide heavy cut, beside a ring that empties as the rest runs
 * down; under it, the set that comes next beside its exercise's drawing,
 * as Ladder and Fitbit show it, and the rest's two buttons. When the rest
 * is over the ring is drawn whole again, in green (green is status): an
 * emptied ring has no arc left to colour. The arc sweeps through each
 * second rather than stepping once a second, a one-second linear
 * transition on its offset that the global Reduce Motion rule takes back
 * to a step. The figure stays in the text colour: in green at this size
 * it would be the largest colour on the screen.
 */
export default function CompactRestTimer({
  seconds,
  target,
  next,
  onStop,
  onExtend,
}: {
  seconds: number;
  target: number;
  next?: RestNextSet;
  onStop: () => void;
  /** Add time to the rest in progress. Not a session-wide target change —
   *  the next rest re-derives its own. */
  onExtend: (seconds: number) => void;
}) {
  const done = seconds >= target;
  const elapsed = target > 0 ? Math.min(1, seconds / target) : 1;
  return (
    <div
      className={cardClasses({
        size: "compact",
        className: "@container space-y-2",
      })}
      role="group"
      aria-label="Rest timer"
    >
      {/* The ring and its word go under the time when beside it they
          would push it off the band (double text on a 320 px phone): the
          time is sized by the screen, the word by the text size. */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <p className="ds-display-figure ds-display-rest whitespace-nowrap text-foreground">
          {clock(target - seconds)}
        </p>
        <div className="flex shrink-0 flex-col items-center gap-0.5">
          <svg
            viewBox="0 0 36 36"
            className="size-[40px] -rotate-90"
            aria-hidden="true"
          >
            {/* The track is ProgressRing's groove, as on Home's rings.
                `stroke-muted` is a near-white tile colour in the light
                theme, lighter than the workout page, so it cannot show the
                emptied part of the ring there. */}
            <circle
              cx="18"
              cy="18"
              r="15"
              fill="none"
              strokeWidth="4"
              stroke="hsl(var(--muted-foreground) / 0.22)"
            />
            <circle
              cx="18"
              cy="18"
              r="15"
              fill="none"
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray={RING}
              strokeDashoffset={done ? 0 : RING * elapsed}
              className={cn(
                "transition-[stroke-dashoffset] duration-1000 ease-linear",
                done ? "stroke-success" : "stroke-primary"
              )}
            />
          </svg>
          <span
            className={cn(
              "whitespace-nowrap text-xs",
              done
                ? "font-semibold text-success-strong"
                : "text-muted-foreground"
            )}
          >
            {done ? "Rest done" : "Rest"}
          </span>
        </div>
      </div>
      {/* The next set and the two buttons share a line while they fit;
          the buttons go under it when they do not (larger text, a 320 px
          phone), where squeezed onto one line "+15 s" sat on the set and
          "End rest" ran off the card. Under 19em of band the drawing gives
          its room to the words, as the exercise's heading does. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {next && (
          <div className="flex min-w-0 flex-auto items-center gap-2.5">
            <ExerciseThumb
              exerciseId={next.exerciseId}
              className="@max-[19em]:hidden"
            />
            <p className="min-w-0 leading-tight">
              <span className="block truncate text-xs text-muted-foreground">
                Next · {next.name}
              </span>
              <span className="block truncate text-sm font-semibold font-mono tabular-nums text-foreground">
                {next.load}
              </span>
            </p>
          </div>
        )}
        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
          <Button
            variant="secondary"
            className={cn("whitespace-nowrap", SECONDARY_ON_CARD_EDGE)}
            aria-label="Add 15 seconds of rest"
            onClick={() => onExtend(15)}
          >
            {/* One span: the Button lays its children out with a gap, which
                split "+15 s" into "+ 15 s" when they were three. */}
            <span>
              +<span className="font-mono tabular-nums">15</span> s
            </span>
          </Button>
          <Button
            variant="ghost"
            className="whitespace-nowrap"
            onClick={onStop}
          >
            End rest
          </Button>
        </div>
      </div>
    </div>
  );
}
