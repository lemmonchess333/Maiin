/**
 * Read just enough of the run history to answer "how long have they been
 * away?" — the input `generateRacePlanV2` needs and had no way to get.
 *
 * WHY A BOUNDED ONE-SHOT READ RATHER THAN A HOOK. The two paths that must
 * resolve a layoff — the calendar auto-rollover and the fell-behind realign —
 * both live inside `useProgram`, and `useProgram` cannot consume `useClaimMap`
 * (the existing runs subscriber) because `useClaimMap` calls `useProgram`.
 * Subscribing again would mean a second live listener over the same collection
 * in an already-hot hook. A capped `getDocs` on the paths that actually need
 * the answer costs one read and adds no listener.
 *
 * WHY THE CAP IS SAFE. Only the most recent ELIGIBLE run matters, and
 * ineligible runs are rare (an invalid GPS trace, a sub-threshold entry). The
 * window has to clear that handful, not the whole history — so a small cap
 * over `createdAt desc` finds it. In the degenerate case where every one of
 * the newest runs is ineligible, this under-reports the layoff (reports
 * shorter than it is), which fails toward the CURRENT behaviour rather than
 * toward an unearned re-entry plan.
 */
import { collection, getDocs, limit, orderBy, query } from "firebase/firestore";

import { db } from "@/lib/firebase";
import { logger } from "@/lib/logger";
import {
  layoffFromRuns,
  type DatedRun,
  type LayoffClass,
} from "./layoffDetection";

/** How many recent runs to inspect. See "why the cap is safe" above. */
export const RECENT_RUN_SCAN_LIMIT = 20;

/**
 * Resolve the runner's layoff class, or `"none"` if it cannot be determined.
 *
 * Every failure mode returns `"none"`: no uid, an empty collection, a read
 * error. That is deliberate and it is the SAFE direction — `"none"` is the
 * behaviour the app had before Run15, so a failed read leaves the user
 * exactly where they were rather than dropping them into a re-entry plan they
 * did not earn. The opposite default would let one offline read rewrite a
 * trained runner's week down to easy running.
 */
export async function fetchRecentLayoff(
  uid: string | null | undefined,
  todayKey: string
): Promise<LayoffClass> {
  if (!uid) return "none";
  try {
    const snap = await getDocs(
      query(
        collection(db, "users", uid, "runs"),
        // `createdAt` is the field `useClaimMap` orders by, so this rides an
        // index that already exists rather than requiring a new one.
        orderBy("createdAt", "desc"),
        limit(RECENT_RUN_SCAN_LIMIT)
      )
    );
    const runs: DatedRun[] = snap.docs.map((d) => {
      const data = d.data() as Record<string, unknown>;
      return {
        date: typeof data.date === "string" ? data.date : undefined,
        distance: typeof data.distance === "number" ? data.distance : undefined,
        duration: typeof data.duration === "number" ? data.duration : undefined,
        isInvalid: data.isInvalid === true,
        savedAnyway: data.savedAnyway === true,
      };
    });
    return layoffFromRuns(runs, todayKey);
  } catch (err) {
    logger.warn("[layoff] recent-run read failed; treating as no layoff", err);
    return "none";
  }
}
