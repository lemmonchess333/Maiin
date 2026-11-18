import { useId } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, Timer } from "lucide-react";
import { THEME } from "@/lib/theme";
import { haptic } from "@/lib/haptic";
import { CIRCUIT_PATH } from "@/features/circuit/circuitPath";

/**
 * Train's way into a circuit (Circ1 (8)): beside Empty workout, a way of
 * lifting with work and rest on a clock, for a short session or one with
 * no kit. On demand only (Circ1 (5)): it moves no plan.
 *
 * Laid out as `EmptyWorkoutEntry` is, in px, so at large text the icon
 * and chevron keep their size and the words get the room.
 */
export default function CircuitEntry() {
  const titleId = useId();
  const captionId = useId();
  return (
    <section className="pt-3" aria-labelledby={titleId}>
      <Link
        to={CIRCUIT_PATH}
        aria-labelledby={titleId}
        aria-describedby={captionId}
        onClick={() => haptic("light")}
        className="flex min-h-[44px] items-center gap-[12px] rounded-xl bg-card p-[12px] card-shadow transition-transform active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span
          className="size-[36px] shrink-0 rounded-lg flex items-center justify-center"
          style={{ background: `${THEME.brand}14` }}
          aria-hidden="true"
        >
          <Timer className="size-[16px] text-lifting-strong" />
        </span>
        <span className="min-w-0 flex-1">
          <span
            id={titleId}
            className="block text-sm font-semibold text-foreground"
          >
            Circuit
          </span>
          <span id={captionId} className="block text-xs text-muted-foreground">
            Work and rest on a clock, 10 to 30 min. Your plan stays as it is.
          </span>
        </span>
        <ChevronRight
          className="size-[16px] shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
      </Link>
    </section>
  );
}
