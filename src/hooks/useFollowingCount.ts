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
  const [failedUid, setFailedUid] = useState<string | null>(null);
  const refresh = useCallback(() => {
    setFailedUid(null);
    setRevision((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!uid) return;
    let active = true;
    const unsubscribe = onSnapshot(
      query(
        collection(db, "following", uid, "users"),
        limit(SOCIAL_GATES.FOLLOWING_FEED_MIN_FOLLOWS)
      ),
      (result) => {
        if (!active) return;
        setSnapshot({ uid, count: result.size });
        setFailedUid(null);
      },
      (error) => {
        if (!active) return;
        logger.error("[useFollowingCount] read failed", error);
        setFailedUid(uid);
      }
    );
    return () => {
      active = false;
      unsubscribe();
    };
  }, [uid, revision]);

  const count = uid && snapshot?.uid === uid ? snapshot.count : null;
  return {
    count,
    /** The read failed and no count is known: not the same as loading. */
    failed: Boolean(uid) && failedUid === uid && count === null,
    refresh,
  };
}
