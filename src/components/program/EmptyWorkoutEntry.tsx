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
 *
 * The icon, padding, gaps and chevron are px, so at large text they keep
 * their size and the words get the room: in rem they took half a 320 px
 * row and the title broke inside "workout".
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
        className="flex min-h-[44px] items-center gap-[12px] rounded-xl bg-card p-[12px] card-shadow transition-transform active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span
          className="size-[36px] shrink-0 rounded-lg flex items-center justify-center"
          style={{ background: `${THEME.brand}14` }}
          aria-hidden="true"
        >
          <Plus className="size-[16px] text-lifting-strong" />
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
          className="size-[16px] shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
      </Link>
    </section>
  );
}
