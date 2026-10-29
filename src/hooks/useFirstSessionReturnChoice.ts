import { useCallback, useEffect, useState } from "react";
import { doc, getDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { useUid } from "@/lib/auth";
import { setDocGuarded } from "@/lib/firestoreWrite";
import { logger } from "@/lib/logger";

export type ReturnChoice = "accepted" | "later" | "denied";

type ChoiceState = {
  uid: string | null;
  loading: boolean;
  failed: boolean;
  response: ReturnChoice | null;
};

const EMPTY: ChoiceState = {
  uid: null,
  loading: false,
  failed: false,
  response: null,
};

/** One account-wide answer, shared across completion screens and devices. */
export function useFirstSessionReturnChoice() {
  const uid = useUid();
  const [state, setState] = useState<ChoiceState>(EMPTY);
  const loading = !!uid && (state.uid !== uid || state.loading);
  const failed = state.uid === uid && state.failed;
  const response = state.uid === uid ? state.response : null;

  useEffect(() => {
    let cancelled = false;
    if (!uid) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clear the prior account immediately
      setState(EMPTY);
      return () => {
        cancelled = true;
      };
    }
    setState({ uid, loading: true, failed: false, response: null });
    void getDoc(doc(db, "users", uid, "settings", "firstSessionReturn"))
      .then((snapshot) => {
        if (cancelled || auth.currentUser?.uid !== uid) return;
        const saved = snapshot.data()?.response;
        const parsed: ReturnChoice | null =
          saved === "accepted" || saved === "later" || saved === "denied"
            ? saved
            : null;
        setState({ uid, loading: false, failed: false, response: parsed });
      })
      .catch((error) => {
        if (cancelled || auth.currentUser?.uid !== uid) return;
        logger.error("[return-reminder] choice load failed", error);
        setState({ uid, loading: false, failed: true, response: null });
      });
    return () => {
      cancelled = true;
    };
  }, [uid]);

  const record = useCallback(
    async (answer: ReturnChoice): Promise<boolean> => {
      if (!uid || auth.currentUser?.uid !== uid || loading || failed)
        return false;
      await setDocGuarded(
        doc(db, "users", uid, "settings", "firstSessionReturn"),
        { response: answer, respondedAt: serverTimestamp() },
        { merge: true }
      );
      if (auth.currentUser?.uid !== uid) return false;
      setState({ uid, loading: false, failed: false, response: answer });
      return true;
    },
    [uid, loading, failed]
  );

  return { loading, failed, response, record };
}
