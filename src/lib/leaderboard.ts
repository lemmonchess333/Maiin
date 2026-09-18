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
import { localDateString, startOfLocalWeek } from "./dateHelpers";

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

/**
 * One name and one unit per leaderboard, for every surface that renders it.
 *
 * `LeaderboardCard` and `FullLeaderboard` each carried their own table and
 * had already drifted: `weekly_distance` was "Weekly Distance" on the card
 * and "Running Distance" in the full view, `weekly_volume` "Weekly Volume"
 * against "Lifting Volume". The units agreed, which is what let the names
 * diverge unnoticed — the figure looked right on both.
 *
 * It was LATENT rather than live: the only production call site passes
 * `weekly_hybrid` (FeedView) and the full view defaults to the same, so a
 * user could only ever reach the two rows that happened to agree. The card's
 * other three entries sit behind a real `challenge` prop, so the day anyone
 * uses it the two surfaces disagree about what the user is looking at.
 *
 * The full view's wording won, for two reasons that are on the screen rather
 * than a preference: the card sport-codes its own icon (Footprints tinted
 * `running`, Dumbbell tinted `lifting`), so "Running"/"Lifting" matches what
 * is drawn beside the title and "Weekly" does not — and the card already
 * renders a persistent "This week" eyebrow next to that title, which made
 * "Weekly Distance · This week" say it twice.
 *
 * Casing is deliberately untouched. All four are Title Case and internally
 * consistent, so the house rule that catches a Title Case stray among
 * sentence-case siblings does not apply here; whether this whole set should
 * move to sentence case is a separate question with one answer, not four.
 */
export const CHALLENGE_LABELS: Record<
  ChallengeType,
  { title: string; unit: string }
> = {
  weekly_hybrid: { title: "Hybrid Score", unit: "pts" },
  weekly_volume: { title: "Lifting Volume", unit: "kg" },
  weekly_distance: { title: "Running Distance", unit: "km" },
  weekly_workouts: { title: "Workouts", unit: "sessions" },
};

export async function buildLeaderboard(
  currentUid: string,
  challenge: ChallengeType
): Promise<LeaderboardEntry[]> {
  const followingSnap = await getDocs(
    collection(db, "following", currentUid, "users")
  );
  const uids = [currentUid, ...followingSnap.docs.map((d) => d.id)];

  // Week start through the shared anchor — this read the week boundary by
  // hand, so it agreed with the rest of the app only by repetition.
  const since = startOfLocalWeek(new Date());
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
