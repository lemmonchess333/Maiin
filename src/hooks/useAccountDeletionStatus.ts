import { useEffect, useState } from "react";
import type { Unsubscribe } from "firebase/firestore";

const ACTIVE = new Set([
  "requested",
  "running",
  "failed_cleanup",
  "pending_cleanup",
  "pending_auth_deletion",
  "operator_review",
]);

export function useAccountDeletionStatus(uid: string | undefined) {
  const [record, setRecord] = useState<{
    uid: string;
    status: string;
    confirmed: boolean;
    supportCode?: string;
  } | null>(null);
  useEffect(() => {
    if (!uid) return;
    let active = true;
    let stop: Unsubscribe | undefined;
    // App also renders the signed-out entry screen. Load the database SDK
    // only once an authenticated account actually needs this subscription.
    void Promise.all([import("firebase/firestore"), import("@/lib/firebase")])
      .then(([{ doc, onSnapshot }, { db }]) => {
        if (!active) return;
        stop = onSnapshot(
          doc(db, "accountDeletionRequests", uid),
          { includeMetadataChanges: true },
          (snapshot) => {
            if (!active) return;
            const data = snapshot.data();
            if (
              data?.status === "completed" &&
              (snapshot.metadata.fromCache ||
                snapshot.metadata.hasPendingWrites)
            )
              return;
            setRecord({
              uid,
              status: data?.status || "",
              confirmed: !snapshot.metadata.fromCache,
              supportCode: data?.supportCode,
            });
          },
          () => {
            // An offline/error snapshot isn't evidence that deletion has completed.
          }
        );
      })
      .catch(() => {
        // Loading failure is not evidence of completion either.
      });
    return () => {
      active = false;
      stop?.();
    };
  }, [uid]);
  const current = record?.uid === uid ? record : null;
  return {
    confirmed: current?.confirmed === true,
    pending: ACTIVE.has(current?.status || ""),
    completed: current?.status === "completed",
    supportCode: current?.supportCode,
  };
}
