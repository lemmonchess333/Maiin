import { useEffect, useRef, useState } from "react";
import BottomSheet from "@/components/ui/BottomSheet";
import Button from "@/components/ui/Button";
import WeightScaleDial from "./WeightScaleDial";
import SegmentedControl from "@/components/ui/SegmentedControl";
import { format, subDays } from "date-fns";
import {
  kgToLb,
  lbToKg,
  formatStonePounds,
  kgToStonePounds,
  stonePoundsToKg,
  formatWeightInUnit,
} from "@/lib/weightUnits";
import { localDateString } from "@/lib/dateHelpers";
import { parseWeightEntry, validWeightDate } from "@/lib/weightEntry";
import { queueWeightEntry } from "@/lib/weightQueue";
import { toast } from "@/lib/toast";
import { track as trackHomeEvent } from "@/lib/homeAnalytics";

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
  const initial = initialKg
    ? selectedUnit === "st"
      ? String(kgToStonePounds(initialKg).stone)
      : formatWeightInUnit(initialKg, selectedUnit)
    : "";
  const [pounds, setPounds] = useState(
    initialKg ? String(kgToStonePounds(initialKg).pounds) : "0"
  );
  const minimumDate = localDateString(subDays(new Date(), 30));
  const [value, setValue] = useState(initial);
  const [date, setDate] = useState(localDateString);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const [preciseKg, setPreciseKg] = useState<number | null>(initialKg ?? null);

  /**
   * B0 effort instrumentation. `interactions` counts CONTROL CHANGES, not
   * literal screen taps — a dial drag registers per settled value and a run
   * of typing registers per keystroke. It is a within-path trend, so
   * comparing a dialled save against a typed one by this number alone would
   * be reading noise; `typed` / `picker` are what separate the paths.
   */
  // Stamped in the mount effect, not at useRef(Date.now()): an impure call
  // during render trips react-hooks/purity, and the same workaround is
  // already the house pattern for Food's render-timing ref.
  const openedAt = useRef(0);
  const interactions = useRef(0);
  const typedRef = useRef(false);
  const pickerRef = useRef(false);
  const noteInteraction = () => {
    interactions.current += 1;
  };
  useEffect(() => {
    openedAt.current = Date.now();
    trackHomeEvent("weight_sheet_open");
  }, []);
  const parsedKg = () => {
    if (preciseKg !== null) return preciseKg;
    if (selectedUnit !== "st") return parseWeightEntry(value, selectedUnit);
    if (!/^\d+$/.test(value) || !/^\d+(?:[.,]\d+)?$/.test(pounds)) return null;
    const remaining = Number(pounds.replace(",", "."));
    if (remaining < 0 || remaining >= 14) return null;
    const kg = stonePoundsToKg(Number(value), remaining);
    return kg >= 20 && kg <= 350 ? kg : null;
  };
  const changeUnit = (next: DisplayUnit) => {
    noteInteraction();
    const kg = parsedKg();
    if (kg !== null) {
      const stone = kgToStonePounds(kg);
      setValue(
        next === "st" ? String(stone.stone) : formatWeightInUnit(kg, next)
      );
      setPounds(String(stone.pounds));
      setPreciseKg(kg);
    }
    setSelectedUnit(next);
    setError("");
  };
  const dialKg = parsedKg() ?? initialKg ?? 80;
  const changeDial = (amount: number) => {
    pickerRef.current = true;
    noteInteraction();
    const kg = selectedUnit === "kg" ? amount : lbToKg(amount);
    setPreciseKg(kg);
    const stone = kgToStonePounds(kg);
    setValue(selectedUnit === "st" ? String(stone.stone) : amount.toFixed(1));
    setPounds(String(stone.pounds));
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
      trackHomeEvent("weight_log_saved", {
        taps: interactions.current,
        typed: typedRef.current,
        picker: pickerRef.current,
        unit: selectedUnit,
        // 0 only if a save somehow beat the mount effect; treated as
        // unknown rather than reported as an instantaneous log.
        ...(openedAt.current > 0
          ? { durationMs: Math.round(Date.now() - openedAt.current) }
          : {}),
      });
      window.dispatchEvent(new Event("tropos:weight-changed"));
      let undoing = false;
      toast.success(
        !navigator.onLine
          ? "Saved on this phone — syncs when you’re back online"
          : `Logged ${selectedUnit === "st" ? formatStonePounds(kg) : `${formatWeightInUnit(kg, selectedUnit)} ${selectedUnit === "lbs" ? "lb" : "kg"}`} · ${format(new Date(`${date}T12:00:00`), "EEE d MMM")}`,
        {
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
        }
      );
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
        <SegmentedControl<DisplayUnit>
          ariaLabel="Weight unit"
          value={selectedUnit}
          onChange={changeUnit}
          disabled={saving}
          options={[
            { value: "kg", label: "kg" },
            { value: "lbs", label: "lb" },
            { value: "st", label: "st" },
          ]}
        />
        <div className="flex items-end gap-3">
          <div className="min-w-0 flex-1">
            <label htmlFor="weight-value" className="sr-only">
              Weight ({selectedUnit === "lbs" ? "lb" : selectedUnit})
            </label>
            <input
              id="weight-value"
              inputMode="decimal"
              placeholder="—"
              className="ds-input min-h-16 min-w-0 w-full text-center text-display font-mono tabular-nums"
              value={value}
              disabled={saving}
              aria-invalid={!!error}
              aria-describedby={error ? "weight-error" : undefined}
              onChange={(event) => {
                setValue(event.target.value);
                setPreciseKg(null);
                typedRef.current = true;
                noteInteraction();
                setError("");
              }}
            />
            {selectedUnit === "st" && (
              <p className="text-center text-micro text-muted-foreground">st</p>
            )}
          </div>
          {selectedUnit === "st" && (
            <div className="min-w-0 flex-1">
              <label htmlFor="weight-pounds" className="sr-only">
                Pounds
              </label>
              <input
                id="weight-pounds"
                className="ds-input min-h-16 min-w-0 w-full text-center text-display font-mono tabular-nums"
                inputMode="decimal"
                value={pounds}
                disabled={saving}
                onChange={(event) => {
                  setPounds(event.target.value);
                  setPreciseKg(null);
                  setError("");
                }}
              />
              <p className="text-center text-micro text-muted-foreground">lb</p>
            </div>
          )}
        </div>
        <WeightScaleDial
          key={selectedUnit}
          value={selectedUnit === "kg" ? dialKg : kgToLb(dialKg)}
          minimum={selectedUnit === "kg" ? 20 : kgToLb(20)}
          maximum={selectedUnit === "kg" ? 350 : kgToLb(350)}
          unit={selectedUnit === "lbs" ? "lb" : selectedUnit}
          disabled={saving}
          onChange={changeDial}
        />
        <div className="flex gap-2">
          <Button
            variant="secondary"
            disabled={saving}
            onClick={() => {
              noteInteraction();
              setDate(localDateString());
            }}
          >
            Today
          </Button>
          <Button
            variant="secondary"
            disabled={saving}
            onClick={() => {
              noteInteraction();
              setDate(localDateString(subDays(new Date(), 1)));
            }}
          >
            Yesterday
          </Button>
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
            noteInteraction();
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
