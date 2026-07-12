/**
 * Directory data for the Community Spaces carousel (Spc1 PR2).
 *
 * One pass on mount: per space, an aggregate member count (v1 has no
 * server-owned counter by design — the aggregate query is unforgeable)
 * plus the caller's own membership doc. Static-read posture like the
 * discover feed (no listeners on a browse surface); `refresh()`
 * re-runs after a join/leave elsewhere.
 */
import { useCallback, useEffect, useState } from "react";
import {
  collection,
  doc,
  getCountFromServer,
  getDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import { SPACE_DEFS, type SpaceDef } from "./spaceDefs";

export interface SpaceDirectoryEntry {
  def: SpaceDef;
  /** null while loading or when the count read failed. */
  memberCount: number | null;
  joined: boolean;
}

export function useSpacesDirectory() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<SpaceDirectoryEntry[]>(() =>
    SPACE_DEFS.map((def) => ({ def, memberCount: null, joined: false }))
  );
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const loaded = await Promise.all(
        SPACE_DEFS.map(async (def): Promise<SpaceDirectoryEntry> => {
          const [countRes, memberRes] = await Promise.allSettled([
            getCountFromServer(collection(db, "spaces", def.id, "members")),
            getDoc(doc(db, "spaces", def.id, "members", user.uid)),
          ]);
          return {
            def,
            memberCount:
              countRes.status === "fulfilled"
                ? countRes.value.data().count
                : null,
            joined:
              memberRes.status === "fulfilled" && memberRes.value.exists(),
          };
        })
      );
      if (!cancelled) setEntries(loaded);
    })();
    return () => {
      cancelled = true;
    };
  }, [user, nonce]);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);
  return { entries, refresh };
}
