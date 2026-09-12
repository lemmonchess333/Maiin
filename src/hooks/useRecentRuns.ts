import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";
import { useUid } from "@/lib/auth";
import { db } from "@/lib/firebase";
import { logger } from "@/lib/logger";
import {
  pendingDocumentWrites,
  queuedWritesVersion,
  subscribeQueuedWrites,
} from "@/lib/offlineQueue";
import { parseRunSummary, type RunSummaryItem } from "./useRunningStats";

/** A small latest-session read for Social's share card, without a date cutoff
 * that would turn a returning runner into an account with no training. */
export function useRecentRuns() {
  const uid = useUid();
  const [snapshot, setSnapshot] = useState<{
    uid: string;
    runs: RunSummaryItem[];
  } | null>(null);
  const queueVersion = useSyncExternalStore(
    subscribeQueuedWrites,
    queuedWritesVersion,
    queuedWritesVersion
  );
  useEffect(() => {
    if (!uid) return;
    let active = true;
    const unsubscribe = onSnapshot(
      query(
        collection(db, "users", uid, "runs"),
        orderBy("completedAt", "desc"),
        limit(5)
      ),
      (result) => {
        if (active)
          setSnapshot({
            uid,
            runs: result.docs
              .map((d) => parseRunSummary(d.id, d.data()))
              .filter((run): run is RunSummaryItem => run !== null),
          });
      },
      (error) => {
        if (active) logger.error("[useRecentRuns] read failed", error);
      }
    );
    return () => {
      active = false;
      unsubscribe();
    };
  }, [uid]);
  const runs = useMemo(() => {
    void queueVersion;
    const byId = new Map(
      (snapshot?.uid === uid ? snapshot.runs : []).map((run) => [run.id, run])
    );
    if (uid)
      for (const entry of pendingDocumentWrites(uid, `users/${uid}/runs`)) {
        const run = parseRunSummary(entry.id, {
          ...(entry.merge ? byId.get(entry.id) : {}),
          ...entry.data,
        });
        if (run) byId.set(run.id, run);
      }
    return [...byId.values()].sort(
      (a, b) => b.completedAt.getTime() - a.completedAt.getTime()
    );
  }, [uid, snapshot, queueVersion]);
  return { runs };
}
