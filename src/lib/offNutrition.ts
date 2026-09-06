/**
 * Open Food Facts → one per-portion nutrition row.
 *
 * The ONE converter for OFF data. OFF publishes nutrients per 100 g
 * (`*_100g`) and, sometimes, a serving size string. Two call sites read
 * it — the barcode lookup (FoodAnalyzer) and the search results (Food)
 * — and until 2026-09-06 only the barcode path converted: search stored
 * the per-100 g values as-is, labelled them "per {serving_size}", and
 * flagged the row HIGH confidence precisely when a serving size existed,
 * so a 30 g bar was logged at its 100 g numbers under a "per 30 g" label
 * with the confirm-serving banner suppressed.
 *
 * Contract: the numbers returned are per `servingSize`. When OFF states a
 * gram serving they are scaled to it (`unitConfidence: "high"`); when it
 * does not (absent, or an ml serving `parseServingGrams` cannot read) they
 * are per 100 g and `servingSize` says "100g" (`unitConfidence: "low"`,
 * which the ServingSizeDrawer turns into its confirm-serving banner).
 * Calories scale the per-100 g energy when present, else come from the
 * per-portion macros via Atwater so calories and macros always agree —
 * the bare `energy-kcal` field is often per SERVING and is never read.
 */
import { parseServingGrams, round1, safeNum } from "@/lib/foodParseHelpers";

/** The subset of an OFF product this app reads. */
export interface OffProductLike {
  product_name?: string;
  brands?: string;
  serving_size?: string;
  nutriments?: Record<string, unknown>;
}

export interface OffPortion {
  name: string;
  brand: string;
  /** What the numbers are PER — OFF's serving when it states a gram
   *  serving, otherwise "100g". */
  servingSize: string;
  /** Grams in that serving; null when the numbers are per 100 g. */
  servingGrams: number | null;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  unitConfidence: "high" | "low";
}

export function offProductToPortion(
  p: OffProductLike,
  fallbackName = "Unknown"
): OffPortion {
  const name = (p.product_name || "").trim() || fallbackName;
  const brand = (p.brands || "").trim();
  const nutr = p.nutriments || {};
  const pro100 = safeNum(nutr["proteins_100g"]);
  const carb100 = safeNum(nutr["carbohydrates_100g"]);
  const fat100 = safeNum(nutr["fat_100g"]);

  const statedServing = (p.serving_size || "").trim();
  const servingGrams = parseServingGrams(statedServing);
  const factor = (servingGrams ?? 100) / 100;

  const protein = round1(pro100 * factor);
  const carbs = round1(carb100 * factor);
  const fat = round1(fat100 * factor);
  const kcal100 = safeNum(nutr["energy-kcal_100g"]);
  const calories = Math.round(
    kcal100 > 0 ? kcal100 * factor : 4 * protein + 4 * carbs + 9 * fat
  );

  return {
    name,
    brand,
    servingSize: servingGrams ? statedServing : "100g",
    servingGrams,
    calories,
    protein,
    carbs,
    fat,
    unitConfidence: servingGrams ? "high" : "low",
  };
}
