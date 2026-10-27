import { useId } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, Plus } from "lucide-react";
import { THEME } from "@/lib/theme";
import { haptic } from "@/lib/haptic";
import { EMPTY_WORKOUT_PATH } from "@/features/program/emptyWorkout";

/**
 * Train's way into an empty workout (Mob1 call 1), the lifting peer of
 * Free run: a session with no plan day behind it, for a free machine, a
 * hotel gym, or the weeks between blocks. It sits on the Lift tab beside
 * the saved routines, the other workouts that are not the plan's day.
 */
export default function EmptyWorkoutEntry() {
  const titleId = useId();
  const captionId = useId();
  return (
    <section className="pt-6" aria-labelledby={titleId}>
      <Link
        to={EMPTY_WORKOUT_PATH}
        aria-labelledby={titleId}
        aria-describedby={captionId}
        onClick={() => haptic("light")}
        className="flex min-h-[44px] items-center gap-3 rounded-xl bg-card p-3 card-shadow transition-transform active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span
          className="size-9 shrink-0 rounded-lg flex items-center justify-center"
          style={{ background: `${THEME.brand}14` }}
          aria-hidden="true"
        >
          <Plus className="size-4 text-lifting-strong" />
        </span>
        <span className="min-w-0 flex-1">
          <span
            id={titleId}
            className="block text-sm font-semibold text-foreground"
          >
            Empty workout
          </span>
          <span id={captionId} className="block text-xs text-muted-foreground">
            Add exercises as you go. Your plan stays as it is.
          </span>
        </span>
        <ChevronRight
          className="size-4 shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
      </Link>
    </section>
  );
}
