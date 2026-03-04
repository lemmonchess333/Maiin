import { useState, useEffect, useCallback } from "react";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  doc,
  setDoc,
  deleteDoc,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";

export interface FoodFavourite {
  id: string;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
  sugar?: number;
  sodium?: number;
  servingSize: string;
  lastUsed: Timestamp;
  useCount: number;
  timeOfDay: "morning" | "midday" | "evening" | "any";
  source: "manual" | "photo" | "barcode" | "search";
}

function getTimeOfDay(hour: number): "morning" | "midday" | "evening" {
  if (hour < 11) return "morning";
  if (hour < 16) return "midday";
  return "evening";
}

export function useFoodFavourites() {
  const { user } = useAuth();
  const [favourites, setFavourites] = useState<FoodFavourite[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setFavourites([]);
      setLoading(false);
      return;
    }

    const ref = collection(db, "users", user.uid, "foodFavourites");
    const q = query(ref, orderBy("useCount", "desc"));

    const unsub = onSnapshot(q, (snap) => {
      setFavourites(
        snap.docs.map((d) => ({ id: d.id, ...d.data() } as FoodFavourite))
      );
      setLoading(false);
    });

    return unsub;
  }, [user]);

  const getTimeRelevant = useCallback(
    (hour: number, limit = 5) => {
      const tod = getTimeOfDay(hour);
      const relevant = favourites.filter(
        (f) => f.timeOfDay === tod || f.timeOfDay === "any"
      );
      if (relevant.length >= limit) return relevant.slice(0, limit);
      // Fill with top-used if not enough time-specific
      const remaining = favourites
        .filter((f) => !relevant.includes(f))
        .slice(0, limit - relevant.length);
      return [...relevant, ...remaining].slice(0, limit);
    },
    [favourites]
  );

  const addFavourite = useCallback(
    async (meal: {
      name: string;
      calories: number;
      protein: number;
      carbs: number;
      fat: number;
      fiber?: number;
      sugar?: number;
      sodium?: number;
      servingSize?: string;
      source?: FoodFavourite["source"];
    }) => {
      if (!user) return { isNew: false, count: 0 };

      const key = meal.name.trim().toLowerCase().replace(/[^a-z0-9]/g, "_");
      if (!key) return { isNew: false, count: 0 };

      const docRef = doc(db, "users", user.uid, "foodFavourites", key);
      const existing = favourites.find((f) => f.id === key);
      const newCount = (existing?.useCount || 0) + 1;

      await setDoc(docRef, {
        name: meal.name.trim(),
        calories: meal.calories,
        protein: meal.protein,
        carbs: meal.carbs,
        fat: meal.fat,
        fiber: meal.fiber ?? null,
        sugar: meal.sugar ?? null,
        sodium: meal.sodium ?? null,
        servingSize: meal.servingSize || "1 serving",
        lastUsed: Timestamp.now(),
        useCount: newCount,
        timeOfDay: getTimeOfDay(new Date().getHours()),
        source: meal.source || "manual",
      }, { merge: true });

      return { isNew: newCount === 3, count: newCount };
    },
    [user, favourites]
  );

  const removeFavourite = useCallback(
    async (id: string) => {
      if (!user) return;
      await deleteDoc(doc(db, "users", user.uid, "foodFavourites", id));
    },
    [user]
  );

  return {
    favourites,
    loading,
    getTimeRelevant,
    addFavourite,
    removeFavourite,
  };
}
