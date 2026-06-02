import { useCallback, useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import { setDocGuarded } from "@/lib/firestoreWrite";
import { logger } from "@/lib/logger";
import { DEFAULT_PUSH_CONSENT, type PushConsent } from "@/lib/pushConsent";

/**
 * Read/write the user's push consent at `users/{uid}/settings/push` (push arc
 * #961, slice 8 / #969). Mirrors the meal/workout reminder settings hooks.
 * Optimistic local update + best-effort persist (a background write failure
 * shouldn't crash a toggle). The register/unregister side effects live in the
 * Settings UI handler, not here — this is just the consent document.
 */
export function usePushSettings() {
  const { user } = useAuth();
  const [consent, setConsent] = useState<PushConsent>(DEFAULT_PUSH_CONSENT);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clear loading when signed out
      setLoading(false);
      return;
    }
    const ref = doc(db, "users", user.uid, "settings", "push");
    getDoc(ref)
      .then((snap) => {
        if (snap.exists()) {
          setConsent({
            ...DEFAULT_PUSH_CONSENT,
            ...(snap.data() as Partial<PushConsent>),
          });
        }
        setLoading(false);
      })
      .catch((err) => {
        logger.error("[push] settings load failed", err);
        setLoading(false);
      });
  }, [user]);

  const update = useCallback(
    async (updates: Partial<PushConsent>) => {
      if (!user) return;
      const updated = { ...consent, ...updates };
      setConsent(updated);
      const ref = doc(db, "users", user.uid, "settings", "push");
      try {
        await setDocGuarded(ref, updated);
      } catch (err) {
        logger.error("[push] settings save failed", err);
      }
    },
    [user, consent]
  );

  return { consent, update, loading };
}
