/**
 * Would a Weekly Review render for a week (Rev1 Q6)? A logged workout,
 * run or meal in it, or, for the quiet-week variant, any before it.
 * Brand-new accounts get silence until their first week with something
 * in it.
 *
 * Its own small module, with no reads beyond the probes, so the reminders
 * chunk (the Monday notification asks it) does not carry the review's
 * view-model. `useWeeklyReview` re-exports what Home and the page use.
 */
import { collection, getDocs, limit, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  addLocalDays,
  localDateString,
  localWeekKey,
  parseLocalDate,
} from "@/lib/dateHelpers";

/** The week before the one `now` falls in: the reviewed week. */
export function reviewedWeekKey(now: Date = new Date()): string {
  return localDateString(addLocalDays(parseLocalDate(localWeekKey(now)), -7));
}

/** localStorage key for the Home entry's viewed state (useDismissOnce). */
/* No uid segment: `useDismissOnce` prefixes one, and it is the only
   writer. Both surfaces that share this key (the Home entry reads it,
   the review page writes it) go through that hook, so they stay in step;
   the Monday notification reads it with the same prefix. */
export function reviewViewedKey(weekKey: string): string {
  return `tropos-review-viewed:${weekKey}`;
}

export async function probeHasDoc(
  uid: string,
  coll: string,
  start: string,
  end: string | null
): Promise<boolean> {
  const parts = [
    end === null ? where("date", "<", start) : where("date", ">=", start),
  ];
  if (end !== null) parts.push(where("date", "<=", end));
  const snap = await getDocs(
    query(collection(db, "users", uid, coll), ...parts, limit(1))
  );
  return !snap.empty;
}

/**
 * Would a review render for the week `weekKey` names? Asked of a week
 * under way, "eligible" stays true once it is: logging only adds. The
 * Monday notification asks it of the week it will be about.
 */
export async function probeReviewEligibility(
  uid: string,
  weekKey: string
): Promise<"none" | "eligible"> {
  const start = weekKey;
  const end = localDateString(addLocalDays(parseLocalDate(weekKey), 6));
  const [w, r, m] = await Promise.all([
    probeHasDoc(uid, "workouts", start, end),
    probeHasDoc(uid, "runs", start, end),
    probeHasDoc(uid, "meals", start, end),
  ]);
  if (w || r || m) return "eligible";
  // Quiet variant: only for established users.
  const [pw, pr, pm] = await Promise.all([
    probeHasDoc(uid, "workouts", start, null),
    probeHasDoc(uid, "runs", start, null),
    probeHasDoc(uid, "meals", start, null),
  ]);
  return pw || pr || pm ? "eligible" : "none";
}
