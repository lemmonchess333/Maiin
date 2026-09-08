import type { Meal, MealItem } from "@/hooks/useMeals";
import { Timestamp } from "firebase/firestore";
import { createMealEntry } from "@/lib/mealEntry";
import { mealSlotFor } from "@/lib/mealSlots";
import type { MealKey } from "@/components/food/mealConstants";

export interface MealCopySelection {
  source: Meal;
  multiplier: number;
  /** Stable while the preview is open, including a failed save and retry. */
  destinationId: string;
}

export interface MealCopyResult {
  created: { sourceId: string; id: string; slot: MealKey }[];
  error: unknown | null;
}

export function parseCopyPortion(value: string): number | null {
  const raw = value.trim();
  if (!/^(?:\d+(?:[.,]\d*)?|[.,]\d+)$/.test(raw)) return null;
  const amount = Number(raw.replace(",", "."));
  return Number.isFinite(amount) && amount > 0 && amount <= 20 ? amount : null;
}

const finite = (value: number | undefined) =>
  typeof value === "number" && Number.isFinite(value) ? value : 0;

/** Scale the logged entry, not a guessed serving. Only nutrition fields are
 * copied: legacy photo URLs, edit metadata and deletion state never travel. */
export function mealCopyPayload(source: Meal, multiplier: number, date: string) {
  if (!Number.isFinite(multiplier) || multiplier <= 0 || multiplier > 20) {
    throw new Error("Enter a portion greater than 0 and no more than 20.");
  }
  const scaled = (value: number | undefined) => finite(value) * multiplier;
  const items: MealItem[] = (source.items ?? []).map((item) => ({
    name: item.name,
    portionSize: multiplier === 1
      ? item.portionSize
      : `${multiplier} × ${item.portionSize || "logged portion"}`,
    calories: scaled(item.calories),
    protein: scaled(item.protein),
    carbs: scaled(item.carbs),
    fat: scaled(item.fat),
    ...(item.fiber !== undefined ? { fiber: scaled(item.fiber) } : {}),
    ...(item.sugar !== undefined ? { sugar: scaled(item.sugar) } : {}),
    ...(item.sodium !== undefined ? { sodium: scaled(item.sodium) } : {}),
  }));
  return {
    date,
    meal: mealSlotFor(source),
    foodName: source.foodName,
    items,
    totalCalories: scaled(source.totalCalories),
    totalProtein: scaled(source.totalProtein),
    totalCarbs: scaled(source.totalCarbs),
    totalFat: scaled(source.totalFat),
    ...(source.totalFiber !== undefined ? { totalFiber: scaled(source.totalFiber) } : {}),
    ...(source.totalSugar !== undefined ? { totalSugar: scaled(source.totalSugar) } : {}),
    ...(source.totalSodium !== undefined ? { totalSodium: scaled(source.totalSodium) } : {}),
    confidence: "copy",
  };
}

/** Return only accepted writes. The sheet keeps the remaining choices on
 * failure, so retry cannot repeat a meal that was already saved locally. */
export async function copySelectedMeals(
  uid: string,
  date: string,
  selections: readonly MealCopySelection[]
): Promise<MealCopyResult> {
  const created: MealCopyResult["created"] = [];
  try {
    // Validate every portion before accepting the first entry.
    const prepared = selections.map((selection) => ({
      selection,
      payload: mealCopyPayload(selection.source, selection.multiplier, date),
    }));
    for (const { selection, payload } of prepared) {
      const added = await createMealEntry(uid, {
        ...payload,
        createdAt: Timestamp.now(),
      }, selection.destinationId);
      created.push({ sourceId: selection.source.id, id: added.id, slot: payload.meal });
    }
    return { created, error: null };
  } catch (error) {
    return { created, error };
  }
}
