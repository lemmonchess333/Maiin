import { useReducedMotion } from "@/hooks/useReducedMotion";
import { usePulse } from "@/hooks/usePulse";
import { showsPulse } from "@/lib/pulse";

/**
 * The live pulse (Soc15): one line near the top of Social's Feed saying
 * other people are training today, "Today: 14 sessions on Tropos", by a
 * small dot that pulses gently. Social may be loud (DESIGN_GUIDE §14l,
 * call 1); Home stays calm, so this is drawn on Social only.
 *
 * Nothing is drawn below PULSE_MIN_SESSIONS (a new Tropos's "Today: 1
 * session" reads as an empty room), while the day's first answer is
 * coming, or when it cannot be read. The figure moves live; it is not a
 * live region, so a screen reader is not told of every session saved.
 *
 * The dot's ring is transform and opacity only (§14h), and under Reduce
 * Motion it is not drawn: the dot stays still.
 */
export default function PulseLine() {
  const sessions = usePulse();
  const reduce = useReducedMotion();
  if (!showsPulse(sessions)) return null;
  return (
    <p className="my-2 flex items-center gap-2 text-small text-muted-foreground">
      <span aria-hidden="true" className="relative inline-flex size-2 shrink-0">
        {!reduce && (
          <span
            data-testid="pulse-ring"
            className="ds-live-pulse absolute inset-0 rounded-full bg-primary"
          />
        )}
        <span className="relative inline-flex size-2 rounded-full bg-primary" />
      </span>
      <span>
        Today:{" "}
        <span className="font-mono tabular-nums font-semibold text-foreground">
          {sessions.toLocaleString()}
        </span>{" "}
        sessions on Tropos
      </span>
    </p>
  );
}
