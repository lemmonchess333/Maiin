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
  configured: boolean;
  failed: boolean;
};

export function usePushSettings() {
  const uid = useUid();
  const [state, setState] = useState<PushSettingsState>({
    uid: null,
    consent: DEFAULT_PUSH_CONSENT,
    loading: false,
    configured: false,
    failed: false,
  });

  const consent = state.uid === uid ? state.consent : DEFAULT_PUSH_CONSENT;
  const loading = uid !== null && (state.uid !== uid || state.loading);
  const configured = state.uid === uid && state.configured;
  const failed = state.uid === uid && state.failed;

  useEffect(() => {
    let cancelled = false;

    if (!uid) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset on sign-out
      setState({
        uid: null,
        consent: DEFAULT_PUSH_CONSENT,
        loading: false,
        configured: false,
        failed: false,
      });
      return () => {
        cancelled = true;
      };
    }

    setState({
      uid,
      consent: DEFAULT_PUSH_CONSENT,
      loading: true,
      configured: false,
      failed: false,
    });

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
          configured: snapshot.exists(),
          failed: false,
        });
      })
      .catch((error) => {
        if (cancelled || auth.currentUser?.uid !== uid) return;
        logger.error("[push] settings load failed", error);
        setState({
          uid,
          consent: DEFAULT_PUSH_CONSENT,
          loading: false,
          configured: false,
          failed: true,
        });
      });

    return () => {
      cancelled = true;
    };
  }, [uid]);

  const update = useCallback(
    async (updates: Partial<PushConsent>) => {
      if (!uid || auth.currentUser?.uid !== uid || loading) return false;

      try {
        // Patch only the chosen switches, preserving changes from another
        // device. Confirm the server write before the UI reports success or
        // token registration starts; failed consent must never look saved.
        await setDocGuarded(
          doc(db, "users", uid, "settings", "push"),
          updates,
          {
            merge: true,
          }
        );
        if (auth.currentUser?.uid !== uid) return false;
        setState((previous) =>
          previous.uid === uid
            ? {
                ...previous,
                consent: { ...previous.consent, ...updates },
                configured: true,
                failed: false,
              }
            : previous
        );
        return true;
      } catch (error) {
        logger.error("[push] settings save failed", error);
        throw error;
      }
    },
    [loading, uid]
  );

  return { consent, update, loading, configured, failed };
}
