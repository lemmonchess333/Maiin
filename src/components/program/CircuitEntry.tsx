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
 * and chevron keep their size and the words get the room. The link is
 * named by its words, the title and then the line under it, as they are
 * drawn: every word on a control is in its name (WCAG 2.5.3).
 */
export default function CircuitEntry() {
  const titleId = useId();
  return (
    <section className="pt-3" aria-labelledby={titleId}>
      <Link
        to={CIRCUIT_PATH}
        onClick={() => haptic("light")}
        className="flex min-h-[44px] items-center gap-[12px] rounded-xl bg-card p-[12px] card-shadow transition-transform active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span
          className="size-[36px] shrink-0 rounded-lg flex items-center justify-center"
          style={{ background: `${THEME.lifting}14` }}
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
          </span>{" "}
          <span className="block text-xs text-muted-foreground">
            Work and rest on a clock, 10 to 30 min.
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
