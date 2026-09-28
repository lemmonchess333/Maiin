import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

/** Circumference of the countdown ring (r = 15 in a 36-unit box). */
const RING = 2 * Math.PI * 15;

/** "1:05" from 65. A rest is minutes and seconds, not a count of seconds. */
function clock(total: number): string {
  const s = Math.max(0, Math.round(total));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** A stable header row: resting never changes the set action's label.
 *
 * DS3: the time left is the row's one big thing, in the numeral font,
 * beside a ring that empties as the rest runs down. The ring turns green
 * when the rest is over (green is status), and its motion is a stroke
 * offset stepping once a second, so there is nothing to animate for
 * Reduce Motion. */
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
      className="border-b border-border/50 px-4 py-2 flex items-center gap-3"
      role="group"
      aria-label="Rest timer"
    >
      <svg
        viewBox="0 0 36 36"
        className="size-9 shrink-0 -rotate-90"
        aria-hidden="true"
      >
        <circle
          cx="18"
          cy="18"
          r="15"
          fill="none"
          strokeWidth="4"
          className="stroke-muted"
        />
        <circle
          cx="18"
          cy="18"
          r="15"
          fill="none"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={RING}
          strokeDashoffset={RING * elapsed}
          className={done ? "stroke-success" : "stroke-primary"}
        />
      </svg>
      <p className="min-w-0 flex-1 leading-tight">
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
      <Button
        variant="secondary"
        aria-label="Add 15 seconds of rest"
        onClick={() => onExtend(15)}
      >
        {/* One span: the Button lays its children out with a gap, which
            split "+15 s" into "+ 15 s" when they were three. */}
        <span>
          +<span className="font-mono tabular-nums">15</span> s
        </span>
      </Button>
      <Button variant="ghost" onClick={onStop}>
        End rest
      </Button>
    </div>
  );
}
