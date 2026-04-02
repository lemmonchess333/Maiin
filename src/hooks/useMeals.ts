import { useState, useEffect, useCallback } from "react";
import { collection, query, orderBy, onSnapshot, deleteDoc, doc, limit, startAfter, getDocs, QueryDocumentSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";

export interface MealItem {
  name: string;
  portionSize: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
  sugar?: number;
  sodium?: number;
}

export interface Meal {
  id: string;
  date: string;
  foodName: string;
  items: MealItem[];
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
  totalFiber?: number;
  totalSugar?: number;
  totalSodium?: number;
  confidence: string;
  createdAt: unknown;
}

/** Coerce a value to a finite number, defaulting to 0 */
function safeNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function parseMealDoc(id: string, raw: Record<string, unknown>): Meal {
  return {
    id,
    date: typeof raw.date === 'string' ? raw.date : '',
    foodName: typeof raw.foodName === 'string' ? raw.foodName : '',
    items: Array.isArray(raw.items) ? raw.items as MealItem[] : [],
    totalCalories: safeNum(raw.totalCalories),
    totalProtein: safeNum(raw.totalProtein),
    totalCarbs: safeNum(raw.totalCarbs),
    totalFat: safeNum(raw.totalFat),
    totalFiber: raw.totalFiber != null ? safeNum(raw.totalFiber) : undefined,
    totalSugar: raw.totalSugar != null ? safeNum(raw.totalSugar) : undefined,
    totalSodium: raw.totalSodium != null ? safeNum(raw.totalSodium) : undefined,
    confidence: typeof raw.confidence === 'string' ? raw.confidence : '',
    createdAt: raw.createdAt,
  };
}

export function useMeals() {
  const { user } = useAuth();
  const [meals, setMeals] = useState<Meal[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot | null>(null);

  const PAGE_SIZE = 100;

  useEffect(() => {
    if (!user) {
      const reset = () => { setMeals([]); setLoading(false); };
      reset();
      return;
    }

    const mealsRef = collection(db, "users", user.uid, "meals");
    const q = query(mealsRef, orderBy("createdAt", "desc"), limit(PAGE_SIZE));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((d) => parseMealDoc(d.id, d.data() as Record<string, unknown>));
      setMeals(data);
      setLastDoc(snapshot.docs[snapshot.docs.length - 1] || null);
      setHasMore(snapshot.docs.length >= PAGE_SIZE);
      setLoading(false);
    });

    return unsubscribe;
  }, [user]);

  const loadMore = useCallback(async () => {
    if (!user || !lastDoc || !hasMore) return;
    const mealsRef = collection(db, "users", user.uid, "meals");
    const q = query(mealsRef, orderBy("createdAt", "desc"), startAfter(lastDoc), limit(PAGE_SIZE));
    const snapshot = await getDocs(q);
    const newData = snapshot.docs.map((d) => parseMealDoc(d.id, d.data() as Record<string, unknown>));
    setMeals(prev => [...prev, ...newData]);
    setLastDoc(snapshot.docs[snapshot.docs.length - 1] || null);
    setHasMore(snapshot.docs.length >= PAGE_SIZE);
  }, [user, lastDoc, hasMore]);

  const deleteMeal = useCallback(
    async (mealId: string) => {
      if (!user) return;
      await deleteDoc(doc(db, "users", user.uid, "meals", mealId));
    },
    [user]
  );

  const getMealsForDate = useCallback(
    (date: string) => {
      return meals.filter((m) => m.date === date);
    },
    [meals]
  );

  const getDailyTotals = useCallback(
    (date: string) => {
      const dateMeals = meals.filter((m) => m.date === date);
      return {
        calories: dateMeals.reduce((sum, m) => sum + m.totalCalories, 0),
        protein: dateMeals.reduce((sum, m) => sum + m.totalProtein, 0),
        carbs: dateMeals.reduce((sum, m) => sum + m.totalCarbs, 0),
        fat: dateMeals.reduce((sum, m) => sum + m.totalFat, 0),
        fiber: dateMeals.reduce((sum, m) => sum + (m.totalFiber || 0), 0),
        sugar: dateMeals.reduce((sum, m) => sum + (m.totalSugar || 0), 0),
        sodium: dateMeals.reduce((sum, m) => sum + (m.totalSodium || 0), 0),
        mealCount: dateMeals.length,
      };
    },
    [meals]
  );

  return { meals, loading, hasMore, loadMore, deleteMeal, getMealsForDate, getDailyTotals };
}
