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
import type { DayTarget } from "@/lib/foodDays";

const EMPTY: ReadonlyMap<string, DayTarget> = new Map();

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

/**
 * Each day's calorie and protein target as it stood that day, over the
 * range: the snapshots `useDailyNutritionSnapshot` writes. A day's target
 * moves with its type (a lift day eats more than a rest day), so judging a
 * past day against TODAY's target would mark the wrong days as misses.
 *
 * Range-scoped like `useMealsInRange`, which it is read beside: the
 * badge reader stops at the newest 60, which would quietly shrink a six-
 * month view to two. Keyed by the uid AND the boundary it was read for, so
 * neither another account's targets nor another range's are shown while a
 * read is in flight.
 */
export function useDailyTargetsInRange(
  uid: string | null | undefined,
  days: number
): { targets: ReadonlyMap<string, DayTarget>; loading: boolean } {
  const [settled, setSettled] = useState<{
    key: string;
    targets: ReadonlyMap<string, DayTarget>;
  } | null>(null);
  const [nowMs] = useState(() => Date.now());
  const sinceKey = useMemo(
    () => localDateString(new Date(nowMs - days * 24 * 60 * 60 * 1000)),
    [nowMs, days]
  );
  const key = `${uid ?? ""}:${sinceKey}`;

  useEffect(() => {
    if (!uid) return;
    const q = query(
      collection(db, "users", uid, "dailyNutrition"),
      where("date", ">=", sinceKey),
      orderBy("date", "desc")
    );
    return onSnapshot(
      q,
      (snapshot) => {
        const targets = new Map<string, DayTarget>();
        for (const d of snapshot.docs) {
          const raw = d.data() as {
            date?: unknown;
            targetCalories?: unknown;
            targetProtein?: unknown;
          };
          // The query filters on `date`, so every doc it returns has one;
          // a non-string there would be a malformed write, not a day.
          if (typeof raw.date !== "string") continue;
          targets.set(raw.date, {
            calories: num(raw.targetCalories),
            protein: num(raw.targetProtein),
          });
        }
        setSettled({ key: `${uid}:${sinceKey}`, targets });
      },
      (err) => {
        // Settle empty: a card that never resolves reads as a hang, and a
        // day without a target is judged against nothing, not guessed.
        logger.error("[useDailyTargetsInRange] subscription failed", err);
        setSettled({ key: `${uid}:${sinceKey}`, targets: new Map() });
      }
    );
  }, [uid, sinceKey]);

  if (!uid) return { targets: EMPTY, loading: false };
  return settled?.key === key
    ? { targets: settled.targets, loading: false }
    : { targets: EMPTY, loading: true };
}
