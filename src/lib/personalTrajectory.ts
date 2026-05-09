/**
 * Personal trajectory — week-over-week hybrid score for a single user.
 *
 * The hybrid score is the same formula as the weekly_hybrid
 * leaderboard challenge: `km * 100 + kg * 0.1`. We compute it for
 * both the current week (Sunday 00:00 local → now) and the prior
 * week (Sunday 00:00 → Saturday 23:59:59) so the Social "leaderboard
 * slot" can show a week-over-week trajectory when the user doesn't
 * have enough friends for a meaningful leaderboard.
 *
 * This is the solo-user alternative to LeaderboardCard. Design
 * rationale (from the council review): when you're the only athlete
 * in the leaderboard, showing it to yourself reads as "the app is
 * empty". Reframing the same slot as personal progression surfaces
 * the app's USP (adaptive-fitness over time) and turns the blank
 * space into a useful motivational signal.
 */

import { collection, getDocs, query, where, orderBy, limit, Timestamp } from 'firebase/firestore';
import { db } from './firebase';
import { isCountableRun } from './runGuards';

export interface TrajectoryBreakdown {
  km: number;
  kg: number;
  score: number;
}

export interface PersonalTrajectory {
  thisWeek: TrajectoryBreakdown;
  lastWeek: TrajectoryBreakdown;
  /**
   * Last week's running total at the same elapsed point in the week —
   * i.e. summed from `lastWeekStart` to `lastWeekStart + (now -
   * thisWeekStart)`. Used as the *fair* baseline for the week-over-week
   * delta: comparing a Tuesday cumulative against a full prior week's
   * total guarantees a misleading negative percentage.
   *
   * `lastWeek.score` is still kept around for the "Last week 287 pts"
   * informational baseline row — it's the right number for that row,
   * just not for the delta.
   */
  lastWeekToDate: TrajectoryBreakdown;
  /**
   * Percent change from `lastWeekToDate.score` to `thisWeek.score`.
   * Positive = improvement, negative = regression. `null` when last
   * week's same-day-of-week running total is zero (division-by-zero —
   * caller should show an absolute delta or "new baseline" copy).
   */
  deltaPct: number | null;
}

function startOfWeek(d: Date): Date {
  const r = new Date(d);
  r.setDate(r.getDate() - r.getDay());
  r.setHours(0, 0, 0, 0);
  return r;
}

function addDays(d: Date, days: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + days);
  return r;
}

function toDateKey(d: Date): string {
  // Firestore workouts are keyed by local yyyy-MM-dd string — match
  // that format here so the `where('date', '>=', ...)` clause lines up.
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function computeRangeBreakdown(
  uid: string,
  fromDate: Date,
  toDate: Date,
): Promise<TrajectoryBreakdown> {
  const fromTs = Timestamp.fromDate(fromDate);
  const toTs = Timestamp.fromDate(toDate);
  const fromKey = toDateKey(fromDate);
  const toKey = toDateKey(toDate);

  const [runsSnap, workoutsSnap] = await Promise.all([
    getDocs(query(
      collection(db, 'users', uid, 'runs'),
      where('completedAt', '>=', fromTs),
      where('completedAt', '<', toTs),
      orderBy('completedAt'),
      limit(100),
    )),
    getDocs(query(
      collection(db, 'users', uid, 'workouts'),
      where('date', '>=', fromKey),
      where('date', '<', toKey),
      orderBy('date'),
      limit(100),
    )),
  ]);

  const km = runsSnap.docs.reduce(
    (s, d) => isCountableRun(d.data()) ? s + (Number(d.data().distance) || 0) / 1000 : s,
    0,
  );
  const kg = workoutsSnap.docs.reduce((s, d) => {
    const exs = (d.data().exercises || []) as { sets?: { weightKg?: number; reps?: number }[] }[];
    return s + exs.reduce((es, ex) => (
      es + (ex.sets ?? []).reduce((ss, set) => (
        ss + (Number(set.weightKg) || 0) * (Number(set.reps) || 0)
      ), 0)
    ), 0);
  }, 0);

  const score = km * 100 + kg * 0.1;
  return {
    km: Math.round(km * 10) / 10,
    kg: Math.round(kg),
    score: Math.round(score),
  };
}

export async function getPersonalTrajectory(uid: string): Promise<PersonalTrajectory> {
  const now = new Date();
  const thisWeekStart = startOfWeek(now);
  const nextWeekStart = addDays(thisWeekStart, 7);
  const lastWeekStart = addDays(thisWeekStart, -7);
  /* Same-elapsed-time-into-the-week marker for last week. If today is
     Tuesday 14:00, this is last Tuesday 14:00. The delta then compares
     "cumulative this week so far" against "cumulative last week at the
     same point" — a fair like-for-like rather than the previous
     "Tuesday vs full week" apples-to-oranges comparison. */
  const elapsedMs = now.getTime() - thisWeekStart.getTime();
  const lastWeekToDateEnd = new Date(lastWeekStart.getTime() + elapsedMs);

  const [thisWeek, lastWeek, lastWeekToDate] = await Promise.all([
    computeRangeBreakdown(uid, thisWeekStart, nextWeekStart),
    computeRangeBreakdown(uid, lastWeekStart, thisWeekStart),
    computeRangeBreakdown(uid, lastWeekStart, lastWeekToDateEnd),
  ]);

  const deltaPct = lastWeekToDate.score > 0
    ? Math.round(((thisWeek.score - lastWeekToDate.score) / lastWeekToDate.score) * 100)
    : null;

  return { thisWeek, lastWeek, lastWeekToDate, deltaPct };
}
