/**
 * SettingsPantry — My pantry: the foods saved from what has been logged,
 * to correct or remove.
 *
 * F2d locked a "Settings → My pantry" screen; until it existed a saved
 * food could only be removed by long-pressing its Quick add row, and a
 * wrong figure on one could not be fixed at all, short of logging it
 * right and waiting for the pantry to take the new numbers. It sits
 * under Nutrition, beside the targets the foods are counted against.
 *
 * The pantry is `users/{uid}/foodFavourites` (`useFoodFavourites`): every
 * manual, barcode, search and typed log files its food there, and the
 * ones logged twice or more show in Quick add. This page lists all of
 * them, by name.
 */
import { useState } from "react";
import { Refrigerator } from "lucide-react";
import { toast } from "@/lib/toast";
import { haptic } from "@/lib/haptic";
import {
  useFoodFavourites,
  type FoodFavourite,
} from "@/hooks/useFoodFavourites";
import SettingsSection from "@/components/settings/SettingsSection";
import { SettingsGroup, SettingsRow } from "@/components/settings/SettingsList";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { validateFoodEntry } from "@/lib/foodValidation";
import { FOOD_NAME_MAX } from "@/lib/mealEntry";
import {
  CALORIE_UNIT,
  formatCalories,
  formatMacro,
} from "@/utils/formatNutrition";

/** One line for a saved food: its serving and figures. Grams unspaced,
 *  the food surface's house style. */
function pantryLine(f: FoodFavourite): string {
  return `${f.servingSize} · ${formatCalories(f.calories)} ${CALORIE_UNIT} · P ${formatMacro(f.protein)}g · C ${formatMacro(f.carbs)}g · F ${formatMacro(f.fat)}g`;
}

const MACRO_FIELDS = [
  { key: "calories", label: "Calories", unit: CALORIE_UNIT },
  { key: "protein", label: "Protein", unit: "g" },
  { key: "carbs", label: "Carbs", unit: "g" },
  { key: "fat", label: "Fat", unit: "g" },
] as const;
type MacroKey = (typeof MACRO_FIELDS)[number]["key"];

function PantryFoodSheet({
  food,
  onClose,
  onSave,
  onDelete,
}: {
  food: FoodFavourite;
  onClose: () => void;
  onSave: (
    changes: Pick<
      FoodFavourite,
      "name" | "servingSize" | "calories" | "protein" | "carbs" | "fat"
    >
  ) => Promise<boolean>;
  onDelete: () => void;
}) {
  const [name, setName] = useState(food.name);
  const [serving, setServing] = useState(food.servingSize);
  const [figures, setFigures] = useState<Record<MacroKey, string>>({
    calories: String(Math.round(food.calories)),
    protein: String(Math.round(food.protein)),
    carbs: String(Math.round(food.carbs)),
    fat: String(Math.round(food.fat)),
  });
  const [saving, setSaving] = useState(false);
  /* Blank is zero, as in the manual logger (water and black coffee are
     real foods); anything else must be a number of 0 or more. */
  const parsed = Object.fromEntries(
    MACRO_FIELDS.map(({ key }) => {
      const raw = figures[key].trim();
      const n = raw === "" ? 0 : Number(raw.replace(",", "."));
      return [key, Number.isFinite(n) && n >= 0 ? n : null];
    })
  ) as Record<MacroKey, number | null>;
  const invalid = MACRO_FIELDS.some(({ key }) => parsed[key] === null);
  const canSave = !!name.trim() && !invalid && !saving;

  const save = async () => {
    if (!canSave) return;
    const changes = {
      name: name.trim(),
      servingSize: serving.trim(),
      calories: parsed.calories ?? 0,
      protein: parsed.protein ?? 0,
      carbs: parsed.carbs ?? 0,
      fat: parsed.fat ?? 0,
    };
    const verdict = validateFoodEntry(changes);
    if (verdict.kind === "blocked") {
      toast.error(verdict.reason, { id: "pantry-validation-error" });
      return;
    }
    setSaving(true);
    try {
      if (await onSave(changes)) onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <BottomSheet
      open
      onOpenChange={(open) => {
        if (!open && !saving) onClose();
      }}
      title="Edit food"
      description={food.name}
      dismissible={!saving}
      maxHeight="max-h-[85dvh]"
    >
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 space-y-4">
        <div className="space-y-2">
          <label
            htmlFor="pantry-name"
            className="text-sm font-medium text-muted-foreground"
          >
            Name
          </label>
          <input
            id="pantry-name"
            type="text"
            value={name}
            maxLength={FOOD_NAME_MAX}
            disabled={saving}
            onChange={(e) => setName(e.target.value)}
            className="ds-input px-3 py-3 text-base"
          />
        </div>
        <div className="space-y-2">
          <label
            htmlFor="pantry-serving"
            className="text-sm font-medium text-muted-foreground"
          >
            Serving
          </label>
          <input
            id="pantry-serving"
            type="text"
            value={serving}
            placeholder="1 serving"
            disabled={saving}
            onChange={(e) => setServing(e.target.value)}
            className="ds-input px-3 py-3 text-base"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          {MACRO_FIELDS.map(({ key, label, unit }) => (
            <div key={key} className="min-w-0 space-y-2">
              <label
                htmlFor={`pantry-${key}`}
                className="text-sm font-medium text-muted-foreground"
              >
                {label}
              </label>
              <div className="relative">
                <input
                  id={`pantry-${key}`}
                  type="text"
                  inputMode="decimal"
                  aria-label={`${label} (${unit})`}
                  aria-invalid={parsed[key] === null || undefined}
                  value={figures[key]}
                  disabled={saving}
                  onChange={(e) =>
                    setFigures((f) => ({ ...f, [key]: e.target.value }))
                  }
                  className="ds-input py-3 pl-3 pr-12 text-base font-mono tabular-nums"
                />
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground"
                >
                  {unit}
                </span>
              </div>
            </div>
          ))}
        </div>
        {invalid && (
          <p role="alert" className="text-sm text-destructive-strong">
            Enter 0 or more.
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          The figures are for one serving, as Quick add logs it.
        </p>
        <Button
          variant="destructive"
          fullWidth
          disabled={saving}
          onClick={() => {
            haptic("light");
            onDelete();
          }}
        >
          Remove from pantry
        </Button>
      </div>
      <div className="shrink-0 border-t border-border/40 px-4 pt-3 pb-4">
        <Button
          size="lg"
          fullWidth
          loading={saving}
          disabled={!canSave}
          onClick={() => void save()}
        >
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </BottomSheet>
  );
}

export default function SettingsPantry() {
  const {
    favourites,
    loading,
    removeFavourite,
    restoreFavourite,
    updateFavourite,
  } = useFoodFavourites();
  const [editing, setEditing] = useState<FoodFavourite | null>(null);
  /* A removed food leaves the list the moment it is removed, and comes
     back if the delete fails or is undone. */
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const shown = favourites
    .filter((f) => !hidden.has(f.id) && f.name.trim())
    .sort((a, b) =>
      a.name.localeCompare(b.name, "en-GB", { sensitivity: "base" })
    );

  const showAgain = (id: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });

  const remove = async (food: FoodFavourite) => {
    setEditing(null);
    setHidden((prev) => new Set(prev).add(food.id));
    if (!(await removeFavourite(food.id))) {
      showAgain(food.id);
      toast.error("Couldn't remove. Try again.", { id: "pantry-remove-error" });
      return;
    }
    toast(`Removed ${food.name}`, {
      id: `pantry-remove-${food.id}`,
      duration: 5000,
      action: {
        label: "Undo",
        onClick: async () => {
          if (await restoreFavourite(food)) showAgain(food.id);
          else
            toast.error("Couldn't undo. The food stays removed.", {
              id: "pantry-undo-error",
            });
        },
      },
    });
  };

  const save = async (
    food: FoodFavourite,
    changes: Parameters<typeof updateFavourite>[1]
  ): Promise<boolean> => {
    const result = await updateFavourite(food, changes);
    if (result === "taken") {
      toast.error(`${changes.name} is already in your pantry.`, {
        id: "pantry-name-taken",
      });
      return false;
    }
    if (result === "failed") {
      toast.error("Couldn't save. Try again.", { id: "pantry-save-error" });
      return false;
    }
    toast.success(`Saved ${changes.name}`, { id: `pantry-saved-${food.id}` });
    return true;
  };

  return (
    <SettingsSection
      title="My pantry"
      subtitle="Foods you've logged, which Quick add offers"
      backTo="/settings/nutrition"
      backLabel="Nutrition"
    >
      {loading && shown.length === 0 ? (
        <p className="text-sm text-muted-foreground" role="status">
          Loading…
        </p>
      ) : shown.length === 0 ? (
        <Card>
          <EmptyState
            compact
            icon={Refrigerator}
            headline="Nothing in your pantry yet"
            sub="Foods you log are kept here. Log one twice and it shows in Quick add."
          />
        </Card>
      ) : (
        <SettingsGroup
          title={`${shown.length} ${shown.length === 1 ? "food" : "foods"}`}
          footer="Quick add shows the foods you log most, at the time you usually eat them."
        >
          {shown.map((food) => (
            <SettingsRow
              key={food.id}
              label={food.name}
              description={
                <span className="font-mono tabular-nums">
                  {pantryLine(food)}
                </span>
              }
              onClick={() => setEditing(food)}
            />
          ))}
        </SettingsGroup>
      )}
      {editing && (
        <PantryFoodSheet
          key={editing.id}
          food={editing}
          onClose={() => setEditing(null)}
          onSave={(changes) => save(editing, changes)}
          onDelete={() => void remove(editing)}
        />
      )}
    </SettingsSection>
  );
}
