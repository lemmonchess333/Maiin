import { useRef, useState } from "react";
import BottomSheet from "@/components/ui/BottomSheet";
import Button from "@/components/ui/Button";
import { MEAL_ORDER, MEAL_LABELS, type MealKey } from "@/components/food/mealConstants";
import type { QuickAddItem } from "@/lib/quickAddOrder";
import { scaleQuickMeal } from "@/lib/quickMealEntry";

export default function QuickMealPortionSheet({
  meal,
  onClose,
  onLog,
  slot,
}: {
  meal: QuickAddItem;
  onClose: () => void;
  slot?: MealKey;
  onLog: (meal: QuickAddItem, slot?: MealKey) => Promise<boolean>;
}) {
  const [selectedSlot, setSelectedSlot] = useState<MealKey>(slot ?? "lunch");
  const [amount, setAmount] = useState("1");
  const [saving, setSaving] = useState(false);
  const pending = useRef(false);
  const number = Number(amount.replace(",", "."));
  const valid = /^\d+(?:[.,]\d+)?$/.test(amount) && number > 0 && number <= 20;
  const save = async () => {
    if (!valid || pending.current) return;
    pending.current = true;
    setSaving(true);
    try {
      if (await onLog(scaleQuickMeal(meal, number), selectedSlot)) onClose();
    } finally {
      pending.current = false;
      setSaving(false);
    }
  };
  return (
    <BottomSheet
      open
      title="Change portion"
      description={meal.name}
      dismissible={!saving}
      onOpenChange={(open) => {
        if (!open && !pending.current) onClose();
      }}
    >
      <div className="px-4 pb-6 pt-3 space-y-3">
        <p className="text-sm text-muted-foreground">
          Usual portion: {meal.portionSize}. This only changes the entry you log
          now.
        </p>
        <label htmlFor="quick-portion" className="block text-sm">
          Number of usual portions
        </label>
        <input
          id="quick-portion"
          className="ds-input w-full min-h-11 font-mono tabular-nums"
          inputMode="decimal"
          value={amount}
          disabled={saving}
          onChange={(e) => setAmount(e.target.value)}
          aria-invalid={!valid}
        />
        {valid ? (
          <p className="text-sm font-mono tabular-nums">
            {Math.round(meal.cal * number)} kcal
          </p>
        ) : (
          <p role="alert" className="text-sm text-destructive-strong">
            Enter a portion greater than 0 and no more than 20.
          </p>
        )}
        <label htmlFor="quick-meal-slot" className="block text-sm">Add to</label>
        <select id="quick-meal-slot" className="ds-input w-full min-h-11" value={selectedSlot}
          disabled={saving} onChange={(event) => setSelectedSlot(event.target.value as MealKey)}>
          {MEAL_ORDER.map((key) => <option key={key} value={key}>{MEAL_LABELS[key]}</option>)}
        </select>
        <Button
          fullWidth
          disabled={!valid}
          loading={saving}
          aria-label="Log this portion"
          onClick={() => void save()}
        >
          Log this portion
        </Button>
      </div>
    </BottomSheet>
  );
}
