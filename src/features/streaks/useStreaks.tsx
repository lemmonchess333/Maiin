import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  createContext,
  use,
  type ReactNode,
} from "react";
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
import { isVolumeEligible } from "@/lib/runStatsEligibility";
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
  /* Persisted onto every run doc by the validity correction
     (PR #480). Carried here so the snapshot mapping can drop invalid
     and zero-distance records before they credit a streak day. */
  isInvalid?: boolean;
  distance?: number;
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
    logger.warn(
      "[Streaks] toIsoString: Date received (expected ISO string)",
      value
    );
    return value.toISOString();
  }
  if (typeof value === "number") {
    logger.warn(
      "[Streaks] toIsoString: number received (expected ISO string)",
      value
    );
    return new Date(value).toISOString();
  }
  if (value && typeof (value as { toDate?: unknown }).toDate === "function") {
    logger.warn(
      "[Streaks] toIsoString: Timestamp received (expected ISO string)",
      value
    );
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
  meals: MealRow[]
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

// ── Grace forgiveness (Streak1 — see .claude/plans/programme-run-followups.md)
//
// A single off-day inside an otherwise-consistent run does NOT break the
// streak. This is the calm forgiveness model the field has converged on
// (Apple watchOS-11 ring pause, MyFitnessPal backfill, habit-tracker
// "never miss twice") — deliberately NOT a Duolingo-style earned-token
// economy.
//
// Rule: walking back from the end anchor, a non-active day may be BRIDGED
// (counted toward the streak span) only if no grace was spent within the
// prior GRACE_MIN_SPACING_DAYS of the walk. That single spacing constraint
// enforces BOTH invariants at once:
//   • "never miss twice" — two consecutive misses are 1 day apart < spacing,
//     so the second is denied and the walk stops; and
//   • "≤1 forgiven day per rolling 7" — a second grace is only allowed once
//     7 calendar days separate it from the last one.
// Spacing is counted in calendar-day steps (not milliseconds) so DST
// transitions can't shift the boundary.
//
// A bridged day is held as PENDING until an older active day confirms it —
// so grace can't extend the streak into pre-history (a trailing/leading gap
// with no active day behind it is discarded, not counted).
const GRACE_MIN_SPACING_DAYS = 7;

/**
 * Today/yesterday rule — the streak does NOT drop to zero at midnight.
 * - If today is active: streak ends on today (live).
 * - Else if yesterday is active: streak ends on yesterday (at risk).
 * - Else: streak = 0 (broken).
 * Walks backwards from the ending date, incrementing while days are in the
 * set, bridging isolated non-active days per the grace rule above.
 *
 * `now` is injectable for deterministic tests; production callers omit it.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function computeCurrentStreak(
  activeDates: Set<string>,
  now: Date = new Date()
): number {
  return computeStreakSpan(activeDates, now).streak;
}

export interface StreakSpan {
  /** Streak length including any bridged grace days. */
  streak: number;
  /**
   * The non-active dates (YYYY-MM-DD) that grace bridged inside the current
   * span, newest-first. Empty when the streak is unbroken or zero. Used by
   * the UI to surface gentle after-the-fact reassurance ("yesterday's rest
   * day is covered") — never a pre-emptive warning.
   */
  bridgedDates: string[];
}

/**
 * Walk the streak once and return both the length and the grace days it
 * bridged. `computeCurrentStreak` is the thin number-only wrapper over this.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function computeStreakSpan(
  activeDates: Set<string>,
  now: Date = new Date()
): StreakSpan {
  if (activeDates.size === 0) return { streak: 0, bridgedDates: [] };

  const today = format(now, "yyyy-MM-dd");
  const yesterday = format(new Date(now.getTime() - 86400000), "yyyy-MM-dd");

  let endDate: Date;
  if (activeDates.has(today)) {
    endDate = new Date(today + "T12:00:00");
  } else if (activeDates.has(yesterday)) {
    endDate = new Date(yesterday + "T12:00:00");
  } else {
    return { streak: 0, bridgedDates: [] };
  }

  let streak = 0;
  // Grace days tentatively bridged, awaiting a confirming older active day.
  let pendingGrace = 0;
  // Calendar days walked since the last grace was spent (Infinity = none yet).
  let stepsSinceGrace = Infinity;
  // Confirmed + pending bridged dates (newest-first by walk order).
  const bridged: string[] = [];
  let pendingBridged: string[] = [];

  const cursor = new Date(endDate);
  while (true) {
    if (activeDates.has(format(cursor, "yyyy-MM-dd"))) {
      // An active day confirms any pending grace bridge before it.
      streak += pendingGrace + 1;
      pendingGrace = 0;
      if (pendingBridged.length > 0) {
        bridged.push(...pendingBridged);
        pendingBridged = [];
      }
    } else {
      // Non-active day — bridge it only if far enough from the last grace.
      if (stepsSinceGrace < GRACE_MIN_SPACING_DAYS) break;
      pendingGrace++;
      pendingBridged.push(format(cursor, "yyyy-MM-dd"));
      stepsSinceGrace = 0;
    }
    cursor.setDate(cursor.getDate() - 1);
    stepsSinceGrace++;
  }
  // Any unconfirmed pending grace (trailing gap into pre-history) is dropped.
  return { streak, bridgedDates: bridged };
}

/**
 * Check if the "balanced" badge criteria are met: 5 unique lift days AND
 * 5 unique run days in the rolling 14-day window ending today.
 */
function isBalancedEarned(workouts: WorkoutRow[], runs: RunRow[]): boolean {
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

// ── Internal hook (single instance — lives inside <StreaksProvider>) ────
//
// The hook itself is unchanged; only the export surface changed. Previously
// every caller (Home, BadgeGrid, useStreakReminder, ...) instantiated this
// directly, each spinning up 4 Firestore subscriptions. Now <StreaksProvider>
// runs it once near the authenticated root, and consumers read from context.

function useStreaksInternal() {
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
  // Badge ids with an award write currently in flight — prevents the
  // check effect from firing duplicate concurrent commits for the same
  // badge before the first resolves.
  const awardInFlightRef = useRef<Set<string>>(new Set());

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

    // Error callback applied to every subscription below: if any one fails,
    // flip its *Loaded flag true so `allLoaded` still resolves and the UI
    // doesn't hang in a skeleton state. State for the failed source stays
    // at its previous value (empty by default, stale if we already had data).
    const onSubscriptionError =
      (source: string, setLoadedFlag: (v: boolean) => void) =>
      (err: unknown) => {
        logger.error(`[useStreaks] ${source} subscription failed`, err);
        setLoadedFlag(true);
      };

    const streaksRef = doc(db, "users", user.uid, "streaks", "data");
    const unsubStreaks = onSnapshot(
      streaksRef,
      (snap) => {
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
          const sanitizedCurrent = Number.isFinite(data.currentStreak)
            ? data.currentStreak
            : 0;
          const sanitizedLongestRaw = Number.isFinite(data.longestStreak)
            ? data.longestStreak
            : 0;
          const sanitizedTotal = Number.isFinite(data.totalActiveDays)
            ? data.totalActiveDays
            : 0;
          // Badge-earned reconciliation: if a streak-threshold badge has an
          // earnedAt timestamp, the user reached at least that threshold
          // at some point — so longestStreak must be >= threshold. We saw
          // rows where Week Warrior (threshold 7) was earned but
          // longestStreak was 4, which meant the old NaN-write bug wiped
          // the longestStreak without clearing earnedAt. Patch it up on
          // read so the UI and the persist effect agree. Bronze/plate/run
          // badges with no threshold are ignored.
          const impliedFromBadges = merged.reduce((max, b) => {
            if (!b.earnedAt) return max;
            if (typeof b.threshold !== "number" || b.threshold <= 0) return max;
            return b.threshold > max ? b.threshold : max;
          }, 0);
          const sanitizedLongest = Math.max(
            sanitizedLongestRaw,
            impliedFromBadges
          );
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
      },
      onSubscriptionError("streaks", setStreaksDocLoaded)
    );

    const workoutsRef = collection(db, "users", user.uid, "workouts");
    const workoutsQ = query(
      workoutsRef,
      orderBy("date", "desc"),
      limit(WORKOUT_LIMIT)
    );
    const unsubWorkouts = onSnapshot(
      workoutsQ,
      (snap) => {
        const rows: WorkoutRow[] = snap.docs
          .map((d) => d.data() as { date?: unknown })
          .filter((d) => typeof d.date === "string")
          .map((d) => ({ date: d.date as string }));
        setWorkouts(rows);
        setWorkoutsLoaded(true);
      },
      onSubscriptionError("workouts", setWorkoutsLoaded)
    );

    const runsRef = collection(db, "users", user.uid, "runs");
    const runsQ = query(
      runsRef,
      orderBy("completedAt", "desc"),
      limit(RUN_LIMIT)
    );
    const unsubRuns = onSnapshot(
      runsQ,
      (snap) => {
        /* Drop invalid + zero-distance records at the snapshot
         boundary so neither computeActiveDateSet nor
         computeStreakDays needs to know the predicate. A
         saved-anyway 0:02 record shouldn't credit a streak day. */
        const rows: RunRow[] = snap.docs.flatMap((d) => {
          const raw = d.data() as {
            completedAt?: unknown;
            isInvalid?: boolean;
            distance?: number;
          };
          if (!isVolumeEligible(raw)) return [];
          const ts =
            raw.completedAt instanceof Timestamp ? raw.completedAt : null;
          return [
            {
              completedAt: ts,
              isInvalid: raw.isInvalid,
              distance: raw.distance,
            },
          ];
        });
        setRuns(rows);
        setRunsLoaded(true);
      },
      onSubscriptionError("runs", setRunsLoaded)
    );

    const mealsRef = collection(db, "users", user.uid, "meals");
    const mealsQ = query(
      mealsRef,
      orderBy("createdAt", "desc"),
      limit(MEAL_LIMIT)
    );
    const unsubMeals = onSnapshot(
      mealsQ,
      (snap) => {
        const rows: MealRow[] = snap.docs.map((d) => {
          const raw = d.data() as { date?: unknown; items?: unknown };
          return {
            date: typeof raw.date === "string" ? raw.date : "",
            items: Array.isArray(raw.items) ? raw.items : [],
          };
        });
        setMeals(rows);
        setMealsLoaded(true);
      },
      onSubscriptionError("meals", setMealsLoaded)
    );

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

  const { activeDateSet, currentStreak, totalActiveDays, bridgedDates } =
    useMemo(() => {
      if (!allLoaded) {
        return {
          activeDateSet: new Set<string>(),
          currentStreak: 0,
          totalActiveDays: 0,
          bridgedDates: [] as string[],
        };
      }
      const set = computeActiveDateSet(workouts, runs, meals);
      const span = computeStreakSpan(set);
      return {
        activeDateSet: set,
        currentStreak: span.streak,
        // Grace days never inflate the honest "days you showed up" count.
        totalActiveDays: set.size,
        bridgedDates: span.bridgedDates,
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

  // Gentle after-the-fact reassurance trigger (Streak1 visibility): true only
  // when the user is active TODAY *and* yesterday was a missed day that grace
  // bridged. One-day relevance window — the moment is "you took yesterday off
  // but you're still covered". Mutually exclusive with the at-risk nudge,
  // which only shows when nothing is logged today. Never pre-emptive.
  const forgivenYesterday = useMemo(() => {
    if (!allLoaded || !hasLoggedToday) return false;
    const yesterday = format(new Date(Date.now() - 86400000), "yyyy-MM-dd");
    return bridgedDates.includes(yesterday);
  }, [allLoaded, hasLoggedToday, bridgedDates]);

  // Merge streakData.badges with BADGE_DEFINITIONS order (streakData.badges
  // is already in definition order from the merge above, so this is a
  // no-op alias — but explicit is clearer for consumers like BadgeGrid).
  const allBadges = streakData.badges;

  // Stable signature over earnedAt values — lets us depend on badge state
  // changes without triggering re-runs on every snapshot reflow.
  const badgesSignature = useMemo(
    () => streakData.badges.map((b) => `${b.id}:${b.earnedAt ?? ""}`).join("|"),
    [streakData.badges]
  );

  // ── Badge award helper ─────────────────────────────────────────────────

  const awardBadge = useCallback(
    async (badgeId: string, silent: boolean) => {
      if (!user) return;

      // Read fresh state via a snapshot of the current badges array
      const badge = streakData.badges.find((b) => b.id === badgeId);
      if (!badge || badge.earnedAt) return;

      // Skip if a write for this badge is already in flight.
      if (awardInFlightRef.current.has(badgeId)) return;
      awardInFlightRef.current.add(badgeId);

      const now = new Date().toISOString();
      const updated: EarnedBadge = { ...badge, earnedAt: now };
      const updatedBadges = streakData.badges.map((b) =>
        b.id === badgeId ? updated : b
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
        // Badge awards are automatic background reconciliation, not a
        // user-initiated action — a transient write failure must not
        // surface a toast (this produced stacked "Failed to save badge"
        // errors). Log only; the next snapshot/state change retries.
        logger.error("[Streaks] Badge save failed:", error);
      } finally {
        awardInFlightRef.current.delete(badgeId);
      }
    },
    [user, streakData.badges]
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
  }, [
    allLoaded,
    currentStreak,
    workouts,
    runs,
    badgesSignature,
    streakData.badges,
    awardBadge,
  ]);

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
    if (
      lastWrittenStreakRef.current === null &&
      currentStreak === streakData.currentStreak
    ) {
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
        lastActiveDate: activeDateSet.has(today)
          ? today
          : streakData.lastActiveDate,
        totalActiveDays,
      },
      { merge: true }
    );
    batch.set(
      userRef,
      {
        currentStreak,
        longestStreak: nextLongest,
      },
      { merge: true }
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
      { merge: true }
    );

    batch
      .commit()
      .then(() => {
        lastWrittenStreakRef.current = currentStreak;
        // Cancel any pending streak-at-risk reminder. The user has just
        // logged something, so the reminder is stale by definition. The
        // useStreakReminder hook re-evaluates on the next foreground /
        // state change and reschedules if the new post-mutation state
        // still warrants a reminder (rare, but cheap to re-evaluate).
        // Intentionally swallow errors: cancel-of-nonexistent is harmless
        // and this must never block or fail the streak write. Logged at
        // warn (dev-only) in case the platform starts reporting real
        // failures we need to debug.
        void cancelNotification(STREAK_NOTIFICATION_ID).catch((err) => {
          logger.warn("[Streaks] cancel streak-at-risk reminder failed", err);
        });
      })
      .catch((error) => {
        logger.error("[Streaks] Save failed:", error);
      });
  }, [
    allLoaded,
    user,
    currentStreak,
    totalActiveDays,
    activeDateSet,
    streakData.currentStreak,
    streakData.longestStreak,
    streakData.lastActiveDate,
  ]);

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
    forgivenYesterday,
    loading: !allLoaded,
    earnedBadges,
    lockedBadges,
    allBadges,
    newBadge: newBadgeQueue[0] ?? null,
    dismissNewBadge,
  };
}

// ── Context provider ────────────────────────────────────────────────────
//
// Previously each consumer (Home, BadgeGrid, useStreakReminder, Settings via
// useStreakReminder, the priming modal, ...) called `useStreaks()` directly,
// each spawning its own 4 Firestore subscriptions (streaks/data + workouts +
// runs + meals). With 3+ concurrent consumers that's 12 live listeners per
// user per session. The provider runs the hook once near the authenticated
// root; consumers read from context.

type StreaksValue = ReturnType<typeof useStreaksInternal>;

const StreaksContext = createContext<StreaksValue | null>(null);

export function StreaksProvider({ children }: { children: ReactNode }) {
  const value = useStreaksInternal();
  return (
    <StreaksContext.Provider value={value}>{children}</StreaksContext.Provider>
  );
}

/**
 * Read the streaks state populated by the single <StreaksProvider> higher
 * up the tree. Throws if called outside the provider — that would mean
 * either (a) the provider hasn't been mounted yet (e.g. on auth / onboarding
 * screens — which is deliberate, we don't subscribe until the user is in),
 * or (b) someone regressed by rendering a streak-consuming component
 * outside the authenticated branch.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useStreaks(): StreaksValue {
  const ctx = use(StreaksContext);
  if (!ctx) {
    throw new Error(
      "useStreaks must be used inside <StreaksProvider> (authenticated routes only)"
    );
  }
  return ctx;
}
