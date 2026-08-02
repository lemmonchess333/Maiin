/**
 * Directory data for the Community Spaces carousel (Spc1 PR2; races
 * plan PR2 adds the race-kind rows).
 *
 * One pass on mount: per space, an aggregate member count (v1 has no
 * server-owned counter by design — the aggregate query is unforgeable)
 * plus the caller's own membership doc. Static-read posture like the
 * discover feed (no listeners on a browse surface); `refresh()`
 * re-runs after a join/leave elsewhere.
 *
 * `includeRaces` (Q6 lock): only the FULL directory (Together tab)
 * lists race spaces — the Feed's compact "Spaces for you" row stays
 * interest-only, so the extra member-count reads never fan out on
 * feed mounts. Past-dated races are excluded before any read happens
 * (Q2: `dateKey < today` derives everything).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  getCountFromServer,
  getDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useUid } from "@/lib/auth";
import { localDateString } from "@/lib/dateHelpers";
import { SPACE_DEFS, type SpaceDef } from "./spaceDefs";
import {
  upcomingResolvedRaceDefs,
  useRaceEventOverrides,
} from "./raceEventOverrides";

export interface SpaceDirectoryEntry {
  def: SpaceDef;
  /** null while loading or when the count read failed. */
  memberCount: number | null;
  joined: boolean;
}

const INTEREST_DEFS = SPACE_DEFS.filter((d) => d.kind === "interest");

export function useSpacesDirectory(includeRaces = false) {
  /* RACE-EVENTS-REMOTE: race rows resolve their event blocks against
   * the server overrides — bundled config renders immediately, and
   * when the session fetch lands the list re-derives (a server-fresh
   * date can rescue a race a stale binary thinks has passed). */
  const overrides = useRaceEventOverrides();
  const defs = useMemo(
    () =>
      includeRaces
        ? [
            ...INTEREST_DEFS,
            ...upcomingResolvedRaceDefs(overrides, localDateString()),
          ]
        : INTEREST_DEFS,
    [includeRaces, overrides]
  );
  const uid = useUid();
  const [entries, setEntries] = useState<SpaceDirectoryEntry[]>(() =>
    defs.map((def) => ({ def, memberCount: null, joined: false }))
  );
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    (async () => {
      const loaded = await Promise.all(
        defs.map(async (def): Promise<SpaceDirectoryEntry> => {
          const [countRes, memberRes] = await Promise.allSettled([
            getCountFromServer(collection(db, "spaces", def.id, "members")),
            getDoc(doc(db, "spaces", def.id, "members", uid)),
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
  }, [uid, nonce, defs]);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);
  return { entries, refresh };
}
