import { db, auth } from './firebase';
import { captureError } from '@/lib/errorReporting';
import {
  collection, collectionGroup, doc, setDoc, deleteDoc, getDocs, getDoc,
  query, orderBy, limit, startAfter, where, increment,
  updateDoc, addDoc, Timestamp, serverTimestamp,
  type DocumentSnapshot, writeBatch,
} from 'firebase/firestore';
import { deleteUser as firebaseDeleteUser } from 'firebase/auth';

// ============================================
// Auth helper — single source of truth for identity
// ============================================
function getAuthUid(): string {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Not authenticated');
  return uid;
}

// ============================================
// Follow / Unfollow
// ============================================
export async function followUser(currentUid: string, targetUid: string) {
  const authedUid = getAuthUid();
  if (currentUid !== authedUid) throw new Error('Identity mismatch');
  const now = Timestamp.now();
  await setDoc(doc(db, 'following', currentUid, 'users', targetUid), { followedAt: now });
  await setDoc(doc(db, 'followers', targetUid, 'users', currentUid), { followedAt: now });
}

export async function unfollowUser(currentUid: string, targetUid: string) {
  const authedUid = getAuthUid();
  if (currentUid !== authedUid) throw new Error('Identity mismatch');
  await deleteDoc(doc(db, 'following', currentUid, 'users', targetUid));
  await deleteDoc(doc(db, 'followers', targetUid, 'users', currentUid));
}

export async function isFollowing(currentUid: string, targetUid: string): Promise<boolean> {
  const snap = await getDoc(doc(db, 'following', currentUid, 'users', targetUid));
  return snap.exists();
}

export async function getFollowerCount(uid: string): Promise<number> {
  const snap = await getDocs(collection(db, 'followers', uid, 'users'));
  return snap.size;
}

export async function getFollowingCount(uid: string): Promise<number> {
  const snap = await getDocs(collection(db, 'following', uid, 'users'));
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
  const snap = await getDocs(query(collection(db, 'following', uid, 'users'), limit(1)));
  return !snap.empty;
}

/**
 * Return the Set of UIDs the user follows. Used by Suggested People
 * for exclusion. Only fetch when the suggestion UI is actually
 * visible — each read scales with the user's follow list.
 */
export async function getFollowingIds(uid: string): Promise<Set<string>> {
  const snap = await getDocs(collection(db, 'following', uid, 'users'));
  return new Set(snap.docs.map((d) => d.id));
}

// ============================================
// Post Activity + Fan-out to Followers
// ============================================
function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatPace(secPerKm: number): string {
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${s.toString().padStart(2, '0')}/km`;
}

export async function postActivity(activity: {
  authorId: string;
  authorName: string;
  type: 'run' | 'workout';
  visibility: 'public' | 'followers' | 'private';
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
  if (activity.authorId !== authedUid) throw new Error('Identity mismatch');
  const activityRef = await addDoc(collection(db, 'activities'), {
    ...activity,
    kudosCount: 0,
    commentCount: 0,
    createdAt: serverTimestamp(),
  });

  if (activity.visibility !== 'private') {
    const followersSnap = await getDocs(collection(db, 'followers', activity.authorId, 'users'));

    let summary: string;
    if (activity.type === 'run') {
      const km = ((activity.distance || 0) / 1000).toFixed(1);
      const time = activity.duration ? formatDuration(activity.duration) : '';
      const pace = typeof activity.avgPace === 'number'
        ? formatPace(activity.avgPace)
        : activity.avgPace || '';
      const name = activity.runName || 'Run';
      summary = `${name} · ${km}km · ${time} · ${pace} pace`;
    } else {
      const name = activity.workoutName || 'Workout';
      const exCount = activity.exerciseCount || 0;
      const vol = activity.totalVolume
        ? `${Math.round(activity.totalVolume).toLocaleString()} kg volume`
        : '';
      const dur = activity.duration
        ? `${Math.round(activity.duration / 60)} min`
        : '';
      summary = [name, `${exCount} exercises`, vol, dur].filter(Boolean).join(' · ');
    }

    const feedItem: Record<string, unknown> = {
      activityId: activityRef.id,
      authorId: activity.authorId,
      authorName: activity.authorName,
      type: activity.type,
      summary,
      createdAt: serverTimestamp(),
    };
    // Include highlight fields for filtering
    if (activity.prHit) feedItem.prHit = true;
    if (activity.badgeEarned) feedItem.badgeEarned = activity.badgeEarned;
    if (activity.challengeMilestone) feedItem.challengeMilestone = activity.challengeMilestone;

    const promises = followersSnap.docs.map(followerDoc =>
      addDoc(collection(db, 'feeds', followerDoc.id, 'items'), feedItem)
    );
    promises.push(addDoc(collection(db, 'feeds', activity.authorId, 'items'), feedItem));
    // Use allSettled so partial fan-out failures don't block the entire post
    const results = await Promise.allSettled(promises);
    const failed = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    if (failed.length > 0) {
      captureError(
        new Error(`[postActivity] ${failed.length}/${results.length} feed writes failed`),
        'network',
        { reasons: failed.map(f => String(f.reason)) },
      );
    }
  }

  return activityRef.id;
}

// ============================================
// Kudos
// ============================================
export async function toggleKudos(activityId: string, userId: string): Promise<boolean> {
  const authedUid = getAuthUid();
  if (userId !== authedUid) throw new Error('Identity mismatch');
  const kudosRef = doc(db, 'kudos', activityId, 'users', userId);
  const snap = await getDoc(kudosRef);

  if (snap.exists()) {
    await deleteDoc(kudosRef);
    await updateDoc(doc(db, 'activities', activityId), { kudosCount: increment(-1) });
    return false;
  } else {
    await setDoc(kudosRef, { createdAt: Timestamp.now() });
    await updateDoc(doc(db, 'activities', activityId), { kudosCount: increment(1) });
    return true;
  }
}

export async function giveHighFive(activityId: string, userId: string): Promise<boolean> {
  const authedUid = getAuthUid();
  if (userId !== authedUid) throw new Error('Identity mismatch');
  const kudosRef = doc(db, 'kudos', activityId, 'users', userId);
  const snap = await getDoc(kudosRef);
  if (snap.exists()) return false; // already given, no-op
  await setDoc(kudosRef, { createdAt: Timestamp.now() });
  await updateDoc(doc(db, 'activities', activityId), { kudosCount: increment(1) });
  return true;
}

export async function hasGivenKudos(activityId: string, userId: string): Promise<boolean> {
  const snap = await getDoc(doc(db, 'kudos', activityId, 'users', userId));
  return snap.exists();
}

export async function getKudosList(activityId: string): Promise<{ userId: string; userName: string }[]> {
  const snap = await getDocs(collection(db, 'kudos', activityId, 'users'));
  const userIds = snap.docs.map(d => d.id);
  if (userIds.length === 0) return [];
  const users = await Promise.all(
    userIds.map(async uid => {
      const userSnap = await getDoc(doc(db, 'users', uid));
      return { userId: uid, userName: userSnap.exists() ? (userSnap.data().displayName || 'Athlete') : 'Athlete' };
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
) {
  const authedUid = getAuthUid();
  if (authorId !== authedUid) throw new Error('Identity mismatch');
  await addDoc(collection(db, 'comments', activityId, 'items'), {
    authorId, authorName, text, createdAt: serverTimestamp(),
  });
  await updateDoc(doc(db, 'activities', activityId), { commentCount: increment(1) });

  // Notify activity author
  if (activityAuthorId && activityAuthorId !== authorId) {
    await writeNotification(activityAuthorId, {
      type: 'comment',
      fromUserId: authorId,
      fromName: authorName,
      activityId,
      message: `${authorName} commented on your activity`,
    });
  }
}

export async function deleteComment(activityId: string, commentId: string): Promise<void> {
  const authedUid = getAuthUid();
  const commentRef = doc(db, 'comments', activityId, 'items', commentId);
  const snap = await getDoc(commentRef);
  if (!snap.exists() || snap.data().authorId !== authedUid) throw new Error('Not authorized');
  await deleteDoc(commentRef);
  await updateDoc(doc(db, 'activities', activityId), { commentCount: increment(-1) });
}

export async function getComments(activityId: string, limitCount = 20, afterDoc?: DocumentSnapshot) {
  let q = query(
    collection(db, 'comments', activityId, 'items'),
    orderBy('createdAt', 'desc'),
    limit(limitCount)
  );
  if (afterDoc) {
    q = query(
      collection(db, 'comments', activityId, 'items'),
      orderBy('createdAt', 'desc'),
      startAfter(afterDoc),
      limit(limitCount)
    );
  }
  const snap = await getDocs(q);
  return {
    comments: snap.docs.map(d => ({ id: d.id, ...d.data() })),
    lastDoc: snap.docs[snap.docs.length - 1] as DocumentSnapshot | undefined,
    hasMore: snap.docs.length >= limitCount,
  };
}

// ============================================
// Feed
// ============================================
export async function getFeed(userId: string, limitCount = 20, afterDoc?: DocumentSnapshot) {
  let q = query(
    collection(db, 'feeds', userId, 'items'),
    orderBy('createdAt', 'desc'),
    limit(limitCount)
  );
  if (afterDoc) {
    q = query(
      collection(db, 'feeds', userId, 'items'),
      orderBy('createdAt', 'desc'),
      startAfter(afterDoc),
      limit(limitCount)
    );
  }
  const snap = await getDocs(q);
  return {
    items: snap.docs.map(d => ({ id: d.id, ...d.data() })),
    lastDoc: snap.docs[snap.docs.length - 1],
  };
}

export async function getActivity(activityId: string) {
  const snap = await getDoc(doc(db, 'activities', activityId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

// ============================================
// Discovery Feed (Public Activities)
// ============================================
export async function getDiscoverFeed(limitCount = 20, afterDoc?: DocumentSnapshot) {
  let q = query(
    collection(db, 'activities'),
    where('visibility', '==', 'public'),
    orderBy('createdAt', 'desc'),
    limit(limitCount)
  );
  if (afterDoc) {
    q = query(
      collection(db, 'activities'),
      where('visibility', '==', 'public'),
      orderBy('createdAt', 'desc'),
      startAfter(afterDoc),
      limit(limitCount)
    );
  }
  const snap = await getDocs(q);
  return {
    items: snap.docs.map(d => ({ id: d.id, ...d.data() })),
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
  const q1 = query(
    collectionGroup(db, 'public'),
    where('displayName', '>=', queryStr),
    where('displayName', '<=', queryStr + '\uf8ff'),
    limit(limitCount)
  );
  // Case-insensitive fallback: also search with first letter capitalized.
  const capitalized = queryStr.charAt(0).toUpperCase() + queryStr.slice(1).toLowerCase();
  const q2 = query(
    collectionGroup(db, 'public'),
    where('displayName', '>=', capitalized),
    where('displayName', '<=', capitalized + '\uf8ff'),
    limit(limitCount)
  );

  const [snap1, snap2] = await Promise.all([getDocs(q1), getDocs(q2)]);
  const seen = new Set<string>();
  const results: { uid: string; [key: string]: unknown }[] = [];
  for (const snap of [snap1, snap2]) {
    for (const d of snap.docs) {
      // Public docs live at `users/{uid}/public/profile` — the owner uid
      // is the grandparent doc id. Fall back to the `uid` field if present.
      const data = d.data() as Record<string, unknown>;
      const ownerUid = d.ref.parent.parent?.id ?? (data.uid as string | undefined);
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
  /** Short reason chip surfaced in the UI. */
  reason: 'in_your_crew' | 'recent_post';
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
  opts: { crewId?: string; limitCount?: number; blockedUsers?: Set<string> } = {},
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
    captureError(e instanceof Error ? e : new Error(String(e)), 'error', { fn: 'getSuggestedPeople.getFollowingIds' });
  }

  // Build an ordered list of candidate UIDs with their reason.
  const candidates = new Map<string, SuggestedPerson>();

  // 1. Crew members first.
  if (crewId) {
    try {
      const memberSnap = await getDocs(collection(db, 'groups', crewId, 'members'));
      for (const m of memberSnap.docs) {
        const memberUid = m.id;
        if (excludeIds.has(memberUid)) continue;
        if (candidates.has(memberUid)) continue;
        candidates.set(memberUid, { uid: memberUid, displayName: 'Athlete', reason: 'in_your_crew', crewId });
      }
    } catch (e) {
      captureError(e instanceof Error ? e : new Error(String(e)), 'error', { fn: 'getSuggestedPeople.crewMembers' });
    }
  }

  // 2. Recent public posters — dedupe by authorId, keep the most recent.
  if (candidates.size < limitCount) {
    try {
      const recent = await getDocs(query(
        collection(db, 'activities'),
        where('visibility', '==', 'public'),
        orderBy('createdAt', 'desc'),
        limit(50),
      ));
      for (const d of recent.docs) {
        const author = (d.data().authorId as string | undefined);
        if (!author) continue;
        if (excludeIds.has(author)) continue;
        if (candidates.has(author)) continue;
        candidates.set(author, { uid: author, displayName: 'Athlete', reason: 'recent_post' });
        if (candidates.size >= limitCount) break;
      }
    } catch (e) {
      captureError(e instanceof Error ? e : new Error(String(e)), 'error', { fn: 'getSuggestedPeople.recentPosters' });
    }
  }

  // Enrich with display names from the public profile projection.
  // Parallel getDoc — small list (≤ limitCount), no pagination, runs once.
  const list = Array.from(candidates.values()).slice(0, limitCount);
  await Promise.all(list.map(async (p) => {
    try {
      const snap = await getDoc(doc(db, 'users', p.uid, 'public', 'profile'));
      const data = snap.data() as { displayName?: string } | undefined;
      if (data?.displayName) p.displayName = data.displayName;
    } catch {
      // Fall through with default 'Athlete' — a missing public profile
      // shouldn't break the whole list.
    }
  }));

  return list;
}

export async function searchUsersByEmail(email: string, limitCount = 10) {
  const q = query(
    collection(db, 'users'),
    where('email', '==', email.toLowerCase().trim()),
    limit(limitCount)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ uid: d.id, ...d.data() }));
}

// ============================================
// Notifications
// ============================================
export async function writeNotification(targetUserId: string, data: {
  type: 'kudos' | 'comment' | 'follow' | 'challenge_milestone';
  fromUserId?: string;
  fromName?: string;
  activityId?: string;
  message?: string;
}) {
  await addDoc(collection(db, 'notifications', targetUserId, 'items'), {
    ...data,
    read: false,
    createdAt: serverTimestamp(),
  });
}

// ============================================
// Batch fetch activities + kudos status
// Replaces N individual reads in ActivityCard
// ============================================
export async function fetchActivitiesByIds(activityIds: string[]): Promise<Record<string, Record<string, unknown>>> {
  if (activityIds.length === 0) return {};
  // Firestore 'in' queries max 30 per batch
  const chunks: string[][] = [];
  for (let i = 0; i < activityIds.length; i += 30) {
    chunks.push(activityIds.slice(i, i + 30));
  }
  const results: Record<string, Record<string, unknown>> = {};
  await Promise.all(chunks.map(async (chunk) => {
    const snaps = await Promise.all(chunk.map(id => getDoc(doc(db, 'activities', id))));
    snaps.forEach(snap => {
      if (snap.exists()) results[snap.id] = { id: snap.id, ...snap.data() };
    });
  }));
  return results;
}

export async function batchGetKudos(activityIds: string[], userId: string): Promise<Record<string, boolean>> {
  if (activityIds.length === 0 || !userId) return {};
  const chunks: string[][] = [];
  for (let i = 0; i < activityIds.length; i += 30) {
    chunks.push(activityIds.slice(i, i + 30));
  }
  const chunkResults = await Promise.all(chunks.map(async (chunk) => {
    const snaps = await Promise.all(chunk.map(id => getDoc(doc(db, 'kudos', id, 'users', userId))));
    const map: Record<string, boolean> = {};
    chunk.forEach((id, i) => { map[id] = snaps[i].exists(); });
    return map;
  }));
  return Object.assign({}, ...chunkResults) as Record<string, boolean>;
}

// ============================================
// Report Content (App Store Guideline 1.2)
// ============================================
export type ReportReason = 'spam' | 'harassment' | 'inappropriate' | 'other';

export async function reportContent(reporterId: string, data: {
  targetType: 'activity' | 'comment' | 'user';
  targetId: string;
  reason: ReportReason;
  details?: string;
}) {
  const authedUid = getAuthUid();
  if (reporterId !== authedUid) throw new Error('Identity mismatch');
  await addDoc(collection(db, 'reports'), {
    reporterId,
    ...data,
    status: 'pending',
    createdAt: serverTimestamp(),
  });
}

// ============================================
// Block User (App Store Guideline 1.2)
// ============================================
export async function blockUser(currentUid: string, targetUid: string) {
  const authedUid = getAuthUid();
  if (currentUid !== authedUid) throw new Error('Identity mismatch');
  await setDoc(doc(db, 'blocks', currentUid, 'users', targetUid), {
    blockedAt: serverTimestamp(),
  });
  // Also unfollow in both directions
  await deleteDoc(doc(db, 'following', currentUid, 'users', targetUid)).catch(() => {});
  await deleteDoc(doc(db, 'followers', currentUid, 'users', targetUid)).catch(() => {});
  await deleteDoc(doc(db, 'following', targetUid, 'users', currentUid)).catch(() => {});
  await deleteDoc(doc(db, 'followers', targetUid, 'users', currentUid)).catch(() => {});
}

export async function unblockUser(currentUid: string, targetUid: string) {
  const authedUid = getAuthUid();
  if (currentUid !== authedUid) throw new Error('Identity mismatch');
  await deleteDoc(doc(db, 'blocks', currentUid, 'users', targetUid));
}

export async function isBlocked(currentUid: string, targetUid: string): Promise<boolean> {
  const snap = await getDoc(doc(db, 'blocks', currentUid, 'users', targetUid));
  return snap.exists();
}

export async function getBlockedUsers(uid: string): Promise<string[]> {
  const snap = await getDocs(collection(db, 'blocks', uid, 'users'));
  return snap.docs.map(d => d.id);
}

// ============================================
// Account Deletion (App Store Guideline 5.1.1(v))
// ============================================
export async function deleteAccount(uid: string): Promise<void> {
  const authedUid = getAuthUid();
  if (uid !== authedUid) throw new Error('Identity mismatch');

  // Delete Firebase Auth account first — safest ordering:
  // If Firestore cleanup fails later, user can't re-login as a ghost
  const currentUser = auth.currentUser;
  if (currentUser) {
    await firebaseDeleteUser(currentUser);
  }

  // Collect all document refs to delete
  const allRefs: ReturnType<typeof doc>[] = [doc(db, 'users', uid)];

  const subcollections = [
    { parent: 'feeds', sub: 'items' },
    { parent: 'notifications', sub: 'items' },
    { parent: 'following', sub: 'users' },
    { parent: 'followers', sub: 'users' },
    { parent: 'blocks', sub: 'users' },
  ];

  for (const { parent, sub } of subcollections) {
    const snap = await getDocs(collection(db, parent, uid, sub));
    snap.docs.forEach(d => allRefs.push(d.ref));
  }

  const activitiesSnap = await getDocs(
    query(collection(db, 'activities'), where('authorId', '==', uid))
  );
  activitiesSnap.docs.forEach(d => allRefs.push(d.ref));

  // Chunk into batches of 450 (safe under Firestore's 500 limit)
  for (let i = 0; i < allRefs.length; i += 450) {
    const chunk = allRefs.slice(i, i + 450);
    const batch = writeBatch(db);
    chunk.forEach(r => batch.delete(r));
    await batch.commit();
  }
}
