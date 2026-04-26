import { memo, useEffect, useState } from "react";
import { haptic } from "@/lib/haptic";
import { cn } from "@/lib/utils";

interface ServingSource {
  /** Display name shown at the top of the sheet. */
  foodName: string;
  /** Number of docs currently in this group (= current serving count). */
  currentCount: number;
  /** Total calories across all current servings — used to derive a
   *  per-serving figure for the live preview. */
  currentTotalCalories: number;
}

interface EditServingsSheetProps {
  /** When non-null the sheet is open and targets this group. */
  source: ServingSource | null;
  onCancel: () => void;
  /** Parent persists the change (add/remove meal docs). Resolves when
   *  the write completes so the sheet can close without flashing a
   *  stale target count. */
  onSave: (targetCount: number) => Promise<void> | void;
}

/**
 * Bottom-sheet for adjusting how many servings of a grouped meal
 * the user logged. Driven by a +/- stepper instead of the earlier
 * 1-8 button grid — scales to any count, shows live calorie
 * preview + delta chip as the user steps, and requires an explicit
 * Save tap so steps don't fire writes on every tick.
 *
 * Extracted from `Food.tsx` where it was ~80 lines of inline JSX.
 * Self-contained: owns the `target` state so the parent only needs
 * to manage "is the sheet open for which group" via the `source`
 * prop plus the two callbacks.
 *
 * Accessibility: renders as a modal dialog with aria-modal, focus
 * traps the Save/Cancel buttons, and wires +/- with explicit
 * aria-labels so screen readers announce the stepper action.
 */
function EditServingsSheet({ source, onCancel, onSave }: EditServingsSheetProps) {
  const [target, setTarget] = useState<number>(source?.currentCount ?? 1);
  const [saving, setSaving] = useState(false);

  // Reset the target whenever a new group is opened. Without this,
  // reopening the sheet on a different row would show the previous
  // row's target as the initial value — confusing and potentially
  // dangerous if the user tapped Save assuming it was current.
  useEffect(() => {
    if (source) {
      setTarget(source.currentCount);
      setSaving(false);
    }
  }, [source]);

  if (!source) return null;

  const { foodName, currentCount, currentTotalCalories } = source;
  const perServingCal = currentCount > 0 ? currentTotalCalories / currentCount : 0;
  const previewCal = Math.round(perServingCal * target);
  const delta = target - currentCount;
  const unchanged = delta === 0;

  const handleSave = async () => {
    if (unchanged || saving) return;
    setSaving(true);
    try {
      await onSave(target);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div
        className="fixed inset-0 bg-black/40 z-40"
        role="presentation"
        onClick={saving ? undefined : onCancel}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Edit servings for ${foodName}`}
        className="fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl bg-card p-5 space-y-5 shadow-2xl"
      >
        <div className="w-10 h-1 rounded-full bg-border mx-auto" />
        <div className="text-center space-y-1">
          <p className="text-base font-semibold text-foreground">{foodName}</p>
          <p className="text-xs text-muted-foreground">
            {currentCount} {currentCount === 1 ? "serving" : "servings"} logged
          </p>
        </div>

        {/* Stepper */}
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={() => { haptic("light"); setTarget((n) => Math.max(1, n - 1)); }}
            disabled={target <= 1 || saving}
            aria-label="Decrease servings"
            className="h-12 w-12 rounded-full bg-muted text-foreground text-xl font-semibold flex items-center justify-center disabled:opacity-30 active:scale-90"
          >
            −
          </button>
          <div className="text-center min-w-[80px]" aria-live="polite">
            <p
              className="text-4xl font-mono tabular-nums font-extrabold text-foreground"
              aria-label={`${target} ${target === 1 ? "serving" : "servings"}`}
            >
              {target}
            </p>
            <p className="text-[11px] text-muted-foreground uppercase tracking-wider mt-0.5">
              {target === 1 ? "serving" : "servings"}
            </p>
          </div>
          <button
            onClick={() => { haptic("light"); setTarget((n) => n + 1); }}
            disabled={saving}
            aria-label="Increase servings"
            className="h-12 w-12 rounded-full bg-muted text-foreground text-xl font-semibold flex items-center justify-center disabled:opacity-30 active:scale-90"
          >
            +
          </button>
        </div>

        {/* Calorie preview + delta chip */}
        <div className="text-center text-xs text-muted-foreground">
          {unchanged ? (
            <span>~ {previewCal} cal</span>
          ) : (
            <span>
              ~ {previewCal} cal
              <span className="ml-2" style={{ color: delta > 0 ? "#D9884E" : "#8E8E93" }}>
                ({delta > 0 ? "+" : ""}{delta} {Math.abs(delta) === 1 ? "serving" : "servings"})
              </span>
            </span>
          )}
        </div>

        <div className="flex gap-2">
          <button
            onClick={onCancel}
            disabled={saving}
            className="flex-1 py-3 rounded-xl bg-muted text-foreground text-sm font-medium active:scale-[0.98] disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={unchanged || saving}
            className={cn(
              "flex-1 py-3 rounded-xl text-sm font-semibold active:scale-[0.98]",
              unchanged || saving
                ? "bg-muted text-muted-foreground"
                : "bg-primary text-primary-foreground",
            )}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </>
  );
}

export default memo(EditServingsSheet);
