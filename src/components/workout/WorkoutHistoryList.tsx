import { useId, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { buttonClasses } from "@/components/ui/buttonClasses";
import { workoutTitle, type Workout } from "@/hooks/useWorkouts";
import { parseLocalDate } from "@/lib/dateHelpers";

/** Reuses History's complete subscription; opening records adds no list query. */
export default function WorkoutHistoryList({
  workouts,
}: {
  workouts: Workout[];
}) {
  const [open, setOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(10);
  const listId = useId();
  if (workouts.length === 0) return null;

  return (
    <div className="mt-3 rounded-xl bg-card card-shadow p-3">
      <Button
        variant="ghost"
        fullWidth
        className="justify-between"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen(!open)}
        rightIcon={
          <ChevronRight className={`size-4 ${open ? "rotate-90" : ""}`} />
        }
      >
        Saved workouts
      </Button>
      <div id={listId} hidden={!open}>
        <p className="px-3 py-2 text-xs text-muted-foreground">
          All dates · {workouts.length}{" "}
          {workouts.length === 1 ? "session" : "sessions"}
        </p>
        <ul className="divide-y divide-border/40">
          {workouts.slice(0, visibleCount).map((workout) => (
            <li key={workout.id}>
              <Link
                to={`/workout/${encodeURIComponent(workout.id)}`}
                className={buttonClasses({
                  variant: "ghost",
                  className:
                    "w-full h-auto min-h-[44px] justify-between gap-3 py-3",
                })}
              >
                <span className="min-w-0 text-left">
                  <span className="block text-sm font-semibold">
                    {workoutTitle(workout)}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {parseLocalDate(workout.date).toLocaleDateString(
                      undefined,
                      {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      }
                    )}
                  </span>
                </span>
                <ChevronRight aria-hidden="true" className="size-4 shrink-0" />
              </Link>
            </li>
          ))}
        </ul>
        {visibleCount < workouts.length && (
          <Button
            variant="ghost"
            fullWidth
            onClick={() => setVisibleCount((count) => count + 10)}
          >
            Show more workouts
          </Button>
        )}
      </div>
    </div>
  );
}
