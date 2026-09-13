import { useRef, useState } from "react";
import type { Workout } from "@/hooks/useWorkouts";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { db } from "@/lib/firebase";
import { correctSavedWorkout } from "@/lib/workoutCorrection";
import { createWorkoutCompletionId } from "@/hooks/useWorkoutDraft";
import { toast } from "sonner";

export default function CorrectWorkoutSheet({
  uid,
  workout,
  onClose,
  onSaved,
}: {
  uid: string;
  workout: Workout;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [correctionId] = useState(createWorkoutCompletionId);
  const [minutes, setMinutes] = useState(String(workout.durationMinutes ?? 0));
  const [sets, setSets] = useState(() =>
    workout.exercises.map((ex) =>
      ex.sets.map((set) => ({
        weightKg: String(set.weightKg),
        reps: String(set.reps),
      }))
    )
  );
  const [saving, setSaving] = useState(false);
  const pending = useRef(false);
  const [error, setError] = useState("");
  const number = (value: string) => (value.trim() ? Number(value) : NaN);
  const changed =
    minutes !== String(workout.durationMinutes ?? 0) ||
    sets.some((row, i) =>
      row.some(
        (set, j) =>
          set.weightKg !== String(workout.exercises[i].sets[j].weightKg) ||
          set.reps !== String(workout.exercises[i].sets[j].reps)
      )
    );
  async function save() {
    if (pending.current || !changed) return;
    pending.current = true;
    setSaving(true);
    setError("");
    try {
      await correctSavedWorkout(
        db,
        uid,
        workout.id,
        workout.revision ?? 0,
        correctionId,
        {
          durationMinutes: number(minutes),
          exercises: sets.map((row) => ({
            sets: row.map((set) => ({
              weightKg: number(set.weightKg),
              reps: number(set.reps),
            })),
          })),
        }
      );
      toast.success("Workout corrected");
      onSaved();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Couldn't save your corrections. Try again."
      );
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }
  function change(
    i: number,
    j: number,
    field: "weightKg" | "reps",
    value: string
  ) {
    setSets((before) =>
      before.map((row, ex) =>
        ex !== i
          ? row
          : row.map((set, index) =>
              index !== j ? set : { ...set, [field]: value }
            )
      )
    );
  }
  return (
    <Dialog
      open
      onClose={() => {
        if (!pending.current) onClose();
      }}
      title="Correct workout"
      description="Changes update history, totals and records. Your programme adjusts only when this workout still determines its targets."
      size="lg"
      position="bottom"
      className="max-h-[85dvh] overflow-y-auto"
    >
      <form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <label
          className="block text-sm font-medium"
          htmlFor="correction-minutes"
        >
          Duration (minutes)
          <input
            id="correction-minutes"
            type="number"
            min="0"
            max="1440"
            step="1"
            value={minutes}
            disabled={saving}
            onChange={(event) => setMinutes(event.target.value)}
            className="ds-input min-h-11 mt-1 w-full font-mono tabular-nums"
          />
        </label>
        {workout.exercises.map((exercise, i) => (
          <fieldset
            key={`${exercise.exerciseId}-${i}`}
            className="space-y-3"
            disabled={saving}
          >
            <legend className="text-sm font-semibold mb-2">
              {exercise.exerciseName}
            </legend>
            {sets[i].map((set, j) => (
              <div key={j} className="grid grid-cols-2 gap-3">
                <label
                  className="text-xs text-muted-foreground"
                  htmlFor={`correction-${i}-${j}-weight`}
                >
                  Set <span className="font-mono tabular-nums">{j + 1}</span>{" "}
                  weight (kg)
                  <input
                    id={`correction-${i}-${j}-weight`}
                    type="number"
                    min="0"
                    max="500"
                    step="any"
                    value={set.weightKg}
                    onChange={(event) =>
                      change(i, j, "weightKg", event.target.value)
                    }
                    className="ds-input min-h-11 mt-1 w-full font-mono tabular-nums"
                  />
                </label>
                <label
                  className="text-xs text-muted-foreground"
                  htmlFor={`correction-${i}-${j}-reps`}
                >
                  Set <span className="font-mono tabular-nums">{j + 1}</span>{" "}
                  {exercise.repUnit === "seconds" ? "seconds" : "reps"}
                  <input
                    id={`correction-${i}-${j}-reps`}
                    type="number"
                    min="1"
                    step="1"
                    value={set.reps}
                    onChange={(event) =>
                      change(i, j, "reps", event.target.value)
                    }
                    className="ds-input min-h-11 mt-1 w-full font-mono tabular-nums"
                  />
                </label>
              </div>
            ))}
          </fieldset>
        ))}
        {error && (
          <p role="alert" className="text-sm text-destructive-strong">
            {error}
          </p>
        )}
        <div className="flex gap-3">
          <Button
            type="button"
            variant="secondary"
            fullWidth
            disabled={saving}
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button type="submit" fullWidth disabled={saving || !changed}>
            {saving ? "Saving…" : "Save corrections"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
