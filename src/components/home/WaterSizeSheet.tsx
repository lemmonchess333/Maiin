import { useId, useState } from "react";
import { format } from "date-fns";
import { ChevronDown, Droplets, X } from "lucide-react";
import Button from "@/components/ui/Button";
import IconButton from "@/components/ui/IconButton";
import SectionLabel from "@/components/ui/SectionLabel";
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
import type { WaterDrink } from "@/lib/waterActions";

export default function WaterSizeSheet({
  open,
  onClose,
  onLog,
  totalMl,
  drinks,
  onRemoveDrink,
}: {
  open: boolean;
  onClose: () => void;
  onLog: (ml: number) => void | boolean;
  /** The day's total, shown beside the title. Undefined on call sites
   *  that only add (the full-width card), which then render no log. */
  totalMl?: number;
  /** Today's drinks, newest first. Each row takes back THAT drink. */
  drinks?: WaterDrink[];
  onRemoveDrink?: (id: string) => void | boolean;
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
  /* Removal keeps the sheet OPEN, unlike a log. Taking one drink back is
     often a correction inside a longer look at the day — closing on the
     first tap would make fixing two mis-taps two trips. */
  function removeDrink(id: string) {
    if (onRemoveDrink?.(id) === false) {
      setError("Couldn't remove that drink. Try again.");
      return;
    }
    setError("");
    haptic("light");
  }

  return (
    <BottomSheet
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title="Water today"
    >
      <div className="overflow-y-auto px-4 py-4 space-y-3">
        {/* The day's running total, beside the presets that change it.
            The tile carries this figure too, but the sheet covers the
            tile the moment it opens — without it you are adding to a
            number you can no longer see. */}
        {totalMl !== undefined && (
          <p className="text-2xl font-extrabold leading-none text-foreground font-mono tabular-nums">
            {formatWaterVolume(totalMl)}
            <span className="ml-2 text-xs font-medium font-sans text-muted-foreground">
              today
            </span>
          </p>
        )}
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
        {/* The day's log. Each drink is its own record in the water
            document (`waterReceipts`), so a row takes back exactly the
            drink it names — the machinery for that (`undoOf`) was
            written with the queue and never surfaced, and the only way
            back was a row that subtracted an abstract amount. It also
            answers "what have I drunk today?", which no surface did.

            Newest first: the thing you are most likely correcting is
            the thing you just logged. Entries written before receipts
            carried a time still list; they show no time rather than
            being dropped. */}
        {drinks && drinks.length > 0 && onRemoveDrink && (
          <div className="border-t border-border/50 pt-3 space-y-1">
            <SectionLabel>Today&rsquo;s drinks</SectionLabel>
            <ul className="space-y-0.5">
              {drinks.map((drink) => (
                <li key={drink.id} className="flex items-center gap-3">
                  <span
                    aria-hidden="true"
                    className="size-7 rounded-lg flex items-center justify-center shrink-0 bg-teal/10"
                  >
                    <Droplets className="size-3.5 text-teal" />
                  </span>
                  <span className="text-sm font-mono tabular-nums font-semibold text-foreground">
                    {formatWaterVolume(drink.ml)}
                  </span>
                  {drink.at !== undefined && (
                    <span className="text-micro font-mono tabular-nums text-muted-foreground">
                      {format(new Date(drink.at), "HH:mm")}
                    </span>
                  )}
                  <IconButton
                    aria-label={`Remove ${formatWaterVolume(drink.ml)}${
                      drink.at !== undefined
                        ? ` logged at ${format(new Date(drink.at), "HH:mm")}`
                        : ""
                    }`}
                    onClick={() => removeDrink(drink.id)}
                    variant="ghost"
                    className="ml-auto -mr-2 text-muted-foreground"
                    icon={<X className="size-4" />}
                  />
                </li>
              ))}
            </ul>
          </div>
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
