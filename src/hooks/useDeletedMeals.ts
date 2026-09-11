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

/** The window the archive screen offers. A UI convention, not a retention
 *  guarantee — nothing purges soft-deleted docs (see `useMeals`). */
export const DELETED_ARCHIVE_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Stable identity so a signed-out render does not churn consumers. */
const EMPTY: Meal[] = [];

export function useDeletedMeals(uid: string | null | undefined): {
  deletedMeals: Meal[];
  loading: boolean;
} {
  const [deletedMeals, setDeletedMeals] = useState<Meal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) return;
    /* Captured once per mount rather than recomputed per render. A sliding
       cutoff would drop a meal out of the list while the user was reaching
       for it — the one moment this screen exists to serve. */
    const cutoff = Timestamp.fromMillis(Date.now() - DELETED_ARCHIVE_WINDOW_MS);
    const q = query(
      collection(db, "users", uid, "meals"),
      where("deletedAt", ">=", cutoff),
      orderBy("deletedAt", "desc")
    );
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        /* No client-side `deletedAt` re-check. Restoring writes
           `deletedAt: null`, and the `where` above already excludes that —
           null sorts below every timestamp in Firestore's type ordering,
           and the test fake reaches the same verdict by its own route.
           A filter here would be unreachable code dressed as a safety net;
           `useDeletedMeals.test.tsx` pins the restored-meal case on the
           query instead. */
        setDeletedMeals(
          snapshot.docs.map((d) =>
            parseMealDoc(d.id, d.data() as Record<string, unknown>)
          )
        );
        setLoading(false);
      },
      (err) => {
        logger.error("[useDeletedMeals] subscription failed", err);
        setDeletedMeals([]);
        setLoading(false);
      }
    );
    return unsubscribe;
  }, [uid]);

  /* Derived, not stored — see `useMealsInRange`. A signed-out caller is a
     fact about the argument, not something to write into state. */
  return uid
    ? { deletedMeals, loading }
    : { deletedMeals: EMPTY, loading: false };
}
