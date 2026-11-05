import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { readActivityMediaUrl } from "@/lib/activityMedia";

/** An authenticated, memory-only image. Never fall back to the stored
 * bearer URL on failure. Late requests cannot repopulate a new session. */
export function useActivityMedia(
  identity: string | null | undefined,
  reportId?: string
): string | undefined {
  const [loaded, setLoaded] = useState<{
    identity: string;
    reportId?: string;
    uid: string;
    url: string;
  }>();
  useEffect(() => {
    let generation = 0;
    let objectUrl: string | undefined;
    const clear = () => {
      generation += 1;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = undefined;
      setLoaded(undefined);
    };
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      clear();
      if (!identity || !user) return;
      const request = generation;
      void readActivityMediaUrl(identity, reportId)
        .then((url) => {
          if (request !== generation || auth.currentUser?.uid !== user.uid) {
            URL.revokeObjectURL(url);
            return;
          }
          objectUrl = url;
          setLoaded({ identity, reportId, uid: user.uid, url });
        })
        .catch(() => {
          /* A quiet tile or drawn map is the fail-closed state. */
        });
    });
    return () => {
      unsubscribe();
      clear();
    };
  }, [identity, reportId]);
  return loaded?.identity === identity &&
    loaded?.reportId === reportId &&
    loaded?.uid === auth.currentUser?.uid
    ? loaded?.url
    : undefined;
}
