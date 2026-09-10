import { useState } from "react";
import { Plus, Minus, AlertTriangle } from "lucide-react";
import { THEME } from "@/lib/theme";
import { useMacroPalette } from "@/hooks/useMacroPalette";
import { BottomSheet } from "@/components/ui/BottomSheet";

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
/* Per-100g foods are measured in GRAMS, everything else in servings.
   The old control stepped servings by 0.5 with no way to type, which on a
   per-100g product meant 50 g jumps: 100 g and 150 g were reachable, 30 g
   and 125 g were not, and those are ordinary portions. Grams also step by
   10 rather than 50 here, but the step is a convenience — the input is
   what makes any amount reachable. */
const GRAM_STEP = 10;
const SERVING_STEP = 0.5;

/** Trim a float to at most 2dp without trailing zeros ("1.5", not "1.50"). */
function tidy(n: number): string {
  return String(Math.round(n * 100) / 100);
}

export function ServingSizeDrawer({ food, open, onClose, onConfirm }: Props) {
  const perHundred = food?.unitConfidence === "low";
  const step = perHundred ? GRAM_STEP : SERVING_STEP;
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

  const parsed = Number(qty.replace(",", "."));
  const valid = Number.isFinite(parsed) && parsed > 0;
  const servings = valid ? (perHundred ? parsed / 100 : parsed) : 0;
  /* Mid-edit the field is briefly empty. The grid then shows ONE serving
     of the food rather than zeros — a row of 0s reads as "this food has no
     calories", which is a claim about the food rather than about the
     half-typed number. Log food is refused until the field parses. */
  const previewServings = valid ? servings : 1;
  const bump = (delta: number) =>
    setQty(tidy(Math.max(step, (valid ? parsed : step) + delta)));

  if (!food) return null;

  return (
    <BottomSheet
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={food.name}
      hideHeader
      maxHeight="max-h-[50vh]"
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
              className="text-lg font-bold font-mono tabular-nums"
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
              className="text-lg font-bold font-mono tabular-nums"
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
              className="text-lg font-bold font-mono tabular-nums"
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
              className="text-lg font-bold font-mono tabular-nums"
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
        <div className="flex items-center justify-center gap-4 pt-4">
          <button
            type="button"
            onClick={() => bump(-step)}
            aria-label={perHundred ? "Decrease grams" : "Decrease servings"}
            className="size-11 rounded-full bg-muted flex items-center justify-center"
          >
            <Minus className="size-4" aria-hidden="true" />
          </button>
          <div className="text-center">
            <label htmlFor="serving-qty" className="sr-only">
              {perHundred ? "Grams" : "Servings"}
            </label>
            <input
              id="serving-qty"
              type="text"
              inputMode="decimal"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              className="w-20 min-h-11 rounded-lg bg-muted text-center text-2xl font-bold font-mono tabular-nums text-foreground"
            />
            <p className="text-xs text-muted-foreground">
              {perHundred ? "grams" : "servings"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => bump(step)}
            aria-label={perHundred ? "Increase grams" : "Increase servings"}
            className="size-11 rounded-full bg-muted flex items-center justify-center"
          >
            <Plus className="size-4" aria-hidden="true" />
          </button>
        </div>

        {/* Log food button */}
        <button
          type="button"
          onClick={() => onConfirm(servings)}
          disabled={!valid}
          className="w-full py-3 rounded-xl text-base font-semibold text-white mt-4 disabled:opacity-50"
          style={{
            background: THEME.gradient.brand,
            boxShadow: "var(--ds-shadow-purple-glow)",
          }}
        >
          Log food
        </button>
      </div>
    </BottomSheet>
  );
}
