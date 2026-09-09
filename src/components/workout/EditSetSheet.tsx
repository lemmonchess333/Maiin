import { useId, useRef, useState } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";

export default function EditSetSheet({
  set,
  setNumber,
  timed,
  onSave,
  onClose,
}: {
  set: { weight: number; reps: number };
  setNumber: number;
  timed: boolean;
  onSave: (values: { weight: number; reps: number }) => Promise<void>;
  onClose: () => void;
}) {
  const id = useId();
  const [weight, setWeight] = useState(String(set.weight));
  const [reps, setReps] = useState(String(set.reps));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);
  return (
    <BottomSheet
      open
      onOpenChange={(open) => {
        if (!open && !pending.current) onClose();
      }}
      dismissible={!saving}
      title={`Edit set ${setNumber}`}
      description="Correct this set while keeping the rest of your workout."
      className="z-[70]"
      overlayClassName="z-[60]"
    >
      <form
        className="p-4 space-y-4"
        onSubmit={async (event) => {
          event.preventDefault();
          if (pending.current) return;
          if (!weight.trim() || !reps.trim()) {
            setError("Enter a weight and a rep or time value.");
            return;
          }
          pending.current = true;
          setSaving(true);
          setError(null);
          try {
            await onSave({
              weight: Number(weight.replace(",", ".")),
              reps: Number(reps.replace(",", ".")),
            });
            onClose();
          } catch (cause) {
            setError(
              cause instanceof Error
                ? cause.message
                : "Couldn’t save your correction. Try again."
            );
          } finally {
            pending.current = false;
            setSaving(false);
          }
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          <label htmlFor={`${id}-weight`} className="space-y-2 text-sm">
            <span>Weight (kg)</span>
            <input
              id={`${id}-weight`}
              inputMode="decimal"
              value={weight}
              onChange={(event) => setWeight(event.target.value)}
              disabled={saving}
              aria-describedby={error ? `${id}-error` : undefined}
              className="ds-input min-h-11 font-mono tabular-nums"
            />
          </label>
          <label htmlFor={`${id}-reps`} className="space-y-2 text-sm">
            <span>{timed ? "Seconds" : "Reps"}</span>
            <input
              id={`${id}-reps`}
              inputMode="numeric"
              value={reps}
              onChange={(event) => setReps(event.target.value)}
              disabled={saving}
              aria-describedby={error ? `${id}-error` : undefined}
              className="ds-input min-h-11 font-mono tabular-nums"
            />
          </label>
        </div>
        {error && (
          <p
            id={`${id}-error`}
            role="alert"
            className="text-sm text-destructive-strong"
          >
            {error}
          </p>
        )}
        <Button type="submit" fullWidth loading={saving}>
          Save changes
        </Button>
        <Button variant="ghost" fullWidth disabled={saving} onClick={onClose}>
          Cancel
        </Button>
      </form>
    </BottomSheet>
  );
}
