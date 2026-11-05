import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useUid } from "@/lib/auth";
import { localDateString } from "@/lib/dateHelpers";
import { logger } from "@/lib/logger";
import { PULSE_COLLECTION, pulseSessions } from "@/lib/pulse";

/** How often the day is checked, so a page left open past midnight reads
 *  the new day's count. */
const DAY_CHECK_MS = 60_000;

/**
 * Today's count of sessions across Tropos (Soc15), live: the viewer's own
 * local day, `pulse/{YYYY-MM-DD}`, through a listener, so the figure moves
 * while the Feed is open. Follows the clock past midnight, and a return to
 * the app, onto the next day's count.
 *
 * Null until the day's first answer, and null when it cannot be read: the
 * line shows nothing then, rather than a figure that is not the server's.
 * A day nobody has saved a session for yet has no document, which is 0.
 */
export function usePulse(): number | null {
  const uid = useUid();
  const [day, setDay] = useState(localDateString);
  const [read, setRead] = useState<{
    key: string;
    sessions: number | null;
  } | null>(null);

  useEffect(() => {
    const update = () => setDay(localDateString());
    const timer = window.setInterval(update, DAY_CHECK_MS);
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);

  const key = `${uid}/${day}`;
  useEffect(() => {
    if (!uid) return;
    return onSnapshot(
      doc(db, PULSE_COLLECTION, day),
      (snap) =>
        setRead({
          key: `${uid}/${day}`,
          sessions: snap.exists() ? pulseSessions(snap.data()) : 0,
        }),
      (err) => {
        logger.warn("[pulse] read failed", err);
        setRead({ key: `${uid}/${day}`, sessions: null });
      }
    );
  }, [uid, day]);

  return uid && read?.key === key ? read.sessions : null;
}
