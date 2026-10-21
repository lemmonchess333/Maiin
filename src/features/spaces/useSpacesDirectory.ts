/**
 * Directory data for the Community Spaces carousel (Spc1 PR2; races
 * plan PR2 adds the race-kind rows).
 *
 * Static reads: interest Spaces request an aggregate count plus the
 * caller's membership; race cards only need membership. Apply country
 * and distance filtering before querying. The read promises are shared by
 * every mounted copy of the hook, keyed by user and Space, so the Feed,
 * the Together directory and People open at once read each Space once,
 * and changing a filter does not reload interest counts. The share empties
 * when the last copy unmounts, so coming back to Social reads afresh; a
 * join or leave (`invalidateSpacesDirectory`) and `refresh()` clear it too.
 *
 * `includeRaces`: the Together directory lists race Spaces. The Feed and
 * People pass it too, for the joined ids only: a race Space you joined
 * counts for My communities and for "Also in" suggestions.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
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
  directoryResolvedRaceDefs,
  useRaceEventOverrides,
} from "./raceEventOverrides";

export interface SpaceDirectoryEntry {
  def: SpaceDef;
  /** null while loading or when the count read failed. */
  memberCount: number | null;
  joined: boolean;
}

const INTEREST_DEFS = SPACE_DEFS.filter((d) => d.kind === "interest");

type Membership = Pick<SpaceDirectoryEntry, "memberCount" | "joined">;

/** Reads shared by the mounted copies, keyed `${uid}:${spaceId}`. */
const sharedReads = new Map<string, Promise<Membership>>();
let mountedCopies = 0;
/** Bumped when the share is cleared, so mounted copies read again. */
let generation = 0;
const generationListeners = new Set<() => void>();

function subscribeGeneration(listener: () => void): () => void {
  generationListeners.add(listener);
  return () => generationListeners.delete(listener);
}
const currentGeneration = () => generation;

/** Forget what the directory read for this account (one Space, or all),
 *  and have every mounted copy read it again: after a join or a leave. */
export function invalidateSpacesDirectory(uid: string, spaceId?: string): void {
  for (const key of [...sharedReads.keys()]) {
    if (spaceId ? key === `${uid}:${spaceId}` : key.startsWith(`${uid}:`)) {
      sharedReads.delete(key);
    }
  }
  generation += 1;
  for (const listener of generationListeners) listener();
}

async function fetchMembership(
  uid: string,
  def: SpaceDef
): Promise<{ membership: Membership; failed: boolean }> {
  const [countRes, memberRes] = await Promise.allSettled([
    // Race cards show date + city, never a member count.
    def.kind === "race"
      ? Promise.resolve(null)
      : getCountFromServer(collection(db, "spaces", def.id, "members")),
    getDoc(doc(db, "spaces", def.id, "members", uid)),
  ]);
  return {
    membership: {
      memberCount:
        countRes.status === "fulfilled"
          ? (countRes.value?.data().count ?? null)
          : null,
      joined: memberRes.status === "fulfilled" && memberRes.value.exists(),
    },
    failed: countRes.status === "rejected" || memberRes.status === "rejected",
  };
}

function readMembership(uid: string, def: SpaceDef): Promise<Membership> {
  const key = `${uid}:${def.id}`;
  const existing = sharedReads.get(key);
  if (existing) return existing;
  const read = fetchMembership(uid, def).then(({ membership, failed }) => {
    // A failed read is not shared onward: the next copy to ask tries again.
    if (failed && sharedReads.get(key) === read) sharedReads.delete(key);
    return membership;
  });
  sharedReads.set(key, read);
  return read;
}

export function useSpacesDirectory(
  includeRaces = false,
  filters: RaceBrowseFilters = UK_RACE_FILTERS
) {
  const overrides = useRaceEventOverrides();
  const todayKey = localDateString();
  const upcomingRaces = useMemo(
    () => (includeRaces ? directoryResolvedRaceDefs(overrides, todayKey) : []),
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
  const nonce = useSyncExternalStore(
    subscribeGeneration,
    currentGeneration,
    currentGeneration
  );
  const [loaded, setLoaded] = useState<{
    uid: typeof uid;
    nonce: number;
    values: Record<string, Membership>;
    done: boolean;
  }>({ uid, nonce, values: {}, done: false });

  useEffect(() => {
    mountedCopies += 1;
    return () => {
      mountedCopies -= 1;
      if (mountedCopies === 0) sharedReads.clear();
    };
  }, []);

  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    (async () => {
      const values = await Promise.all(
        defs.map(
          async (def) => [def.id, await readMembership(uid, def)] as const
        )
      );
      if (!cancelled)
        setLoaded({
          uid,
          nonce,
          values: Object.fromEntries(values),
          done: true,
        });
    })();
    return () => {
      cancelled = true;
    };
  }, [uid, nonce, defs]);

  // Always derive from the current filter; old requests cannot flash stale rows
  // or expose a previous account's Joined flags during an identity change.
  // Memoised: callers key effects on this list (People's suggestions take
  // the joined ids from it), and a new array every render re-ran those
  // effects every render, a fetch loop for as long as People was open.
  const entries = useMemo<SpaceDirectoryEntry[]>(
    () =>
      defs.map((def) => ({
        def,
        memberCount: null,
        joined: false,
        ...(loaded.uid === uid && loaded.nonce === nonce
          ? loaded.values[def.id]
          : undefined),
      })),
    [defs, loaded, uid, nonce]
  );
  const refresh = useCallback(() => {
    if (uid) invalidateSpacesDirectory(uid);
  }, [uid]);
  /** True once this account's membership reads have answered, so the
   *  `joined` flags are known rather than defaulted to false. */
  const ready = loaded.done && loaded.uid === uid && loaded.nonce === nonce;
  return { entries, upcomingRaces, refresh, ready };
}
