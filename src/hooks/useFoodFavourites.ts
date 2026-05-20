import { useState, useEffect, useCallback, useRef } from "react";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  doc,
  setDoc,
  deleteDoc,
  Timestamp,
  increment,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { track as trackFoodEvent } from "@/lib/foodAnalytics";

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
  source: "manual" | "photo" | "barcode" | "search" | "nl";
}

/** Pantry collection ceiling. Once the user has accumulated >50
 *  distinct favourited foods, snapshot-driven eviction prunes back
 *  to 50 by selecting the lowest-useCount entry (oldest-lastUsed
 *  tie-break). The lowest-useCount-first sort naturally targets
 *  useCount=1 "fossil" entries before pruning higher-tier items,
 *  so a single sort rule handles both the soft ceiling and the
 *  fossil prune the round-3 grill specced separately. */
const SOFT_CAP = 50;

/** Eviction debounce. Avoids burst-deletes during high-volume
 *  meal-log sessions — multiple addFavourite calls within 500ms
 *  collapse to a single eviction pass after the snapshot settles. */
const EVICTION_DEBOUNCE_MS = 500;

/** Minimum useCount required for a favourite to surface as a Quick
 *  Add chip. Locked in the F2d grill: graduation gate of 2 prevents
 *  one-off entries (typos, single tries) from cluttering the row.
 *  NL typeahead deliberately bypasses this gate (PR 4) — typing the
 *  first 2 chars is an explicit intent signal that the chip surface
 *  doesn't have. */
const GRADUATION_THRESHOLD = 2;

function getTimeOfDay(hour: number): "morning" | "midday" | "evening" {
  if (hour < 11) return "morning";
  if (hour < 16) return "midday";
  return "evening";
}

/** Unicode-safe doc-id key. Previous version stripped all non-ASCII
 *  (`[^a-z0-9]/g`) which silently locked out users logging CJK,
 *  Cyrillic, Arabic, or accented Spanish meals — `name.replace(...)`
 *  collapsed to "" and addFavourite no-op'd. NFKC normalises
 *  combining accents, then we replace whitespace + slashes (the
 *  Firestore doc-id reserved chars) with `_`. */
function makeKey(name: string): string {
  return name.trim().toLowerCase().normalize("NFKC").replace(/[\s/\\]+/g, "_");
}

function safeNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

function parseFavouriteDoc(id: string, raw: Record<string, unknown>): FoodFavourite {
  const tod = raw.timeOfDay;
  const timeOfDay: FoodFavourite["timeOfDay"] =
    tod === "morning" || tod === "midday" || tod === "evening" || tod === "any"
      ? tod
      : "any";
  const src = raw.source;
  const source: FoodFavourite["source"] =
    src === "photo" || src === "barcode" || src === "search" || src === "nl"
      ? src
      : "manual";
  return {
    id,
    name: typeof raw.name === "string" ? raw.name : "",
    calories: safeNum(raw.calories),
    protein: safeNum(raw.protein),
    carbs: safeNum(raw.carbs),
    fat: safeNum(raw.fat),
    fiber: raw.fiber == null ? undefined : safeNum(raw.fiber),
    sugar: raw.sugar == null ? undefined : safeNum(raw.sugar),
    sodium: raw.sodium == null ? undefined : safeNum(raw.sodium),
    servingSize: typeof raw.servingSize === "string" ? raw.servingSize : "1 serving",
    lastUsed: raw.lastUsed instanceof Timestamp ? raw.lastUsed : Timestamp.fromMillis(0),
    useCount: safeNum(raw.useCount),
    timeOfDay,
    source,
  };
}

export function useFoodFavourites() {
  const { user } = useAuth();
  const { isOnline } = useOnlineStatus();
  const [favourites, setFavourites] = useState<FoodFavourite[]>([]);
  const [loading, setLoading] = useState(true);
  /** Increments whenever a favourite crosses the graduation
   *  threshold (previousCount < 2 → newCount >= 2). Consumers
   *  effect on this to trigger one-shot UI (first-graduation
   *  coachmark). The "< 2 → >= 2" inequality catches multi-
   *  increment jumps (offline sync delivering useCount 1 → 3 in a
   *  single snapshot) where a strict `=== 2` check would miss the
   *  transition. */
  const [graduationToken, setGraduationToken] = useState(0);
  /** Re-entrancy guard for eviction. The snapshot can re-fire while
   *  a deleteDoc is in flight — without the guard, the effect would
   *  pick the same target (still present in the cached snapshot) and
   *  fire a second delete on the same id. Flipped true on schedule,
   *  cleared in the delete's finally. */
  const evictingRef = useRef(false);
  /** Previous-snapshot lookup keyed by doc id. Graduation detection
   *  diffs current snapshot against this map. */
  const previousByIdRef = useRef<Map<string, FoodFavourite>>(new Map());
  /** Skip graduation detection on the first snapshot — existing
   *  useCount=5+ items from prior sessions must not all "graduate"
   *  on every login. The flag flips true after the initial snapshot
   *  lands; from then on, transitions across the threshold fire
   *  graduation events. */
  const initialSnapshotSeenRef = useRef(false);

  useEffect(() => {
    if (!user) {
      const reset = () => { setFavourites([]); setLoading(false); };
      reset();
      return;
    }

    const ref = collection(db, "users", user.uid, "foodFavourites");
    // Firestore order by useCount desc — coarse sort, cheap, single
    // index. Secondary tie-break by lastUsed desc happens client-side
    // in the snapshot handler to avoid the composite index requirement —
    // favourites are <50 docs per user, in-memory sort is free.
    const q = query(ref, orderBy("useCount", "desc"));

    const unsub = onSnapshot(
      q,
      (snap) => {
        const parsed = snap.docs.map((d) =>
          parseFavouriteDoc(d.id, d.data() as Record<string, unknown>),
        );
        // Stable tie-break on equal useCount: most-recently used wins.
        parsed.sort((a, b) => {
          if (b.useCount !== a.useCount) return b.useCount - a.useCount;
          return b.lastUsed.toMillis() - a.lastUsed.toMillis();
        });

        // Graduation detection: diff current vs previous snapshot
        // for `< 2 → >= 2` transitions. Skipped on the initial
        // snapshot so prior-session high-useCount items don't all
        // fire on first load. Emits analytics + bumps the token
        // for consumer-side coachmark trigger.
        if (initialSnapshotSeenRef.current) {
          for (const fav of parsed) {
            const prev = previousByIdRef.current.get(fav.id);
            const wasBelow = (prev?.useCount ?? 0) < 2;
            const isAtOrAbove = fav.useCount >= 2;
            if (wasBelow && isAtOrAbove) {
              trackFoodEvent("food_pantry_graduated", {
                favouriteId: fav.id,
                useCount: fav.useCount,
                source: fav.source,
              });
              setGraduationToken((t) => t + 1);
            }
          }
        } else {
          initialSnapshotSeenRef.current = true;
        }
        previousByIdRef.current = new Map(parsed.map((f) => [f.id, f]));

        setFavourites(parsed);
        setLoading(false);
      },
      // Favourites are a "nice to have" quick-log surface — if the
      // subscription fails, drop loading so the UI doesn't hang and leave
      // the current list in place. Writes still go through: addFavourite
      // / removeFavourite will either succeed against the server or
      // surface their own errors to the caller.
      (err) => {
        logger.error("[useFoodFavourites] snapshot subscription failed", err);
        setLoading(false);
      }
    );

    return unsub;
  }, [user]);

  /** Snapshot-driven eviction. Runs when the favourites snapshot
   *  delivers >SOFT_CAP entries, debounced to merge bursts. Lives
   *  here (not inside addFavourite) for two reasons:
   *    1. The post-increment snapshot reflects server-authoritative
   *       useCount values; picking an eviction target from local
   *       state inside addFavourite reads a stale view and can
   *       delete a doc that just graduated.
   *    2. Eviction is housekeeping, not user-critical. Decoupling
   *       it from the write path means an eviction failure can't
   *       bubble into the meal-save UX.
   *
   *  Online-only — when offline the local Firestore cache lags the
   *  server (pending increments not yet ack'd), and an eviction
   *  pick from stale data risks deleting the wrong doc. Eviction
   *  catches up when connectivity restores and the next snapshot
   *  delivers fresh state. */
  useEffect(() => {
    if (!user) return;
    if (!isOnline) return;
    if (evictingRef.current) return;
    if (favourites.length <= SOFT_CAP) return;

    // Lowest useCount first; tie-break by oldest lastUsed. Selects
    // useCount=1 "fossils" before higher-tier items naturally, so
    // no separate fossil-prune pass is needed.
    const sorted = [...favourites].sort((a, b) => {
      if (a.useCount !== b.useCount) return a.useCount - b.useCount;
      return a.lastUsed.toMillis() - b.lastUsed.toMillis();
    });
    const target = sorted[0];

    const timer = setTimeout(async () => {
      evictingRef.current = true;
      try {
        await deleteDoc(
          doc(db, "users", user.uid, "foodFavourites", target.id),
        );
        trackFoodEvent("food_pantry_eviction", {
          favouriteId: target.id,
          useCount: target.useCount,
          totalBefore: favourites.length,
        });
      } catch (err) {
        logger.error("[useFoodFavourites] eviction delete failed", err);
      } finally {
        evictingRef.current = false;
      }
    }, EVICTION_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [favourites, isOnline, user]);

  /** Returns favourites filtered to time-of-day relevance, capped at
   *  `limit`. Two-tier ordering inside the cap:
   *    1. Exact-time matches (eg. tod === "morning") first, ranked by
   *       useCount desc → lastUsed desc.
   *    2. "any"-tagged items next, same ranking.
   *    3. Backfill with top-used non-matching items if still under limit.
   *  Without the two-tier split, a high-useCount "any" item would push
   *  out the user's actual morning routine — the time-of-day signal
   *  must come first within the cap.
   *
   *  Graduation gate (useCount >= 2) applied here so the Quick Add
   *  chip surface stays free of one-off entries. NL typeahead reads
   *  `favourites` directly and bypasses this filter (PR 4). */
  const getTimeRelevant = useCallback(
    (hour: number, limit = 5) => {
      const tod = getTimeOfDay(hour);
      const graduated = favourites.filter((f) => f.useCount >= GRADUATION_THRESHOLD);
      const exact = graduated.filter((f) => f.timeOfDay === tod);
      const anyTime = graduated.filter((f) => f.timeOfDay === "any");
      const tiered = [...exact, ...anyTime];
      if (tiered.length >= limit) return tiered.slice(0, limit);
      // Backfill from remaining graduated (off-time-of-day) by useCount.
      const used = new Set(tiered.map((f) => f.id));
      const backfill = graduated.filter((f) => !used.has(f.id));
      return [...tiered, ...backfill].slice(0, limit);
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

      const key = makeKey(meal.name);
      if (!key) return { isNew: false, count: 0 };

      // OFF / AI sanity check — reject obvious zero-macro junk.
      // OFF returns the occasional product with all macros null and
      // calories 0; auto-adding those means the user re-taps the chip
      // and logs nothing. Cheap defense; the check only bites when
      // EVERY macro AND calorie is zero.
      const macroSum =
        safeNum(meal.calories) +
        safeNum(meal.protein) +
        safeNum(meal.carbs) +
        safeNum(meal.fat);
      if (macroSum === 0) {
        return { isNew: false, count: 0 };
      }

      const docRef = doc(db, "users", user.uid, "foodFavourites", key);
      const existing = favourites.find((f) => f.id === key);
      const previousCount = existing?.useCount ?? 0;
      const predictedCount = previousCount + 1;

      // Base payload — merges every write. useCount uses server-side
      // increment(1) so concurrent multi-device logs (offline queue
      // + watch + phone) don't lose increments to local-state races.
      type FavouritePayload = {
        name: string;
        calories: number;
        protein: number;
        carbs: number;
        fat: number;
        fiber: number | null;
        sugar: number | null;
        sodium: number | null;
        servingSize: string;
        lastUsed: Timestamp;
        useCount: ReturnType<typeof increment>;
        timeOfDay?: FoodFavourite["timeOfDay"];
        source?: FoodFavourite["source"];
      };
      const payload: FavouritePayload = {
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
        useCount: increment(1),
      };

      // Set timeOfDay + source ONLY on first write. merge:true would
      // otherwise overwrite both on every log: a "morning" oatmeal
      // logged once at dinner flips timeOfDay="evening" and vanishes
      // from morning Quick Add. Originating source is also more
      // analytically useful than last-write source.
      if (!existing) {
        payload.timeOfDay = getTimeOfDay(new Date().getHours());
        payload.source = meal.source || "manual";
      }

      // Favourites are a quick-log cache, not critical data. If the write
      // fails we log and return a benign result so callers (notably the
      // meal save flow in FoodAnalyzer) don't bubble a favourites error
      // into what the user sees as a meal-save failure.
      try {
        await setDoc(docRef, payload, { merge: true });
      } catch (err) {
        logger.error("[useFoodFavourites] addFavourite write failed", err);
        return { isNew: false, count: previousCount };
      }

      // Graduation event = useCount crossing the threshold. Predicted
      // locally; the snapshot will catch up. Used by callers that
      // want to celebrate the first-graduation moment (eg. PR 3
      // Coachmark — fires on `previous < 2 && next >= 2` so multi-
      // increment jumps from offline sync don't miss the trigger).
      return {
        isNew:
          previousCount < GRADUATION_THRESHOLD &&
          predictedCount >= GRADUATION_THRESHOLD,
        count: predictedCount,
      };
    },
    [user, favourites]
  );

  const removeFavourite = useCallback(
    async (id: string): Promise<boolean> => {
      if (!user) return false;
      try {
        await deleteDoc(doc(db, "users", user.uid, "foodFavourites", id));
        return true;
      } catch (err) {
        logger.error("[useFoodFavourites] removeFavourite failed", err);
        return false;
      }
    },
    [user]
  );

  /** Undo handler — restores a previously-removed favourite to its
   *  pre-delete shape. Used by the long-press → undo-toast flow so
   *  tapping Undo within the 5s window writes back the captured doc
   *  with `merge: false` (a full overwrite rather than the partial
   *  field-merge addFavourite uses), preserving the original
   *  useCount/lastUsed/timeOfDay/source intact. */
  const restoreFavourite = useCallback(
    async (favourite: FoodFavourite): Promise<boolean> => {
      if (!user) return false;
      try {
        await setDoc(
          doc(db, "users", user.uid, "foodFavourites", favourite.id),
          {
            name: favourite.name,
            calories: favourite.calories,
            protein: favourite.protein,
            carbs: favourite.carbs,
            fat: favourite.fat,
            fiber: favourite.fiber ?? null,
            sugar: favourite.sugar ?? null,
            sodium: favourite.sodium ?? null,
            servingSize: favourite.servingSize,
            lastUsed: favourite.lastUsed,
            useCount: favourite.useCount,
            timeOfDay: favourite.timeOfDay,
            source: favourite.source,
          },
          { merge: false },
        );
        return true;
      } catch (err) {
        logger.error("[useFoodFavourites] restoreFavourite failed", err);
        return false;
      }
    },
    [user]
  );

  return {
    favourites,
    loading,
    graduationToken,
    getTimeRelevant,
    addFavourite,
    removeFavourite,
    restoreFavourite,
  };
}
