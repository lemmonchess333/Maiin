/**
 * Goal Space client hook (GOALS-CORE-01, slice 4).
 *
 * Discovery: the membership callables maintain an owner-only journey
 * link (users/{uid}/journeys/{spaceId}) for every Circle — so the
 * client lists its Circles through the existing journeys rules with
 * no collection-group read surface. Space/member/event reads are
 * member-only (rules); membership WRITES go through the callables
 * exclusively. The one client write — publishing an event — passes
 * the checkEventPayload privacy fence before addDocGuarded, and the
 * rules enforce the same allowlist server-side.
 */

import { useCallback, useEffect, useState } from "react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
} from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { db } from "@/lib/firebase";
import { addDocGuarded } from "@/lib/firestoreWrite";
import { logger } from "@/lib/logger";
import {
  checkEventPayload,
  parseGoalSpace,
  parseGoalSpaceEvent,
  type GoalSpace,
  type GoalSpaceEvent,
  type GoalSpaceEventKind,
  type GoalSpaceMember,
  type GoalSpaceType,
} from "./goalSpaceTypes";

export interface CircleSummary {
  space: GoalSpace;
  /** Present only for the owner (from the create callable / doc). */
  inviteCode: string | null;
}

export interface CircleDetail {
  members: GoalSpaceMember[];
  events: GoalSpaceEvent[];
}

function fns() {
  return getFunctions();
}

export function useGoalSpaces(uid: string | undefined) {
  // null = loading
  const [circles, setCircles] = useState<CircleSummary[] | null>(null);

  const reload = useCallback(async () => {
    if (!uid) return;
    try {
      const links = await getDocs(collection(db, "users", uid, "journeys"));
      const spaceIds = links.docs
        .map((d) => d.data()?.goalSpaceId)
        .filter((id): id is string => typeof id === "string");
      const spaces = await Promise.all(
        spaceIds.map(async (id) => {
          try {
            const snap = await getDoc(doc(db, "goalSpaces", id));
            if (!snap.exists()) return null;
            const data = snap.data();
            const space = parseGoalSpace(data);
            if (!space) return null;
            return {
              space,
              inviteCode:
                space.ownerId === uid && typeof data.inviteCode === "string"
                  ? data.inviteCode
                  : null,
            } satisfies CircleSummary;
          } catch {
            // Removed since the link was written (or rules denied) —
            // skip rather than break the whole list.
            return null;
          }
        })
      );
      setCircles(
        spaces
          .filter((s): s is CircleSummary => s !== null)
          .sort((a, b) => b.space.createdAt - a.space.createdAt)
      );
    } catch (err) {
      logger.error("goalSpaces: list failed", err);
      setCircles([]);
    }
  }, [uid]);

  useEffect(() => {
    setCircles(null);
    void reload();
  }, [reload]);

  const createCircle = useCallback(
    async (input: {
      type: GoalSpaceType;
      title: string;
      targetDate?: string;
    }): Promise<{ spaceId: string; inviteCode: string } | null> => {
      try {
        const call = httpsCallable(fns(), "createGoalSpace");
        const res = await call(input);
        await reload();
        return res.data as { spaceId: string; inviteCode: string };
      } catch (err) {
        logger.error("goalSpaces: create failed", err);
        return null;
      }
    },
    [reload]
  );

  const joinCircle = useCallback(
    async (spaceId: string, inviteCode: string): Promise<boolean> => {
      try {
        await httpsCallable(fns(), "joinGoalSpace")({ spaceId, inviteCode });
        await reload();
        return true;
      } catch (err) {
        logger.error("goalSpaces: join failed", err);
        return false;
      }
    },
    [reload]
  );

  const leaveCircle = useCallback(
    async (spaceId: string): Promise<boolean> => {
      try {
        await httpsCallable(fns(), "leaveGoalSpace")({ spaceId });
        await reload();
        return true;
      } catch (err) {
        logger.error("goalSpaces: leave failed", err);
        return false;
      }
    },
    [reload]
  );

  const loadDetail = useCallback(
    async (spaceId: string): Promise<CircleDetail> => {
      try {
        const [membersSnap, eventsSnap] = await Promise.all([
          getDocs(collection(db, "goalSpaces", spaceId, "members")),
          getDocs(
            query(
              collection(db, "goalSpaces", spaceId, "events"),
              orderBy("createdAt", "desc"),
              limit(30)
            )
          ),
        ]);
        const members = membersSnap.docs
          .map((d) => d.data() as GoalSpaceMember)
          .sort((a, b) => a.joinedAt - b.joinedAt);
        const events = eventsSnap.docs
          .map((d) => parseGoalSpaceEvent({ id: d.id, ...d.data() }))
          .filter((e): e is GoalSpaceEvent => e !== null);
        return { members, events };
      } catch (err) {
        logger.error("goalSpaces: detail failed", err);
        return { members: [], events: [] };
      }
    },
    []
  );

  /** Publish a summary-only event. The privacy fence runs CLIENT-side
   *  too so a coding mistake fails loudly before the rules reject it. */
  const publishEvent = useCallback(
    async (
      spaceId: string,
      kind: GoalSpaceEventKind,
      text?: string,
      weekKey?: string
    ): Promise<boolean> => {
      if (!uid) return false;
      const payload: Record<string, unknown> = {
        uid,
        kind,
        text: text?.trim() ? text.trim().slice(0, 200) : null,
        weekKey: weekKey ?? null,
        createdAt: Date.now(),
      };
      const check = checkEventPayload(payload);
      if (!check.ok) {
        logger.error("goalSpaces: event blocked by privacy fence", check);
        return false;
      }
      try {
        await addDocGuarded(
          collection(db, "goalSpaces", spaceId, "events"),
          payload
        );
        return true;
      } catch (err) {
        logger.error("goalSpaces: event write failed", err);
        return false;
      }
    },
    [uid]
  );

  return {
    loading: uid !== undefined && circles === null,
    circles: circles ?? [],
    reload,
    createCircle,
    joinCircle,
    leaveCircle,
    loadDetail,
    publishEvent,
  };
}
