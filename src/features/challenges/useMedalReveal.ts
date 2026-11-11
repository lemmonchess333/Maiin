import { useCallback, useEffect, useState } from "react";
import { collection, getDocs, limit, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { logger } from "@/lib/logger";
import { markMedalRevealed, revealedMedals } from "./medalReveals";
import { medalToReveal, parseMedal, type Medal } from "./medals";

/** The newest medals read for the reveal: more than a fortnight's worth
 *  for anyone, since one is revealed a visit. */
export const MEDAL_REVEAL_READ_LIMIT = 12;

/**
 * The medal the signed-in person has not seen revealed yet (Soc15), read
 * once from their own record (users/{uid}/medals, owner-read) when the
 * hook mounts. Social mounts it on each visit, so a medal reached while
 * Social is open is revealed on the next.
 *
 * `markRevealed` records the reveal on this device at the moment it
 * shows, so a reveal closed by leaving the app is not shown again;
 * `clear` takes it away once it is closed. Keyed by its caller on the
 * account, so one account's medal never shows to the next.
 */
export function useMedalReveal(uid: string) {
  const [medal, setMedal] = useState<Medal | null>(null);
  // The read has settled, either way: no medal now means none to reveal.
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let live = true;
    getDocs(
      query(
        collection(db, "users", uid, "medals"),
        orderBy("earnedAt", "desc"),
        limit(MEDAL_REVEAL_READ_LIMIT)
      )
    )
      .then((snap) => {
        if (!live) return;
        const medals = snap.docs
          .map((d) => parseMedal(d.id, d.data()))
          .filter((m): m is Medal => m !== null);
        setMedal(medalToReveal(medals, revealedMedals(uid)));
        setReady(true);
      })
      .catch((err) => {
        // No reveal this visit; the medal is still in the trophy case.
        logger.warn("[medals] reveal read failed", err);
        if (live) setReady(true);
      });
    return () => {
      live = false;
    };
  }, [uid]);

  const markRevealed = useCallback(
    (shown: Medal) => markMedalRevealed(uid, shown),
    [uid]
  );
  const clear = useCallback(() => setMedal(null), []);

  return { medal, ready, markRevealed, clear };
}
