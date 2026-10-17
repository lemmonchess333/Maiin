import { useId, useRef, useState } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { liftUnitLabel, type LiftUnit } from "@/lib/liftLoad";
import { kitLoadIn, kitLoadToKg } from "@/features/program/loadSteps";

/** The ask-first question (`SetValidationWarn`'s words). */
interface SetQuestion {
  title: string;
  message: string;
  confirmLabel: string;
}

export default function EditSetSheet({
  set,
  setName,
  timed,
  unit,
  exerciseId,
  onSave,
  onClose,
}: {
  /** The set as logged, its weight in kg. */
  set: { weight: number; reps: number };
  /** The set as the workout screen names it: "set 2", "warm-up 1". */
  setName: string;
  timed: boolean;
  /** The unit the weight is shown and typed in; `onSave` gets kg. */
  unit: LiftUnit;
  /** The lift, for its kit: a kettlebell reads in whole lb (Lift18). */
  exerciseId?: string;
  /** Saves the set, or resolves to a question to ask first: a weight far
   *  past today's plan or the best for these reps (Lift16). Saving again
   *  with `confirmed` logs it. */
  onSave: (
    values: { weight: number; reps: number },
    confirmed: boolean
  ) => Promise<SetQuestion | undefined>;
  onClose: () => void;
}) {
  const id = useId();
  const [shownWeight] = useState(() =>
    String(kitLoadIn(set.weight, unit, exerciseId))
  );
  const [weight, setWeight] = useState(shownWeight);
  const [reps, setReps] = useState(String(set.reps));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [question, setQuestion] = useState<SetQuestion | null>(null);
  const pending = useRef(false);
  const save = async (confirmed: boolean) => {
    if (pending.current) return;
    if (!weight.trim() || !reps.trim()) {
      setError("Enter a weight and a rep or time value.");
      return;
    }
    pending.current = true;
    setSaving(true);
    setError(null);
    try {
      const asked = await onSave(
        {
          // Untouched, it keeps the kg it was logged at: a kg set read
          // in lb ("132.3") would otherwise come back 10 g heavier.
          weight:
            weight === shownWeight
              ? set.weight
              : kitLoadToKg(Number(weight.replace(",", ".")), unit, exerciseId),
          reps: Number(reps.replace(",", ".")),
        },
        confirmed
      );
      if (asked) setQuestion(asked);
      else onClose();
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
  };
  return (
    <BottomSheet
      open
      onOpenChange={(open) => {
        if (!open && !pending.current) onClose();
      }}
      dismissible={!saving}
      title={`Edit ${setName}`}
      description="Correct this set while keeping the rest of your workout."
      className="z-[70]"
      overlayClassName="z-[60]"
    >
      <form
        className="p-4 space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void save(false);
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          <label htmlFor={`${id}-weight`} className="space-y-2 text-sm">
            <span>Weight ({liftUnitLabel(unit)})</span>
            <input
              id={`${id}-weight`}
              inputMode="decimal"
              value={weight}
              onChange={(event) => {
                setWeight(event.target.value);
                setQuestion(null);
              }}
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
              onChange={(event) => {
                setReps(event.target.value);
                setQuestion(null);
              }}
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
        {question ? (
          <>
            <div role="alert" className="space-y-1">
              <p className="font-semibold">{question.title}</p>
              <p className="text-sm text-muted-foreground">
                {question.message}
              </p>
            </div>
            <Button fullWidth loading={saving} onClick={() => void save(true)}>
              {question.confirmLabel}
            </Button>
            <Button
              variant="ghost"
              fullWidth
              disabled={saving}
              onClick={() => setQuestion(null)}
            >
              Change it
            </Button>
          </>
        ) : (
          <>
            <Button type="submit" fullWidth loading={saving}>
              Save changes
            </Button>
            <Button
              variant="ghost"
              fullWidth
              disabled={saving}
              onClick={onClose}
            >
              Cancel
            </Button>
          </>
        )}
      </form>
    </BottomSheet>
  );
}
