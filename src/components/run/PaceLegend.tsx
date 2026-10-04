import SectionLabel from "@/components/ui/SectionLabel";
import { cn } from "@/lib/utils";
import { ROUTE_PACE_STEPS } from "./routePace";

/**
 * The key to the pace-coloured route on the run finish screen and a saved
 * run, drawn under the map.
 *
 * It names what it keys ("Route pace") and draws every step the map uses,
 * fastest to slowest, from the same table (`routePace.ts`), so the key
 * and the route cannot disagree. Only the two ends are worded: the steps
 * are an order, faster to slower than the run's own average, and the
 * middle ones need no names of their own.
 *
 * Render it only where the route is drawn in pace colours: the map does
 * that when it has the run's average pace, and draws a plain line when it
 * does not.
 */
export default function PaceLegend({ className }: { className?: string }) {
  return (
    <div
      role="img"
      aria-label="Route pace, coloured from faster to slower than your average"
      className={cn("flex items-center justify-between gap-3 py-2", className)}
    >
      <SectionLabel as="span">Route pace</SectionLabel>
      <span className="flex items-center gap-2 text-xs text-muted-foreground">
        Faster
        <span className="flex gap-0.5">
          {ROUTE_PACE_STEPS.map((step) => (
            <span
              key={step.color}
              data-testid="route-pace-step"
              className="h-1.5 w-4 rounded-full"
              style={{ background: step.color }}
            />
          ))}
        </span>
        Slower
      </span>
    </div>
  );
}
