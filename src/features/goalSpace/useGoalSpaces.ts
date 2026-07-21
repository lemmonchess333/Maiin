/**
 * Goal Space client hook (GOALS-CORE-01, slice 4).
 *
 * Discovery: the membership callables maintain an owner-only journey
 * link (users/{uid}/journeys/{spaceId}) for every Circle — so the
 * client lists its Circles through the existing journeys rules with
 * no collection-group read surface. Space/member/event reads are
 * member-only (rules); membership WRITES go through the callables
 * exclusively. The one client-direct write — publishing a
 * milestone/needs-support-class event — passes the checkEventPayload
 * privacy fence before addDocGuarded, and the rules enforce the same
 * allowlist server-side. Weekly check-ins are SERVER-owned
 * (SOCIAL-FOCUS-01): setWeeklyFocus/backCheckIn go through callables
 * so the deterministic weekly event ID and the closed focus enum
 * can't be bypassed.
 */

import { useCallback, useEffect, useRef, useState } from "react";
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
import { localWeekKey } from "@/lib/dateHelpers";
import {
  checkEventPayload,
  parseGoalSpace,
  parseGoalSpaceEvent,
  type GoalSpace,
  type GoalSpaceEvent,
  type GoalSpaceEventKind,
  type GoalSpaceMember,
  type GoalSpaceType,
  type WeeklyFocus,
} from "./goalSpaceTypes";

/** goalSpaceWeeklyCheckIn's create/duplicate/update contract. */
export interface WeeklyCheckInResult {
  ok: boolean;
  eventId: string;
  duplicate: boolean;
  updated: boolean;
}

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
  // SOCIAL-HOME-01: a failed list read must be distinguishable from a
  // genuinely empty Circle list — the Together surface renders a retry
  // affordance for the former and the cold-start selector for the
  // latter. Cleared on any successful reload.
  const [loadFailed, setLoadFailed] = useState(false);

  // CIRCLE-INDEX-TRUST-01: request-generation guard. Every reload bumps
  // the counter and captures its own generation; a completion only
  // commits state if it's still the current generation. This closes the
  // account-switch and overlapping-refresh races — a late account-A read
  // (or a superseded refresh) can no longer overwrite newer state, so
  // account A's Circle titles can't flash while account B resolves. The
  // effect below also clears to loading on a uid change; the two
  // together give the "own the index by uid + generation" property.
  const genRef = useRef(0);

  const reload = useCallback(async () => {
    if (!uid) return;
    const myGen = ++genRef.current;
    const isCurrent = () => genRef.current === myGen;
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
      // Superseded by a newer reload / account switch — drop this result.
      if (!isCurrent()) return;
      setCircles(
        spaces
          .filter((s): s is CircleSummary => s !== null)
          .sort((a, b) => b.space.createdAt - a.space.createdAt)
      );
      setLoadFailed(false);
    } catch (err) {
      if (!isCurrent()) return;
      logger.error("goalSpaces: list failed", err);
      setCircles([]);
      setLoadFailed(true);
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
    // Accepts the raw pasted/typed code. The server resolves any accepted
    // form — a short code (K7P4-9M2H), or the legacy spaceId.token string —
    // so the client stays format-agnostic.
    async (code: string): Promise<boolean> => {
      try {
        await httpsCallable(fns(), "joinGoalSpace")({ code });
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
        const ownCheckInRef = uid
          ? doc(db, "goalSpaces", spaceId, "events", `${uid}_${localWeekKey()}`)
          : null;
        const [membersSnap, eventsSnap, ownCheckInSnap] = await Promise.all([
          getDocs(collection(db, "goalSpaces", spaceId, "members")),
          getDocs(
            query(
              collection(db, "goalSpaces", spaceId, "events"),
              orderBy("createdAt", "desc"),
              limit(30)
            )
          ),
          ownCheckInRef ? getDoc(ownCheckInRef) : Promise.resolve(null),
        ]);
        const members = membersSnap.docs
          .map((d) => d.data() as GoalSpaceMember)
          .sort((a, b) => a.joinedAt - b.joinedAt);
        const events = eventsSnap.docs
          .map((d) => parseGoalSpaceEvent({ id: d.id, ...d.data() }))
          .filter((e): e is GoalSpaceEvent => e !== null);
        // The 30-event window can age out the member's OWN current-week
        // check-in (focus changes deliberately preserve createdAt) —
        // and the "Set vs Change weekly focus" state derives from it.
        // The deterministic doc ID makes the direct read cheap.
        if (ownCheckInSnap?.exists()) {
          const own = parseGoalSpaceEvent({
            id: ownCheckInSnap.id,
            ...ownCheckInSnap.data(),
          });
          if (own && !events.some((e) => e.id === own.id)) {
            events.push(own);
            events.sort((a, b) => b.createdAt - a.createdAt);
          }
        }
        return { members, events };
      } catch (err) {
        logger.error("goalSpaces: detail failed", err);
        return { members: [], events: [] };
      }
    },
    [uid]
  );

  /** Publish a summary-only event. The privacy fence runs CLIENT-side
   *  too so a coding mistake fails loudly before the rules reject it.
   *  weekly_check_in is excluded at the TYPE level — a caller passing
   *  it would compile, pass local state, then silently fail at the
   *  fence; the callable (setWeeklyFocus) is the only check-in path. */
  const publishEvent = useCallback(
    async (
      spaceId: string,
      kind: Exclude<GoalSpaceEventKind, "weekly_check_in">,
      text?: string
    ): Promise<boolean> => {
      if (!uid) return false;
      const payload: Record<string, unknown> = {
        uid,
        kind,
        text: text?.trim() ? text.trim().slice(0, 200) : null,
        weekKey: null,
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

  /** SOCIAL-FOCUS-01 — set (or change) this week's check-in + focus.
   *  Server-owned: the callable writes the deterministic
   *  ${uid}_${weekKey} event, so re-submitting can only land on the
   *  same doc. weekKey is the member's LOCAL week (localWeekKey) —
   *  the server validates, never recomputes. */
  const setWeeklyFocus = useCallback(
    async (
      spaceId: string,
      weeklyFocus: WeeklyFocus | null
    ): Promise<WeeklyCheckInResult | null> => {
      try {
        const call = httpsCallable(fns(), "goalSpaceWeeklyCheckIn");
        const res = await call({
          spaceId,
          weekKey: localWeekKey(),
          weeklyFocus,
        });
        return res.data as WeeklyCheckInResult;
      } catch (err) {
        logger.error("goalSpaces: weekly check-in failed", err);
        return null;
      }
    },
    []
  );

  /** CIRCLE-TARGET-LIFECYCLE — owner resolves a Circle whose target
   *  date has passed. `continue` needs a future YYYY-MM-DD; `wrap`
   *  ends the Circle. Server-owned (the space doc is rules-locked), so
   *  on success we reload to pick up the authoritative new state. */
  const resolveTarget = useCallback(
    async (
      spaceId: string,
      action: "continue" | "wrap",
      newTargetDate?: string
    ): Promise<boolean> => {
      try {
        const call = httpsCallable(fns(), "resolveGoalSpaceTarget");
        await call({ spaceId, action, newTargetDate });
        await reload();
        return true;
      } catch (err) {
        logger.error("goalSpaces: resolveTarget failed", err);
        return false;
      }
    },
    [reload]
  );

  /** Back another member's weekly focus (bounded, idempotent). */
  const backCheckIn = useCallback(
    async (
      spaceId: string,
      eventId: string
    ): Promise<{ ok: boolean; alreadyBacked: boolean } | null> => {
      try {
        const call = httpsCallable(fns(), "backGoalSpaceCheckIn");
        const res = await call({ spaceId, eventId });
        return res.data as { ok: boolean; alreadyBacked: boolean };
      } catch (err) {
        logger.error("goalSpaces: back failed", err);
        return null;
      }
    },
    []
  );

  return {
    loading: uid !== undefined && circles === null,
    circles: circles ?? [],
    loadFailed,
    reload,
    createCircle,
    joinCircle,
    leaveCircle,
    loadDetail,
    publishEvent,
    setWeeklyFocus,
    backCheckIn,
    resolveTarget,
  };
}
