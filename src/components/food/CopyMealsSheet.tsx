import { useId, useRef, useState } from "react";
import type { Meal } from "@/hooks/useMeals";
import BottomSheet from "@/components/ui/BottomSheet";
import Button from "@/components/ui/Button";
import SectionLabel from "@/components/ui/SectionLabel";
import { haptic } from "@/lib/haptic";
import { mealSlotFor } from "@/lib/mealSlots";
import { mealCopyPayload, parseCopyPortion, type MealCopyResult, type MealCopySelection } from "@/lib/mealCopy";
import { MEAL_LABELS, MEAL_ORDER } from "./mealConstants";

interface Props {
  sources: readonly Meal[];
  onClose: () => void;
  onSave: (selections: readonly MealCopySelection[]) => Promise<MealCopyResult>;
}

/** The existing yesterday preview, with choices made before any write.
 * Snapshot once: live diary updates during a partial save must not replace
 * the remaining choices or reset a portion the person is still editing. */
export default function CopyMealsSheet({ sources, onClose, onSave }: Props) {
  const fieldId = useId();
  const [rows, setRows] = useState(() => sources.map((source) => ({
    source, selected: true, amount: "1", destinationId: crypto.randomUUID(),
  })));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);
  const selected = rows.filter((row) => row.selected);
  const valid = selected.length > 0 && selected.every((row) => parseCopyPortion(row.amount) !== null);
  const totals = selected.reduce((sum, row) => {
    const multiplier = parseCopyPortion(row.amount);
    if (multiplier === null) return sum;
    const payload = mealCopyPayload(row.source, multiplier, row.source.date);
    return {
      calories: sum.calories + payload.totalCalories,
      protein: sum.protein + payload.totalProtein,
      carbs: sum.carbs + payload.totalCarbs,
      fat: sum.fat + payload.totalFat,
    };
  }, { calories: 0, protein: 0, carbs: 0, fat: 0 });

  const save = async () => {
    if (!valid || pending.current) return;
    pending.current = true;
    setSaving(true);
    setError(null);
    haptic("light");
    try {
      const result = await onSave(selected.map((row) => ({
        source: row.source,
        multiplier: parseCopyPortion(row.amount)!,
        destinationId: row.destinationId,
      })));
      if (result.error !== null) {
        const copied = new Set(result.created.map((entry) => entry.sourceId));
        setRows((current) => current.filter((row) => !copied.has(row.source.id)));
        setError(result.created.length > 0
          ? "Some meals were saved. Your remaining choices are still here; try again."
          : "Couldn't save these meals. Your choices are still here; try again.");
      } else {
        onClose();
      }
    } catch {
      setError("Couldn't save these meals. Your choices are still here; try again.");
    } finally {
      pending.current = false;
      setSaving(false);
    }
  };

  return (
    <BottomSheet
      open
      title="Copy yesterday's meals"
      description="Choose the meals to log. Each stays in its original meal slot."
      dismissible={!saving}
      onOpenChange={(open) => { if (!open && !pending.current) onClose(); }}
    >
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 space-y-3">
        <p className="text-sm text-muted-foreground">
          A portion of <span className="font-mono tabular-nums">1</span> copies the amount logged yesterday.
        </p>
        {MEAL_ORDER.map((slot) => {
          const slotRows = rows.filter((row) => mealSlotFor(row.source) === slot);
          if (slotRows.length === 0) return null;
          return (
            <div key={slot}>
              <SectionLabel>{MEAL_LABELS[slot]}</SectionLabel>
              <div className="divide-y divide-border/50">
                {slotRows.map((row) => {
                  const inputId = `${fieldId}-${row.destinationId}`;
                  const multiplier = parseCopyPortion(row.amount);
                  return (
                    <div key={row.source.id} className="py-2 space-y-1.5">
                      <div className="flex items-center gap-3">
                      <label className="flex flex-1 min-w-0 items-center gap-3 min-h-11 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={row.selected}
                          disabled={saving}
                          onChange={(event) => {
                            haptic("light");
                            setRows((current) => current.map((item) => item.source.id === row.source.id
                              ? { ...item, selected: event.target.checked } : item));
                          }}
                          className="size-5 shrink-0 accent-primary focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2"
                        />
                        <span className="min-w-0 text-base font-semibold break-words">{row.source.foodName}</span>
                      </label>
                      <div className="w-20 shrink-0">
                        <label htmlFor={inputId} className="sr-only">Portion for {row.source.foodName}</label>
                        <input
                          id={inputId}
                          aria-label={`Portion for ${row.source.foodName}`}
                          aria-describedby={row.selected && multiplier === null ? `${inputId}-error` : undefined}
                          inputMode="decimal"
                          className="ds-input min-h-11 font-mono tabular-nums text-center"
                          value={row.amount}
                          disabled={!row.selected || saving}
                          aria-invalid={row.selected && multiplier === null}
                          onChange={(event) => setRows((current) => current.map((item) => item.source.id === row.source.id
                            ? { ...item, amount: event.target.value } : item))}
                        />
                      </div>
                      </div>
                      <div className="flex items-start justify-between gap-3 text-xs text-muted-foreground">
                        <p className="min-w-0 break-words">
                          Yesterday: {row.source.items.length > 0
                            ? row.source.items.map((item) => item.portionSize).join(", ")
                            : "logged portion"}
                        </p>
                        {multiplier !== null && (
                          <span className="shrink-0 whitespace-nowrap">
                            <span className="font-mono tabular-nums">{Math.round(row.source.totalCalories * multiplier)}</span> kcal
                          </span>
                        )}
                      </div>
                      {row.selected && multiplier === null && (
                        <p id={`${inputId}-error`} role="alert" className="text-sm text-destructive-strong">
                          Enter a portion greater than <span className="font-mono tabular-nums">0</span> and no more than <span className="font-mono tabular-nums">20</span>.
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <div className="shrink-0 border-t border-border/50 px-4 py-3 space-y-3">
        <div className="space-y-1" role="status" aria-live="polite">
          <p className="text-sm">
            <span className="font-mono tabular-nums">{selected.length}</span> {selected.length === 1 ? "meal" : "meals"} selected
            {valid && <> · <span className="font-mono tabular-nums">{Math.round(totals.calories)}</span> kcal</>}
          </p>
          {valid && (
            <p className="text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-1">
              <span>Protein <span className="font-mono tabular-nums">{Math.round(totals.protein)}</span> g</span>
              <span>Carbs <span className="font-mono tabular-nums">{Math.round(totals.carbs)}</span> g</span>
              <span>Fat <span className="font-mono tabular-nums">{Math.round(totals.fat)}</span> g</span>
            </p>
          )}
        </div>
        {error && <p role="alert" className="text-sm text-destructive-strong">{error}</p>}
        <Button fullWidth loading={saving} disabled={!valid} onClick={() => void save()}>
          Log selected meals
        </Button>
      </div>
    </BottomSheet>
  );
}
