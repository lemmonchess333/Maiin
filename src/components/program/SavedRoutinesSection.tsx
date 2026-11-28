import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Bookmark, Pencil, Plus, Trash2, Play } from "lucide-react";
import { toast } from "@/lib/toast";
import { useUid } from "@/lib/auth";
import {
  listSavedRoutines,
  deleteSavedRoutine,
  restoreSavedRoutine,
  type SavedRoutine,
} from "@/lib/savedRoutines";
import { THEME } from "@/lib/theme";
import { haptic } from "@/lib/haptic";
import { logger } from "@/lib/logger";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { ErrorState } from "@/components/ui/ErrorState";
import SectionHeading from "@/components/ui/SectionHeading";
import RoutineEditorSheet from "./RoutineEditorSheet";

/**
 * "Saved routines" surface on the Program page.
 *
 * Lists workouts the user saved from the social feed or built with the
 * routine editor. Each row launches the routine runner, or lets the user
 * edit or remove the saved template.
 */
export default function SavedRoutinesSection() {
  const uid = useUid();
  const [routines, setRoutines] = useState<SavedRoutine[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editorState, setEditorState] = useState<{
    open: boolean;
    routine: SavedRoutine | null;
  }>({ open: false, routine: null });

  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    void (async () => {
      try {
        const items = await listSavedRoutines(uid);
        if (cancelled) return;
        setRoutines(items);
        setLoadFailed(false);
      } catch (err) {
        // The rest of the Program page is unaffected. Hiding the section,
        // as an empty list does, would tell someone with saved routines
        // they have none, so a failed read says so instead.
        logger.error("[SavedRoutines] list failed", err);
        if (!cancelled) setLoadFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [uid, attempt]);

  if (!uid) return null;
  // Hide the section entirely when there's nothing saved AND we're not
  // loading — empty-state chrome on a non-essential surface adds noise.
  if (!loading && !loadFailed && routines.length === 0 && !editorState.open)
    return null;

  // Undo writes the same document back under the same id, so the row and
  // any /routine/:id link to it return exactly as they were. The section
  // stays mounted (it renders null, not unmounts) while the list is
  // empty, so an Undo on the last routine re-shows it.
  const restore = async (routine: SavedRoutine, index: number) => {
    if (!uid) return;
    try {
      await restoreSavedRoutine(uid, routine);
      setRoutines((prev) => {
        if (prev.some((r) => r.id === routine.id)) return prev;
        const next = [...prev];
        next.splice(Math.min(index, next.length), 0, routine);
        return next;
      });
      haptic("light");
    } catch (err) {
      logger.error("[SavedRoutines] restore failed", err);
      toast.error("Couldn’t restore the routine. Try again.");
    }
  };

  const handleDelete = async (routineId: string) => {
    if (!uid || deletingId) return;
    const index = routines.findIndex((r) => r.id === routineId);
    const routine = routines[index];
    if (!routine) return;
    setDeletingId(routineId);
    haptic("light");
    try {
      await deleteSavedRoutine(uid, routineId);
      setRoutines((prev) => prev.filter((r) => r.id !== routineId));
      toast.success("Routine removed", {
        duration: 8000,
        action: {
          label: "Undo",
          onClick: () => void restore(routine, index),
        },
      });
    } catch {
      toast.error("Couldn’t delete. Try again.");
    } finally {
      setDeletingId(null);
    }
  };

  const handleSaved = (saved: SavedRoutine) => {
    setRoutines((prev) => {
      const idx = prev.findIndex((r) => r.id === saved.id);
      if (idx === -1) return [saved, ...prev];
      return prev.map((r, i) => (i === idx ? saved : r));
    });
  };

  return (
    <section className="pt-6 space-y-2" aria-label="Saved routines">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Bookmark
            className="size-5 shrink-0"
            style={{ color: THEME.lifting }}
            aria-hidden="true"
          />
          <SectionHeading>Saved routines</SectionHeading>
        </div>
        <Button
          variant="ghost"
          size="sm"
          leftIcon={<Plus className="size-4" aria-hidden="true" />}
          onClick={() => {
            haptic("light");
            setEditorState({ open: true, routine: null });
          }}
        >
          New
        </Button>
      </div>

      {loadFailed && routines.length === 0 ? (
        <ErrorState
          title="Couldn’t load your saved routines"
          description="Check your connection and try again."
          retry={{
            onClick: () => {
              setLoadFailed(false);
              setAttempt((n) => n + 1);
            },
          }}
        />
      ) : null}

      <div className="space-y-2">
        {routines.map((routine) => {
          const setCount = routine.exercises.reduce(
            (s, ex) => s + (ex.setCount || 0),
            0
          );
          return (
            /* Row body links to the runnable session; action icons are
               siblings so clicks don't bubble through the Link. */
            <div
              key={routine.id}
              className="flex items-center gap-2 p-3 rounded-xl bg-card surface-flat"
            >
              <Link
                to={`/routine/${routine.id}`}
                className="flex items-center gap-3 flex-1 min-w-0"
              >
                <div
                  className="size-9 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: `${THEME.lifting}14` }}
                  aria-hidden="true"
                >
                  <Play className="size-4" style={{ color: THEME.lifting }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">
                    {routine.name}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {routine.sourceAuthorId === uid
                      ? "Your routine"
                      : `From ${routine.sourceAuthorName}`}{" "}
                    · {routine.exercises.length} exercise
                    {routine.exercises.length === 1 ? "" : "s"}
                    {setCount > 0
                      ? ` · ${setCount} ${setCount === 1 ? "set" : "sets"}`
                      : ""}
                  </p>
                </div>
              </Link>
              <IconButton
                icon={<Pencil className="size-4" />}
                aria-label={`Edit ${routine.name}`}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  haptic("light");
                  setEditorState({ open: true, routine });
                }}
                className="shrink-0 -my-2 text-muted-foreground hover:text-foreground"
              />
              <IconButton
                icon={<Trash2 className="size-4" />}
                aria-label={`Remove ${routine.name}`}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  void handleDelete(routine.id);
                }}
                disabled={deletingId === routine.id}
                className="shrink-0 -my-2 -mr-2 text-muted-foreground hover:text-destructive-strong"
              />
            </div>
          );
        })}
      </div>

      {editorState.open && (
        <RoutineEditorSheet
          key={editorState.routine?.id ?? "new"}
          open
          uid={uid}
          authorName="You"
          routine={editorState.routine}
          onClose={() => setEditorState({ open: false, routine: null })}
          onSaved={handleSaved}
        />
      )}
    </section>
  );
}
