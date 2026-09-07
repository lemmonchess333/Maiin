import { Timestamp } from "firebase/firestore";
import { createMealEntry, undoMealEntries } from "@/lib/mealEntry";
import { scopedKey, readString, writeString, remove } from "@/lib/localStore";
import { stripUndefined } from "@/lib/firestoreGuards";
import {
  buildQuickAddMealPayload,
  type QuickAddItem,
} from "@/lib/quickAddOrder";

export function scaleQuickMeal(
  meal: QuickAddItem,
  multiplier: number
): QuickAddItem {
  if (!Number.isFinite(multiplier) || multiplier <= 0 || multiplier > 20)
    throw new Error("Choose a portion greater than 0 and no more than 20.");
  const portion = (label: string) =>
    multiplier === 1 ? label : `${multiplier} × ${label}`;
  return {
    ...meal,
    cal: meal.cal * multiplier,
    pro: meal.pro * multiplier,
    carb: meal.carb * multiplier,
    fat: meal.fat * multiplier,
    portionSize: portion(meal.portionSize),
    ...(meal.bundle
      ? {
          bundle: {
            ...meal.bundle,
            items: meal.bundle.items.map((i) => ({
              ...i,
              portionSize: portion(i.portionSize),
              calories: i.calories * multiplier,
              protein: i.protein * multiplier,
              carbs: i.carbs * multiplier,
              fat: i.fat * multiplier,
            })),
          },
        }
      : {}),
  };
}

/** The retry identity is retained until this phone has accepted the write. */
export async function saveQuickMeal(uid: string, meal: QuickAddItem, date: string, slot?: string | null) {
  if (meal.example) throw new Error("Describe your own meal before logging.");
  const payload = buildQuickAddMealPayload(meal);
  const data = stripUndefined({ date, foodName: payload.foodName, items: payload.items,
    totalCalories: meal.cal, totalProtein: meal.pro, totalCarbs: meal.carb, totalFat: meal.fat,
    confidence: "quick-add", ...(slot ? { meal: slot } : {}) });
  const key = scopedKey(`tropos-quick-meal-retry:${JSON.stringify(data)}`, uid);
  const id = readString(key) ?? crypto.randomUUID();
  if (!writeString(key, id)) throw new Error("Couldn't keep this entry for retry. Check device storage.");
  await createMealEntry(uid, { ...data, createdAt: Timestamp.now() }, id);
  remove(key);
  return () => undoMealEntries(uid, [id]);
}
