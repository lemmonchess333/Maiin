import { useState } from "react";
import { Timestamp } from "firebase/firestore";
import { createMealEntry, notifyMealsLogged } from "@/lib/mealEntry";
import { useUid } from "@/lib/auth";
import { toast } from "@/lib/toast";
import { localDateString } from "@/lib/dateHelpers";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { validateFoodEntry } from "@/lib/foodValidation";
import { useFoodFavourites } from "@/hooks/useFoodFavourites";

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
}

export function ManualFoodLogger({ date, meal, open, onClose }: Props) {
  const uid = useUid();
  const { addFavourite } = useFoodFavourites();
  const [name, setName] = useState("");
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");
  const [saving, setSaving] = useState(false);
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
      void addFavourite({
        name: entry.name,
        calories: entry.calories,
        protein: entry.protein,
        carbs: entry.carbs,
        fat: entry.fat,
        source: "manual",
      });

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
      onClose();
    } catch {
      toast.error("Couldn't save this meal. Try again.", {
        id: "food-save-error",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (!uid || !name.trim()) return;

    const entry: FoodEntry = {
      name: name.trim(),
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
      name: name.trim(),
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
        title="Log a meal"
        maxHeight="max-h-[85dvh]"
      >
        <div className="min-h-0 overflow-y-auto px-4 py-4">
          {/* Meal name input */}
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Meal name"
            aria-label="Meal name"
            className="ds-input px-3 py-3 text-base"
          />

          {/* Macro input grid */}
          <div className="grid grid-cols-2 gap-3 mt-4">
            {[
              {
                label: "Calories",
                value: calories,
                set: setCalories,
                unit: "kcal",
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
            fullWidth
            size="lg"
            onClick={handleSave}
            disabled={saving || !name.trim()}
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
