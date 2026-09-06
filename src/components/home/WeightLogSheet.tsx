import { useRef, useState } from "react";
import BottomSheet from "@/components/ui/BottomSheet";
import Button from "@/components/ui/Button";
import IconButton from "@/components/ui/IconButton";
import { Minus, Plus } from "lucide-react";
import { formatWeightInUnit } from "@/lib/weightUnits";
import { localDateString } from "@/lib/dateHelpers";
import {
  parseWeightEntry,
  saveWeightEntry,
  validWeightDate,
} from "@/lib/weightEntry";
import { toast } from "@/lib/toast";

export default function WeightLogSheet({
  uid,
  unit,
  initialKg,
  onClose,
}: {
  uid: string;
  unit: "kg" | "lbs";
  initialKg?: number;
  onClose: () => void;
}) {
  const initial = initialKg ? formatWeightInUnit(initialKg, unit) : "";
  const [value, setValue] = useState(initial);
  const [date, setDate] = useState(localDateString);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const change = (delta: number) => {
    const amount = Number(value.replace(",", "."));
    if (!Number.isFinite(amount)) return;
    setValue(Math.max(0, amount + delta).toFixed(1));
    setError("");
  };
  const save = async () => {
    if (pending.current) return;
    // An untouched display preserves the precise canonical value.
    const kg =
      value === initial && initialKg
        ? initialKg
        : parseWeightEntry(value, unit);
    if (kg === null || kg === undefined) {
      setError(
        "Enter a valid weight between 20 and 350 kg, or the equivalent in pounds."
      );
      return;
    }
    if (!validWeightDate(date)) {
      setError("Choose today or an earlier valid date.");
      return;
    }
    pending.current = true;
    setSaving(true);
    setError("");
    try {
      const undo = await saveWeightEntry(uid, date, kg);
      window.dispatchEvent(new Event("tropos:weight-changed"));
      let undoing = false;
      toast.success("Weight logged", {
        duration: 8000,
        action: {
          label: "Undo",
          onClick: async () => {
            if (undoing) return;
            undoing = true;
            try {
              await undo();
              window.dispatchEvent(new Event("tropos:weight-changed"));
              toast.success("Weight entry undone");
            } catch (err) {
              toast.error(
                err instanceof Error ? err.message : "Couldn't undo weight."
              );
              undoing = false;
            }
          },
        },
      });
      onClose();
    } catch (err) {
      setError(
        err instanceof Error && !("code" in err)
          ? err.message
          : "Couldn't save your weight. Check your connection and try again."
      );
    } finally {
      pending.current = false;
      setSaving(false);
    }
  };
  return (
    <BottomSheet
      open
      title="Log weight"
      description="Choose the weight and date to record"
      dismissible={!saving}
      onOpenChange={(open) => {
        if (!open && !pending.current) onClose();
      }}
    >
      <div className="px-4 pb-6 pt-3 space-y-4">
        <label htmlFor="weight-value" className="block text-sm font-semibold">
          Weight ({unit === "lbs" ? "lb" : "kg"})
        </label>
        <div className="flex items-center gap-2">
          <IconButton
            aria-label="Decrease weight by 0.1"
            disabled={saving}
            onClick={() => change(-0.1)}
            icon={<Minus />}
          />
          <input
            id="weight-value"
            inputMode="decimal"
            className="ds-input min-w-0 w-full text-center text-2xl font-mono tabular-nums"
            value={value}
            disabled={saving}
            aria-invalid={!!error}
            aria-describedby={error ? "weight-error" : undefined}
            onChange={(e) => {
              setValue(e.target.value);
              setError("");
            }}
          />
          <IconButton
            aria-label="Increase weight by 0.1"
            disabled={saving}
            onClick={() => change(0.1)}
            icon={<Plus />}
          />
        </div>
        <label className="block text-sm" htmlFor="weight-date">
          Date
        </label>
        <input
          id="weight-date"
          type="date"
          className="ds-input min-h-11 w-full"
          value={date}
          max={localDateString()}
          disabled={saving}
          onChange={(e) => {
            setDate(e.target.value);
            setError("");
          }}
        />
        <p className="text-micro text-muted-foreground">
          A new entry for the same day replaces that day's weight.
        </p>
        {error && (
          <p
            id="weight-error"
            role="alert"
            className="text-sm text-destructive-strong"
          >
            {error}
          </p>
        )}
        {saving && (
          <p role="status" className="text-sm text-muted-foreground">
            Saving weight…
          </p>
        )}
        <Button
          fullWidth
          loading={saving}
          aria-label="Log weight"
          onClick={() => void save()}
        >
          Log weight
        </Button>
      </div>
    </BottomSheet>
  );
}
