import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  Timestamp,
} from "firebase/firestore";
import { db } from "./firebase";
import { isVolumeEligible } from "./runStatsEligibility";
import { localDateString } from "./dateHelpers";

export interface LeaderboardEntry {
  uid: string;
  name: string;
  value: number;
  rank: number;
}

export type ChallengeType =
  | "weekly_distance"
  | "weekly_volume"
  | "weekly_hybrid"
  | "weekly_workouts";

export async function buildLeaderboard(
  currentUid: string,
  challenge: ChallengeType
): Promise<LeaderboardEntry[]> {
  const followingSnap = await getDocs(
    collection(db, "following", currentUid, "users")
  );
  const uids = [currentUid, ...followingSnap.docs.map((d) => d.id)];

  const since = new Date();
  since.setDate(since.getDate() - since.getDay());
  since.setHours(0, 0, 0, 0);
  const sinceTs = Timestamp.fromDate(since);
  // `workout.date` is stored as a LOCAL "YYYY-MM-DD" string, so the cutoff
  // for the `where('date', '>=', ...)` query must be the LOCAL date of
  // `since` — not `since.toISOString()` (UTC). `since` is LOCAL Sunday
  // midnight; in positive-offset zones (e.g. UTC+9) that instant is still
  // the previous calendar day in UTC, so the UTC stringify rolls the cutoff
  // back to the previous Saturday and pulls in an extra day's workouts. The
  // runs query filters on `completedAt` (a Timestamp) so it correctly uses
  // `sinceTs` and is unaffected.
  const sinceDateStr = localDateString(since);

  const entries: { uid: string; value: number }[] = [];

  await Promise.all(
    uids.map(async (uid) => {
      let value = 0;

      if (challenge === "weekly_distance" || challenge === "weekly_hybrid") {
        const runsSnap = await getDocs(
          query(
            collection(db, "users", uid, "runs"),
            where("completedAt", ">=", sinceTs),
            orderBy("completedAt"),
            limit(50)
          )
        );
        const km = runsSnap.docs.reduce(
          (s, d) =>
            isVolumeEligible(d.data())
              ? s + (d.data().distance || 0) / 1000
              : s,
          0
        );
        if (challenge === "weekly_distance") value = Math.round(km * 10) / 10;
        else value += km * 100;
      }

      if (challenge === "weekly_volume" || challenge === "weekly_hybrid") {
        const workoutsSnap = await getDocs(
          query(
            collection(db, "users", uid, "workouts"),
            where("date", ">=", sinceDateStr),
            orderBy("date"),
            limit(50)
          )
        );
        const kg = workoutsSnap.docs.reduce((s, d) => {
          return (
            s +
            (d.data().exercises || []).reduce(
              (
                es: number,
                ex: { sets?: { weightKg?: number; reps?: number }[] }
              ) =>
                es +
                (ex.sets || []).reduce(
                  (ss: number, set: { weightKg?: number; reps?: number }) =>
                    ss + (set.weightKg || 0) * (set.reps || 0),
                  0
                ),
              0
            )
          );
        }, 0);
        if (challenge === "weekly_volume") value = Math.round(kg);
        else value += kg * 0.1;
      }

      if (challenge === "weekly_workouts") {
        const workoutsSnap = await getDocs(
          query(
            collection(db, "users", uid, "workouts"),
            where("date", ">=", sinceDateStr),
            orderBy("date"),
            limit(50)
          )
        );
        value = workoutsSnap.docs.length;
      }

      entries.push({ uid, value: Math.round(value * 10) / 10 });
    })
  );

  return entries
    .sort((a, b) => b.value - a.value)
    .map((e, i) => ({
      uid: e.uid,
      name: "",
      value: e.value,
      rank: i + 1,
    }));
}
