import { useState } from "react";
import Button from "@/components/ui/Button";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { haptic } from "@/lib/haptic";
import WaterContainerIcon, {
  type WaterContainerType,
} from "./WaterContainerIcon";
import {
  WATER_PRESETS,
  MAX_SINGLE_LOG_ML,
  formatWaterVolume,
} from "@/lib/waterUnits";

export default function WaterSizeSheet({
  open,
  onClose,
  onLog,
  consumedMl,
  targetMl,
  servingMl = 250,
  onServingChange,
  onSetTotal,
}: {
  open: boolean;
  onClose: () => void;
  onLog: (ml: number) => void | boolean;
  consumedMl: number;
  targetMl: number;
  servingMl?: number;
  recentSizes?: number[];
  onServingChange?: (ml: number) => void | boolean;
  onSetTotal?: (ml: number) => void | boolean;
}) {
  const [mode, setMode] = useState<"add" | "custom" | "total" | "serving">(
    "add"
  );
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");
  const isTotal = mode === "total";
  const minimum = isTotal ? 0 : 1;
  // A total can exceed a single drink; do not cap corrections at 3 L.
  const maximum = isTotal ? Math.max(20000, consumedMl) : MAX_SINGLE_LOG_ML;
  const value = Number(amount);
  const valid =
    /^\d+$/.test(amount.trim()) &&
    Number.isSafeInteger(value) &&
    value >= minimum &&
    value <= maximum;
  function changeMode(next: typeof mode) {
    setMode(next);
    setAmount(
      next === "total"
        ? String(consumedMl)
        : next === "serving"
          ? String(servingMl)
          : ""
    );
    setError("");
  }
  function log(ml: number) {
    if (onLog(ml) === false) {
      setError("Couldn't save this amount. Try again.");
      return;
    }
    haptic();
    onClose();
  }
  function save() {
    if (!valid) return;
    if (mode === "custom") return log(value);
    const saved = isTotal ? onSetTotal?.(value) : onServingChange?.(value);
    if (saved === false) {
      setError("Couldn't save this change. Try again.");
      return;
    }
    haptic();
    if (isTotal) onClose();
    else changeMode("add");
  }
  return (
    <BottomSheet
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title={isTotal ? "Edit water total" : "Add water"}
    >
      <div className="px-5 pb-6 pt-3 space-y-3">
        <p className="text-center text-sm text-muted-foreground">
          Today{" "}
          <span className="font-mono tabular-nums text-foreground">
            {formatWaterVolume(consumedMl)} / {formatWaterVolume(targetMl)}
          </span>
        </p>
        {mode === "add" ? (
          <>
            <div className="grid grid-cols-3 gap-2">
              {WATER_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => log(preset.ml)}
                  className="flex flex-col items-center justify-center gap-1 min-h-24 rounded-xl bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 motion-safe:active:scale-[0.97]"
                >
                  <WaterContainerIcon
                    type={preset.id as WaterContainerType}
                    size={32}
                  />
                  <span className="text-xs text-muted-foreground">
                    {preset.label}
                  </span>
                  <span className="font-mono tabular-nums text-sm font-semibold">
                    {preset.ml} ml
                  </span>
                </button>
              ))}
            </div>
            <Button
              variant="secondary"
              fullWidth
              onClick={() => changeMode("custom")}
            >
              Other amount
            </Button>
            {onServingChange && (
              <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
                <span>
                  Quick add{" "}
                  <span className="font-mono tabular-nums">{servingMl} ml</span>
                </span>
                <Button variant="ghost" onClick={() => changeMode("serving")}>
                  Change
                </Button>
              </div>
            )}
            {onSetTotal && (
              <Button
                variant="ghost"
                fullWidth
                onClick={() => changeMode("total")}
              >
                Edit today’s total
              </Button>
            )}
          </>
        ) : (
          <>
            <label htmlFor="water-amount" className="block text-sm font-medium">
              {isTotal
                ? "Today’s total (ml)"
                : mode === "serving"
                  ? "Quick-add amount (ml)"
                  : "Amount (ml)"}
            </label>
            <input
              id="water-amount"
              type="number"
              inputMode="numeric"
              min={minimum}
              max={maximum}
              value={amount}
              onChange={(event) => {
                setAmount(event.target.value);
                setError("");
              }}
              className="ds-input min-h-11 w-full font-mono tabular-nums"
              aria-invalid={!!amount && !valid}
            />
            {amount && !valid && (
              <p role="alert" className="text-sm text-destructive-strong">
                Enter a whole amount from {minimum} to {maximum} ml.
              </p>
            )}
            <Button fullWidth disabled={!valid} onClick={save}>
              {isTotal || mode === "serving" ? "Save changes" : "Add water"}
            </Button>
            <Button variant="ghost" fullWidth onClick={() => changeMode("add")}>
              Back
            </Button>
          </>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive-strong">
            {error}
          </p>
        )}
      </div>
    </BottomSheet>
  );
}
