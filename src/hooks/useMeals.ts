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
  serverTimestamp,
  runTransaction,
  QueryDocumentSnapshot,
} from "firebase/firestore";
import { setDocGuarded } from "@/lib/firestoreWrite";
import { deleteFoodPhoto } from "@/lib/foodPhotoStore";
import { invalidateFoodPhotoCache } from "@/hooks/useFoodPhotoUrls";
import { noteActivitySnapshot } from "@/lib/activationTracker";
import { db } from "@/lib/firebase";
import { useUid } from "@/lib/auth";
import { sumMealTotals } from "@/lib/mealTotals";
import { validateFoodEntry } from "@/lib/foodValidation";
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
  /** LEGACY ONLY — a Firebase Storage download URL for a meal photo,
   *  written by the pre-Food9 background upload. NOTHING WRITES THIS ANY
   *  MORE: captures now live on the device (`src/lib/foodPhotoStore.ts`)
   *  and no photo field is persisted at all. It stays parsed so docs
   *  written before the swap keep rendering their photo card, and it
   *  drains on its own as those meals fall out of the diary's 90-day
   *  tap-back window. Do not add new writers.
   *
   *  Its sibling `photoPath` was deleted with the swap: it was written,
   *  typed and parsed, and read by nothing anywhere in the repo — the
   *  account-deletion executor sweeps by PREFIX, not by that field. */
  photoUrl?: string;
  confidence: string;
  createdAt: unknown;
  /** F5c — soft-delete sentinel. Set to a Firestore Timestamp when
   *  the user deletes the meal; null (or missing) for active meals.
   *  Nothing clears it automatically — see the note on `deleteMeal`;
   *  the only hard delete is the user's own "Delete permanently" in
   *  Settings → Recently Deleted. Active-meals views filter by
   *  `!deletedAt` client-side (server-side `WHERE deletedAt == null`
   *  would miss docs that predate the field; lazy migration via
   *  `parseMealDoc` reads missing → null). */
  deletedAt?: unknown;
  /** F5b — bumped on every write to the meal doc (any source). Lazy-
   *  migration default is the doc's createdAt for docs predating
   *  this field. */
  updatedAt?: unknown;
  /** F5b — total write count for the meal (any source, internal /
   *  debug). Lazy-migration default is 0 at READ time (via
   *  parseMealDoc); the field is typed as optional so legacy test
   *  fixtures + alternative construction paths don't need to know
   *  the F5b contract. Treat as 0 when missing. */
  revisionCount?: number;
  /** F5b — count of MANUAL user edits via `editMeal()`. Drives the
   *  "Edited" pill UI in Food6 ci7. AI-refinement writes bump
   *  `revisionCount` but NOT `userEditCount` so the pill reads as
   *  "the user edited this" rather than "anything has touched this
   *  doc". Lazy-migration default is 0 at read time; optional in
   *  the type for the same reason as revisionCount above. */
  userEditCount?: number;
  /** F1d — per-field edit lock. Each time the user manually edits a
   *  field via editMeal(), that field's key is added to this array
   *  (deduped). Future AI-refinement code paths SHOULD skip any key
   *  in this set — the user has explicitly set the value and an
   *  automated refinement overwriting it would feel like a bug.
   *  Lazy-migration default is an empty array at read time. No
   *  consumer enforces this yet (no AI-refinement path exists);
   *  the field is populated now so when the consumer lands it can
   *  immediately gate on this array without a backfill. */
  userEditedFields?: string[];
}

/** F5a: payload accepted by `editMeal`. All fields optional — partial
 *  updates are valid (e.g. user only renames the foodName). Macro
 *  totals are validated against `foodValidation.ts` when present;
 *  values that trip the BLOCKED tier throw and the doc is not
 *  written. The WARN tier doesn't throw — UI surfaces the warning
 *  via its own confirmation flow, same as the create path. */
export interface EditMealUpdates {
  foodName?: string;
  items?: MealItem[];
  totalCalories?: number;
  totalProtein?: number;
  totalCarbs?: number;
  totalFat?: number;
  meal?: "breakfast" | "lunch" | "snacks" | "dinner";
}

/** Coerce a value to a finite number, defaulting to 0 */
function safeNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function parseMealDoc(id: string, raw: Record<string, unknown>): Meal {
  return {
    id,
    date: typeof raw.date === "string" ? raw.date : "",
    foodName: typeof raw.foodName === "string" ? raw.foodName : "",
    items: Array.isArray(raw.items) ? (raw.items as MealItem[]) : [],
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
    photoUrl: typeof raw.photoUrl === "string" ? raw.photoUrl : undefined,
    confidence: typeof raw.confidence === "string" ? raw.confidence : "",
    createdAt: raw.createdAt,
    // F5c: missing field is interpreted as active (null). Restored
    // meals also carry deletedAt: null after the restore write.
    deletedAt: raw.deletedAt ?? null,
    // F5b: lazy migration. Docs predating the field get sensible
    // defaults at read time so the UI doesn't need to branch on
    // "field missing" anywhere downstream — only on the counter
    // value itself. updatedAt defaults to createdAt so "last
    // modified" comparisons work for unmigrated docs without a
    // separate flag check.
    updatedAt: raw.updatedAt ?? raw.createdAt,
    revisionCount:
      typeof raw.revisionCount === "number" ? raw.revisionCount : 0,
    userEditCount:
      typeof raw.userEditCount === "number" ? raw.userEditCount : 0,
    // F1d: defensive read — field is an array of strings (field keys
    // the user has manually edited). Anything else (missing, wrong
    // type, non-string entries) defaults to an empty array so
    // downstream consumers can iterate without guards.
    userEditedFields: Array.isArray(raw.userEditedFields)
      ? (raw.userEditedFields as unknown[]).filter(
          (k): k is string => typeof k === "string"
        )
      : [],
  };
}

export function useMeals() {
  const uid = useUid();
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
    if (!uid) {
      const reset = () => {
        setAllMeals([]);
        setLoading(false);
      };
      reset();
      return;
    }

    const mealsRef = collection(db, "users", uid, "meals");
    const q = query(mealsRef, orderBy("createdAt", "desc"), limit(PAGE_SIZE));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map((d) =>
          parseMealDoc(d.id, d.data() as Record<string, unknown>)
        );
        setAllMeals(data);
        setLastDoc(snapshot.docs[snapshot.docs.length - 1] || null);
        setHasMore(snapshot.docs.length >= PAGE_SIZE);
        setLoading(false);
        // Activation funnel: fire `food_logged` once per newly-created meal
        // across all creation sites. Baseline-guarded + deduped by uid.
        noteActivitySnapshot(
          "food",
          uid,
          snapshot.docs.map((d) => d.id)
        );
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
  }, [uid]);

  // F5c — split active vs soft-deleted. Existing call sites only see
  // active meals via `meals`; the Settings recently-deleted archive
  // reads `deletedMeals`. Memoised so the array references stay
  // stable across renders that don't change the underlying snapshot.
  const meals = useMemo(() => allMeals.filter((m) => !m.deletedAt), [allMeals]);
  const deletedMeals = useMemo(
    () => allMeals.filter((m) => !!m.deletedAt),
    [allMeals]
  );

  const loadMore = useCallback(async () => {
    if (!uid || !lastDoc || !hasMore) return;
    const mealsRef = collection(db, "users", uid, "meals");
    const q = query(
      mealsRef,
      orderBy("createdAt", "desc"),
      startAfter(lastDoc),
      limit(PAGE_SIZE)
    );
    const snapshot = await getDocs(q);
    const newData = snapshot.docs.map((d) =>
      parseMealDoc(d.id, d.data() as Record<string, unknown>)
    );
    setAllMeals((prev) => [...prev, ...newData]);
    setLastDoc(snapshot.docs[snapshot.docs.length - 1] || null);
    setHasMore(snapshot.docs.length >= PAGE_SIZE);
  }, [uid, lastDoc, hasMore]);

  // F5c — soft-delete: writes `deletedAt: serverTimestamp()` instead
  // of removing the doc. Restoration clears `deletedAt`.
  //
  // NOTE this comment used to claim "the 24h auto-purge cron CF
  // hard-deletes after the window expires". There is NO such function
  // — all seven scheduled functions in `functions/index.js` were
  // checked (weeklyPerformanceRollup, dailyPerformanceRefresh,
  // rolloverChallenges, weeklyCoachPrompts, hourlyStreakNudge,
  // dailyRaceReconciliationSweep, weeklyFellBehindCheck) and none
  // touches `meals`. A soft-deleted meal doc lives forever unless the
  // user taps "Delete permanently" in Settings → Recently Deleted
  // (`hardDeleteMeal`), or the account is deleted. The "24h window" is
  // therefore a UI convention on the archive screen, not a retention
  // guarantee — treat it as such when reasoning about anything hung
  // off a meal doc's lifetime.
  //
  // Existing call sites (Food.tsx) keep their 3-second in-session
  // undo timer in front of this call, so the soft-delete only fires
  // after the user has had a chance to undo. That's the in-session
  // toast surface; the Recently-Deleted Settings archive covers
  // longer-term recovery within 24h.
  const deleteMeal = useCallback(
    async (mealId: string) => {
      if (!uid) return;
      await setDocGuarded(
        doc(db, "users", uid, "meals", mealId),
        { deletedAt: serverTimestamp() },
        { merge: true }
      );
    },
    [uid]
  );

  const restoreMeal = useCallback(
    async (mealId: string) => {
      if (!uid) return;
      await setDocGuarded(
        doc(db, "users", uid, "meals", mealId),
        { deletedAt: null },
        { merge: true }
      );
    },
    [uid]
  );

  /**
   * F5a — partial update for a single meal doc. Atomic via Firestore
   * transaction so the counter bumps and field updates land together
   * even under concurrent writes. Bumps BOTH `revisionCount` (any
   * write) AND `userEditCount` (manual edit signal that drives the
   * Food6 ci7 "Edited" pill); AI-refinement code paths bump only
   * `revisionCount` and should NOT call through this function.
   *
   * Validates macro totals against the same `validateFoodEntry` floor
   * the create path uses — BLOCKED-tier values throw and the doc
   * is not written. WARN-tier values are returned to the caller via
   * the result so the UI can run its own confirmation flow before
   * retrying with `force=true` (mirrors the NL parse pattern).
   *
   * Lazy migration: if the doc predates the F5b counters (missing
   * `revisionCount` / `userEditCount`), the transaction reads them
   * as 0 and writes back 1.
   */
  const editMeal = useCallback(
    async (mealId: string, updates: EditMealUpdates): Promise<void> => {
      if (!uid) throw new Error("Not authenticated");

      // Validate against the create-path floor when macros are
      // present. We only block on the hard ceiling; WARN-tier values
      // are out of scope for this hook (UI flow handles them).
      const validation = validateFoodEntry({
        calories: updates.totalCalories,
        protein: updates.totalProtein,
        carbs: updates.totalCarbs,
        fat: updates.totalFat,
      });
      if (validation.kind === "blocked") {
        throw new Error(validation.reason);
      }

      const ref = doc(db, "users", uid, "meals", mealId);
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists()) throw new Error("Meal not found");
        const current = snap.data() as Record<string, unknown>;
        const currentRevision =
          typeof current.revisionCount === "number" ? current.revisionCount : 0;
        const currentUserEdit =
          typeof current.userEditCount === "number" ? current.userEditCount : 0;
        // F1d: union of existing locks + the keys of THIS update.
        // Deduped via Set. Defensive on the existing value: anything
        // not an array of strings is treated as empty so a corrupted
        // doc doesn't propagate junk.
        const currentLocks = Array.isArray(current.userEditedFields)
          ? (current.userEditedFields as unknown[]).filter(
              (k): k is string => typeof k === "string"
            )
          : [];
        const nextLocks = Array.from(
          new Set<string>([...currentLocks, ...Object.keys(updates)])
        );
        tx.update(ref, {
          ...updates,
          updatedAt: serverTimestamp(),
          revisionCount: currentRevision + 1,
          userEditCount: currentUserEdit + 1,
          userEditedFields: nextLocks,
        });
      });
    },
    [uid]
  );

  /** Hard-delete — bypasses the soft-delete window. Reserved for the
   *  Settings recently-deleted page's "Delete permanently" action;
   *  callers OUTSIDE that surface should call `deleteMeal` instead.
   *
   *  Food9: also drops the meal's device-local photo. This is the
   *  delete-on-delete the Storage implementation never had — a photo
   *  uploaded there outlived its meal forever, and only the
   *  account-deletion prefix sweep ever removed it. Deliberately NOT
   *  done in the soft `deleteMeal`: restore from Recently Deleted has to
   *  be lossless, so the blob outlives the soft delete and is collected
   *  by the retention sweep instead. */
  const hardDeleteMeal = useCallback(
    async (mealId: string) => {
      if (!uid) return;
      await deleteDoc(doc(db, "users", uid, "meals", mealId));
      await deleteFoodPhoto(uid, mealId);
      invalidateFoodPhotoCache(uid, mealId);
    },
    [uid]
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
    [meals]
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
    editMeal,
    getMealsForDate,
    getDailyTotals,
  };
}
