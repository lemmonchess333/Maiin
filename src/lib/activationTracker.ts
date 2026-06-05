/**
 * Activation-funnel new-activity detector.
 *
 * The data hooks `useMeals` and `useWorkouts` are LIVE `onSnapshot`
 * subscriptions, mounted in several places at once, and meals/workouts are
 * created from many call sites (7 + 3 respectively). Rather than instrument
 * every write site — fragile and easy to miss/double-count — the hooks hand
 * each snapshot's doc ids here, and this fires the per-occurrence lifecycle
 * event once per newly-created doc. One observer per type captures every
 * creation path with zero edits to the write/calc paths.
 *
 * Keyed by `(type, uid)`:
 *   - The FIRST snapshot for a key is the BASELINE — its ids are recorded
 *     but nothing fires (they pre-date this session/subscription).
 *   - Afterwards, any id not seen before fires exactly once.
 *   - Module-scope state means concurrent subscriptions for the same user
 *     dedupe to a single fire, and an account switch re-baselines under the
 *     new uid (no false "activity" events for the new user's history).
 *
 * Runs use a one-shot `getDocs` query (not a live snapshot), so they're
 * instrumented at their single creation call site instead (RunSummary) —
 * not here.
 *
 * Never throws on the caller: `track()` → `emit()` is already non-blocking
 * and self-guarding, so a flaky analytics path can't disrupt a snapshot
 * handler.
 */
import { track } from "./lifecycleAnalytics";

export type ActivityType = "food" | "workout";

const EVENT = {
  food: "food_logged",
  workout: "workout_completed",
} as const;

/** key `${type}:${uid}` → set of doc ids already accounted for. */
const seenByKey = new Map<string, Set<string>>();

/**
 * Record the doc ids from the latest snapshot and fire the activity event
 * once per never-before-seen id. The first call for a `(type, uid)` is the
 * baseline (records ids, fires nothing). Returns the ids that fired — for
 * tests; callers ignore it.
 */
export function noteActivitySnapshot(
  type: ActivityType,
  uid: string,
  ids: string[]
): string[] {
  if (!uid) return [];
  const key = `${type}:${uid}`;
  const existing = seenByKey.get(key);
  const isBaseline = existing === undefined;
  const set = existing ?? new Set<string>();
  if (isBaseline) seenByKey.set(key, set);

  const fired: string[] = [];
  for (const id of ids) {
    if (set.has(id)) continue;
    set.add(id);
    if (!isBaseline) {
      track(EVENT[type]);
      fired.push(id);
    }
  }
  return fired;
}

/** Test-only — clears module state between cases. */
export function __resetActivationTracker(): void {
  seenByKey.clear();
}
