import { useRef, useState } from "react";
import BottomSheet from "@/components/ui/BottomSheet";
import Button from "@/components/ui/Button";
import IconButton from "@/components/ui/IconButton";
import { Minus, Plus } from "lucide-react";
import SegmentedControl from "@/components/ui/SegmentedControl";
import { format, subDays } from "date-fns";
import { formatStonePounds, kgToStonePounds, stonePoundsToKg, formatWeightInUnit } from "@/lib/weightUnits";
import { localDateString } from "@/lib/dateHelpers";
import {
  parseWeightEntry,
  validWeightDate,
} from "@/lib/weightEntry";
import { queueWeightEntry } from "@/lib/weightQueue";
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
  type DisplayUnit = "kg" | "lbs" | "st";
  const [selectedUnit, setSelectedUnit] = useState<DisplayUnit>(unit);
  const initial = initialKg ? (selectedUnit === "st" ? String(kgToStonePounds(initialKg).stone) : formatWeightInUnit(initialKg, selectedUnit)) : "";
  const [pounds, setPounds] = useState(initialKg ? String(kgToStonePounds(initialKg).pounds) : "0");
  const minimumDate = localDateString(subDays(new Date(), 30));
  const [value, setValue] = useState(initial);
  const [date, setDate] = useState(localDateString);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const parsedKg = () => {
    if (selectedUnit !== "st") return value === initial && initialKg ? initialKg : parseWeightEntry(value, selectedUnit);
    if (!/^\d+$/.test(value) || !/^\d+(?:[.,]\d+)?$/.test(pounds)) return null;
    const remaining = Number(pounds.replace(",", "."));
    if (remaining < 0 || remaining >= 14) return null;
    if (initialKg && value === initial && remaining === kgToStonePounds(initialKg).pounds) return initialKg;
    const kg = stonePoundsToKg(Number(value), remaining);
    return kg >= 20 && kg <= 350 ? kg : null;
  };
  const changeUnit = (next: DisplayUnit) => {
    const kg = parsedKg();
    if (kg !== null) {
      const stone = kgToStonePounds(kg);
      setValue(next === "st" ? String(stone.stone) : formatWeightInUnit(kg, next));
      setPounds(String(stone.pounds));
    }
    setSelectedUnit(next);
    setError("");
  };
  const change = (delta: number) => {
    const amount = Number(value.replace(",", "."));
    if (!Number.isFinite(amount)) return;
    setValue(Math.max(0, amount + delta).toFixed(1));
    setError("");
  };
  const save = async () => {
    if (pending.current) return;
    // An untouched display preserves the precise canonical value.
    const kg = parsedKg();
    if (kg === null || kg === undefined) {
      setError(
        "Enter a valid weight between 20 and 350 kg, or the equivalent in pounds."
      );
      return;
    }
    if (!validWeightDate(date) || date < minimumDate) {
      setError("Choose a day within the last 30 days.");
      return;
    }
    pending.current = true;
    setSaving(true);
    setError("");
    try {
      const undo = queueWeightEntry(uid, date, kg);
      window.dispatchEvent(new Event("tropos:weight-changed"));
      let undoing = false;
      toast.success(!navigator.onLine ? "Saved on this phone — syncs when you’re back online" : `Logged ${selectedUnit === "st" ? formatStonePounds(kg) : `${formatWeightInUnit(kg, selectedUnit)} ${selectedUnit === "lbs" ? "lb" : "kg"}`} · ${format(new Date(`${date}T12:00:00`), "EEE d MMM")}`, {
        duration: 5000,
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
        <SegmentedControl<DisplayUnit> ariaLabel="Weight unit" value={selectedUnit} onChange={changeUnit} disabled={saving}
          options={[{ value: "kg", label: "kg" }, { value: "lbs", label: "lb" }, { value: "st", label: "st" }]} />
        <label htmlFor="weight-value" className="block text-sm font-semibold">
          Weight ({selectedUnit === "lbs" ? "lb" : selectedUnit})
        </label>
        <div className="flex items-center gap-2">
          {selectedUnit !== "st" && <IconButton
            aria-label="Decrease weight by 0.1"
            disabled={saving}
            onClick={() => change(-0.1)}
            icon={<Minus />}
          />}
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
          {selectedUnit !== "st" && <IconButton
            aria-label="Increase weight by 0.1"
            disabled={saving}
            onClick={() => change(0.1)}
            icon={<Plus />}
          />}
        </div>
        {selectedUnit === "st" && <label className="block text-sm">Pounds
          <input aria-label="Pounds" className="ds-input min-h-11 w-full font-mono tabular-nums" inputMode="decimal" value={pounds} disabled={saving} onChange={(event) => setPounds(event.target.value)} />
        </label>}
        <div className="flex gap-2">
          <Button variant="secondary" disabled={saving} onClick={() => setDate(localDateString())}>Today</Button>
          <Button variant="secondary" disabled={saving} onClick={() => setDate(localDateString(subDays(new Date(), 1)))}>Yesterday</Button>
        </div>
        <label className="block text-sm" htmlFor="weight-date">
          Date
        </label>
        <input
          id="weight-date"
          type="date"
          className="ds-input min-h-11 w-full"
          value={date}
          min={minimumDate}
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
