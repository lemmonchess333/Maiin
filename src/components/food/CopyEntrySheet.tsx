import { useId, useRef, useState } from "react";
import type { Meal } from "@/hooks/useMeals";
import BottomSheet from "@/components/ui/BottomSheet";
import Button from "@/components/ui/Button";
import Select from "@/components/ui/Select";
import { haptic } from "@/lib/haptic";
import { mealSlotFor } from "@/lib/mealSlots";
import {
  mealCopyPayload,
  parseCopyPortion,
  type MealCopyResult,
  type MealCopySelection,
} from "@/lib/mealCopy";
import { copyDestinations } from "@/lib/copyDays";
import { CALORIE_UNIT, formatCalories } from "@/utils/formatNutrition";
import { MEAL_LABELS } from "./mealConstants";

interface Props {
  /** The row's entries: one, or each repeat of a row of repeats. */
  sources: readonly Meal[];
  todayKey: string;
  minDate: string;
  onClose: () => void;
  onSave: (
    date: string,
    selections: readonly MealCopySelection[]
  ) => Promise<MealCopyResult>;
}

/**
 * Log an entry again on another day, from any day the diary shows: the
 * row's sheet opens this, and it copies what the row holds to the chosen
 * day at the chosen portion, in the entry's own meal slot. MacroFactor
 * and Yazio copy a row to a day; Tropos copied only yesterday into
 * today's empty slots. It is a copy of a logged entry, not a saved meal
 * (Food6 declined templates).
 */
export default function CopyEntrySheet({
  sources,
  todayKey,
  minDate,
  onClose,
  onSave,
}: Props) {
  const id = useId();
  const days = copyDestinations(todayKey, minDate);
  const [date, setDate] = useState(days[0]?.key ?? todayKey);
  const [amount, setAmount] = useState("1");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /* One destination id per entry for the life of the sheet, so a retry
     after a failed save cannot log the same copy twice. */
  const [destinationIds] = useState(() =>
    sources.map(() => crypto.randomUUID())
  );
  const pending = useRef(false);
  const multiplier = parseCopyPortion(amount);
  const first = sources[0];
  const calories =
    multiplier === null
      ? null
      : sources.reduce(
          (sum, source) =>
            sum + mealCopyPayload(source, multiplier, date).totalCalories,
          0
        );
  const dayLabel = days.find((d) => d.key === date)?.label ?? "Today";

  const save = async () => {
    if (multiplier === null || pending.current) return;
    pending.current = true;
    setSaving(true);
    setError(null);
    haptic("light");
    try {
      const result = await onSave(
        date,
        sources.map((source, i) => ({
          source,
          multiplier,
          destinationId: destinationIds[i],
        }))
      );
      if (result.error === null) onClose();
      else
        setError(
          result.created.length > 0
            ? "Some of it was saved. Try again for the rest."
            : "Couldn't save this copy. Try again."
        );
    } catch {
      setError("Couldn't save this copy. Try again.");
    } finally {
      pending.current = false;
      setSaving(false);
    }
  };

  if (!first) return null;

  return (
    <BottomSheet
      open
      title="Copy to another day"
      description={first.foodName}
      dismissible={!saving}
      onOpenChange={(open) => {
        if (!open && !pending.current) onClose();
      }}
    >
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 space-y-3">
        <p className="text-sm text-muted-foreground">
          It goes into {MEAL_LABELS[mealSlotFor(first)].toLowerCase()} on that
          day. A portion of <span className="font-mono tabular-nums">1</span>{" "}
          copies the amount logged.
        </p>
        <label htmlFor={`${id}-day`} className="block text-sm">
          Day
        </label>
        <Select
          id={`${id}-day`}
          value={date}
          disabled={saving}
          onChange={(event) => setDate(event.target.value)}
        >
          {days.map((day) => (
            <option key={day.key} value={day.key}>
              {day.label}
            </option>
          ))}
        </Select>
        <label htmlFor={`${id}-portion`} className="block text-sm">
          Portion
        </label>
        <input
          id={`${id}-portion`}
          className="ds-input w-full min-h-11 font-mono tabular-nums"
          inputMode="decimal"
          value={amount}
          disabled={saving}
          aria-invalid={multiplier === null}
          aria-describedby={multiplier === null ? `${id}-error` : undefined}
          onChange={(event) => setAmount(event.target.value)}
        />
        {calories !== null ? (
          <p className="text-sm">
            <span className="font-mono tabular-nums">
              {formatCalories(calories)}
            </span>{" "}
            {CALORIE_UNIT}
          </p>
        ) : (
          <p
            id={`${id}-error`}
            role="alert"
            className="text-sm text-destructive-strong"
          >
            Enter a portion greater than{" "}
            <span className="font-mono tabular-nums">0</span> and no more than{" "}
            <span className="font-mono tabular-nums">20</span>.
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive-strong">
            {error}
          </p>
        )}
      </div>
      <div className="shrink-0 border-t border-border/50 px-4 py-3">
        {/* Logging food is the food orange wherever it happens
            (DESIGN_GUIDE §14i). */}
        <Button
          variant="nutrition"
          fullWidth
          loading={saving}
          disabled={multiplier === null}
          onClick={() => void save()}
        >
          {`Log to ${dayLabel}`}
        </Button>
      </div>
    </BottomSheet>
  );
}
