/**
 * Meals for a chosen span of days, fetched BY DATE.
 *
 * Analytics sliced `useMeals`, which subscribes to the newest 400 meal docs
 * ordered by `createdAt`. Four hundred is roughly two to three months for
 * someone logging four to six meals a day, so 3M / 6M / 1Y were averaged
 * over whatever part of the period happened to fit in that window. The
 * numbers stayed plausible — an average over 70 days of a 365-day period
 * looks exactly like an average over 365 — which is what made it worth
 * fixing rather than leaving.
 *
 * `days` is the whole span the caller needs, comparison window included:
 * a period and its preceding comparable period is `rangeDays * 2`.
 *
 * Meals are filtered to ACTIVE here, matching `useMeals().meals` — a
 * soft-deleted meal is not part of what you ate.
 */
import { useEffect, useMemo, useState } from "react";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { logger } from "@/lib/logger";
import { localDateString } from "@/lib/dateHelpers";
import { activeMealDocs } from "@/lib/mealTotals";
import { parseMealDoc, type Meal } from "@/hooks/useMeals";

/** Stable identity so a signed-out render does not churn consumers. */
const EMPTY: Meal[] = [];

export function useMealsInRange(
  uid: string | null | undefined,
  days: number
): { meals: Meal[]; loading: boolean } {
  /* The loaded meals tagged with the boundary they were fetched for. When
     the range changes, the previous result stops matching and the hook
     reports `loading` again — so a 1Y label can never be drawn over 1M's
     numbers, even for a frame. Storing a bare `loading` flag and flipping
     it at the top of the effect left exactly that window open. */
  const [settled, setSettled] = useState<{ key: string; meals: Meal[] } | null>(
    null
  );

  /* The clock is read ONCE, at mount. Reading it during render is impure
     and would re-derive the boundary on every pass; it also means the
     window cannot slide out from under a chart the user is reading. `days`
     stays reactive, so switching 1M → 1Y still refetches. */
  const [nowMs] = useState(() => Date.now());
  /* A date KEY, not a Date: `meal.date` is a local "YYYY-MM-DD" string, and
     ISO dates compare lexicographically, so this is a plain string range in
     Firestore. Deriving the key this way also keeps the boundary in the
     same local-date terms the documents were written in — the UTC-vs-local
     mismatch this codebase has been bitten by repeatedly. */
  const sinceKey = useMemo(
    () => localDateString(new Date(nowMs - days * 24 * 60 * 60 * 1000)),
    [nowMs, days]
  );

  useEffect(() => {
    if (!uid) return;
    const q = query(
      collection(db, "users", uid, "meals"),
      where("date", ">=", sinceKey),
      orderBy("date", "desc")
    );
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setSettled({
          key: sinceKey,
          meals: activeMealDocs(
            snapshot.docs.map((d) =>
              parseMealDoc(d.id, d.data() as Record<string, unknown>)
            )
          ) as Meal[],
        });
      },
      (err) => {
        // Settle EMPTY rather than leave the caller spinning: a chart that
        // never resolves reads as a hang, and the error is logged here.
        logger.error("[useMealsInRange] subscription failed", err);
        setSettled({ key: sinceKey, meals: [] });
      }
    );
    return unsubscribe;
  }, [uid, sinceKey]);

  /* Derived, not stored. A signed-out caller is a fact about the argument,
     so answering it here avoids a setState in the effect body and the
     frame of stale state that comes with one. */
  const fresh = settled?.key === sinceKey;
  if (!uid) return { meals: EMPTY, loading: false };
  return fresh
    ? { meals: settled.meals, loading: false }
    : { meals: EMPTY, loading: true };
}
