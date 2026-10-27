import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "@/lib/toast";
import { Check } from "lucide-react";
import { useUid } from "@/lib/auth";
import { haptic } from "@/lib/haptic";
import { logger } from "@/lib/logger";
import { THEME } from "@/lib/theme";
import {
  saveRoutine,
  isExternalRoutineSource,
  redactExternalRoutineExercises,
  type SavedRoutineExercise,
} from "@/lib/savedRoutines";
import {
  formatExerciseSummary,
  type ExerciseSummaryInput,
} from "@/lib/exerciseSummary";
import InlineNumerals from "@/components/ui/InlineNumerals";
import { useLiftUnit } from "@/hooks/useLiftUnit";
import { BottomSheet } from "@/components/ui/BottomSheet";

/** Keep the preview and feed on one formatter; its numbers take the inline number tier.
 *  In the reader's unit, as the feed card's rows are (Lift18). */
function ExerciseSummary(props: ExerciseSummaryInput) {
  const liftUnit = useLiftUnit();
  return (
    <span className="text-muted-foreground [&_.font-mono]:text-foreground/80">
      <InlineNumerals>{formatExerciseSummary(props, liftUnit)}</InlineNumerals>
    </span>
  );
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Default name shown in the input — usually the source workout's
   *  activityTitle / workoutName. User can edit before saving. */
  defaultName: string;
  /** The post it is saved from. Absent when saved from the person's own
   *  workout (`/workout/:id`), which may never have been posted. */
  sourceActivityId?: string;
  sourceAuthorId: string;
  sourceAuthorName: string;
  sourceWorkoutName?: string;
  exercises: SavedRoutineExercise[];
}

const NAME_MAX = 60;

/**
 * "Save as routine" bottom sheet. Opened from the workout ActivityCard
 * action row, and from a saved workout's own page (`/workout/:id`), so a
 * person who never posts can still keep a session to run again. Captures the user's chosen name (defaults to the source
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
  const uid = useUid();
  const navigate = useNavigate();
  const [name, setName] = useState(defaultName);
  const [saving, setSaving] = useState(false);
  /* Structure-only external saves: the preview must show what will
     actually be saved. Saving ANOTHER member's workout blanks their
     working weights (the lib redacts on write too — this keeps the sheet
     honest); saving your own keeps your loads. */
  const external = isExternalRoutineSource(uid ?? "", sourceAuthorId);
  const previewExercises = redactExternalRoutineExercises(
    uid ?? "",
    sourceAuthorId,
    exercises
  );
  /* `saved` holds the post-success state for ~600ms so the sheet flashes
     a "Saved" affordance on the primary button before closing. Without
     it the sheet snapped shut the moment the Firestore write resolved
     and the only confirmation was a toast that's easy to miss when the
     user has already moved on. */
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    if (!uid || saving || saved) return;
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Give the routine a name");
      return;
    }
    setSaving(true);
    haptic("light");
    try {
      const routineId = await saveRoutine(uid, {
        name: trimmed,
        ...(sourceActivityId ? { sourceActivityId } : {}),
        sourceAuthorId,
        sourceAuthorName,
        ...(sourceWorkoutName ? { sourceWorkoutName } : {}),
        exercises,
      });
      /* Post-save continuity: hold the sheet open briefly with a
         visible "Saved" state, then close. The toast still fires with
         an "Open routine" action so a user who looks up after the
         sheet has gone has a clear path back to the routine. */
      setSaving(false);
      setSaved(true);
      haptic("success");
      toast.success("Saved to your routines", {
        action: {
          label: "Open routine",
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
      description={
        external
          ? `Snapshot of ${sourceAuthorName}'s workout. You can run it later from the Train tab.`
          : "A copy of this workout. You can run it again from the Train tab."
      }
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
            className="ds-input text-sm"
          />
        </div>

        {/* Exercise preview — read-only list of what will be saved.
                Capped at 6 visible rows so the sheet stays compact;
                a longer routine still saves all exercises, just shows
                "+ N more" below the visible six. */}
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">
            Exercises ({previewExercises.length})
          </p>
          <div className="rounded-xl bg-muted/40 p-3 space-y-1.5">
            {previewExercises.slice(0, 6).map((ex, i) => (
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
            {previewExercises.length > 6 && (
              <p className="text-xs text-muted-foreground pt-1">
                + {previewExercises.length - 6} more
              </p>
            )}
          </div>
          {external && (
            <p className="text-xs text-muted-foreground">
              Saves the structure only — your own history sets the weights.
            </p>
          )}
        </div>

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={saving || saved}
            className="flex-1 py-3 rounded-xl bg-muted text-foreground text-sm font-medium transition-transform active:scale-[0.98] disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || saved || !name.trim()}
            aria-live="polite"
            className="flex-1 py-3 rounded-xl text-white text-sm font-semibold active:scale-[0.98] disabled:opacity-90 transition flex items-center justify-center gap-1.5"
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
