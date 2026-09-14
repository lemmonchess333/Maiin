/**
 * Directory data for the Community Spaces carousel (Spc1 PR2; races
 * plan PR2 adds the race-kind rows).
 *
 * Static reads: interest Spaces request an aggregate count plus the
 * caller's membership; race cards only need membership. Apply country,
 * distance and past-date filtering before querying. Cache read promises
 * per mounted hook and user so changing a filter does not reload interest
 * counts. `refresh()` invalidates that cache after a join/leave.
 *
 * `includeRaces`: only the full Together directory lists race Spaces.
 * The compact Feed stays interest-only and never pays for race reads.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  collection,
  doc,
  getCountFromServer,
  getDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useUid } from "@/lib/auth";
import { localDateString } from "@/lib/dateHelpers";
import {
  filterRaceDefs,
  UK_RACE_FILTERS,
  type RaceBrowseFilters,
} from "./raceBrowse";
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

export function useSpacesDirectory(
  includeRaces = false,
  filters: RaceBrowseFilters = UK_RACE_FILTERS
) {
  const overrides = useRaceEventOverrides();
  const todayKey = localDateString();
  const upcomingRaces = useMemo(
    () => (includeRaces ? upcomingResolvedRaceDefs(overrides, todayKey) : []),
    [includeRaces, overrides, todayKey]
  );
  const { country, distance } = filters;
  const defs = useMemo(
    () => [
      ...INTEREST_DEFS,
      ...filterRaceDefs(upcomingRaces, { country, distance }),
    ],
    [upcomingRaces, country, distance]
  );
  const uid = useUid();
  const [nonce, setNonce] = useState(0);
  type Membership = Pick<SpaceDirectoryEntry, "memberCount" | "joined">;
  const cache = useRef<{
    uid: typeof uid;
    nonce: number;
    reads: Map<string, Promise<Membership>>;
  }>({ uid, nonce, reads: new Map() });
  const [loaded, setLoaded] = useState<{
    uid: typeof uid;
    nonce: number;
    values: Record<string, Membership>;
  }>({ uid, nonce, values: {} });

  useEffect(() => {
    if (cache.current.uid !== uid || cache.current.nonce !== nonce) {
      cache.current = { uid, nonce, reads: new Map() };
    }
    if (!uid) return;
    let cancelled = false;
    const reads = cache.current.reads;
    (async () => {
      const values = await Promise.all(
        defs.map(async (def) => {
          let read = reads.get(def.id);
          if (!read) {
            read = (async (): Promise<Membership> => {
              const [countRes, memberRes] = await Promise.allSettled([
                // Race cards show date + city, never a member count.
                def.kind === "race"
                  ? Promise.resolve(null)
                  : getCountFromServer(
                      collection(db, "spaces", def.id, "members")
                    ),
                getDoc(doc(db, "spaces", def.id, "members", uid)),
              ]);
              return {
                memberCount:
                  countRes.status === "fulfilled"
                    ? (countRes.value?.data().count ?? null)
                    : null,
                joined:
                  memberRes.status === "fulfilled" && memberRes.value.exists(),
              };
            })();
            reads.set(def.id, read);
          }
          return [def.id, await read] as const;
        })
      );
      if (!cancelled)
        setLoaded({ uid, nonce, values: Object.fromEntries(values) });
    })();
    return () => {
      cancelled = true;
    };
  }, [uid, nonce, defs]);

  // Always derive from the current filter; old requests cannot flash stale rows
  // or expose a previous account's Joined flags during an identity change.
  const entries: SpaceDirectoryEntry[] = defs.map((def) => ({
    def,
    memberCount: null,
    joined: false,
    ...(loaded.uid === uid && loaded.nonce === nonce
      ? loaded.values[def.id]
      : undefined),
  }));
  const refresh = useCallback(() => setNonce((n) => n + 1), []);
  return { entries, upcomingRaces, refresh };
}
