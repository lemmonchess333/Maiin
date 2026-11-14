/**
 * Lifetime meal totals, across every meal an account has.
 *
 * The Lifetime tile counted `useMeals`, which subscribes to the newest 400
 * meal docs. So "meals logged" and "days logged" both stopped at 400 and at
 * however many distinct days those covered, and a long-standing user's
 * lifetime figures quietly stopped moving. A capped count looks exactly
 * like a real one, so the totals must know when the window is not
 * everything.
 *
 * They do: `useMeals` says whether its window stopped at its page size.
 *
 * - A window that did not stop holds every meal the account has. The
 *   totals come from it, live, and nothing else is read. That is every
 *   account for its first few months of logging.
 * - A window that stopped (or failed) leaves older meals unseen. Every meal
 *   is read once, kept for the session, and the live window is laid over
 *   it (`lifetimeMealDays.ts`), so a meal logged or binned since shows
 *   without another whole read. The read is taken again once it is half an
 *   hour old, which bounds how long a change made on another device to a
 *   meal outside the window can go unseen.
 *
 * The first snapshot of a window this device has never asked for can come
 * from the local cache and hold only part of it. The totals follow the
 * window, as History's other meal figures do, and settle with the server's
 * answer.
 *
 * Soft-deleted meals do not count: the tile says what you logged and kept.
 * Its days are food days (`foodDay.ts`): a day's kept meals reach 800 kcal.
 */
import { useEffect, useMemo, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useUid } from "@/lib/auth";
import { logger } from "@/lib/logger";
import {
  lifetimeMealStats,
  mealDay,
  overlayWindow,
  type LifetimeMealStats,
  type MealDay,
  type WindowMeal,
} from "@/lib/lifetimeMealDays";

export type { LifetimeMealStats };

/** The live meals window, as `useMeals()` returns it. */
export interface MealsWindow {
  /** Kept meals in the window. */
  meals: readonly WindowMeal[];
  /** Soft-deleted meals in the window. */
  deletedMeals: readonly WindowMeal[];
  /** The window stopped at its page size: older meals exist outside it. */
  hasMore: boolean;
  loading: boolean;
  error: string | null;
}

/** How long a whole read stands before History takes it again. */
export const WHOLE_READ_MAX_AGE_MS = 30 * 60 * 1000;

const EMPTY: LifetimeMealStats = { mealCount: 0, daysLogged: 0 };

type EveryMeal = ReadonlyMap<string, MealDay>;

/* One whole read an account a session, shared by every mount of History. */
const wholeReads = new Map<string, { at: number; meals: EveryMeal }>();
const reading = new Map<string, Promise<EveryMeal>>();

export function __resetLifetimeMealReadsForTests(): void {
  wholeReads.clear();
  reading.clear();
}

function readEveryMeal(uid: string): Promise<EveryMeal> {
  const inFlight = reading.get(uid);
  if (inFlight) return inFlight;
  const read = getDocs(collection(db, "users", uid, "meals"))
    .then((snap) => {
      const meals: EveryMeal = new Map(
        snap.docs.map((d) => [
          d.id,
          mealDay(d.data() as Parameters<typeof mealDay>[0]),
        ])
      );
      wholeReads.set(uid, { at: Date.now(), meals });
      return meals;
    })
    .finally(() => reading.delete(uid));
  reading.set(uid, read);
  return read;
}

export function useLifetimeMealStats(
  mealsWindow: MealsWindow,
  options?: { enabled?: boolean }
) {
  const enabled = options?.enabled ?? true;
  const uid = useUid();
  const { meals, deletedMeals, hasMore, loading: windowLoading } = mealsWindow;
  const windowFailed = mealsWindow.error !== null;
  const active = Boolean(uid && enabled);
  // A window that stopped at its page size, or failed, is not everything.
  const needsWholeRead = active && !windowLoading && (hasMore || windowFailed);

  const [read, setRead] = useState<{ uid: string; meals: EveryMeal } | null>(
    null
  );
  /* A read that FAILED is not a user who has never logged. `useLifetimeRunStats`
     carries this for the same reason: there, zero made History hide the whole
     Running section with the only evidence in a console the user never sees. */
  const [failedUid, setFailedUid] = useState<string | null>(null);

  useEffect(() => {
    if (!uid || !needsWholeRead) return;
    const kept = wholeReads.get(uid);
    if (kept && Date.now() - kept.at < WHOLE_READ_MAX_AGE_MS) return;
    let cancelled = false;
    readEveryMeal(uid)
      .then((everyMeal) => {
        if (cancelled) return;
        setRead({ uid, meals: everyMeal });
        setFailedUid(null);
      })
      .catch((err) => {
        logger.error("useLifetimeMealStats error:", err);
        if (!cancelled) setFailedUid(uid);
      });
    return () => {
      cancelled = true;
    };
  }, [uid, needsWholeRead]);

  /* This mount's read, or the session's: an account change must not show
     the previous account's totals for even one frame, so both are keyed by
     the account they were read for. */
  const everyMeal =
    uid && needsWholeRead
      ? ((read?.uid === uid ? read.meals : null) ??
        wholeReads.get(uid)?.meals ??
        null)
      : null;

  const stats = useMemo(() => {
    if (!active || windowLoading) return EMPTY;
    if (!needsWholeRead) {
      return lifetimeMealStats(overlayWindow(new Map(), meals, deletedMeals));
    }
    if (!everyMeal) return EMPTY;
    return lifetimeMealStats(overlayWindow(everyMeal, meals, deletedMeals));
  }, [active, windowLoading, needsWholeRead, everyMeal, meals, deletedMeals]);

  const readFailed = needsWholeRead && !everyMeal && failedUid === uid;
  return {
    ...stats,
    loading:
      active &&
      (windowLoading || (needsWholeRead && !everyMeal)) &&
      !readFailed,
    failed: readFailed,
  };
}
