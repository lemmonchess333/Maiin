import { useState } from "react";
import { Check } from "lucide-react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import {
  historyDatePresets,
  validHistoryDate,
  type HistoryDates,
} from "@/lib/trainingHistory";

export default function HistoryDateSheet({
  dates,
  today,
  onClose,
  onApply,
}: {
  dates: HistoryDates;
  today: string;
  onClose: () => void;
  onApply: (dates: HistoryDates) => void;
}) {
  const [draft, setDraft] = useState(dates);
  const invalid =
    !validHistoryDate(draft.from) ||
    !validHistoryDate(draft.to) ||
    draft.from > draft.to;
  return (
    <BottomSheet
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="Date range"
    >
      <div className="overflow-y-auto px-[16px] pt-2 pb-6 space-y-4">
        <fieldset>
          <legend className="sr-only">Choose a date range</legend>
          {historyDatePresets(today).map((preset) => {
            const selected =
              draft.from === preset.dates.from && draft.to === preset.dates.to;
            return (
              <Button
                key={preset.label}
                variant="ghost"
                fullWidth
                className="min-h-[52px] h-auto justify-between py-3 text-left"
                aria-pressed={selected}
                onClick={() => setDraft(preset.dates)}
                rightIcon={
                  selected ? <Check className="size-5 shrink-0" /> : undefined
                }
              >
                {preset.label}
              </Button>
            );
          })}
        </fieldset>
        <fieldset className="space-y-3">
          <legend className="text-sm font-bold mb-3">Custom dates</legend>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,10rem),1fr))] gap-3">
            <label className="min-w-0 space-y-2 text-sm text-muted-foreground">
              <span className="block">From</span>
              <input
                type="date"
                className="ds-input w-full min-w-0 min-h-[48px]"
                value={draft.from}
                max={draft.to || undefined}
                onChange={(e) => setDraft({ ...draft, from: e.target.value })}
                aria-invalid={invalid}
                aria-describedby={invalid ? "history-date-error" : undefined}
              />
            </label>
            <label className="min-w-0 space-y-2 text-sm text-muted-foreground">
              <span className="block">To</span>
              <input
                type="date"
                className="ds-input w-full min-w-0 min-h-[48px]"
                value={draft.to}
                min={draft.from || undefined}
                onChange={(e) => setDraft({ ...draft, to: e.target.value })}
                aria-invalid={invalid}
                aria-describedby={invalid ? "history-date-error" : undefined}
              />
            </label>
          </div>
          {invalid && (
            <p
              id="history-date-error"
              role="alert"
              className="text-sm text-destructive-strong"
            >
              Choose valid dates with the end on or after the start.
            </p>
          )}
        </fieldset>
        <div className="flex flex-wrap gap-3 [&>button]:flex-1 [&>button]:min-w-[min(100%,8rem)] [&>button]:h-auto [&>button]:py-3 [&>button]:whitespace-normal">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={invalid} onClick={() => onApply(draft)}>
            Apply dates
          </Button>
        </div>
      </div>
    </BottomSheet>
  );
}
