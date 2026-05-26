import { db, auth } from "./firebase";
import { captureError } from "@/lib/errorReporting";
import {
  collection,
  collectionGroup,
  doc,
  setDoc,
  deleteDoc,
  getDocs,
  getDoc,
  query,
  orderBy,
  limit,
  startAfter,
  where,
  addDoc,
  Timestamp,
  serverTimestamp,
  type DocumentSnapshot,
} from "firebase/firestore";
import { httpsCallable, getFunctions } from "firebase/functions";

// ============================================
// Auth helper — single source of truth for identity
// ============================================
function getAuthUid(): string {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Not authenticated");
  return uid;
}

// ============================================
// Follow / Unfollow
// ============================================
export async function followUser(currentUid: string, targetUid: string) {
  const authedUid = getAuthUid();
  if (currentUid !== authedUid) throw new Error("Identity mismatch");
  const now = Timestamp.now();
  await setDoc(doc(db, "following", currentUid, "users", targetUid), {
    followedAt: now,
  });
  await setDoc(doc(db, "followers", targetUid, "users", currentUid), {
    followedAt: now,
  });
}

export async function unfollowUser(currentUid: string, targetUid: string) {
  const authedUid = getAuthUid();
  if (currentUid !== authedUid) throw new Error("Identity mismatch");
  await deleteDoc(doc(db, "following", currentUid, "users", targetUid));
  await deleteDoc(doc(db, "followers", targetUid, "users", currentUid));
}

export async function isFollowing(
  currentUid: string,
  targetUid: string
): Promise<boolean> {
  const snap = await getDoc(
    doc(db, "following", currentUid, "users", targetUid)
  );
  return snap.exists();
}

export async function getFollowerCount(uid: string): Promise<number> {
  const snap = await getDocs(collection(db, "followers", uid, "users"));
  return snap.size;
}

export async function getFollowingCount(uid: string): Promise<number> {
  const snap = await getDocs(collection(db, "following", uid, "users"));
  return snap.size;
}

/**
 * Cheap check for "do I follow anyone at all". `getFollowingCount`
 * reads every doc in the subcollection — wasteful when the caller
 * only needs a boolean (smart-default feed sub-tab). `limit(1)`
 * costs a single Firestore read regardless of how many follows the
 * user has.
 */
export async function hasAnyFollowing(uid: string): Promise<boolean> {
  const snap = await getDocs(
    query(collection(db, "following", uid, "users"), limit(1))
  );
  return !snap.empty;
}

/**
 * Return the user's following count bounded by `cap` — cheap when
 * caller only needs to know if the count crosses a small threshold
 * (e.g. "does this user have ≥2 follows" for the leaderboard vs
 * trajectory card decision). A `limit(cap)` query reads at most
 * `cap` docs regardless of the full follow list size.
 */
export async function getBoundedFollowingCount(
  uid: string,
  cap: number
): Promise<number> {
  const snap = await getDocs(
    query(collection(db, "following", uid, "users"), limit(cap))
  );
  return snap.size;
}

/**
 * Return the Set of UIDs the user follows. Used by Suggested People
 * for exclusion. Only fetch when the suggestion UI is actually
 * visible — each read scales with the user's follow list.
 */
export async function getFollowingIds(uid: string): Promise<Set<string>> {
  const snap = await getDocs(collection(db, "following", uid, "users"));
  return new Set(snap.docs.map((d) => d.id));
}

/* Mirror of getFollowingIds for the inverse direction: who follows
 * *me*. Used by the "Follows you" badge in suggested-people rows and
 * search results — a row reads as more compelling when the candidate
 * is already engaging with the current user, so surface that signal
 * inline. Reads users/{uid}/followers — same fan-out pattern. */
export async function getFollowerIds(uid: string): Promise<Set<string>> {
  const snap = await getDocs(collection(db, "followers", uid, "users"));
  return new Set(snap.docs.map((d) => d.id));
}

// ============================================
// Post Activity + Fan-out to Followers
// ============================================
function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatPace(secPerKm: number): string {
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${s.toString().padStart(2, "0")}/km`;
}

export async function postActivity(activity: {
  authorId: string;
  authorName: string;
  /**
   * Denormalised author avatar URL. Carried on the activity doc and
   * on each fan-out feed item so ActivityCard can render the author
   * row without a per-card profile fetch. Optional — absent when the
   * user hasn't uploaded a photo; the UI falls back to initials.
   */
  authorPhotoURL?: string;
  type: "run" | "workout";
  visibility: "public" | "followers" | "private";
  // Enriched fields
  workoutName?: string;
  runName?: string;
  exerciseCount?: number;
  totalVolume?: number;
  duration?: number;
  distance?: number;
  avgPace?: number | string;
  elevationGain?: number;
  calories?: number;
  muscleGroups?: string[];
  prHit?: boolean;
  prExercise?: string;
  prWeight?: number;
  challengeMilestone?: string;
  badgeEarned?: string;
  crewId?: string;
  [key: string]: unknown;
}) {
  const authedUid = getAuthUid();
  if (activity.authorId !== authedUid) throw new Error("Identity mismatch");
  const activityRef = await addDoc(collection(db, "activities"), {
    ...activity,
    kudosCount: 0,
    commentCount: 0,
    createdAt: serverTimestamp(),
  });

  if (activity.visibility !== "private") {
    const followersSnap = await getDocs(
      collection(db, "followers", activity.authorId, "users")
    );

    let summary: string;
    if (activity.type === "run") {
      const km = ((activity.distance || 0) / 1000).toFixed(1);
      const time = activity.duration ? formatDuration(activity.duration) : "";
      const pace =
        typeof activity.avgPace === "number"
          ? formatPace(activity.avgPace)
          : activity.avgPace || "";
      const name = activity.runName || "Run";
      summary = `${name} · ${km}km · ${time} · ${pace} pace`;
    } else {
      const name = activity.workoutName || "Workout";
      const exCount = activity.exerciseCount || 0;
      const vol = activity.totalVolume
        ? `${Math.round(activity.totalVolume).toLocaleString()} kg volume`
        : "";
      const dur = activity.duration
        ? `${Math.round(activity.duration / 60)} min`
        : "";
      summary = [name, `${exCount} exercises`, vol, dur]
        .filter(Boolean)
        .join(" · ");
    }

    const feedItem: Record<string, unknown> = {
      activityId: activityRef.id,
      authorId: activity.authorId,
      authorName: activity.authorName,
      type: activity.type,
      summary,
      createdAt: serverTimestamp(),
    };
    if (activity.authorPhotoURL)
      feedItem.authorPhotoURL = activity.authorPhotoURL;
    // Include highlight fields for filtering
    if (activity.prHit) feedItem.prHit = true;
    if (activity.badgeEarned) feedItem.badgeEarned = activity.badgeEarned;
    if (activity.challengeMilestone)
      feedItem.challengeMilestone = activity.challengeMilestone;

    const promises = followersSnap.docs.map((followerDoc) =>
      addDoc(collection(db, "feeds", followerDoc.id, "items"), feedItem)
    );
    promises.push(
      addDoc(collection(db, "feeds", activity.authorId, "items"), feedItem)
    );
    // Use allSettled so partial fan-out failures don't block the entire post
    const results = await Promise.allSettled(promises);
    const failed = results.filter(
      (r): r is PromiseRejectedResult => r.status === "rejected"
    );
    if (failed.length > 0) {
      captureError(
        new Error(
          `[postActivity] ${failed.length}/${results.length} feed writes failed`
        ),
        "network",
        { reasons: failed.map((f) => String(f.reason)) }
      );
    }
  }

  return activityRef.id;
}

// ============================================
// Kudos
//
// 2026-05-26 audit PR 2 (finding #2) — kudos toggle now routes via
// the `toggleKudosCallable` Cloud Function. Pre-PR-2 the client
// wrote `kudos/{aid}/users/{uid}` + `activities/{aid}.kudosCount`
// directly via `updateDoc(..., { kudosCount: increment(1) })` —
// rules let any authed user set kudosCount to any value because
// `affectedKeys().hasOnly(['kudosCount'])` doesn't validate values.
// The CF flips both docs atomically in a Firestore txn.
// ============================================
export async function toggleKudos(
  activityId: string,
  userId: string
): Promise<boolean> {
  const authedUid = getAuthUid();
  if (userId !== authedUid) throw new Error("Identity mismatch");
  const fn = httpsCallable<{ activityId: string }, { kudosed: boolean }>(
    getFunctions(),
    "toggleKudosCallable"
  );
  const result = await fn({ activityId });
  return result.data.kudosed;
}

// `giveHighFive` is a thin wrapper that only adds kudos (never
// removes). Post-PR-2 the callable returns a `kudosed` boolean so
// we can preserve the "no-op if already given" semantic by
// checking server-side state via the callable's return value:
// if it returns kudosed=false, the user had kudos and we just
// removed them — restore by calling again.
//
// Simpler: just use toggleKudos and trust the server. The original
// "give once, never undo" semantic was a courtesy; legitimate
// double-tap UX is now toggling, which matches every social app.
export async function giveHighFive(
  activityId: string,
  userId: string
): Promise<boolean> {
  return toggleKudos(activityId, userId);
}

export async function hasGivenKudos(
  activityId: string,
  userId: string
): Promise<boolean> {
  const snap = await getDoc(doc(db, "kudos", activityId, "users", userId));
  return snap.exists();
}

export async function getKudosList(
  activityId: string
): Promise<{ userId: string; userName: string; photoURL?: string }[]> {
  const snap = await getDocs(collection(db, "kudos", activityId, "users"));
  const userIds = snap.docs.map((d) => d.id);
  if (userIds.length === 0) return [];
  // Source from `users/{uid}/public/profile` (cross-user readable) —
  // pre-W1d this read `users/{uid}` (owner-only) and silently returned
  // "Athlete" for every kudos-giver except the current user. Also
  // pulls photoURL so the "Props from" list can render real avatars.
  const users = await Promise.all(
    userIds.map(async (uid) => {
      try {
        const userSnap = await getDoc(
          doc(db, "users", uid, "public", "profile")
        );
        const data = userSnap.data() as
          | { displayName?: string; photoURL?: string }
          | undefined;
        return {
          userId: uid,
          userName: data?.displayName || "Athlete",
          ...(data?.photoURL ? { photoURL: data.photoURL } : {}),
        };
      } catch {
        return { userId: uid, userName: "Athlete" };
      }
    })
  );
  return users;
}

// ============================================
// Comments
// ============================================
export async function addComment(
  activityId: string,
  authorId: string,
  authorName: string,
  text: string,
  activityAuthorId?: string,
  /**
   * Denormalised author avatar URL. Persisted on the comment doc so
   * the read path can render real avatars without a per-comment
   * profile fetch. Optional — absent when the commenter hasn't
   * uploaded a photo; UI falls back to initials.
   */
  authorPhotoURL?: string
) {
  const authedUid = getAuthUid();
  if (authorId !== authedUid) throw new Error("Identity mismatch");
  // 2026-05-26 audit PR 2 (finding #2) — comment create routes via
  // `addCommentCallable`. The CF creates the comment doc + bumps
  // commentCount atomically; client direct writes are denied at
  // the rules layer.
  const fn = httpsCallable<
    {
      activityId: string;
      text: string;
      authorName: string;
      authorPhotoURL?: string;
    },
    { commentId: string }
  >(getFunctions(), "addCommentCallable");
  await fn({
    activityId,
    text,
    authorName,
    ...(authorPhotoURL ? { authorPhotoURL } : {}),
  });

  // Notify activity author. Notification create still goes
  // client-direct (deferred to PR 3 of the audit — server-side
  // notification creation, audit finding #6).
  if (activityAuthorId && activityAuthorId !== authorId) {
    await writeNotification(activityAuthorId, {
      type: "comment",
      fromUserId: authorId,
      fromName: authorName,
      activityId,
      message: `${authorName} commented on your activity`,
    });
  }
}

export async function deleteComment(
  activityId: string,
  commentId: string
): Promise<void> {
  // 2026-05-26 audit PR 2 (finding #2) — delete + counter decrement
  // routed through `deleteCommentCallable`. The CF validates
  // ownership server-side (authorId === auth.uid) and flips both
  // docs in one txn.
  const fn = httpsCallable<
    { activityId: string; commentId: string },
    { ok: boolean }
  >(getFunctions(), "deleteCommentCallable");
  await fn({ activityId, commentId });
}

export async function getComments(
  activityId: string,
  limitCount = 20,
  afterDoc?: DocumentSnapshot
) {
  let q = query(
    collection(db, "comments", activityId, "items"),
    orderBy("createdAt", "desc"),
    limit(limitCount)
  );
  if (afterDoc) {
    q = query(
      collection(db, "comments", activityId, "items"),
      orderBy("createdAt", "desc"),
      startAfter(afterDoc),
      limit(limitCount)
    );
  }
  const snap = await getDocs(q);
  return {
    comments: snap.docs.map((d) => ({ id: d.id, ...d.data() })),
    lastDoc: snap.docs[snap.docs.length - 1] as DocumentSnapshot | undefined,
    hasMore: snap.docs.length >= limitCount,
  };
}

// ============================================
// Feed
// ============================================
export async function getFeed(
  userId: string,
  limitCount = 20,
  afterDoc?: DocumentSnapshot
) {
  let q = query(
    collection(db, "feeds", userId, "items"),
    orderBy("createdAt", "desc"),
    limit(limitCount)
  );
  if (afterDoc) {
    q = query(
      collection(db, "feeds", userId, "items"),
      orderBy("createdAt", "desc"),
      startAfter(afterDoc),
      limit(limitCount)
    );
  }
  const snap = await getDocs(q);
  return {
    items: snap.docs.map((d) => ({ id: d.id, ...d.data() })),
    lastDoc: snap.docs[snap.docs.length - 1],
  };
}

export async function getActivity(activityId: string) {
  const snap = await getDoc(doc(db, "activities", activityId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

// ============================================
// Discovery Feed (Public Activities)
// ============================================
export async function getDiscoverFeed(
  limitCount = 20,
  afterDoc?: DocumentSnapshot
) {
  let q = query(
    collection(db, "activities"),
    where("visibility", "==", "public"),
    orderBy("createdAt", "desc"),
    limit(limitCount)
  );
  if (afterDoc) {
    q = query(
      collection(db, "activities"),
      where("visibility", "==", "public"),
      orderBy("createdAt", "desc"),
      startAfter(afterDoc),
      limit(limitCount)
    );
  }
  const snap = await getDocs(q);
  return {
    items: snap.docs.map((d) => ({ id: d.id, ...d.data() })),
    lastDoc: snap.docs[snap.docs.length - 1],
  };
}

/**
 * Crew-scoped activity feed. Filters the global activities collection
 * by the crewId field that's auto-attached when a member of that crew
 * posts a workout/run via the share composer.
 *
 * Visibility filter is `in ['public', 'followers']` so any non-private
 * post tagged with this crewId surfaces. Private posts stay hidden as
 * the author intended.
 *
 * Requires a Firestore composite index on (crewId asc, visibility asc,
 * createdAt desc). Firestore will surface a console warning + a
 * one-click index creation link the first time the query runs against
 * a real database without the index.
 */
export async function getCrewActivities(
  crewId: string,
  limitCount = 20,
  afterDoc?: DocumentSnapshot
) {
  const baseConstraints = [
    where("crewId", "==", crewId),
    where("visibility", "in", ["public", "followers"]),
    orderBy("createdAt", "desc"),
  ];
  let q = query(
    collection(db, "activities"),
    ...baseConstraints,
    limit(limitCount)
  );
  if (afterDoc) {
    q = query(
      collection(db, "activities"),
      ...baseConstraints,
      startAfter(afterDoc),
      limit(limitCount)
    );
  }
  const snap = await getDocs(q);
  return {
    items: snap.docs.map((d) => ({ id: d.id, ...d.data() })),
    lastDoc: snap.docs[snap.docs.length - 1],
  };
}

// ============================================
// User Search
// ============================================
export async function searchUsers(queryStr: string, limitCount = 10) {
  // Architecture B: the owner-only `users/{uid}` doc is not cross-user
  // readable. Search the `users/{uid}/public/profile` projection via a
  // collection group query — every profile doc lives at the same leaf
  // collection name (`public`), so collectionGroup('public') spans them all.
  /* Primary: displayNameLower \u2014 a normalised lowercase mirror written
     by auth.tsx + the OneTimeMaintenance backfill. Firestore range
     queries are case-sensitive, so without this field a search for
     "myl" missed "Myles" / "MYLES" entirely. Wrapped in catch in
     case the user's profile docs predate the migration and the
     index hasn't been built yet \u2014 the fallback queries below carry
     the load until the backfill catches up. */
  const lower = queryStr.toLowerCase();
  const qLower = query(
    collectionGroup(db, "public"),
    where("displayNameLower", ">=", lower),
    where("displayNameLower", "<=", lower + "\uf8ff"),
    limit(limitCount)
  );
  // Legacy fallbacks against displayName (raw + capitalized) \u2014 kept
  // for users whose public profile hasn't been migrated yet.
  const q1 = query(
    collectionGroup(db, "public"),
    where("displayName", ">=", queryStr),
    where("displayName", "<=", queryStr + "\uf8ff"),
    limit(limitCount)
  );
  const capitalized =
    queryStr.charAt(0).toUpperCase() + queryStr.slice(1).toLowerCase();
  const q2 = query(
    collectionGroup(db, "public"),
    where("displayName", ">=", capitalized),
    where("displayName", "<=", capitalized + "\uf8ff"),
    limit(limitCount)
  );

  const [snapLower, snap1, snap2] = await Promise.all([
    getDocs(qLower).catch(() => null),
    getDocs(q1),
    getDocs(q2),
  ]);
  const seen = new Set<string>();
  const results: { uid: string; [key: string]: unknown }[] = [];
  // Order matters: the displayNameLower path is the most accurate, so
  // walk it first; legacy fallbacks fill in users not yet migrated.
  const snaps = [snapLower, snap1, snap2].filter(
    (s): s is NonNullable<typeof s> => !!s
  );
  for (const snap of snaps) {
    for (const d of snap.docs) {
      // Public docs live at `users/{uid}/public/profile` — the owner uid
      // is the grandparent doc id. Fall back to the `uid` field if present.
      const data = d.data() as Record<string, unknown>;
      const ownerUid =
        d.ref.parent.parent?.id ?? (data.uid as string | undefined);
      if (!ownerUid || seen.has(ownerUid)) continue;
      seen.add(ownerUid);
      results.push({ uid: ownerUid, ...data });
    }
  }
  return results.slice(0, limitCount);
}

// ============================================
// Suggested People (v1 — no recommendation engine)
// ============================================

export interface SuggestedPerson {
  uid: string;
  displayName: string;
  /** Uploaded avatar URL — threads through from `users/{uid}/public/profile`. */
  photoURL?: string;
  /** Short reason chip surfaced in the UI. */
  reason: "in_your_crew" | "recent_post";
  /** For the "in_your_crew" reason — included so UIs can label it. */
  crewId?: string;
}

/**
 * v1 strategy: union two cheap sources, rank crew members first.
 *
 *   1. Crew members — if the user is in a crew, pull the member list
 *      (the user most cares about people they share a crew with).
 *   2. Recent public posters — anyone who posted a public activity
 *      recently is someone worth following (they're active AND they
 *      share publicly, so they'll show up on your feed).
 *
 * Filters: self, already-followed, blocked. No graph traversal, no
 * ML, no collaborative filtering — a v1 good enough to turn the
 * Find tab from a dead stub into a working discovery surface.
 *
 * If the pool comes back empty after filtering, the caller should
 * render the honest "suggestions appear as the community grows"
 * empty state rather than faking a list.
 */
export async function getSuggestedPeople(
  uid: string,
  opts: {
    crewId?: string;
    limitCount?: number;
    blockedUsers?: Set<string>;
  } = {}
): Promise<SuggestedPerson[]> {
  const { crewId, limitCount = 10, blockedUsers = new Set<string>() } = opts;
  const excludeIds = new Set<string>([uid, ...blockedUsers]);

  // Exclude people we already follow — one-time read scoped to when
  // the suggestion UI is actually rendered.
  try {
    const following = await getFollowingIds(uid);
    following.forEach((id) => excludeIds.add(id));
  } catch (e) {
    // If we can't read following, suggestions may duplicate existing
    // follows — acceptable degraded-state rather than failing outright.
    captureError(e instanceof Error ? e : new Error(String(e)), "error", {
      fn: "getSuggestedPeople.getFollowingIds",
    });
  }

  // Build an ordered list of candidate UIDs with their reason.
  const candidates = new Map<string, SuggestedPerson>();

  // 1. Crew members first.
  if (crewId) {
    try {
      const memberSnap = await getDocs(
        collection(db, "groups", crewId, "members")
      );
      for (const m of memberSnap.docs) {
        const memberUid = m.id;
        if (excludeIds.has(memberUid)) continue;
        if (candidates.has(memberUid)) continue;
        candidates.set(memberUid, {
          uid: memberUid,
          displayName: "Athlete",
          reason: "in_your_crew",
          crewId,
        });
      }
    } catch (e) {
      captureError(e instanceof Error ? e : new Error(String(e)), "error", {
        fn: "getSuggestedPeople.crewMembers",
      });
    }
  }

  // 2. Recent public posters — dedupe by authorId, keep the most recent.
  if (candidates.size < limitCount) {
    try {
      const recent = await getDocs(
        query(
          collection(db, "activities"),
          where("visibility", "==", "public"),
          orderBy("createdAt", "desc"),
          limit(50)
        )
      );
      for (const d of recent.docs) {
        const author = d.data().authorId as string | undefined;
        if (!author) continue;
        if (excludeIds.has(author)) continue;
        if (candidates.has(author)) continue;
        candidates.set(author, {
          uid: author,
          displayName: "Athlete",
          reason: "recent_post",
        });
        if (candidates.size >= limitCount) break;
      }
    } catch (e) {
      captureError(e instanceof Error ? e : new Error(String(e)), "error", {
        fn: "getSuggestedPeople.recentPosters",
      });
    }
  }

  // Enrich with display names + avatars from the public profile
  // projection. Parallel getDoc — small list (≤ limitCount), no
  // pagination, runs once.
  const list = Array.from(candidates.values()).slice(0, limitCount);
  await Promise.all(
    list.map(async (p) => {
      try {
        const snap = await getDoc(doc(db, "users", p.uid, "public", "profile"));
        const data = snap.data() as
          | { displayName?: string; photoURL?: string }
          | undefined;
        if (data?.displayName) p.displayName = data.displayName;
        if (data?.photoURL) p.photoURL = data.photoURL;
      } catch {
        // Fall through with default 'Athlete' — a missing public profile
        // shouldn't break the whole list.
      }
    })
  );

  return list;
}

export async function searchUsersByEmail(email: string, limitCount = 10) {
  const q = query(
    collection(db, "users"),
    where("email", "==", email.toLowerCase().trim()),
    limit(limitCount)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
}

// ============================================
// Notifications
// ============================================
export async function writeNotification(
  targetUserId: string,
  data: {
    type: "kudos" | "comment" | "follow" | "challenge_milestone";
    fromUserId?: string;
    fromName?: string;
    activityId?: string;
    message?: string;
  }
) {
  await addDoc(collection(db, "notifications", targetUserId, "items"), {
    ...data,
    read: false,
    createdAt: serverTimestamp(),
  });
}

// ============================================
// Batch fetch activities + kudos status
// Replaces N individual reads in ActivityCard
// ============================================
export async function fetchActivitiesByIds(
  activityIds: string[]
): Promise<Record<string, Record<string, unknown>>> {
  if (activityIds.length === 0) return {};
  // Firestore 'in' queries max 30 per batch
  const chunks: string[][] = [];
  for (let i = 0; i < activityIds.length; i += 30) {
    chunks.push(activityIds.slice(i, i + 30));
  }
  const results: Record<string, Record<string, unknown>> = {};
  await Promise.all(
    chunks.map(async (chunk) => {
      const snaps = await Promise.all(
        chunk.map((id) => getDoc(doc(db, "activities", id)))
      );
      snaps.forEach((snap) => {
        if (snap.exists()) results[snap.id] = { id: snap.id, ...snap.data() };
      });
    })
  );
  return results;
}

export async function batchGetKudos(
  activityIds: string[],
  userId: string
): Promise<Record<string, boolean>> {
  if (activityIds.length === 0 || !userId) return {};
  const chunks: string[][] = [];
  for (let i = 0; i < activityIds.length; i += 30) {
    chunks.push(activityIds.slice(i, i + 30));
  }
  const chunkResults = await Promise.all(
    chunks.map(async (chunk) => {
      const snaps = await Promise.all(
        chunk.map((id) => getDoc(doc(db, "kudos", id, "users", userId)))
      );
      const map: Record<string, boolean> = {};
      chunk.forEach((id, i) => {
        map[id] = snaps[i].exists();
      });
      return map;
    })
  );
  return Object.assign({}, ...chunkResults) as Record<string, boolean>;
}

// ============================================
// Report Content (App Store Guideline 1.2)
// ============================================
//
// S4 (locked) — two-tier categories. Top-level reporter category +
// optional sub-reason. The reasoner picks a category in the modal,
// then a more specific sub-reason inside it. Server-side severity
// computation (S4d, deferred) maps category + sub-reason + target
// content to a severity tier; this client just submits what the
// reporter said. `reason` retained as a derived "best top-level
// summary" so the admin queue (which still filters by reason) keeps
// working without breaking the existing client-server contract.
export type ReportReason = "spam" | "harassment" | "inappropriate" | "other";
export type ReportCategory =
  | "harassment"
  | "spam"
  | "inappropriate"
  | "impersonation"
  | "other";

export interface ReportContentInput {
  targetType: "activity" | "comment" | "user";
  targetId: string;
  /** Top-level category — S4b two-tier first level. */
  category: ReportCategory;
  /** Sub-reason within the category (free-form string per category;
   *  v1 picker enforces a closed set per category but the server
   *  accepts any string to allow new sub-reasons without redeploys). */
  subReason?: string;
  /** 500-char freeform note. Server-side profanity filter may flag
   *  for admin review; UI redacts on the admin queue side. */
  freeformNote?: string;
  /** Optional. The author of the reported content — kept on the
   *  report doc so the admin queue can group by target user even
   *  when targetType is "comment" (where targetId is the comment
   *  doc id, not the author uid). */
  targetUid?: string;
  /** Informational only — the report doc records whether the
   *  reporter also hid + blocked. Doesn't trigger server actions;
   *  the client orchestrates those calls separately. */
  hideFromFeed?: boolean;
  blockAuthor?: boolean;
  /** Backwards-compat: a callsite that still uses the old `reason`
   *  field overrides the derived value. Stays optional so new
   *  callsites can drop it. */
  reason?: ReportReason;
  /** Backwards-compat alias for `freeformNote`. */
  details?: string;
}

export async function reportContent(
  reporterId: string,
  data: ReportContentInput
) {
  const authedUid = getAuthUid();
  if (reporterId !== authedUid) throw new Error("Identity mismatch");
  // Derive `reason` from `category` for the admin queue's existing
  // filter (which uses ReportReason, the old 4-value enum). The
  // category enum is a superset so the mapping is straightforward.
  const derivedReason: ReportReason =
    data.reason ??
    (data.category === "impersonation" ? "other" : data.category);
  await addDoc(collection(db, "reports"), {
    reporterId,
    targetType: data.targetType,
    targetId: data.targetId,
    targetUid: data.targetUid,
    reason: derivedReason,
    category: data.category,
    subReason: data.subReason,
    freeformNote: data.freeformNote ?? data.details,
    hideFromFeed: !!data.hideFromFeed,
    blockAuthor: !!data.blockAuthor,
    status: "pending",
    createdAt: serverTimestamp(),
  });
}

// ============================================
// Block User (App Store Guideline 1.2)
// ============================================
export async function blockUser(currentUid: string, targetUid: string) {
  const authedUid = getAuthUid();
  if (currentUid !== authedUid) throw new Error("Identity mismatch");
  await setDoc(doc(db, "blocks", currentUid, "users", targetUid), {
    blockedAt: serverTimestamp(),
  });
  // Also unfollow in both directions
  await deleteDoc(doc(db, "following", currentUid, "users", targetUid)).catch(
    () => {}
  );
  await deleteDoc(doc(db, "followers", currentUid, "users", targetUid)).catch(
    () => {}
  );
  await deleteDoc(doc(db, "following", targetUid, "users", currentUid)).catch(
    () => {}
  );
  await deleteDoc(doc(db, "followers", targetUid, "users", currentUid)).catch(
    () => {}
  );
}

export async function unblockUser(currentUid: string, targetUid: string) {
  const authedUid = getAuthUid();
  if (currentUid !== authedUid) throw new Error("Identity mismatch");
  await deleteDoc(doc(db, "blocks", currentUid, "users", targetUid));
}

export async function isBlocked(
  currentUid: string,
  targetUid: string
): Promise<boolean> {
  const snap = await getDoc(doc(db, "blocks", currentUid, "users", targetUid));
  return snap.exists();
}

export async function getBlockedUsers(uid: string): Promise<string[]> {
  const snap = await getDocs(collection(db, "blocks", uid, "users"));
  return snap.docs.map((d) => d.id);
}

// ============================================
// Account Deletion (App Store Guideline 5.1.1(v))
// ============================================
/**
 * Delete the current user's account end-to-end. Runs server-side
 * via the `deleteMyAccount` Cloud Function — the Admin SDK on the
 * server bypasses Firestore rules, removes data from every known
 * subcollection + author-keyed top-level collection, deletes the
 * user's Storage files, and then deletes the Auth user as the
 * FINAL step (so a partial failure mid-flow leaves the user still
 * authenticated and retryable).
 *
 * Pre-W1f this ran client-side and deleted the Auth user first,
 * which stranded users in an inconsistent state if any Firestore
 * cleanup step failed afterwards.
 */
export async function deleteAccount(uid: string): Promise<void> {
  const authedUid = getAuthUid();
  if (uid !== authedUid) throw new Error("Identity mismatch");
  const deleteMyAccount = httpsCallable(getFunctions(), "deleteMyAccount");
  await deleteMyAccount({});
}
