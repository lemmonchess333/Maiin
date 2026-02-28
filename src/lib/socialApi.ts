import { db } from './firebase';
import {
  collection, doc, setDoc, deleteDoc, getDocs, getDoc,
  query, orderBy, limit, startAfter, where, increment,
  updateDoc, addDoc, Timestamp, serverTimestamp,
  type DocumentSnapshot,
} from 'firebase/firestore';

// ============================================
// Follow / Unfollow
// ============================================
export async function followUser(currentUid: string, targetUid: string) {
  const now = Timestamp.now();
  await setDoc(doc(db, 'following', currentUid, 'users', targetUid), { followedAt: now });
  await setDoc(doc(db, 'followers', targetUid, 'users', currentUid), { followedAt: now });
}

export async function unfollowUser(currentUid: string, targetUid: string) {
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

// ============================================
// Post Activity + Fan-out to Followers
// ============================================
export async function postActivity(activity: {
  authorId: string;
  authorName: string;
  type: 'run' | 'workout';
  visibility: 'public' | 'followers' | 'private';
  [key: string]: any;
}) {
  const activityRef = await addDoc(collection(db, 'activities'), {
    ...activity,
    kudosCount: 0,
    commentCount: 0,
    createdAt: serverTimestamp(),
  });

  if (activity.visibility !== 'private') {
    const followersSnap = await getDocs(collection(db, 'followers', activity.authorId, 'users'));

    const summary = activity.type === 'run'
      ? `${((activity.distance || 0) / 1000).toFixed(1)} km run · ${activity.avgPace || ''}`
      : `${activity.exerciseCount || 0} exercises · ${activity.prsHit || 0} PRs`;

    const feedItem = {
      activityId: activityRef.id,
      authorId: activity.authorId,
      authorName: activity.authorName,
      type: activity.type,
      summary,
      createdAt: serverTimestamp(),
    };

    const promises = followersSnap.docs.map(followerDoc =>
      addDoc(collection(db, 'feeds', followerDoc.id, 'items'), feedItem)
    );
    promises.push(addDoc(collection(db, 'feeds', activity.authorId, 'items'), feedItem));
    await Promise.all(promises);
  }

  return activityRef.id;
}

// ============================================
// Kudos
// ============================================
export async function toggleKudos(activityId: string, userId: string): Promise<boolean> {
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

export async function hasGivenKudos(activityId: string, userId: string): Promise<boolean> {
  const snap = await getDoc(doc(db, 'kudos', activityId, 'users', userId));
  return snap.exists();
}

// ============================================
// Comments
// ============================================
export async function addComment(activityId: string, authorId: string, authorName: string, text: string) {
  await addDoc(collection(db, 'comments', activityId, 'items'), {
    authorId, authorName, text, createdAt: serverTimestamp(),
  });
  await updateDoc(doc(db, 'activities', activityId), { commentCount: increment(1) });
}

export async function getComments(activityId: string, limitCount = 20) {
  const q = query(
    collection(db, 'comments', activityId, 'items'),
    orderBy('createdAt', 'desc'),
    limit(limitCount)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
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
// User Search
// ============================================
export async function searchUsers(queryStr: string, limitCount = 10) {
  const q = query(
    collection(db, 'users'),
    where('displayName', '>=', queryStr),
    where('displayName', '<=', queryStr + '\uf8ff'),
    limit(limitCount)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ uid: d.id, ...d.data() }));
}
