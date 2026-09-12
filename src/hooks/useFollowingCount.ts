import { useCallback, useEffect, useState } from "react";
import { collection, limit, onSnapshot, query } from "firebase/firestore";
import { useUid } from "@/lib/auth";
import { db } from "@/lib/firebase";
import { logger } from "@/lib/logger";
import { SOCIAL_GATES } from "@/lib/socialGates";

/** Live, bounded density signal. A successful follow must update the shell
 * without a remount; a failed read must not claim the account has no follows. */
export function useFollowingCount() {
  const uid = useUid();
  const [snapshot, setSnapshot] = useState<{
    uid: string;
    count: number;
  } | null>(null);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((n) => n + 1), []);

  useEffect(() => {
    if (!uid) return;
    let active = true;
    const unsubscribe = onSnapshot(
      query(
        collection(db, "following", uid, "users"),
        limit(SOCIAL_GATES.FOLLOWING_FEED_MIN_FOLLOWS)
      ),
      (result) => {
        if (active) setSnapshot({ uid, count: result.size });
      },
      (error) => {
        if (active) logger.error("[useFollowingCount] read failed", error);
      }
    );
    return () => {
      active = false;
      unsubscribe();
    };
  }, [uid, revision]);

  return {
    count: uid && snapshot?.uid === uid ? snapshot.count : null,
    refresh,
  };
}
