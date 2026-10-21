/**
 * The one deeper read that seeds early_bird's days on a streak document
 * that predates them (`earlyLogDays.ts`): each source's newest documents,
 * up to the caps the streak reads within. Loaded on demand, since it runs
 * once per account and the streak's own chunk is on the cold start.
 */
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { fetchSavedRuns } from "@/lib/savedRuns";
import { fetchSavedWorkouts } from "@/lib/savedWorkouts";
import { isVolumeEligible } from "@/lib/runStatsEligibility";
import { activeMealDocs } from "@/lib/mealTotals";
import { earlyDaysOf } from "./earlyLogDays";

export interface SeedCaps {
  meals: number;
  workouts: number;
  runs: number;
}

/** The early days among the newest documents of each source. */
export async function readSeedEarlyDays(
  uid: string,
  caps: SeedCaps
): Promise<string[]> {
  const [mealSnap, workouts, runs] = await Promise.all([
    getDocs(
      query(
        collection(db, "users", uid, "meals"),
        orderBy("createdAt", "desc"),
        limit(caps.meals)
      )
    ),
    fetchSavedWorkouts(uid, { latest: caps.workouts }),
    fetchSavedRuns(uid, { latest: caps.runs }),
  ]);
  const mealTimes = activeMealDocs(
    mealSnap.docs.map(
      (d) => d.data() as { createdAt?: unknown; deletedAt?: unknown }
    )
  ).map((m) => (m.createdAt instanceof Timestamp ? m.createdAt : null));
  return earlyDaysOf([
    ...workouts.map((w) =>
      w.createdAt instanceof Timestamp ? w.createdAt : null
    ),
    ...runs.filter(isVolumeEligible).map((r) => r.completedAt),
    ...mealTimes,
  ]);
}
