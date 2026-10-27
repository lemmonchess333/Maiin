import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { THEME } from "@/lib/theme";
import { useMacroPalette } from "@/hooks/useMacroPalette";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { OFF_CREDIT } from "@/lib/offNutrition";
import { parseAmount } from "@/lib/mealPortion";
import PortionAmountField from "./PortionAmountField";

interface Props {
  food: {
    name: string;
    brand: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    servingSize: string;
    /** F2: when 'low', the macro numbers are per-100g (the OFF
     *  product had no real serving_size string and we fell back
     *  to "100g"). Renders the warning banner so the user knows
     *  to confirm their actual portion before confirming. */
    unitConfidence?: "high" | "low";
  } | null;
  open: boolean;
  onClose: () => void;
  onConfirm: (servings: number) => void;
}

// Sprint 3 follow-up sweep: vaul boilerplate replaced with shared
// BottomSheet primitive. The food header is rendered in children
// (not via the primitive's title prop) because it includes a
// secondary brand line + tertiary "per serving" line — three lines
// of metadata that don't fit the single-line title strip. hideHeader
// keeps the drag handle but skips the visible title row; the
// food.name is still emitted as an sr-only Drawer.Title for the
// aria-labelledby contract.
/* Per-100g foods are measured in GRAMS, everything else in servings, with
   the typed field PortionAmountField draws (see AMOUNT_STEP for why). */

export function ServingSizeDrawer({ food, open, onClose, onConfirm }: Props) {
  const perHundred = food?.unitConfidence === "low";
  /* ONE piece of state, held as the string the user types. Deriving the
     servings from it (rather than mirroring two values) is what stops the
     input and the macro grid from disagreeing mid-edit. */
  const [qty, setQty] = useState(() => (perHundred ? "100" : "1"));
  const [prevFood, setPrevFood] = useState(food);
  const { accent, text: macroText } = useMacroPalette();
  if (prevFood !== food) {
    setPrevFood(food);
    setQty(food?.unitConfidence === "low" ? "100" : "1");
  }

  const parsed = parseAmount(qty);
  const valid = parsed !== null;
  const servings = parsed === null ? 0 : perHundred ? parsed / 100 : parsed;
  /* Mid-edit the field is briefly empty. The grid then shows ONE serving
     of the food rather than zeros — a row of 0s reads as "this food has no
     calories", which is a claim about the food rather than about the
     half-typed number. Log food is refused until the field parses. */
  const previewServings = valid ? servings : 1;

  if (!food) return null;

  return (
    <BottomSheet
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={food.name}
      hideHeader
      className="border-t border-border"
    >
      <div className="px-5 pt-4 pb-6">
        {/* Drag handle */}
        <div className="w-10 h-1 rounded-full mx-auto mb-4 bg-border" />

        {/* Food header */}
        <div className="mb-4">
          <p className="text-sm font-semibold text-foreground">{food.name}</p>
          {food.brand && (
            <p className="text-xs text-muted-foreground">{food.brand}</p>
          )}
          <p className="text-xs text-muted-foreground mt-0.5">
            per {food.servingSize}
          </p>
        </div>

        {/* F2 low-confidence banner. OFF responses without a real
            serving_size field fall back to per-100g macro values —
            the numbers above are then per 100g of the product, not
            per a typical serving. Surface this explicitly so users
            don't unknowingly log 100g as a serving. */}
        {food.unitConfidence === "low" && (
          <div
            className="mb-4 flex items-start gap-2 px-3 py-2 rounded-lg text-xs leading-snug"
            style={{
              background: `${THEME.semantic.nutrition}14`,
              color: THEME.semantic.nutrition,
            }}
            role="status"
          >
            <AlertTriangle
              aria-hidden="true"
              className="size-3.5 shrink-0 mt-0.5"
            />
            <p>
              <span className="font-semibold">Per-100g data only.</span>{" "}
              <span className="text-foreground/80">
                Confirm your actual serving size before saving.
              </span>
            </p>
          </div>
        )}

        {/* Macro grid */}
        <div className="grid grid-cols-4 gap-2 text-center">
          <div
            className="rounded-lg p-2"
            style={{ backgroundColor: `${accent.nutrition}1A` }}
          >
            <p
              className="text-lg font-bold font-figure tabular-nums"
              style={{ color: macroText.nutrition }}
            >
              {Math.round(food.calories * previewServings)}
            </p>
            <p className="text-xs" style={{ color: macroText.nutrition }}>
              cal
            </p>
          </div>
          <div
            className="rounded-lg p-2"
            style={{ backgroundColor: `${accent.protein}1A` }}
          >
            <p
              className="text-lg font-bold font-figure tabular-nums"
              style={{ color: macroText.protein }}
            >
              {Math.round(food.protein * previewServings)}g
            </p>
            <p className="text-xs" style={{ color: macroText.protein }}>
              protein
            </p>
          </div>
          <div
            className="rounded-lg p-2"
            style={{ backgroundColor: `${accent.carbs}1A` }}
          >
            <p
              className="text-lg font-bold font-figure tabular-nums"
              style={{ color: macroText.carbs }}
            >
              {Math.round(food.carbs * previewServings)}g
            </p>
            <p className="text-xs" style={{ color: macroText.carbs }}>
              carbs
            </p>
          </div>
          <div
            className="rounded-lg p-2"
            style={{ backgroundColor: `${accent.fat}1A` }}
          >
            <p
              className="text-lg font-bold font-figure tabular-nums"
              style={{ color: macroText.fat }}
            >
              {Math.round(food.fat * previewServings)}g
            </p>
            <p className="text-xs" style={{ color: macroText.fat }}>
              fat
            </p>
          </div>
        </div>

        {/* Quantity — typeable, with the unit named beside it. */}
        <div className="pt-4">
          <PortionAmountField
            unit={perHundred ? "grams" : "servings"}
            value={qty}
            onChange={setQty}
          />
        </div>

        {/* Logging food is the food orange wherever it happens
            (DESIGN_GUIDE §14i): the colour says what the button does. */}
        <Button
          variant="nutrition"
          size="lg"
          fullWidth
          className="mt-4"
          onClick={() => onConfirm(servings)}
          disabled={!valid}
        >
          Log food
        </Button>

        {/* The food is an Open Food Facts search result (Food opens this
            sheet for nothing else), and the database's licence (ODbL)
            asks for a credit wherever its data is shown. */}
        <p className="mt-3 text-center text-micro text-muted-foreground">
          {OFF_CREDIT}
        </p>
      </div>
    </BottomSheet>
  );
}
