import { memo, useState } from "react";
import { THEME } from "@/lib/theme";
import { haptic } from "@/lib/haptic";
import { cn } from "@/lib/utils";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { MEAL_ORDER, MEAL_LABELS, type MealKey } from "./mealConstants";

interface ServingSource {
  /** Display name shown at the top of the sheet. */
  foodName: string;
  /** Number of docs currently in this group (= current serving count). */
  currentCount: number;
  /** Total calories across all current servings — used to derive a
   *  per-serving figure for the live preview AND seed the F5a macro
   *  inputs below. */
  currentTotalCalories: number;
  /** F5a: total macros across all current servings. Sheet renders the
   *  per-serving (rounded) values in the inputs; on save, per-serving
   *  values are written to each underlying doc via editMeal so the
   *  group's new total = N_servings × per-serving value. */
  currentTotalProtein: number;
  currentTotalCarbs: number;
  currentTotalFat: number;
  /** F5a: current meal slot if all underlying docs share one. When
   *  the group spans multiple slots (mixed state — unusual but
   *  possible if a user moved one of two duplicates), this is null
   *  and the picker renders un-selected. Editing snaps the whole
   *  group to whichever pill the user taps. */
  currentMeal: MealKey | null;
}

/** F5a: per-serving macro overrides. All fields optional — only the
 *  fields the user actually changed are propagated, so editMeal
 *  partial-update writes only the dimensions the user touched. */
export interface MacroOverrides {
  /** Per-serving calories. Will be written to each doc's totalCalories. */
  totalCalories?: number;
  totalProtein?: number;
  totalCarbs?: number;
  totalFat?: number;
}

export interface EditServingsChanges {
  targetCount: number;
  /** Null = unchanged from the source's currentMeal. When the user
   *  picks a different slot, parent maps this through the F5a
   *  editMeal API to each underlying doc in the group. */
  targetMeal: MealKey | null;
  /** F5a: trimmed new name. Null = unchanged from the source's
   *  foodName. Empty / whitespace-only input is treated as a no-op
   *  and never propagated. */
  targetName: string | null;
  /** F5a: per-serving macro overrides for the dimensions the user
   *  actually changed. Null = no macro inputs touched. Empty object
   *  is never sent — at least one dimension is present when non-null.
   *  Each value is per-serving, so the parent applies it to each doc
   *  in the group via editMeal. */
  targetMacros: MacroOverrides | null;
}

interface EditServingsSheetProps {
  /** When non-null the sheet is open and targets this group. */
  source: ServingSource | null;
  onCancel: () => void;
  /** Parent persists the change (add/remove meal docs +/or edit slot
   *  on each existing doc). Resolves when the write completes so the
   *  sheet can close without flashing a stale state. */
  onSave: (changes: EditServingsChanges) => Promise<void> | void;
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
function EditServingsSheet({
  source,
  onCancel,
  onSave,
}: EditServingsSheetProps) {
  // The parent mounts this sheet conditionally and keys it on the
  // group id, so each open is a fresh instance — useState's initial
  // value is the source-of-truth for the stepper. No reset effect:
  // an effect would re-fire whenever the parent re-renders with a
  // new `source` object identity (which happens often via Firestore
  // listeners) and stomp the user's stepper input mid-edit.
  const [target, setTarget] = useState<number>(source?.currentCount ?? 1);
  // F5a: meal-slot edit. Null tracks "user hasn't picked a different
  // slot yet"; the Save button only flags the change when the picked
  // slot differs from the source's currentMeal. Lets the parent
  // distinguish "slot change requested" from "slot unchanged but
  // count changed" cleanly.
  const [pickedMeal, setPickedMeal] = useState<MealKey | null>(
    source?.currentMeal ?? null
  );
  // F5a: rename. Input is uncontrolled-ish — initialised from the
  // source's foodName once. The "changed" check compares trimmed
  // values so trailing whitespace doesn't count as an edit and
  // empty / whitespace-only input is treated as no-op (never
  // propagated to editMeal — empty foodName has no useful meaning).
  const [pickedName, setPickedName] = useState<string>(source?.foodName ?? "");
  // F5a: per-serving macro inputs. Initial values are the rounded
  // per-serving figures derived from the group totals; on save we
  // write the picked per-serving value back to each underlying doc.
  // String state (not number) so partial input — "12." or empty
  // mid-edit — doesn't shimmer the input value or fight the user's
  // typing. Parsed at compare/save time.
  const initialPerServing = ((): {
    cal: number;
    pro: number;
    car: number;
    fat: number;
  } => {
    if (!source) return { cal: 0, pro: 0, car: 0, fat: 0 };
    const div = Math.max(1, source.currentCount);
    return {
      cal: Math.round(source.currentTotalCalories / div),
      pro: Math.round(source.currentTotalProtein / div),
      car: Math.round(source.currentTotalCarbs / div),
      fat: Math.round(source.currentTotalFat / div),
    };
  })();
  const [pickedCal, setPickedCal] = useState<string>(
    String(initialPerServing.cal)
  );
  const [pickedPro, setPickedPro] = useState<string>(
    String(initialPerServing.pro)
  );
  const [pickedCar, setPickedCar] = useState<string>(
    String(initialPerServing.car)
  );
  const [pickedFat, setPickedFat] = useState<string>(
    String(initialPerServing.fat)
  );
  const [saving, setSaving] = useState(false);

  if (!source) return null;

  const { foodName, currentCount, currentTotalCalories, currentMeal } = source;
  const perServingCal =
    currentCount > 0 ? currentTotalCalories / currentCount : 0;
  const previewCal = Math.round(perServingCal * target);
  const countDelta = target - currentCount;
  const mealChanged = pickedMeal !== null && pickedMeal !== currentMeal;
  const trimmedName = pickedName.trim();
  const nameChanged = trimmedName.length > 0 && trimmedName !== foodName.trim();

  // F5a: macro change detection. Per dimension, the string input is
  // parsed to a finite non-negative number; only differing values
  // count. Blank / non-numeric / negative inputs are treated as
  // "unchanged for this dimension" so a half-typed edit doesn't
  // trip Save and an editMeal call doesn't write junk.
  const parseMacro = (raw: string): number | null => {
    const trimmed = raw.trim();
    if (trimmed === "") return null;
    const n = Number(trimmed);
    if (!Number.isFinite(n) || n < 0) return null;
    return Math.round(n);
  };
  const picked = {
    cal: parseMacro(pickedCal),
    pro: parseMacro(pickedPro),
    car: parseMacro(pickedCar),
    fat: parseMacro(pickedFat),
  };
  const macroOverrides: MacroOverrides = {};
  if (picked.cal !== null && picked.cal !== initialPerServing.cal) {
    macroOverrides.totalCalories = picked.cal;
  }
  if (picked.pro !== null && picked.pro !== initialPerServing.pro) {
    macroOverrides.totalProtein = picked.pro;
  }
  if (picked.car !== null && picked.car !== initialPerServing.car) {
    macroOverrides.totalCarbs = picked.car;
  }
  if (picked.fat !== null && picked.fat !== initialPerServing.fat) {
    macroOverrides.totalFat = picked.fat;
  }
  const macrosChanged = Object.keys(macroOverrides).length > 0;

  const unchanged =
    countDelta === 0 && !mealChanged && !nameChanged && !macrosChanged;

  const handleSave = async () => {
    if (unchanged || saving) return;
    setSaving(true);
    try {
      await onSave({
        targetCount: target,
        targetMeal: mealChanged ? pickedMeal : null,
        targetName: nameChanged ? trimmedName : null,
        targetMacros: macrosChanged ? macroOverrides : null,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <BottomSheet
      open
      onOpenChange={(o) => {
        if (!o && !saving) onCancel();
      }}
      title={`Edit servings for ${foodName}`}
      hideHeader
    >
      <div className="p-5 space-y-5">
        <div className="w-10 h-1 rounded-full bg-border mx-auto" />
        <div className="text-center space-y-1">
          {/* F5a rename input. Styled to look like the static heading
              it replaced (centered, semibold, base size) so the sheet
              reads as "same shape, but editable" rather than gaining a
              form-row. Focus border + light bg only appear on focus
              so the affordance is discoverable on tap. */}
          <label className="sr-only" htmlFor="edit-meal-name">
            Edit name
          </label>
          <input
            id="edit-meal-name"
            type="text"
            value={pickedName}
            onChange={(e) => setPickedName(e.target.value)}
            disabled={saving}
            aria-label="Edit name"
            placeholder="Name"
            className={cn(
              "w-full text-center text-base font-semibold text-foreground bg-transparent",
              "rounded-lg px-3 py-1.5 border border-transparent",
              "focus:outline-none focus:border-border focus:bg-muted/50 transition-colors",
              "disabled:opacity-60"
            )}
          />
          <p className="text-xs text-muted-foreground">
            {currentCount} {currentCount === 1 ? "serving" : "servings"} logged
          </p>
        </div>

        {/* F5a meal-slot picker. Tappable pill row matches the
            "+ Snacks" composer-pill visual language. Picked state
            uses the brand purple; unpicked state stays muted so the
            visual weight signals "tap to change", not "tap to log".
            Hidden when source.currentMeal is null AND the picker
            hasn't been touched — that covers groups spanning
            multiple slots, where snapping all docs to one slot via
            this picker IS the intended outcome but the section
            label here would be misleading. */}
        <div className="space-y-1.5">
          <p className="text-caption uppercase tracking-[0.14em] text-muted-foreground font-semibold text-center">
            Meal slot
          </p>
          <div className="flex gap-1.5 justify-center flex-wrap">
            {MEAL_ORDER.map((slot) => {
              const isPicked = pickedMeal === slot;
              return (
                <button
                  key={slot}
                  type="button"
                  onClick={() => {
                    haptic("light");
                    setPickedMeal(slot);
                  }}
                  disabled={saving}
                  aria-pressed={isPicked}
                  className={cn(
                    "px-3 py-1 rounded-full text-micro font-semibold transition-colors active:scale-[0.97]",
                    isPicked
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {MEAL_LABELS[slot]}
                </button>
              );
            })}
          </div>
        </div>

        {/* F5a macro inputs. Per-serving figures derived from group
            totals — on save, the picked per-serving value is written
            to each underlying doc via editMeal so the group's new
            total = N × per-serving. Inputs use type=number with
            inputMode="numeric" so mobile shows the numeric keypad
            but the input still accepts the typing-friendly empty
            state. Only dimensions the user actually changes are
            propagated to editMeal — parseMacro() above gates which
            fields land in macroOverrides. */}
        <div className="space-y-1.5">
          <p className="text-caption uppercase tracking-[0.14em] text-muted-foreground font-semibold text-center">
            Per serving
          </p>
          <div className="grid grid-cols-4 gap-2">
            {(
              [
                {
                  id: "edit-meal-cal",
                  label: "Cal",
                  value: pickedCal,
                  setter: setPickedCal,
                },
                {
                  id: "edit-meal-pro",
                  label: "Protein",
                  value: pickedPro,
                  setter: setPickedPro,
                },
                {
                  id: "edit-meal-car",
                  label: "Carbs",
                  value: pickedCar,
                  setter: setPickedCar,
                },
                {
                  id: "edit-meal-fat",
                  label: "Fat",
                  value: pickedFat,
                  setter: setPickedFat,
                },
              ] as const
            ).map(({ id, label, value, setter }) => (
              <div key={id} className="flex flex-col items-center gap-1">
                <label
                  htmlFor={id}
                  className="text-caption uppercase tracking-wide text-muted-foreground"
                >
                  {label}
                </label>
                <input
                  id={id}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={value}
                  onChange={(e) => setter(e.target.value)}
                  disabled={saving}
                  aria-label={`Per-serving ${label.toLowerCase()}`}
                  className={cn(
                    "w-full text-center text-base font-mono tabular-nums font-semibold text-foreground bg-muted/50",
                    "rounded-lg px-2 py-1.5 border border-transparent",
                    "focus:outline-none focus:border-border focus:bg-card transition-colors",
                    "disabled:opacity-60",
                    "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  )}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Stepper */}
        <div className="flex items-center justify-center gap-4">
          <button
            type="button"
            onClick={() => {
              haptic("light");
              setTarget((n) => Math.max(1, n - 1));
            }}
            disabled={target <= 1 || saving}
            aria-label="Decrease servings"
            className="size-12 rounded-full bg-muted text-foreground text-xl font-semibold flex items-center justify-center disabled:opacity-30 active:scale-90"
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
            <p className="text-caption text-muted-foreground uppercase tracking-wider mt-0.5">
              {target === 1 ? "serving" : "servings"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              haptic("light");
              setTarget((n) => n + 1);
            }}
            disabled={saving}
            aria-label="Increase servings"
            className="size-12 rounded-full bg-muted text-foreground text-xl font-semibold flex items-center justify-center disabled:opacity-30 active:scale-90"
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
              {countDelta !== 0 && (
                <span
                  className="ml-2"
                  style={{
                    color:
                      countDelta > 0
                        ? THEME.semantic.nutrition
                        : THEME.text.muted,
                  }}
                >
                  ({countDelta > 0 ? "+" : ""}
                  {countDelta}{" "}
                  {Math.abs(countDelta) === 1 ? "serving" : "servings"})
                </span>
              )}
              {mealChanged && pickedMeal && (
                <span className="ml-2 text-primary">
                  → {MEAL_LABELS[pickedMeal]}
                </span>
              )}
              {nameChanged && (
                <span className="ml-2 text-primary">renamed</span>
              )}
              {macrosChanged && (
                <span className="ml-2 text-primary">macros updated</span>
              )}
            </span>
          )}
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="flex-1 py-3 rounded-xl bg-muted text-foreground text-sm font-medium active:scale-[0.98] disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={unchanged || saving}
            className={cn(
              "flex-1 py-3 rounded-xl text-sm font-semibold active:scale-[0.98]",
              unchanged || saving
                ? "bg-muted text-muted-foreground"
                : "bg-primary text-primary-foreground"
            )}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}

export default memo(EditServingsSheet);
