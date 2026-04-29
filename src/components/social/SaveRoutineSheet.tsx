import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Drawer } from "vaul";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { haptic } from "@/lib/haptic";
import { saveRoutine, type SavedRoutineExercise } from "@/lib/savedRoutines";

/**
 * Renders the per-exercise summary with numbers in JetBrains Mono and
 * units ("kg", "BW", "sets") in Plus Jakarta — Tropos's "numerals in
 * mono, words in sans" convention. The shared lib formatter returns a
 * pure string and would render the units in mono too, which read as
 * cramped on the routine preview rows. Branching at render time lets
 * each fragment pick its own font without forking the formatter used
 * by the activity feed.
 */
function ExerciseSummary({
  setCount,
  targetReps,
  targetWeightKg,
}: {
  setCount: number;
  targetReps: number;
  targetWeightKg: number;
}) {
  const sets = Math.max(0, Math.round(setCount || 0));
  const reps = Math.max(0, Math.round(targetReps || 0));
  const weight = Math.max(0, Number(targetWeightKg) || 0);

  const num = "font-mono tabular-nums text-foreground/80";
  const unit = "text-muted-foreground/80";

  if (sets === 0 && reps === 0) {
    return <span className="text-muted-foreground/70">—</span>;
  }
  if (reps === 0) {
    return (
      <span>
        <span className={num}>{sets}</span>
        <span className={unit}> {sets === 1 ? "set" : "sets"}</span>
      </span>
    );
  }
  if (weight === 0) {
    return (
      <span>
        <span className={num}>{sets}×{reps}</span>
        <span className={unit}> BW</span>
      </span>
    );
  }
  const weightStr = Number.isInteger(weight) ? String(weight) : weight.toFixed(1);
  return (
    <span>
      <span className={num}>{sets}×{reps}×{weightStr}</span>
      <span className={unit}>kg</span>
    </span>
  );
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Default name shown in the input — usually the source workout's
   *  activityTitle / workoutName. User can edit before saving. */
  defaultName: string;
  sourceActivityId: string;
  sourceAuthorId: string;
  sourceAuthorName: string;
  sourceWorkoutName?: string;
  exercises: SavedRoutineExercise[];
}

const NAME_MAX = 60;

/**
 * "Save as routine" bottom sheet. Opened from the workout ActivityCard
 * action row. Captures the user's chosen name (defaults to the source
 * workout's name) and persists a snapshot to users/{uid}/savedRoutines.
 *
 * The exercise list is shown read-only — this is a save-as-snapshot,
 * not an editor. PR 4.1 will add an editable routine flow.
 */
export default function SaveRoutineSheet({
  open,
  onClose,
  defaultName,
  sourceActivityId,
  sourceAuthorId,
  sourceAuthorName,
  sourceWorkoutName,
  exercises,
}: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState(defaultName);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!user || saving) return;
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Give the routine a name");
      return;
    }
    setSaving(true);
    haptic("light");
    try {
      const routineId = await saveRoutine(user.uid, {
        name: trimmed,
        sourceActivityId,
        sourceAuthorId,
        sourceAuthorName,
        ...(sourceWorkoutName ? { sourceWorkoutName } : {}),
        exercises,
      });
      /* Post-save continuity: instead of a fire-and-forget toast, give
         the user a "View in Program" action on the toast so the social
         → training bridge feels intentional. Tap takes them straight
         to the routine ready to run; Sonner's action prop persists the
         toast until they choose. */
      toast.success("Saved to your routines", {
        action: {
          label: "View in Program",
          onClick: () => {
            navigate(`/routine/${routineId}`);
          },
        },
        duration: 5000,
      });
      onClose();
    } catch (err) {
      console.error("saveRoutine failed:", err);
      toast.error("Couldn't save. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleOpenChange = (next: boolean) => {
    if (!next && !saving) onClose();
  };

  return (
    <Drawer.Root open={open} onOpenChange={handleOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/50 z-40" />
        <Drawer.Content className="fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl bg-card border-t border-border outline-none">
          <div className="mx-auto w-10 h-1 rounded-full bg-border my-3" aria-hidden="true" />
          <div className="px-5 pb-5 space-y-4">
            <Drawer.Title className="text-lg font-bold text-foreground">
              Save as routine
            </Drawer.Title>
            <Drawer.Description className="text-xs text-muted-foreground -mt-2">
              Snapshot of {sourceAuthorName}&apos;s workout. You can run it later from your Program.
            </Drawer.Description>

            {/* Name input */}
            <div className="space-y-1.5">
              <label htmlFor="routine-name" className="text-xs font-medium text-muted-foreground">
                Name
              </label>
              <input
                id="routine-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value.slice(0, NAME_MAX))}
                placeholder="e.g. Push A"
                className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>

            {/* Exercise preview — read-only list of what will be saved.
                Capped at 6 visible rows so the sheet stays compact;
                a longer routine still saves all exercises, just shows
                "+ N more" below the visible six. */}
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">
                Exercises ({exercises.length})
              </p>
              <div className="rounded-xl bg-muted/40 p-3 space-y-1.5">
                {exercises.slice(0, 6).map((ex, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-foreground truncate">{ex.name}</span>
                    <span className="shrink-0 text-xs">
                      <ExerciseSummary
                        setCount={ex.setCount}
                        targetReps={ex.targetReps}
                        targetWeightKg={ex.targetWeightKg}
                      />
                    </span>
                  </div>
                ))}
                {exercises.length > 6 && (
                  <p className="text-xs text-muted-foreground/70 pt-1">
                    + {exercises.length - 6} more
                  </p>
                )}
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="flex-1 py-3 rounded-xl bg-muted text-foreground text-sm font-medium active:scale-[0.98] disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || !name.trim()}
                className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold active:scale-[0.98] disabled:opacity-60"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
