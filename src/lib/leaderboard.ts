import {
  collection,
  doc,
  getDoc,
  getDocs,
  Timestamp,
} from "firebase/firestore";
import { db } from "./firebase";
import { localDateString, startOfLocalWeek } from "./dateHelpers";
import { fetchSavedWorkouts } from "./savedWorkouts";
import { liftUnitLabel, liftVolumeIn, type LiftUnit } from "./liftLoad";

export interface LeaderboardEntry {
  uid: string;
  name: string;
  value: number;
  rank: number;
}

/** What a board ranks. Sessions is the card's (Polish2 call 5: the one
 *  measure that compares a lifter with a runner); the full board adds
 *  distance and volume; workouts is the weekly challenge's lift count. */
export type ChallengeType =
  | "weekly_sessions"
  | "weekly_distance"
  | "weekly_volume"
  | "weekly_workouts";

/**
 * One name and one unit per leaderboard, for every surface that renders it.
 *
 * `LeaderboardCard` and `FullLeaderboard` each carried their own table and
 * had already drifted: `weekly_distance` was "Weekly Distance" on the card
 * and "Running Distance" in the full view, `weekly_volume` "Weekly Volume"
 * against "Lifting Volume". The units agreed, which is what let the names
 * diverge unnoticed — the figure looked right on both.
 *
 * The full view's wording won, for two reasons that are on the screen rather
 * than a preference: the card sport-codes its own icon (Footprints tinted
 * `running`, Dumbbell tinted `lifting`), so "Running"/"Lifting" matches what
 * is drawn beside the title and "Weekly" does not — and the card already
 * renders a persistent "This week" eyebrow next to that title, which made
 * "Weekly Distance · This week" say it twice.
 *
 * Casing is deliberately untouched. All of them are Title Case and internally
 * consistent, so the house rule that catches a Title Case stray among
 * sentence-case siblings does not apply here; whether this whole set should
 * move to sentence case is a separate question with one answer, not four.
 */
export const CHALLENGE_LABELS: Record<
  ChallengeType,
  { title: string; unit: string }
> = {
  weekly_sessions: { title: "Sessions", unit: "sessions" },
  weekly_volume: { title: "Lifting Volume", unit: "kg" },
  weekly_distance: { title: "Running Distance", unit: "km" },
  weekly_workouts: { title: "Workouts", unit: "sessions" },
};

/** A board's figure as the reader reads it. The volume board ranks stored
 *  kg; an lb reader sees lb (Lift18). The order is the same either way. */
export function boardFigure(
  challenge: ChallengeType,
  value: number,
  liftUnit: LiftUnit
): { value: number; unit: string } {
  if (challenge === "weekly_volume")
    return {
      value: Math.round(liftVolumeIn(value, liftUnit)),
      unit: liftUnitLabel(liftUnit),
    };
  const { unit } = CHALLENGE_LABELS[challenge];
  return { value, unit: unit === "sessions" && value === 1 ? "session" : unit };
}

/** One person's week as their followers' boards show it. */
export interface BoardWeek {
  uid: string;
  sessions: number;
  lifts: number;
  runs: number;
  distanceM: number;
  volumeKg: number;
}

const isPermissionDenied = (err: unknown) =>
  typeof err === "object" &&
  err !== null &&
  (err as { code?: string }).code === "permission-denied";

/**
 * This week for you and everyone you follow who shares theirs (Polish2
 * call 5). Each is one read of `friendsBoard/{uid}`, the tally the server
 * keeps from their sessions, because a person's sessions are theirs alone
 * to read: the board this replaced read them for everyone followed, was
 * refused for the first, and never loaded.
 *
 * Someone who does not share has no tally and is left out; someone who
 * blocked you, or a follow since removed, is refused and left out the
 * same way. A tally from a week already over (`weekEndsAt` passed where
 * they are) is a week with nothing in it yet.
 */
export async function loadBoardWeeks(
  currentUid: string,
  now: number = Date.now()
): Promise<BoardWeek[]> {
  const followingSnap = await getDocs(
    collection(db, "following", currentUid, "users")
  );
  const uids = [currentUid, ...followingSnap.docs.map((d) => d.id)];
  const weeks = await Promise.all(
    uids.map(async (uid): Promise<BoardWeek | null> => {
      let snap;
      try {
        snap = await getDoc(doc(db, "friendsBoard", uid));
      } catch (err) {
        if (isPermissionDenied(err)) return null;
        throw err;
      }
      if (!snap.exists()) return null;
      const data = snap.data();
      const ends =
        data.weekEndsAt instanceof Timestamp ? data.weekEndsAt.toMillis() : 0;
      const current = ends > now;
      const figure = (v: unknown) =>
        current && typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0;
      return {
        uid,
        sessions: figure(data.sessions),
        lifts: figure(data.lifts),
        runs: figure(data.runs),
        distanceM: figure(data.distanceM),
        volumeKg: figure(data.volumeKg),
      };
    })
  );
  return weeks.filter((w): w is BoardWeek => w !== null);
}

/** One board's order: distance in km to a tenth, volume in whole kg. */
export function rankBoard(
  weeks: BoardWeek[],
  challenge: ChallengeType
): LeaderboardEntry[] {
  const valueOf = (w: BoardWeek) =>
    challenge === "weekly_sessions"
      ? w.sessions
      : challenge === "weekly_workouts"
        ? w.lifts
        : challenge === "weekly_distance"
          ? Math.round(w.distanceM / 100) / 10
          : Math.round(w.volumeKg);
  return weeks
    .map((w) => ({ uid: w.uid, value: valueOf(w) }))
    .sort((a, b) => b.value - a.value)
    .map((e, i) => ({ uid: e.uid, name: "", value: e.value, rank: i + 1 }));
}

/** Your own lift sessions this week, for the weekly challenge's card,
 *  whether or not you share your week: your sessions are yours to read. */
export async function countMyWeekLifts(uid: string): Promise<number> {
  // The week's first day through the shared anchor, as a LOCAL day key:
  // `workout.date` is the local day a session started (Lift3).
  const since = localDateString(startOfLocalWeek(new Date()));
  const workouts = await fetchSavedWorkouts(uid, { since, cap: 50 });
  return workouts.length;
}
