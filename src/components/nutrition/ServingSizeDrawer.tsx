import { useState } from "react";
import { Plus, Minus, AlertTriangle } from "lucide-react";
import { THEME } from "@/lib/theme";
import { useMacroPalette } from "@/hooks/useMacroPalette";
import { BottomSheet } from "@/components/ui/BottomSheet";

interface Props {
  food:
    | {
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
      }
    | null;
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
export function ServingSizeDrawer({ food, open, onClose, onConfirm }: Props) {
  const [servings, setServings] = useState(1);
  const [prevFood, setPrevFood] = useState(food);
  const { accent, text: macroText } = useMacroPalette();
  if (prevFood !== food) {
    setPrevFood(food);
    setServings(1);
  }

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
          {food.brand && <p className="text-xs text-muted-foreground">{food.brand}</p>}
          <p className="text-xs text-muted-foreground mt-0.5">per {food.servingSize}</p>
        </div>

        {/* F2 low-confidence banner. OFF responses without a real
            serving_size field fall back to per-100g macro values —
            the numbers above are then per 100g of the product, not
            per a typical serving. Surface this explicitly so users
            don't unknowingly log 100g as a serving. */}
        {food.unitConfidence === "low" && (
          <div
            className="mb-4 flex items-start gap-2 px-3 py-2 rounded-lg text-xs leading-snug"
            style={{ background: `${THEME.warning}14`, color: THEME.warning }}
            role="status"
          >
            <AlertTriangle aria-hidden="true" className="w-3.5 h-3.5 shrink-0 mt-0.5" />
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
          <div className="rounded-lg p-2" style={{ backgroundColor: `${accent.nutrition}1A` }}>
            <p className="text-lg font-bold tabular-nums" style={{ color: macroText.nutrition }}>
              {Math.round(food.calories * servings)}
            </p>
            <p className="text-xs" style={{ color: macroText.nutrition }}>cal</p>
          </div>
          <div className="rounded-lg p-2" style={{ backgroundColor: `${accent.protein}1A` }}>
            <p className="text-lg font-bold tabular-nums" style={{ color: macroText.protein }}>
              {Math.round(food.protein * servings)}g
            </p>
            <p className="text-xs" style={{ color: macroText.protein }}>protein</p>
          </div>
          <div className="rounded-lg p-2" style={{ backgroundColor: `${accent.carbs}1A` }}>
            <p className="text-lg font-bold tabular-nums" style={{ color: macroText.carbs }}>
              {Math.round(food.carbs * servings)}g
            </p>
            <p className="text-xs" style={{ color: macroText.carbs }}>carbs</p>
          </div>
          <div className="rounded-lg p-2" style={{ backgroundColor: `${accent.fat}1A` }}>
            <p className="text-lg font-bold tabular-nums" style={{ color: macroText.fat }}>
              {Math.round(food.fat * servings)}g
            </p>
            <p className="text-xs" style={{ color: macroText.fat }}>fat</p>
          </div>
        </div>

        {/* Serving adjuster */}
        <div className="flex items-center justify-center gap-4 pt-4">
          <button
            type="button"
            onClick={() => setServings(Math.max(0.5, servings - 0.5))}
            aria-label="Decrease servings"
            className="w-9 h-9 rounded-full bg-muted flex items-center justify-center"
          >
            <Minus className="w-4 h-4" aria-hidden="true" />
          </button>
          <div className="text-center">
            <p className="text-2xl font-bold text-foreground">{servings}</p>
            <p className="text-xs text-muted-foreground">servings</p>
          </div>
          <button
            type="button"
            onClick={() => setServings(servings + 0.5)}
            aria-label="Increase servings"
            className="w-9 h-9 rounded-full bg-muted flex items-center justify-center"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {/* Log Food button */}
        <button
          type="button"
          onClick={() => onConfirm(servings)}
          className="w-full py-3 rounded-xl text-base font-semibold text-white mt-4"
          style={{
            background: THEME.gradient.brand,
            boxShadow: "0 4px 16px rgba(124,110,246,0.25)",
          }}
        >
          Log Food
        </button>
      </div>
    </BottomSheet>
  );
}
