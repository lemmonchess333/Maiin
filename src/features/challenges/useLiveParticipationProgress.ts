import { useEffect, useMemo, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { logger } from "@/lib/logger";

const EMPTY_PROGRESS = {};

/** Live server backfill and edit results for the rotating participation goal.
 * Only active/recently ended definitions supplied by useChallenges are watched:
 * normally this month's edition and, for seven days, the previous finale.
 * A null entry is an observed missing document, not an unread value. */
export function useLiveParticipationProgress<T>(
  uid: string | null,
  tracked: readonly { id: string; metric: string }[]
): Readonly<Record<string, T | null>> {
  const key = JSON.stringify(
    [
      ...new Set(
        tracked
          .filter(
            (c) => c.metric === "active_days" || c.metric === "training_minutes"
          )
          .map((c) => c.id)
      ),
    ].sort()
  );
  const [state, setState] = useState<{
    uid: string;
    values: Record<string, T | null>;
  } | null>(null);

  useEffect(() => {
    if (!uid) return;
    let active = true;
    const ids = JSON.parse(key) as string[];
    const included = new Set(ids);
    const unsubscribes = ids.map((id) => {
      let listening = true;
      let unsubscribe = () => {};
      unsubscribe = onSnapshot(
        doc(db, "challenges", id, "participants", uid),
        (snapshot) => {
          if (!active || !listening) return;
          const value = snapshot.exists() ? (snapshot.data() as T) : null;
          setState((prev) => ({
            uid,
            values: {
              ...(prev?.uid === uid
                ? Object.fromEntries(
                    Object.entries(prev.values).filter(([id]) =>
                      included.has(id)
                    )
                  )
                : {}),
              [id]: value,
            },
          }));
        },
        (error) => {
          if (!active || !listening) return;
          listening = false;
          unsubscribe();
          // Firestore listener errors are terminal. Let pull-to-refresh reads
          // answer for this id rather than pinning the last live value forever.
          setState((prev) => {
            if (prev?.uid !== uid) return prev;
            const values = { ...prev.values };
            delete values[id];
            return { uid, values };
          });
          logger.warn(
            "[Challenges] Live participation progress failed:",
            error
          );
        }
      );
      // The shared fake can deliver an initial error synchronously; this also
      // makes cleanup safe if a subscription fails before returning its stop.
      if (!listening) unsubscribe();
      return () => {
        listening = false;
        unsubscribe();
      };
    });
    return () => {
      active = false;
      for (const unsubscribe of unsubscribes) unsubscribe();
    };
  }, [uid, key]);

  // Keep known snapshots for ids that remain tracked while the finale window
  // changes. A stale one-shot value must not flash back between subscriptions.
  return useMemo(() => {
    if (!uid || state?.uid !== uid) return EMPTY_PROGRESS;
    const included = new Set(JSON.parse(key) as string[]);
    return Object.fromEntries(
      Object.entries(state.values).filter(([id]) => included.has(id))
    );
  }, [state, uid, key]);
}
