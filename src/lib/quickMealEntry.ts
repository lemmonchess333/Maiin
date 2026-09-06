import { doc, runTransaction, Timestamp } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
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

// Firestore can return map fields in a different order than the input.
function mealSignature(value: unknown): string {
  return JSON.stringify(value, (_key, current) =>
    current && typeof current === "object" && !Array.isArray(current)
      ? Object.fromEntries(
          Object.entries(current).sort(([a], [b]) => a.localeCompare(b))
        )
      : current
  );
}

/** Persist the retry ID before sending. An ambiguous network result cannot
 * cause another record, including after a page remount. */
export async function saveQuickMeal(
  uid: string,
  meal: QuickAddItem,
  date: string,
  slot?: string | null
) {
  const payload = buildQuickAddMealPayload(meal);
  const data = stripUndefined({
    date,
    foodName: payload.foodName,
    items: payload.items,
    totalCalories: meal.cal,
    totalProtein: meal.pro,
    totalCarbs: meal.carb,
    totalFat: meal.fat,
    confidence: "quick-add",
    ...(slot ? { meal: slot } : {}),
  });
  const entryKey = `tropos-quick-meal-retry:${mealSignature(data)}`;
  const uidKey = scopedKey(entryKey, uid);
  const id = readString(uidKey) ?? crypto.randomUUID();
  if (!writeString(uidKey, id))
    throw new Error(
      "Couldn't keep this entry for retry. Check device storage."
    );
  const ref = doc(db, "users", uid, "meals", id);
  await runTransaction(db, async (tx) => {
    if (auth.currentUser?.uid !== uid)
      throw new Error("Sign in again to log food.");
    const saved = await tx.get(ref);
    if (!saved.exists()) tx.set(ref, { ...data, createdAt: Timestamp.now() });
  });
  if (!remove(uidKey))
    throw new Error("Meal saved. Free device storage before retrying.");
  return async () => {
    await runTransaction(db, async (tx) => {
      if (auth.currentUser?.uid !== uid)
        throw new Error("Sign in again before undoing.");
      const saved = await tx.get(ref);
      if (!saved.exists()) return;
      const current = saved.data();
      if (
        Object.entries(data).some(
          ([k, v]) => mealSignature(current[k]) !== mealSignature(v)
        )
      )
        throw new Error(
          "This entry has been edited. Use the diary to correct it."
        );
      tx.delete(ref);
    });
  };
}
