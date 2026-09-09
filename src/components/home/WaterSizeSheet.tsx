import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import Button from "@/components/ui/Button";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { haptic } from "@/lib/haptic";
import WaterContainerIcon, {
  type WaterContainerType,
} from "./WaterContainerIcon";
import { WATER_PRESETS, MAX_SINGLE_LOG_ML } from "@/lib/waterUnits";

export default function WaterSizeSheet({
  open,
  onClose,
  onLog,
}: {
  open: boolean;
  onClose: () => void;
  onLog: (ml: number) => void | boolean;
}) {
  const amountId = useId();
  const [customOpen, setCustomOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");
  const value = Number(amount);
  const valid =
    /^\d+$/.test(amount.trim()) &&
    Number.isSafeInteger(value) &&
    value >= 1 &&
    value <= MAX_SINGLE_LOG_ML;

  function log(ml: number) {
    if (onLog(ml) === false) {
      setError("Couldn't save this amount. Try again.");
      return;
    }
    haptic();
    onClose();
  }

  return (
    <BottomSheet
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title="Add water"
    >
      <div className="overflow-y-auto px-4 py-4 space-y-3">
        <div className="grid grid-cols-3 gap-2">
          {WATER_PRESETS.map((preset) => (
            <Button
              key={preset.id}
              variant="secondary"
              onClick={() => log(preset.ml)}
              aria-label={`Add ${preset.ml} ml ${preset.label.toLowerCase()}`}
              className="h-auto min-h-24 flex-col gap-2 px-2 py-3"
            >
              <WaterContainerIcon
                type={preset.id as WaterContainerType}
                size={28}
              />
              <span className="font-mono tabular-nums text-base font-semibold">
                {preset.ml}
                <span className="ml-1 text-xs font-normal text-muted-foreground">
                  ml
                </span>
              </span>
            </Button>
          ))}
        </div>
        <div className="border-t border-border/50 pt-1">
          <Button
            variant="ghost"
            fullWidth
            aria-expanded={customOpen}
            aria-controls={`${amountId}-custom`}
            className="justify-between px-0 hover:bg-transparent"
            onClick={() => setCustomOpen((current) => !current)}
            rightIcon={
              <ChevronDown
                className={`size-4 text-muted-foreground ${customOpen ? "rotate-180" : ""}`}
              />
            }
          >
            Other amount
          </Button>
          {customOpen && (
            <form
              id={`${amountId}-custom`}
              className="pt-2 space-y-2"
              onSubmit={(event) => {
                event.preventDefault();
                if (valid) log(value);
              }}
            >
              <div className="flex items-center gap-2">
                <div className="relative min-w-0 flex-1">
                  <label htmlFor={amountId} className="sr-only">
                    Amount (ml)
                  </label>
                  <input
                    id={amountId}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={MAX_SINGLE_LOG_ML}
                    placeholder="Amount"
                    value={amount}
                    onChange={(event) => {
                      setAmount(event.target.value);
                      setError("");
                    }}
                    className="ds-input px-4 pr-12 font-mono tabular-nums"
                    aria-invalid={!!amount && !valid}
                    aria-describedby={
                      amount && !valid ? `${amountId}-error` : undefined
                    }
                  />
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-muted-foreground"
                  >
                    ml
                  </span>
                </div>
                <Button
                  type="submit"
                  disabled={!valid}
                  className="min-h-12 px-5"
                >
                  Add
                </Button>
              </div>
              {amount && !valid && (
                <p
                  id={`${amountId}-error`}
                  role="alert"
                  className="text-sm text-destructive-strong"
                >
                  Enter a whole amount from 1 to {MAX_SINGLE_LOG_ML} ml.
                </p>
              )}
            </form>
          )}
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive-strong">
            {error}
          </p>
        )}
      </div>
    </BottomSheet>
  );
}
