import { useCallback, useEffect, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import { logger } from "@/lib/logger";

/**
 * F2d pantry — user-curated local food database.
 *
 * Each entry is a food the user has logged or explicitly added,
 * with macros + usage stats. Surfaces in the NL parser BEFORE OFF
 * results (separate wire-up), so frequently-eaten foods land in
 * one tap rather than requiring a network round-trip to OFF.
 *
 * Per-user subcollection at `users/{uid}/pantry/{itemId}`. Storage
 * cost is small — pantry items are flat macro docs, no media. A
 * future pruning CF can clear `lastUsedAt` entries older than 90d
 * if user pantries grow unbounded.
 */
export type PantryItemSource = "manual" | "barcode" | "meal_log";

export interface PantryItem {
  id: string;
  /** Canonical name as the user wants to see it in the suggestions
   *  dropdown. Storage is the EXACT casing the user typed; matching
   *  is case-insensitive at query time. */
  name: string;
  /** Per-serving macros. servingSize gives the unit. */
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  /** Human-readable serving descriptor (eg "1 cup", "100g", "1 large").
   *  Matches the OFFResult.servingSize shape so pantry items can flow
   *  through the same downstream code paths as OFF picks. */
  servingSize: string;
  /** Times this pantry item has been used as a logging source.
   *  Sort surfaces frequently-used items first. */
  usageCount: number;
  lastUsedAt: unknown;
  createdAt: unknown;
  /** Where the pantry entry originated. `manual` = user typed it
   *  in. `barcode` = product from the OFF scanner that the user
   *  chose to save. `meal_log` = auto-added after the user logged
   *  the same food twice (auto-add toggle in Settings). */
  source: PantryItemSource;
}

/** Shape accepted when creating a new pantry item. `id`, counters,
 *  and timestamps are filled in by the hook. */
export interface NewPantryItem {
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  servingSize: string;
  source: PantryItemSource;
}

/** Shape accepted when updating an existing pantry item. All
 *  fields optional — partial updates are the common case (eg user
 *  fixes a typo in the name without re-entering macros). */
export type PantryItemUpdate = Partial<Omit<PantryItem, "id" | "createdAt" | "usageCount" | "lastUsedAt">>;

function parsePantryDoc(id: string, raw: Record<string, unknown>): PantryItem {
  const safeNum = (v: unknown): number => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };
  const source: PantryItemSource =
    raw.source === "barcode" || raw.source === "meal_log" ? raw.source : "manual";
  return {
    id,
    name: typeof raw.name === "string" ? raw.name : "",
    calories: safeNum(raw.calories),
    protein: safeNum(raw.protein),
    carbs: safeNum(raw.carbs),
    fat: safeNum(raw.fat),
    servingSize: typeof raw.servingSize === "string" ? raw.servingSize : "1 serving",
    usageCount: safeNum(raw.usageCount),
    lastUsedAt: raw.lastUsedAt ?? raw.createdAt ?? null,
    createdAt: raw.createdAt ?? null,
    source,
  };
}

export function usePantry() {
  const { user } = useAuth();
  const [items, setItems] = useState<PantryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      const reset = () => {
        setItems([]);
        setLoading(false);
      };
      reset();
      return;
    }
    const pantryRef = collection(db, "users", user.uid, "pantry");
    // Order client-side query by lastUsedAt desc — recent + frequent
    // surfaces first in the NL suggestions dropdown. usageCount sort
    // would bury recently-added items behind years-old entries; the
    // recency ordering hits the common "I had this yesterday" path.
    const q = query(pantryRef, orderBy("lastUsedAt", "desc"));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list = snapshot.docs.map((d) =>
          parsePantryDoc(d.id, d.data() as Record<string, unknown>),
        );
        setItems(list);
        setLoading(false);
      },
      (err) => {
        logger.error("[usePantry] snapshot failed", err);
        setLoading(false);
      },
    );
    return unsubscribe;
  }, [user]);

  const addItem = useCallback(
    async (input: NewPantryItem): Promise<string | null> => {
      if (!user) return null;
      try {
        const docRef = await addDoc(
          collection(db, "users", user.uid, "pantry"),
          {
            ...input,
            usageCount: 0,
            createdAt: serverTimestamp(),
            lastUsedAt: serverTimestamp(),
          },
        );
        return docRef.id;
      } catch (err) {
        logger.error("[usePantry.addItem] failed", err);
        return null;
      }
    },
    [user],
  );

  const updateItem = useCallback(
    async (id: string, updates: PantryItemUpdate): Promise<boolean> => {
      if (!user) return false;
      try {
        await setDoc(
          doc(db, "users", user.uid, "pantry", id),
          updates,
          { merge: true },
        );
        return true;
      } catch (err) {
        logger.error("[usePantry.updateItem] failed", err);
        return false;
      }
    },
    [user],
  );

  const removeItem = useCallback(
    async (id: string): Promise<boolean> => {
      if (!user) return false;
      try {
        await deleteDoc(doc(db, "users", user.uid, "pantry", id));
        return true;
      } catch (err) {
        logger.error("[usePantry.removeItem] failed", err);
        return false;
      }
    },
    [user],
  );

  /** Atomically bump usageCount + stamp lastUsedAt. Called from the
   *  NL parser pick path when the user logs a meal via a pantry
   *  suggestion. Transaction so concurrent picks (eg. user double-
   *  taps before the listener catches up) don't lose increments. */
  const recordUsage = useCallback(
    async (id: string): Promise<boolean> => {
      if (!user) return false;
      try {
        const ref = doc(db, "users", user.uid, "pantry", id);
        await runTransaction(db, async (tx) => {
          const snap = await tx.get(ref);
          if (!snap.exists()) return;
          const current = snap.data() as Record<string, unknown>;
          const currentCount =
            typeof current.usageCount === "number" ? current.usageCount : 0;
          tx.update(ref, {
            usageCount: currentCount + 1,
            lastUsedAt: serverTimestamp(),
          });
        });
        return true;
      } catch (err) {
        logger.error("[usePantry.recordUsage] failed", err);
        return false;
      }
    },
    [user],
  );

  return { items, loading, addItem, updateItem, removeItem, recordUsage };
}
