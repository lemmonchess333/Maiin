import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  writeBatch,
  limit,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { BADGE_DEFINITIONS, initBadges, type EarnedBadge } from "./badges";
import { format } from "date-fns";
import { logger } from "@/lib/logger";
import { cancelNotification } from "@/lib/notifications";
import { STREAK_NOTIFICATION_ID } from "@/hooks/useStreakReminder";

export interface StreakData {
  currentStreak: number;
  longestStreak: number;
  lastActiveDate: string;
  totalActiveDays: number;
  badges: EarnedBadge[];
}

const DEFAULT_STREAKS: StreakData = {
  currentStreak: 0,
  longestStreak: 0,
  lastActiveDate: "",
  totalActiveDays: 0,
  badges: initBadges(),
};

// ── Subscription window sizes ────────────────────────────────────────────
// 400-day workout/run window and 500-doc meal window assume no user has a
// real active-day streak longer than ~380 days. A user with 1000+ historical
// docs only has their most recent N read — enough to compute any realistic
// streak with headroom for the 365-day badge. totalActiveDays is therefore
// windowed, not truly lifetime. Acceptable for launch.
const WORKOUT_LIMIT = 400;
const RUN_LIMIT = 400;
const MEAL_LIMIT = 500;

// ── Timezone notes ───────────────────────────────────────────────────────
// All date math uses date-fns format() which respects the device timezone.
// DST: wall-clock dates don't change on DST boundaries, so date-fns handles
// it automatically. Timezone travel: crossing timezones can shift date
// boundaries by 1 day. Out of scope for v1 — the alternative (storing a
// per-user canonical timezone) adds complexity without clear value.

// ── Row shapes (minimal — only what the streak hook needs) ──────────────
interface WorkoutRow {
  date: string;
}

interface RunRow {
  completedAt: Timestamp | null;
}

interface MealRow {
  date: string;
  items: unknown[];
}

// ── Pure helpers ─────────────────────────────────────────────────────────

/**
 * Coerce a value to an ISO 8601 string for badgeSummary mirror writes.
 *
 * Defensive across multiple shapes even though the current EarnedBadge.earnedAt
 * is typed and written as `string | null` — an older or future write path
 * could produce a Date / Timestamp / epoch number. Any path beyond `string`
 * indicates schema drift; log on hit so we notice.
 */
function toIsoString(value: unknown): string {
  if (typeof value === "string") return value;
  if (value instanceof Date) {
    logger.warn("[Streaks] toIsoString: Date received (expected ISO string)", value);
    return value.toISOString();
  }
  if (typeof value === "number") {
    logger.warn("[Streaks] toIsoString: number received (expected ISO string)", value);
    return new Date(value).toISOString();
  }
  if (value && typeof (value as { toDate?: unknown }).toDate === "function") {
    logger.warn("[Streaks] toIsoString: Timestamp received (expected ISO string)", value);
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  logger.warn("[Streaks] toIsoString: unexpected value", value);
  return new Date().toISOString();
}

/**
 * Build the set of active dates (YYYY-MM-DD) from workouts, runs, and meals.
 * A date counts as active if ANY of the three sources contributes it.
 * Meals must have at least one item to count (guards against draft/empty docs).
 */
function computeActiveDateSet(
  workouts: WorkoutRow[],
  runs: RunRow[],
  meals: MealRow[],
): Set<string> {
  const set = new Set<string>();

  for (const w of workouts) {
    if (typeof w.date === "string" && w.date) set.add(w.date);
  }

  for (const r of runs) {
    if (!r.completedAt) continue;
    try {
      const d = r.completedAt.toDate();
      set.add(format(d, "yyyy-MM-dd"));
    } catch {
      // Skip rows with invalid timestamps
    }
  }

  for (const m of meals) {
    if (typeof m.date !== "string" || !m.date) continue;
    if (!Array.isArray(m.items) || m.items.length === 0) continue;
    set.add(m.date);
  }

  return set;
}

/**
 * Today/yesterday rule — the streak does NOT drop to zero at midnight.
 * - If today is active: streak ends on today (live).
 * - Else if yesterday is active: streak ends on yesterday (at risk).
 * - Else: streak = 0 (broken).
 * Walks backwards from the ending date, incrementing while consecutive days
 * are in the set.
 */
function computeCurrentStreak(activeDates: Set<string>): number {
  if (activeDates.size === 0) return 0;

  const today = format(new Date(), "yyyy-MM-dd");
  const yesterday = format(new Date(Date.now() - 86400000), "yyyy-MM-dd");

  let endDate: Date;
  if (activeDates.has(today)) {
    endDate = new Date(today + "T12:00:00");
  } else if (activeDates.has(yesterday)) {
    endDate = new Date(yesterday + "T12:00:00");
  } else {
    return 0;
  }

  let streak = 0;
  const cursor = new Date(endDate);
  while (activeDates.has(format(cursor, "yyyy-MM-dd"))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

/**
 * Check if the "balanced" badge criteria are met: 5 unique lift days AND
 * 5 unique run days in the rolling 14-day window ending today.
 */
function isBalancedEarned(
  workouts: WorkoutRow[],
  runs: RunRow[],
): boolean {
  const today = new Date();
  const windowStart = new Date(today);
  windowStart.setDate(windowStart.getDate() - 13); // 14 days inclusive
  const startKey = format(windowStart, "yyyy-MM-dd");
  const endKey = format(today, "yyyy-MM-dd");
  const inWindow = (d: string) => d >= startKey && d <= endKey;

  const liftDays = new Set<string>();
  for (const w of workouts) {
    if (typeof w.date === "string" && inWindow(w.date)) liftDays.add(w.date);
  }

  const runDays = new Set<string>();
  for (const r of runs) {
    if (!r.completedAt) continue;
    try {
      const d = format(r.completedAt.toDate(), "yyyy-MM-dd");
      if (inWindow(d)) runDays.add(d);
    } catch {
      // skip
    }
  }

  return liftDays.size >= 5 && runDays.size >= 5;
}

// ── Hook ─────────────────────────────────────────────────────────────────

export function useStreaks() {
  const { user } = useAuth();

  // Streaks doc state (persisted badges + longest streak)
  const [streakData, setStreakData] = useState<StreakData>(DEFAULT_STREAKS);

  // Source streams
  const [workouts, setWorkouts] = useState<WorkoutRow[]>([]);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [meals, setMeals] = useState<MealRow[]>([]);

  // Loading gates — 4 independent flags. We wait for all 4 to flip before
  // computing or persisting anything, so silent backfill can't double-award
  // badges that already have an earnedAt set in Firestore.
  const [streaksDocLoaded, setStreaksDocLoaded] = useState(false);
  const [workoutsLoaded, setWorkoutsLoaded] = useState(false);
  const [runsLoaded, setRunsLoaded] = useState(false);
  const [mealsLoaded, setMealsLoaded] = useState(false);

  // New-badge queue — multiple badges awarded in one pass show one at a time.
  const [newBadgeQueue, setNewBadgeQueue] = useState<EarnedBadge[]>([]);

  // Refs — track state across renders without triggering re-runs
  const lastWrittenStreakRef = useRef<number | null>(null);
  const hasLoadedRef = useRef(false);

  // ── Subscribe to all 4 streams ─────────────────────────────────────────

  useEffect(() => {
    if (!user) {
      // Reset state on sign-out. This branch is cleanup-only — there's no
      // external system to sync to when the user is gone.
      /* eslint-disable react-hooks/set-state-in-effect */
      setStreakData(DEFAULT_STREAKS);
      setWorkouts([]);
      setRuns([]);
      setMeals([]);
      setStreaksDocLoaded(false);
      setWorkoutsLoaded(false);
      setRunsLoaded(false);
      setMealsLoaded(false);
      setNewBadgeQueue([]);
      /* eslint-enable react-hooks/set-state-in-effect */
      lastWrittenStreakRef.current = null;
      hasLoadedRef.current = false;
      return;
    }

    const streaksRef = doc(db, "users", user.uid, "streaks", "data");
    const unsubStreaks = onSnapshot(streaksRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data() as StreakData;
        // Merge badge definitions with saved earned dates — this auto-backfills
        // new badges as earnedAt: null for existing users. No migration needed.
        const savedBadges = data.badges || [];
        const merged = BADGE_DEFINITIONS.map((def) => {
          const saved = savedBadges.find((b: EarnedBadge) => b.id === def.id);
          return { ...def, earnedAt: saved?.earnedAt || null };
        });
        // Spread DEFAULT_STREAKS first so legacy docs that pre-date a field
        // (e.g. longestStreak / totalActiveDays) don't propagate `undefined`
        // into state — that previously caused `Math.max(n, undefined) === NaN`
        // downstream at line 329 and surfaced as "NaN" on the Longest Streak
        // stat card in BadgeGrid. The persist effect will naturally rewrite
        // the doc with the full field set on the next streak mutation.
        //
        // Sanitize the two numeric streak fields on read: an earlier buggy
        // persist (pre-spread-default) could have written `NaN` into
        // streaks/data.longestStreak. `NaN` is a present value, so the
        // spread-default above does NOT replace it. Coerce any non-finite
        // value to 0 here so Math.max(currentStreak, 0) can't produce NaN.
        const sanitizedCurrent = Number.isFinite(data.currentStreak) ? data.currentStreak : 0;
        const sanitizedLongest = Number.isFinite(data.longestStreak) ? data.longestStreak : 0;
        const sanitizedTotal = Number.isFinite(data.totalActiveDays) ? data.totalActiveDays : 0;
        setStreakData({
          ...DEFAULT_STREAKS,
          ...data,
          currentStreak: sanitizedCurrent,
          longestStreak: sanitizedLongest,
          totalActiveDays: sanitizedTotal,
          badges: merged,
        });
      } else {
        setStreakData(DEFAULT_STREAKS);
      }
      setStreaksDocLoaded(true);
    });

    const workoutsRef = collection(db, "users", user.uid, "workouts");
    const workoutsQ = query(workoutsRef, orderBy("date", "desc"), limit(WORKOUT_LIMIT));
    const unsubWorkouts = onSnapshot(workoutsQ, (snap) => {
      const rows: WorkoutRow[] = snap.docs
        .map((d) => d.data() as { date?: unknown })
        .filter((d) => typeof d.date === "string")
        .map((d) => ({ date: d.date as string }));
      setWorkouts(rows);
      setWorkoutsLoaded(true);
    });

    const runsRef = collection(db, "users", user.uid, "runs");
    const runsQ = query(runsRef, orderBy("completedAt", "desc"), limit(RUN_LIMIT));
    const unsubRuns = onSnapshot(runsQ, (snap) => {
      const rows: RunRow[] = snap.docs.map((d) => {
        const raw = d.data() as { completedAt?: unknown };
        const ts = raw.completedAt instanceof Timestamp ? raw.completedAt : null;
        return { completedAt: ts };
      });
      setRuns(rows);
      setRunsLoaded(true);
    });

    const mealsRef = collection(db, "users", user.uid, "meals");
    const mealsQ = query(mealsRef, orderBy("createdAt", "desc"), limit(MEAL_LIMIT));
    const unsubMeals = onSnapshot(mealsQ, (snap) => {
      const rows: MealRow[] = snap.docs.map((d) => {
        const raw = d.data() as { date?: unknown; items?: unknown };
        return {
          date: typeof raw.date === "string" ? raw.date : "",
          items: Array.isArray(raw.items) ? raw.items : [],
        };
      });
      setMeals(rows);
      setMealsLoaded(true);
    });

    return () => {
      unsubStreaks();
      unsubWorkouts();
      unsubRuns();
      unsubMeals();
    };
  }, [user]);

  const allLoaded =
    streaksDocLoaded && workoutsLoaded && runsLoaded && mealsLoaded;

  // ── Derived state ──────────────────────────────────────────────────────

  const { activeDateSet, currentStreak, totalActiveDays } = useMemo(() => {
    if (!allLoaded) {
      return {
        activeDateSet: new Set<string>(),
        currentStreak: 0,
        totalActiveDays: 0,
      };
    }
    const set = computeActiveDateSet(workouts, runs, meals);
    return {
      activeDateSet: set,
      currentStreak: computeCurrentStreak(set),
      totalActiveDays: set.size,
    };
  }, [allLoaded, workouts, runs, meals]);

  const longestStreak = Math.max(currentStreak, streakData.longestStreak);

  // True if the user has any logged activity (workout / run / meal with items)
  // for today's date in the device-local timezone. Shared with useStreakReminder
  // so its "hasLoggedToday" gate stays consistent with the streak computation
  // itself — both read from the same activeDateSet + same date key.
  const hasLoggedToday = useMemo(() => {
    if (!allLoaded) return false;
    return activeDateSet.has(format(new Date(), "yyyy-MM-dd"));
  }, [allLoaded, activeDateSet]);

  // Merge streakData.badges with BADGE_DEFINITIONS order (streakData.badges
  // is already in definition order from the merge above, so this is a
  // no-op alias — but explicit is clearer for consumers like BadgeGrid).
  const allBadges = streakData.badges;

  // Stable signature over earnedAt values — lets us depend on badge state
  // changes without triggering re-runs on every snapshot reflow.
  const badgesSignature = useMemo(
    () => streakData.badges.map((b) => `${b.id}:${b.earnedAt ?? ""}`).join("|"),
    [streakData.badges],
  );

  // ── Badge award helper ─────────────────────────────────────────────────

  const awardBadge = useCallback(
    async (badgeId: string, silent: boolean) => {
      if (!user) return;

      // Read fresh state via a snapshot of the current badges array
      const badge = streakData.badges.find((b) => b.id === badgeId);
      if (!badge || badge.earnedAt) return;

      const now = new Date().toISOString();
      const updated: EarnedBadge = { ...badge, earnedAt: now };
      const updatedBadges = streakData.badges.map((b) =>
        b.id === badgeId ? updated : b,
      );

      // Compute a compact, cross-user-readable badge summary for the public
      // profile mirror. Full EarnedBadge[] stays on streaks/data (owner-only);
      // only ids + earnedAt timestamps flow through the public doc.
      const earnedMap: Record<string, string> = {};
      for (const b of updatedBadges) {
        if (!b.earnedAt) continue;
        earnedMap[b.id] = toIsoString(b.earnedAt);
      }
      const badgeSummary = {
        earnedMap,
        count: Object.keys(earnedMap).length,
      };

      const streaksRef = doc(db, "users", user.uid, "streaks", "data");
      const publicProfileRef = doc(db, "users", user.uid, "public", "profile");
      try {
        const batch = writeBatch(db);
        batch.set(streaksRef, { badges: updatedBadges }, { merge: true });
        // Mirror only the summary onto the public profile doc. The
        // users/{uid}/public/{doc} rule accepts subsets via hasOnly, so a
        // partial merge with just badgeSummary is valid.
        batch.set(publicProfileRef, { badgeSummary }, { merge: true });
        await batch.commit();
        if (!silent) {
          setNewBadgeQueue((q) => [...q, updated]);
        }
      } catch (error) {
        logger.error("[Streaks] Badge save failed:", error);
        if (!silent) toast.error("Failed to save badge");
      }
    },
    [user, streakData.badges],
  );

  // ── Badge check logic — runs after every snapshot change once loaded ─

  useEffect(() => {
    if (!allLoaded) return;

    const silent = !hasLoadedRef.current;

    // Streak-based badges (consistency category with threshold set)
    const checkStreakBadges = async () => {
      for (const b of streakData.badges) {
        if (typeof b.threshold !== "number" || b.threshold <= 0) continue;
        if (b.earnedAt) continue;
        if (currentStreak >= b.threshold) {
          await awardBadge(b.id, silent);
        }
      }
    };

    // Rolling-window balanced badge
    const checkBalancedBadge = async () => {
      const balanced = streakData.badges.find((b) => b.id === "balanced");
      if (!balanced || balanced.earnedAt) return;
      if (isBalancedEarned(workouts, runs)) {
        await awardBadge("balanced", silent);
      }
    };

    void checkStreakBadges();
    void checkBalancedBadge();

    // Flip to loud mode after the first pass completes.
    if (!hasLoadedRef.current) {
      hasLoadedRef.current = true;
    }
    // badgesSignature is included so we re-evaluate after an earned badge
    // lands in the snapshot — this lets multi-threshold crossings award in
    // sequence without infinite loops (already-earned badges short-circuit).
  }, [allLoaded, currentStreak, workouts, runs, badgesSignature, streakData.badges, awardBadge]);

  // ── Persist streak changes (loop-guarded, atomic mirror) ──────────────
  //
  // Atomic batch writes three docs in one commit:
  //   1. users/{uid}/streaks/data           — full detail (source of truth;
  //                                           owner-only).
  //   2. users/{uid}                        — mirrored currentStreak +
  //                                           longestStreak on the main
  //                                           user doc (owner-only read for
  //                                           now; kept for Home's existing
  //                                           hydration path).
  //   3. users/{uid}/public/profile         — cross-user-readable projection
  //                                           (see match rule in
  //                                           firestore.rules). Only the
  //                                           allowlisted fields land here.
  //
  // Mirror-write contract: streaks/data carries the full state (badges,
  // lastActiveDate, totalActiveDays); users/{uid} + public/profile carry
  // only the two summary numbers we denormalise for cross-surface reads.

  useEffect(() => {
    if (!allLoaded || !user) return;
    if (currentStreak === lastWrittenStreakRef.current) return;
    // Skip initial write if Firestore already has the right value (avoids
    // a pointless write on every fresh mount).
    if (lastWrittenStreakRef.current === null && currentStreak === streakData.currentStreak) {
      lastWrittenStreakRef.current = currentStreak;
      return;
    }

    const streaksRef = doc(db, "users", user.uid, "streaks", "data");
    const userRef = doc(db, "users", user.uid);
    const publicProfileRef = doc(db, "users", user.uid, "public", "profile");
    const today = format(new Date(), "yyyy-MM-dd");
    const nextLongest = Math.max(currentStreak, streakData.longestStreak);

    const batch = writeBatch(db);
    batch.set(
      streaksRef,
      {
        currentStreak,
        longestStreak: nextLongest,
        lastActiveDate: activeDateSet.has(today) ? today : streakData.lastActiveDate,
        totalActiveDays,
      },
      { merge: true },
    );
    batch.set(
      userRef,
      {
        currentStreak,
        longestStreak: nextLongest,
      },
      { merge: true },
    );
    // Mirror onto the cross-user-readable public profile doc.
    // Readable by any authenticated user per firestore.rules match /users/{uid}/public/{doc}.
    batch.set(
      publicProfileRef,
      {
        uid: user.uid,
        currentStreak,
        longestStreak: nextLongest,
      },
      { merge: true },
    );

    batch.commit()
      .then(() => {
        lastWrittenStreakRef.current = currentStreak;
        // Cancel any pending streak-at-risk reminder. The user has just
        // logged something, so the reminder is stale by definition. The
        // useStreakReminder hook re-evaluates on the next foreground /
        // state change and reschedules if the new post-mutation state
        // still warrants a reminder (rare, but cheap to re-evaluate).
        // Errors are swallowed — cancel-of-nonexistent is harmless and
        // this must never block or fail the streak write.
        void cancelNotification(STREAK_NOTIFICATION_ID).catch(() => {});
      })
      .catch((error) => {
        logger.error("[Streaks] Save failed:", error);
      });
  }, [allLoaded, user, currentStreak, totalActiveDays, activeDateSet, streakData.currentStreak, streakData.longestStreak, streakData.lastActiveDate]);

  // ── Public API ─────────────────────────────────────────────────────────

  const dismissNewBadge = useCallback(() => {
    setNewBadgeQueue((q) => q.slice(1));
  }, []);

  const earnedBadges = streakData.badges.filter((b) => b.earnedAt);
  const lockedBadges = streakData.badges.filter((b) => !b.earnedAt);

  return {
    currentStreak,
    longestStreak,
    totalActiveDays,
    hasLoggedToday,
    loading: !allLoaded,
    earnedBadges,
    lockedBadges,
    allBadges,
    newBadge: newBadgeQueue[0] ?? null,
    dismissNewBadge,
  };
}

// TODO: hoist this hook to a context provider. Currently Home and Food each
// create their own 4 subscriptions (8 total). A shared provider at the auth
// boundary would halve Firestore reads.
