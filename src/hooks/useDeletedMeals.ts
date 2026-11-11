/**
 * The recently-deleted archive, found by WHEN A MEAL WAS DELETED.
 *
 * `useMeals` subscribes to the newest 400 meals ordered by `createdAt`, and
 * the archive filtered that same window for `deletedAt`. So it could only
 * ever show meals that were both recently LOGGED and deleted: delete a meal
 * from three months ago and it is nowhere in the newest 400, so the archive
 * stayed empty and the meal was unrecoverable through the UI.
 *
 * Ordering by `deletedAt` asks the question the screen is actually asking.
 * When the meal was logged stops mattering entirely.
 */
import { useEffect, useState } from "react";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { logger } from "@/lib/logger";
import { parseMealDoc, type Meal } from "@/hooks/useMeals";

/** Include every supported Firestore timestamp, excluding null/missing
 *  deletion fields. Meals remain recoverable until an explicit hard delete. */
const FIRST_TIMESTAMP = Timestamp.fromDate(new Date("0001-01-01T00:00:00Z"));

/** Stable identity so a signed-out render does not churn consumers. */
const EMPTY: Meal[] = [];

export function useDeletedMeals(uid: string | null | undefined): {
  deletedMeals: Meal[];
  loading: boolean;
} {
  const [settled, setSettled] = useState<{
    uid: string;
    meals: Meal[];
  } | null>(null);

  useEffect(() => {
    if (!uid) return;
    let active = true;
    const q = query(
      collection(db, "users", uid, "meals"),
      where("deletedAt", ">=", FIRST_TIMESTAMP),
      orderBy("deletedAt", "desc")
    );
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        if (!active) return;
        /* No client-side `deletedAt` re-check. Restoring writes
           `deletedAt: null`, and the `where` above already excludes that —
           null sorts below every timestamp in Firestore's type ordering,
           and the test fake reaches the same verdict by its own route.
           A filter here would be unreachable code dressed as a safety net;
           `useDeletedMeals.test.tsx` pins the restored-meal case on the
           query instead. */
        setSettled({
          uid,
          meals: snapshot.docs.map((d) =>
            parseMealDoc(d.id, d.data() as Record<string, unknown>)
          ),
        });
      },
      (err) => {
        if (!active) return;
        logger.error("[useDeletedMeals] subscription failed", err);
        setSettled({ uid, meals: [] });
      }
    );
    return () => {
      active = false;
      unsubscribe();
    };
  }, [uid]);

  /* Derived, not stored — see `useMealsInRange`. A signed-out caller is a
     fact about the argument, not something to write into state. */
  if (!uid) return { deletedMeals: EMPTY, loading: false };
  return settled?.uid === uid
    ? { deletedMeals: settled.meals, loading: false }
    : { deletedMeals: EMPTY, loading: true };
}
