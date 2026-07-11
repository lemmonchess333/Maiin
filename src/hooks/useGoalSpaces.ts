/**
 * Goal Spaces hooks (GOALS-CORE-01).
 *
 * `useGoalSpaces` — the member's circle list, derived from their private
 * `users/{uid}/journeys` subcollection (one journey per membership, doc
 * id == spaceId), hydrated with each space's shared metadata.
 *
 * `useGoalSpace` — one circle's detail: space doc + members + events.
 * All three streams are member-gated by rules; a permission error after
 * being removed resolves to `notFound` rather than crashing.
 *
 * State is only ever set inside subscription callbacks (never
 * synchronously in an effect body — react-hooks/set-state-in-effect);
 * the identity-key pattern (`forUid` / `forId`) makes stale data from a
 * previous key read as "loading" instead of flashing wrong content.
 */
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import {
  subscribeJourneys,
  subscribeGoalSpace,
  subscribeGoalSpaceMembers,
  subscribeGoalSpaceEvents,
} from "@/lib/goalSpacesApi";
import type {
  GoalSpace,
  GoalSpaceEvent,
  GoalSpaceMember,
  Journey,
} from "@/features/goalSpaces/goalSpaceModel";

interface JourneysState {
  forUid: string;
  rows: Journey[];
}

export function useGoalSpaces(): {
  journeys: Journey[];
  spaces: Record<string, GoalSpace>;
  loading: boolean;
} {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const [journeysState, setJourneysState] = useState<JourneysState | null>(
    null
  );
  const [spacesMap, setSpacesMap] = useState<Record<string, GoalSpace>>({});

  useEffect(() => {
    if (!uid) return;
    return subscribeJourneys(
      uid,
      (rows) => setJourneysState({ forUid: uid, rows }),
      () => setJourneysState({ forUid: uid, rows: [] })
    );
  }, [uid]);

  const current = uid && journeysState?.forUid === uid ? journeysState : null;
  const journeys = useMemo(() => current?.rows ?? [], [current]);
  // Signed out → settled-empty; signed in → loading until first snapshot.
  const loading = !!uid && current === null;

  // Hydrate each journey's space metadata. Memberships are ≤ a handful,
  // so one listener per space is cheap and keeps titles/counts live.
  const spaceIds = useMemo(
    () => journeys.map((j) => j.spaceId).sort(),
    [journeys]
  );
  const spaceIdsKey = spaceIds.join(",");

  useEffect(() => {
    if (spaceIds.length === 0) return;
    const unsubs = spaceIds.map((id) =>
      subscribeGoalSpace(id, (space) => {
        setSpacesMap((prev) => {
          if (space === null) {
            if (!(id in prev)) return prev;
            const next = { ...prev };
            delete next[id];
            return next;
          }
          return { ...prev, [id]: space };
        });
      })
    );
    return () => unsubs.forEach((u) => u());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spaceIdsKey]);

  // Expose only the CURRENT journeys' spaces — entries for circles the
  // user has since left linger in the map harmlessly but never render.
  const spaces = useMemo(() => {
    const out: Record<string, GoalSpace> = {};
    for (const id of spaceIds) {
      if (spacesMap[id]) out[id] = spacesMap[id];
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spaceIdsKey, spacesMap]);

  return { journeys, spaces, loading };
}

interface SpaceState {
  forId: string;
  space: GoalSpace | null;
  members: GoalSpaceMember[];
  events: GoalSpaceEvent[];
  /** First space snapshot (or a read error) arrived. */
  settled: boolean;
  /** Rules denied the read — non-member/removed/deleted. */
  failed: boolean;
}

export function useGoalSpace(spaceId: string | undefined): {
  space: GoalSpace | null;
  members: GoalSpaceMember[];
  events: GoalSpaceEvent[];
  loading: boolean;
  notFound: boolean;
} {
  const [state, setState] = useState<SpaceState | null>(null);

  useEffect(() => {
    if (!spaceId) return;
    // Merge-with-identity: any callback may fire first; each merges into
    // a base that resets when the previous state belongs to another id.
    const base = (prev: SpaceState | null): SpaceState =>
      prev?.forId === spaceId
        ? prev
        : {
            forId: spaceId,
            space: null,
            members: [],
            events: [],
            settled: false,
            failed: false,
          };
    const unsubSpace = subscribeGoalSpace(
      spaceId,
      (space) => setState((prev) => ({ ...base(prev), space, settled: true })),
      () =>
        setState((prev) => ({
          ...base(prev),
          space: null,
          settled: true,
          failed: true,
        }))
    );
    const unsubMembers = subscribeGoalSpaceMembers(spaceId, (members) =>
      setState((prev) => ({ ...base(prev), members }))
    );
    const unsubEvents = subscribeGoalSpaceEvents(spaceId, (events) =>
      setState((prev) => ({ ...base(prev), events }))
    );
    return () => {
      unsubSpace();
      unsubMembers();
      unsubEvents();
    };
  }, [spaceId]);

  const current = spaceId && state?.forId === spaceId ? state : null;
  return {
    space: current?.space ?? null,
    members: current?.members ?? [],
    events: current?.events ?? [],
    loading: !!spaceId && !current?.settled,
    notFound:
      !spaceId ||
      (current?.settled === true && (current.failed || current.space === null)),
  };
}
