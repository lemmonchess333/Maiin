import { useCallback, useEffect, useState } from "react";
import { collection, getDocs, limit, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  addLocalDays,
  localDateString,
  parseLocalDate,
} from "@/lib/dateHelpers";
import { logger } from "@/lib/logger";
import { parseResult, type LeagueResult } from "./league";
import {
  markLeagueResultRevealed,
  revealedLeagueWeeks,
} from "./leagueResultReveals";

/** A result is revealed until this many days after its week began: the
 *  week after it was settled. The next Monday brings a newer one. */
export const RESULT_REVEAL_DAYS = 14;

/** Whether a result is still to be revealed on `today` ("yyyy-MM-dd"). */
export function resultStillToReveal(
  result: LeagueResult,
  revealed: readonly string[],
  today: string
): boolean {
  if (revealed.includes(result.weekKey)) return false;
  const until = localDateString(
    addLocalDays(parseLocalDate(result.weekKey), RESULT_REVEAL_DAYS)
  );
  return today < until;
}

/**
 * The league result the signed-in person has not seen revealed on this
 * device (Soc15 call 3): their newest, read once from their own record
 * (users/{uid}/leagueResults, owner-read) when Social mounts, so a result
 * settled on Monday is revealed on the first visit to Social after it.
 *
 * `markRevealed` records it the moment it shows, so a reveal closed by
 * leaving the app is not shown again; `clear` takes it away once closed.
 * Keyed by its caller on the account, so one account's result never shows
 * to the next.
 */
export function useLeagueResult(uid: string) {
  const [result, setResult] = useState<LeagueResult | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let live = true;
    getDocs(
      query(
        collection(db, "users", uid, "leagueResults"),
        orderBy("weekKey", "desc"),
        limit(1)
      )
    )
      .then((snap) => {
        if (!live) return;
        const newest = snap.docs
          .map((d) => parseResult(d.id, d.data()))
          .find((r): r is LeagueResult => r !== null);
        setResult(
          newest &&
            resultStillToReveal(
              newest,
              revealedLeagueWeeks(uid),
              localDateString(new Date())
            )
            ? newest
            : null
        );
        setReady(true);
      })
      .catch((err) => {
        // No reveal this visit; the result is on the league page's next week.
        logger.warn("[league] result read failed", err);
        if (live) setReady(true);
      });
    return () => {
      live = false;
    };
  }, [uid]);

  const markRevealed = useCallback(
    (shown: LeagueResult) => markLeagueResultRevealed(uid, shown.weekKey),
    [uid]
  );
  const clear = useCallback(() => setResult(null), []);

  return { result, ready, markRevealed, clear };
}
