import { useCallback, useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { useUid } from "@/lib/auth";
import { setDocGuarded } from "@/lib/firestoreWrite";
import { logger } from "@/lib/logger";
import { DEFAULT_PUSH_CONSENT, type PushConsent } from "@/lib/pushConsent";

/**
 * Read/write the user's push consent at `users/{uid}/settings/push` (push arc
 * #961; uid-safety hardened in packet 17). The state is uid-scoped: a late
 * getDoc for account A can never render under account B, and update refuses to
 * write when auth.currentUser no longer matches the captured uid. The
 * register/unregister side effects live in the Settings UI handler, not here.
 */
type PushSettingsState = {
  uid: string | null;
  consent: PushConsent;
  loading: boolean;
};

export function usePushSettings() {
  const uid = useUid();
  const [state, setState] = useState<PushSettingsState>({
    uid: null,
    consent: DEFAULT_PUSH_CONSENT,
    loading: false,
  });

  const consent = state.uid === uid ? state.consent : DEFAULT_PUSH_CONSENT;
  const loading = uid !== null && (state.uid !== uid || state.loading);

  useEffect(() => {
    let cancelled = false;

    if (!uid) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset on sign-out
      setState({ uid: null, consent: DEFAULT_PUSH_CONSENT, loading: false });
      return () => {
        cancelled = true;
      };
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect -- uid-scoped load reset
    setState({ uid, consent: DEFAULT_PUSH_CONSENT, loading: true });

    void getDoc(doc(db, "users", uid, "settings", "push"))
      .then((snapshot) => {
        if (cancelled || auth.currentUser?.uid !== uid) return;
        setState({
          uid,
          consent: {
            ...DEFAULT_PUSH_CONSENT,
            ...(snapshot.exists()
              ? (snapshot.data() as Partial<PushConsent>)
              : {}),
          },
          loading: false,
        });
      })
      .catch((error) => {
        if (cancelled || auth.currentUser?.uid !== uid) return;
        logger.error("[push] settings load failed", error);
        setState({ uid, consent: DEFAULT_PUSH_CONSENT, loading: false });
      });

    return () => {
      cancelled = true;
    };
  }, [uid]);

  const update = useCallback(
    async (updates: Partial<PushConsent>) => {
      if (!uid || auth.currentUser?.uid !== uid) return;
      const current = state.uid === uid ? state.consent : DEFAULT_PUSH_CONSENT;
      const next = { ...current, ...updates };
      setState({ uid, consent: next, loading: false });

      try {
        await setDocGuarded(doc(db, "users", uid, "settings", "push"), next);
      } catch (error) {
        logger.error("[push] settings save failed", error);
      }
    },
    [state, uid]
  );

  return { consent, update, loading };
}
