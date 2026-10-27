import { useId } from "react";
import { Minus, Plus } from "lucide-react";
import IconButton from "@/components/ui/IconButton";
import { stepAmount, type AmountUnit } from "@/lib/mealPortion";

interface Props {
  /** Grams for a food measured by weight, servings for anything else. */
  unit: AmountUnit;
  /** The amount as typed. Held as text so a half-typed "1." stays put. */
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
}

/**
 * The typed portion amount: a field with the unit named under it and a
 * step either side. One control for every sheet that sets how much of a
 * food was eaten, the search result's, the barcode result's and the edit
 * sheet's, so the same food is measured the same way however it arrived.
 * The parent owns the text and reads it with `parseAmount`.
 */
export default function PortionAmountField({
  unit,
  value,
  onChange,
  disabled = false,
}: Props) {
  const id = useId();
  const grams = unit === "grams";
  return (
    <div className="flex items-center justify-center gap-4">
      <IconButton
        variant="secondary"
        aria-label={grams ? "Decrease grams" : "Decrease servings"}
        icon={<Minus className="size-4" aria-hidden="true" />}
        onClick={() => onChange(stepAmount(value, unit, -1))}
        disabled={disabled}
        className="rounded-full"
      />
      <div className="text-center">
        <label htmlFor={id} className="sr-only">
          {grams ? "Grams" : "Servings"}
        </label>
        <input
          id={id}
          type="text"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="w-20 min-h-11 rounded-lg bg-muted text-center text-2xl font-bold font-figure tabular-nums text-foreground disabled:opacity-60"
        />
        <p className="text-xs text-muted-foreground">
          {grams ? "grams" : "servings"}
        </p>
      </div>
      <IconButton
        variant="secondary"
        aria-label={grams ? "Increase grams" : "Increase servings"}
        icon={<Plus className="size-4" aria-hidden="true" />}
        onClick={() => onChange(stepAmount(value, unit, 1))}
        disabled={disabled}
        className="rounded-full"
      />
    </div>
  );
}
