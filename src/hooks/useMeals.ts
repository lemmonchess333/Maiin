import { useState, useEffect, useCallback, useMemo } from "react";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  deleteDoc,
  doc,
  limit,
  startAfter,
  getDocs,
  setDoc,
  serverTimestamp,
  QueryDocumentSnapshot,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import { sumMealTotals } from "@/lib/mealTotals";
import { logger } from "@/lib/logger";

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
  /** User-selected meal slot. When set, getMealCategory in Food.tsx uses this
   *  instead of the time-of-day heuristic. Persisted from the "+ Snacks" /
   *  "+ Breakfast" / ... targeting flow so a snack logged at 9am goes to
   *  Snacks, not Breakfast. */
  meal?: "breakfast" | "lunch" | "snacks" | "dinner";
  confidence: string;
  createdAt: unknown;
  /** F5c — soft-delete sentinel. Set to a Firestore Timestamp when
   *  the user deletes the meal; null (or missing) for active meals.
   *  The 24h auto-purge cron CF clears the doc when this is set and
   *  older than the threshold. Active-meals views filter by
   *  `!deletedAt` client-side (server-side `WHERE deletedAt == null`
   *  would miss docs that predate the field; lazy migration via
   *  `parseMealDoc` reads missing → null). */
  deletedAt?: unknown;
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
    // Preserve the user-selected meal slot — without this the field was
    // being written to Firestore but stripped on read, so `+ Snacks`
    // flow always fell through to the breakfast/lunch/dinner time
    // heuristic in Food.tsx:getMealCategory and landed in the wrong
    // section. Narrow to the four valid values to keep downstream
    // switches exhaustive.
    meal:
      raw.meal === "breakfast" ||
      raw.meal === "lunch" ||
      raw.meal === "snacks" ||
      raw.meal === "dinner"
        ? raw.meal
        : undefined,
    confidence: typeof raw.confidence === 'string' ? raw.confidence : '',
    createdAt: raw.createdAt,
    // F5c: missing field is interpreted as active (null). Restored
    // meals also carry deletedAt: null after the restore write.
    deletedAt: raw.deletedAt ?? null,
  };
}

export function useMeals() {
  const { user } = useAuth();
  // Internal store holds BOTH active and soft-deleted meals; the
  // returned `meals` filters to active only, `deletedMeals` to
  // soft-deleted only. Single subscription powers both surfaces.
  const [allMeals, setAllMeals] = useState<Meal[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot | null>(null);

  // 400 matches the useStreaks window — an active user logging 4-6 meals/day
  // hits 100 in ~17 days and their history silently truncates. 400 covers
  // ~67 days of heavy logging with headroom for the 365-day streak badge
  // calculations that read meals as a signal.
  const PAGE_SIZE = 400;

  useEffect(() => {
    if (!user) {
      const reset = () => { setAllMeals([]); setLoading(false); };
      reset();
      return;
    }

    const mealsRef = collection(db, "users", user.uid, "meals");
    const q = query(mealsRef, orderBy("createdAt", "desc"), limit(PAGE_SIZE));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map((d) => parseMealDoc(d.id, d.data() as Record<string, unknown>));
        setAllMeals(data);
        setLastDoc(snapshot.docs[snapshot.docs.length - 1] || null);
        setHasMore(snapshot.docs.length >= PAGE_SIZE);
        setLoading(false);
      },
      // Surface the failure so the UI can exit its skeleton state; keep any
      // previously loaded meals in state so a transient permission blip or
      // network hiccup doesn't wipe what the user is already looking at.
      (err) => {
        logger.error("[useMeals] snapshot subscription failed", err);
        setLoading(false);
        setHasMore(false);
      }
    );

    return unsubscribe;
  }, [user]);

  // F5c — split active vs soft-deleted. Existing call sites only see
  // active meals via `meals`; the Settings recently-deleted archive
  // reads `deletedMeals`. Memoised so the array references stay
  // stable across renders that don't change the underlying snapshot.
  const meals = useMemo(() => allMeals.filter((m) => !m.deletedAt), [allMeals]);
  const deletedMeals = useMemo(
    () => allMeals.filter((m) => !!m.deletedAt),
    [allMeals],
  );

  const loadMore = useCallback(async () => {
    if (!user || !lastDoc || !hasMore) return;
    const mealsRef = collection(db, "users", user.uid, "meals");
    const q = query(mealsRef, orderBy("createdAt", "desc"), startAfter(lastDoc), limit(PAGE_SIZE));
    const snapshot = await getDocs(q);
    const newData = snapshot.docs.map((d) => parseMealDoc(d.id, d.data() as Record<string, unknown>));
    setAllMeals((prev) => [...prev, ...newData]);
    setLastDoc(snapshot.docs[snapshot.docs.length - 1] || null);
    setHasMore(snapshot.docs.length >= PAGE_SIZE);
  }, [user, lastDoc, hasMore]);

  // F5c — soft-delete: writes `deletedAt: serverTimestamp()` instead
  // of removing the doc. Restoration clears `deletedAt`; the 24h
  // auto-purge cron CF hard-deletes after the window expires.
  // Existing call sites (Food.tsx) keep their 3-second in-session
  // undo timer in front of this call, so the soft-delete only fires
  // after the user has had a chance to undo. That's the in-session
  // toast surface; the Recently-Deleted Settings archive covers
  // longer-term recovery within 24h.
  const deleteMeal = useCallback(
    async (mealId: string) => {
      if (!user) return;
      await setDoc(
        doc(db, "users", user.uid, "meals", mealId),
        { deletedAt: serverTimestamp() },
        { merge: true },
      );
    },
    [user],
  );

  const restoreMeal = useCallback(
    async (mealId: string) => {
      if (!user) return;
      await setDoc(
        doc(db, "users", user.uid, "meals", mealId),
        { deletedAt: null },
        { merge: true },
      );
    },
    [user],
  );

  /** Hard-delete — bypasses the soft-delete window. Reserved for the
   *  Settings recently-deleted page's "Delete permanently" action;
   *  callers OUTSIDE that surface should call `deleteMeal` instead. */
  const hardDeleteMeal = useCallback(
    async (mealId: string) => {
      if (!user) return;
      await deleteDoc(doc(db, "users", user.uid, "meals", mealId));
    },
    [user],
  );

  const getMealsForDate = useCallback(
    (date: string) => {
      return meals.filter((m) => m.date === date);
    },
    [meals]
  );

  // Routed through the shared sumMealTotals util so useHomeData (Home's
  // today sum) and useMeals (Food's daily sum) can't drift. If you're
  // adding a new macro (fibre, sugar, sodium, something new), update
  // mealTotals.ts — the two callers get it for free.
  const getDailyTotals = useCallback(
    (date: string) => sumMealTotals(meals.filter((m) => m.date === date)),
    [meals],
  );

  return {
    meals,
    deletedMeals,
    loading,
    hasMore,
    loadMore,
    deleteMeal,
    restoreMeal,
    hardDeleteMeal,
    getMealsForDate,
    getDailyTotals,
  };
}
