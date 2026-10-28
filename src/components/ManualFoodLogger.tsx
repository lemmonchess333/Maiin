import { useState } from "react";
import { Timestamp } from "firebase/firestore";
import { createMealEntry, notifyMealsLogged } from "@/lib/mealEntry";
import { useUid } from "@/lib/auth";
import { toast } from "@/lib/toast";
import { localDateString } from "@/lib/dateHelpers";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { Toggle } from "@/components/ui/Toggle";
import { validateFoodEntry } from "@/lib/foodValidation";
import { useFoodFavourites } from "@/hooks/useFoodFavourites";
import { CALORIE_UNIT } from "@/utils/formatNutrition";
import { QUICK_ADD_NAME, isQuickAddName } from "@/lib/quickAddName";

interface FoodEntry {
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

/* Coerce empty string → 0 (water, black coffee, 0-cal entries are
   legitimate). Number("") returns NaN; we want 0. Shared by both the
   save and the override-save paths. */
const numOrZero = (s: string) => (s.trim() === "" ? 0 : Number(s));

interface Props {
  date?: string;
  /* Meal slot ("breakfast" / "lunch" / "snacks" / "dinner") if the
     user picked one before opening the drawer. Persisted as the
     `meal` field on the doc when set; omitted when null/undefined
     to match the NL / quick-add convention (no default slot). */
  meal?: "breakfast" | "lunch" | "snacks" | "dinner" | null;
  open: boolean;
  onClose: () => void;
  /** Fired once the meal is saved, before `onClose`, so the parent can
   *  tell a save from a dismissal. */
  onSaved?: () => void;
  /** A scanned barcode the food database did not have (F2d). The form is
   *  then the product's details: the meal keeps the code, and "Add to my
   *  pantry", on by default, files the product under it so the next scan
   *  of the same pack finds it. */
  barcode?: string | null;
}

export function ManualFoodLogger({
  date,
  meal,
  open,
  onClose,
  onSaved,
  barcode = null,
}: Props) {
  const uid = useUid();
  const { addFavourite } = useFoodFavourites();
  const [name, setName] = useState("");
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");
  const [saving, setSaving] = useState(false);
  /* Every manual log goes into the pantry. A typed-in product offers the
     switch, because a one-off pack is common there and unticking it is
     one tap. */
  const [addToPantry, setAddToPantry] = useState(true);
  /* ConfirmDialog state for suspicious-but-possible high values
     (>5000 cal etc). Negative / NaN values are blocked outright
     via inline toast — they never reach this prompt. */
  const [warnTitle, setWarnTitle] = useState<string | null>(null);
  const [warnDescription, setWarnDescription] = useState<string>("");

  const performSave = async (entry: FoodEntry) => {
    if (!uid) return;
    setSaving(true);
    try {
      const logDate = date || localDateString();
      const savedMeal = await createMealEntry(uid, {
        date: logDate,
        foodName: entry.name,
        items: [
          {
            name: entry.name,
            portionSize: "1 serving",
            calories: entry.calories,
            protein: entry.protein,
            carbs: entry.carbs,
            fat: entry.fat,
          },
        ],
        totalCalories: entry.calories,
        totalProtein: entry.protein,
        totalCarbs: entry.carbs,
        totalFat: entry.fat,
        confidence: "manual",
        ...(barcode ? { barcode } : {}),
        /* Optional `meal` slot mirrors the NL / quick-add
           convention — persisted only when the user explicitly
           picked one. No default. */
        ...(meal ? { meal } : {}),
        createdAt: Timestamp.now(),
      });

      notifyMealsLogged(uid, [savedMeal.id], "Logged manually", {
        path: "manual",
      });

      /* F2d grill — auto-add to Quick Add pantry. Fire-and-forget;
         the favourites collection is a best-effort cache (see
         addFavourite's internal error handling) and the meal doc
         is already written, so a favourites-write failure should
         not bubble back to the user as a save error. */
      /* A product goes in when its switch is on. An entry with no name of
         its own is a number rather than a food, and stays out. */
      const intoPantry = barcode ? addToPantry : !isQuickAddName(entry.name);
      if (intoPantry) {
        void addFavourite({
          name: entry.name,
          calories: entry.calories,
          protein: entry.protein,
          carbs: entry.carbs,
          fat: entry.fat,
          source: barcode ? "barcode" : "manual",
          ...(barcode ? { barcode } : {}),
        });
      }

      /* Clear and close on the save itself. A delayed reset stays armed on
         a component the sheet does not unmount, so dismissing and
         reopening inside its window handed the next entry to a timer
         belonging to the previous one — it wiped five fields and closed
         the sheet under whatever had just been typed. The confirmation is
         `notifyMealsLogged`'s toast, the same one every other logging
         route in the app answers with. */
      setName("");
      setCalories("");
      setProtein("");
      setCarbs("");
      setFat("");
      setAddToPantry(true);
      onSaved?.();
      onClose();
    } catch {
      toast.error("Couldn't save this meal. Try again.", {
        id: "food-save-error",
      });
    } finally {
      setSaving(false);
    }
  };

  /* A product needs its name: the pantry files it under its code and the
     next scan shows it. Anything else can go without one and is saved as
     "Quick add" (the calories are what was asked for). */
  const nameRequired = !!barcode;
  const entryName = () => name.trim() || QUICK_ADD_NAME;

  const handleSave = async () => {
    if (!uid || (nameRequired && !name.trim())) return;

    const entry: FoodEntry = {
      name: entryName(),
      calories: numOrZero(calories),
      protein: numOrZero(protein),
      carbs: numOrZero(carbs),
      fat: numOrZero(fat),
    };

    const verdict = validateFoodEntry(entry);
    if (verdict.kind === "blocked") {
      toast.error(verdict.reason, { id: "food-validation-error" });
      return;
    }
    if (verdict.kind === "warn") {
      /* Open ConfirmDialog with field-specific title + body. The
         confirm path performs the save; cancel returns the user
         to the form with all values intact. */
      setWarnTitle(verdict.title);
      setWarnDescription(verdict.description);
      return;
    }
    await performSave(entry);
  };

  const handleConfirmOverride = async () => {
    setWarnTitle(null);
    const entry: FoodEntry = {
      name: entryName(),
      calories: numOrZero(calories),
      protein: numOrZero(protein),
      carbs: numOrZero(carbs),
      fat: numOrZero(fat),
    };
    await performSave(entry);
  };

  return (
    <>
      <BottomSheet
        open={open}
        onOpenChange={(o) => !o && onClose()}
        title={barcode ? "Add this product" : QUICK_ADD_NAME}
        maxHeight="max-h-[85dvh]"
      >
        <div className="min-h-0 overflow-y-auto px-4 py-4">
          {/* Meal name input, optional outside a product's form */}
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={barcode ? "Product name" : "Name (optional)"}
            aria-label={barcode ? "Product name" : "Meal name"}
            className="ds-input px-3 py-3 text-base"
          />
          {barcode && (
            <p className="mt-2 text-xs text-muted-foreground">
              Per serving, from the pack.
            </p>
          )}

          {/* Macro input grid */}
          <div className="grid grid-cols-2 gap-3 mt-4">
            {[
              {
                label: "Calories",
                value: calories,
                set: setCalories,
                unit: CALORIE_UNIT,
              },
              { label: "Protein", value: protein, set: setProtein, unit: "g" },
              { label: "Carbs", value: carbs, set: setCarbs, unit: "g" },
              { label: "Fat", value: fat, set: setFat, unit: "g" },
            ].map((field) => (
              <div key={field.label} className="min-w-0 space-y-1.5">
                <label
                  htmlFor={`manual-macro-${field.label.toLowerCase()}`}
                  className="text-sm font-medium text-muted-foreground"
                >
                  {field.label}
                </label>
                <div className="relative">
                  <input
                    id={`manual-macro-${field.label.toLowerCase()}`}
                    type="number"
                    inputMode="decimal"
                    step="1"
                    min="0"
                    aria-label={`${field.label} (${field.unit})`}
                    value={field.value}
                    onChange={(e) => field.set(e.target.value)}
                    placeholder="0"
                    className="ds-input py-3 pl-3 pr-12 text-base font-mono tabular-nums"
                  />
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground"
                  >
                    {field.unit}
                  </span>
                </div>
              </div>
            ))}
          </div>
          {barcode && (
            <div className="mt-4 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm text-foreground">Add to my pantry</p>
                <p className="text-xs text-muted-foreground">
                  The next scan of this barcode finds it.
                </p>
              </div>
              <Toggle
                checked={addToPantry}
                onChange={() => setAddToPantry((on) => !on)}
                label="Add to my pantry"
              />
            </div>
          )}
        </div>
        {/* Sticky save footer. Pre-F2 the button lived inside the
              overflow-y-auto container, so on small iPhone viewports
              with the keyboard up + form filled the Save button
              could scroll below the keyboard and become unreachable.
              Lifting it into a non-scrolling footer with safe-area
              bottom padding keeps it pinned regardless of scroll
              state. */}
        <div className="shrink-0 px-4 pt-1 pb-4">
          <Button
            variant="nutrition"
            fullWidth
            size="lg"
            onClick={handleSave}
            disabled={saving || (nameRequired && !name.trim())}
            loading={saving}
          >
            {saving ? "Saving…" : "Log meal"}
          </Button>
        </div>
      </BottomSheet>
      {/* Suspicious-but-possible high-value override prompt. Cancel
        leaves the form intact so the user can adjust; Save anyway
        commits the entry as typed. Negative / NaN values are
        blocked outright via toast and never reach this dialog. */}
      <ConfirmDialog
        open={warnTitle !== null}
        title={warnTitle ?? ""}
        description={warnDescription}
        confirmLabel="Save anyway"
        cancelLabel="Edit"
        onConfirm={handleConfirmOverride}
        onCancel={() => setWarnTitle(null)}
      />
    </>
  );
}
