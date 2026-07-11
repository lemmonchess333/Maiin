/**
 * Goal Spaces client API (GOALS-CORE-01).
 *
 * ALL writes go through Cloud Function callables — membership, counters,
 * invites and events are server-owned, and firestore.rules deny every
 * direct client write to Circle collections (a browser cannot forge a
 * membership, count, invite or event). The client's only direct Firestore
 * access is READS: its own journeys, and spaces/members/events for
 * circles it belongs to.
 *
 * Callables (functions/goalSpaces.js): createGoalSpace,
 * createGoalSpaceInvite, joinGoalSpace, leaveGoalSpace,
 * removeGoalSpaceMember, publishGoalSpaceEvent.
 */
import { httpsCallable } from "firebase/functions";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  limit,
  type Unsubscribe,
} from "firebase/firestore";
import { db, functions } from "@/lib/firebase";
import { logger } from "@/lib/logger";
import type {
  GoalSpace,
  GoalSpaceEvent,
  GoalSpaceMember,
  GoalSpaceType,
  GoalSpaceEventKind,
  Journey,
} from "@/features/goalSpaces/goalSpaceModel";

/* ── Callables ──────────────────────────────────────────────────────── */

export async function createGoalSpace(input: {
  type: GoalSpaceType;
  title: string;
  why?: string;
  /** Display projection for the member doc (server cleans + bounds). */
  displayName?: string;
  photoURL?: string | null;
}): Promise<{ spaceId: string }> {
  const call = httpsCallable(functions, "createGoalSpace");
  const res = await call(input);
  return res.data as { spaceId: string };
}

export async function createGoalSpaceInvite(input: {
  spaceId: string;
}): Promise<{ code: string; expiresAtMs: number }> {
  const call = httpsCallable(functions, "createGoalSpaceInvite");
  const res = await call(input);
  return res.data as { code: string; expiresAtMs: number };
}

export async function joinGoalSpace(input: {
  code: string;
  displayName?: string;
  photoURL?: string | null;
}): Promise<{ spaceId: string; alreadyMember?: boolean }> {
  const call = httpsCallable(functions, "joinGoalSpace");
  const res = await call(input);
  return res.data as { spaceId: string; alreadyMember?: boolean };
}

export async function leaveGoalSpace(input: {
  spaceId: string;
}): Promise<void> {
  const call = httpsCallable(functions, "leaveGoalSpace");
  await call(input);
}

export async function removeGoalSpaceMember(input: {
  spaceId: string;
  memberUid: string;
}): Promise<void> {
  const call = httpsCallable(functions, "removeGoalSpaceMember");
  await call(input);
}

export async function publishGoalSpaceEvent(input: {
  spaceId: string;
  kind: GoalSpaceEventKind;
  note?: string;
  displayName?: string;
}): Promise<void> {
  const call = httpsCallable(functions, "publishGoalSpaceEvent");
  await call(input);
}

/* ── Read subscriptions (rules allow member/owner reads only) ───────── */

export function subscribeJourneys(
  uid: string,
  onData: (journeys: Journey[]) => void,
  onError?: () => void
): Unsubscribe {
  return onSnapshot(
    collection(db, "users", uid, "journeys"),
    (snap) => {
      const rows = snap.docs.map((d) => {
        const data = d.data() as Partial<Journey>;
        return {
          spaceId: d.id,
          type: (data.type ?? "hybrid") as Journey["type"],
          why: typeof data.why === "string" ? data.why : "",
          role: data.role === "owner" ? "owner" : "member",
          joinedAt: typeof data.joinedAt === "string" ? data.joinedAt : "",
        } satisfies Journey;
      });
      onData(rows);
    },
    (err) => {
      logger.warn("[goalSpaces] journeys subscription failed", err);
      onError?.();
    }
  );
}

export function subscribeGoalSpace(
  spaceId: string,
  onData: (space: GoalSpace | null) => void,
  onError?: () => void
): Unsubscribe {
  return onSnapshot(
    doc(db, "goalSpaces", spaceId),
    (snap) => {
      if (!snap.exists()) {
        onData(null);
        return;
      }
      const data = snap.data();
      onData({
        id: snap.id,
        type: data.type as GoalSpace["type"],
        title: typeof data.title === "string" ? data.title : "",
        visibility: data.visibility === "private" ? "private" : "invite_only",
        ownerId: typeof data.ownerId === "string" ? data.ownerId : "",
        memberCount:
          typeof data.memberCount === "number" ? data.memberCount : 0,
        maxMembers: typeof data.maxMembers === "number" ? data.maxMembers : 8,
        createdAt: typeof data.createdAt === "string" ? data.createdAt : "",
        active: data.active !== false,
      });
    },
    (err) => {
      logger.warn("[goalSpaces] space subscription failed", err);
      onError?.();
    }
  );
}

export function subscribeGoalSpaceMembers(
  spaceId: string,
  onData: (members: GoalSpaceMember[]) => void,
  onError?: () => void
): Unsubscribe {
  return onSnapshot(
    query(
      collection(db, "goalSpaces", spaceId, "members"),
      orderBy("joinedAt", "asc")
    ),
    (snap) => {
      onData(
        snap.docs.map((d) => {
          const data = d.data();
          return {
            uid: d.id,
            role: data.role === "owner" ? "owner" : "member",
            displayName:
              typeof data.displayName === "string" ? data.displayName : "",
            photoURL: typeof data.photoURL === "string" ? data.photoURL : null,
            joinedAt: typeof data.joinedAt === "string" ? data.joinedAt : "",
          } satisfies GoalSpaceMember;
        })
      );
    },
    (err) => {
      logger.warn("[goalSpaces] members subscription failed", err);
      onError?.();
    }
  );
}

/** Newest 30 events — a circle of ≤8 posting summary moments never needs
 *  pagination in v1. */
export function subscribeGoalSpaceEvents(
  spaceId: string,
  onData: (events: GoalSpaceEvent[]) => void,
  onError?: () => void
): Unsubscribe {
  return onSnapshot(
    query(
      collection(db, "goalSpaces", spaceId, "events"),
      orderBy("createdAt", "desc"),
      limit(30)
    ),
    (snap) => {
      onData(
        snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            kind: data.kind as GoalSpaceEvent["kind"],
            authorUid: typeof data.authorUid === "string" ? data.authorUid : "",
            authorName:
              typeof data.authorName === "string" ? data.authorName : "",
            note: typeof data.note === "string" ? data.note : "",
            createdAt: typeof data.createdAt === "string" ? data.createdAt : "",
          } satisfies GoalSpaceEvent;
        })
      );
    },
    (err) => {
      logger.warn("[goalSpaces] events subscription failed", err);
      onError?.();
    }
  );
}
