import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "@/lib/toast";
import { Check } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { haptic } from "@/lib/haptic";
import { logger } from "@/lib/logger";
import { THEME } from "@/lib/theme";
import { saveRoutine, type SavedRoutineExercise } from "@/lib/savedRoutines";
import { isBodyweightExerciseId } from "@/lib/exercises";
import { BottomSheet } from "@/components/ui/BottomSheet";

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
  exerciseId,
}: {
  setCount: number;
  targetReps: number;
  targetWeightKg: number;
  /** When provided, used to distinguish bodyweight movements from
   *  uncalibrated weighted exercises. Without it, weight === 0 falls
   *  back to "{sets}×{reps}" without a BW label. */
  exerciseId?: string;
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
    // Only label as BW for true bodyweight movements. An uncalibrated
    // weighted exercise (Leg Press at 0kg) shouldn't claim "BW".
    if (isBodyweightExerciseId(exerciseId)) {
      return (
        <span>
          <span className={num}>
            {sets}×{reps}
          </span>
          <span className={unit}> BW</span>
        </span>
      );
    }
    return (
      <span>
        <span className={num}>
          {sets}×{reps}
        </span>
      </span>
    );
  }
  const weightStr = Number.isInteger(weight)
    ? String(weight)
    : weight.toFixed(1);
  return (
    <span>
      <span className={num}>
        {sets}×{reps}×{weightStr}
      </span>
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
  /* `saved` holds the post-success state for ~600ms so the sheet flashes
     a "Saved" affordance on the primary button before closing. Without
     it the sheet snapped shut the moment the Firestore write resolved
     and the only confirmation was a toast that's easy to miss when the
     user has already moved on. */
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    if (!user || saving || saved) return;
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
      /* Post-save continuity: hold the sheet open briefly with a
         visible "Saved" state, then close. The toast still fires with
         a "View in Program" action so a user who looks up after the
         sheet has gone has a clear path back to the routine. */
      setSaving(false);
      setSaved(true);
      haptic("success");
      toast.success("Saved to your routines", {
        action: {
          label: "View in Program",
          onClick: () => {
            navigate(`/routine/${routineId}`);
          },
        },
        duration: 5000,
      });
      window.setTimeout(() => {
        setSaved(false);
        onClose();
      }, 650);
    } catch (err) {
      logger.error("saveRoutine failed:", err);
      toast.error("Couldn't save. Try again.");
      setSaving(false);
    }
  };

  const handleOpenChange = (next: boolean) => {
    if (!next && !saving && !saved) onClose();
  };

  return (
    // Sprint 3 follow-up sweep: vaul boilerplate replaced with the
    // shared BottomSheet primitive. Title + description forwarded
    // via the primitive's props (becomes Drawer.Title /
    // Drawer.Description internally for the aria-labelledby /
    // aria-describedby wiring).
    <BottomSheet
      open={open}
      onOpenChange={handleOpenChange}
      title="Save as routine"
      description={`Snapshot of ${sourceAuthorName}'s workout. You can run it later from your Programme.`}
    >
      <div className="px-5 pb-5 pt-3 space-y-4">
        {/* Name input */}
        <div className="space-y-1.5">
          <label
            htmlFor="routine-name"
            className="text-xs font-medium text-muted-foreground"
          >
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
              <div
                key={i}
                className="flex items-center justify-between gap-2 text-sm"
              >
                <span className="text-foreground truncate">{ex.name}</span>
                <span className="shrink-0 text-xs">
                  <ExerciseSummary
                    setCount={ex.setCount}
                    targetReps={ex.targetReps}
                    targetWeightKg={ex.targetWeightKg}
                    exerciseId={ex.exerciseId}
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
            disabled={saving || saved}
            className="flex-1 py-3 rounded-xl bg-muted text-foreground text-sm font-medium active:scale-[0.98] disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || saved || !name.trim()}
            aria-live="polite"
            className="flex-1 py-3 rounded-xl text-white text-sm font-semibold active:scale-[0.98] disabled:opacity-90 transition-colors flex items-center justify-center gap-1.5"
            style={{
              backgroundColor: saved ? THEME.success : THEME.brandStrong,
            }}
          >
            {saved ? (
              <>
                <Check className="size-4" />
                Saved
              </>
            ) : saving ? (
              "Saving…"
            ) : (
              "Save"
            )}
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}
