import { Button } from "@/components/ui/Button";
import { cardClasses } from "@/components/ui/cardClasses";
import { cn } from "@/lib/utils";

/** Circumference of the countdown ring (r = 15 in a 36-unit box). */
const RING = 2 * Math.PI * 15;

/** "1:05" from 65. A rest is minutes and seconds, not a count of seconds. */
function clock(total: number): string {
  const s = Math.max(0, Math.round(total));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** The rest card, docked above the workout's bottom bar (Pol1): resting
 * never changes the set action's label, and nothing above the card moves
 * when it arrives.
 *
 * DS3: the time left is the card's one big thing, in the numeral font,
 * beside a ring that empties as the rest runs down. When the rest is over
 * the ring is drawn whole again, in green (green is status): an emptied
 * ring has no arc left to colour. The arc sweeps through each second
 * rather than stepping once a second, a one-second linear transition on
 * its offset that the global Reduce Motion rule takes back to a step. */
export default function CompactRestTimer({
  seconds,
  target,
  onStop,
  onExtend,
}: {
  seconds: number;
  target: number;
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
        className: "flex flex-wrap items-center gap-x-2 gap-y-2",
      })}
      role="group"
      aria-label="Rest timer"
    >
      {/* The time and its two buttons share a line while they fit, and
          the buttons go under the time when they do not (larger text, a
          320 px phone): squeezed onto one line, "+15 s" sat on the time
          and "End rest" ran off the card. */}
      <div className="flex flex-auto items-center gap-3">
        <svg
          viewBox="0 0 36 36"
          className="size-9 shrink-0 -rotate-90"
          aria-hidden="true"
        >
          {/* The track is ProgressRing's groove, as on Home's rings.
            `stroke-muted` is a near-white tile colour in the light theme,
            lighter than the workout page, so it cannot show the emptied
            part of the ring there. */}
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
        <p className="leading-tight whitespace-nowrap">
          <span className="block text-xs text-muted-foreground">
            {done ? "Rest done" : "Rest"}
          </span>
          <span
            className={cn(
              "block text-h3 font-bold font-mono tabular-nums",
              done ? "text-success-strong" : "text-foreground"
            )}
          >
            {clock(target - seconds)}
          </span>
        </p>
      </div>
      <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
        <Button
          variant="secondary"
          className="whitespace-nowrap"
          aria-label="Add 15 seconds of rest"
          onClick={() => onExtend(15)}
        >
          {/* One span: the Button lays its children out with a gap, which
              split "+15 s" into "+ 15 s" when they were three. */}
          <span>
            +<span className="font-mono tabular-nums">15</span> s
          </span>
        </Button>
        <Button variant="ghost" className="whitespace-nowrap" onClick={onStop}>
          End rest
        </Button>
      </div>
    </div>
  );
}
