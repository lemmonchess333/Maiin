import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Bookmark, Trash2, Play } from "lucide-react";
import { toast } from "@/lib/toast";
import { useAuth } from "@/lib/auth";
import {
  listSavedRoutines,
  deleteSavedRoutine,
  type SavedRoutine,
} from "@/lib/savedRoutines";
import { THEME } from "@/lib/theme";
import { haptic } from "@/lib/haptic";

/**
 * "Saved routines" surface on the Program page (PR 4 save half).
 *
 * Lists workouts the user saved from the social feed via the
 * "Save as routine" action on ActivityCard. Each row shows the
 * routine name, the original author attribution, and a compact
 * exercise count + total set count.
 *
 * The "Use this routine" path (run a saved routine as a workout)
 * is deferred to PR 4.1 because it touches the program engine's
 * dayIndex-keyed completion flow. For now the rows are display-only
 * with a delete affordance.
 */
export default function SavedRoutinesSection() {
  const { user } = useAuth();
  const [routines, setRoutines] = useState<SavedRoutine[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void (async () => {
      try {
        const items = await listSavedRoutines(user.uid);
        if (cancelled) return;
        setRoutines(items);
      } catch {
        // Don't crash the Program page on a routine-list load failure;
        // the rest of the page is unaffected.
        if (!cancelled) setRoutines([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (!user) return null;
  // Hide the section entirely when there's nothing saved AND we're not
  // loading — empty-state chrome on a non-essential surface adds noise.
  if (!loading && routines.length === 0) return null;

  const handleDelete = async (routineId: string) => {
    if (!user || deletingId) return;
    setDeletingId(routineId);
    haptic("light");
    try {
      await deleteSavedRoutine(user.uid, routineId);
      setRoutines((prev) => prev.filter((r) => r.id !== routineId));
      toast.success("Routine removed");
    } catch {
      toast.error("Couldn't delete. Try again.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <section className="pt-6 space-y-2" aria-label="Saved routines">
      <div className="flex items-center gap-2">
        <Bookmark
          className="size-4"
          style={{ color: THEME.brand }}
          aria-hidden="true"
        />
        <h2 className="text-sm font-semibold text-foreground">
          Saved routines
        </h2>
      </div>

      <div className="space-y-2">
        {routines.map((routine) => {
          const setCount = routine.exercises.reduce(
            (s, ex) => s + (ex.setCount || 0),
            0
          );
          return (
            /* Row body links to the runnable session; trash icon is a
               sibling so its click doesn't bubble through the Link. */
            <div
              key={routine.id}
              className="flex items-center gap-3 p-3 rounded-xl bg-card border border-border/40"
            >
              <Link
                to={`/routine/${routine.id}`}
                className="flex items-center gap-3 flex-1 min-w-0"
              >
                <div
                  className="size-9 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: `${THEME.brand}14` }}
                  aria-hidden="true"
                >
                  <Play className="size-4" style={{ color: THEME.brand }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">
                    {routine.name}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    From {routine.sourceAuthorName} · {routine.exercises.length}{" "}
                    exercise
                    {routine.exercises.length === 1 ? "" : "s"}
                    {setCount > 0 ? ` · ${setCount} sets` : ""}
                  </p>
                </div>
              </Link>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  void handleDelete(routine.id);
                }}
                disabled={deletingId === routine.id}
                aria-label={`Remove ${routine.name}`}
                className="p-2 -m-2 text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
