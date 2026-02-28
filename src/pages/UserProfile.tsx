import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { doc, getDoc, collection, getDocs, query, where, orderBy, limit } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { getFollowerCount, getFollowingCount } from '../lib/socialApi';
import FollowButton from '../components/social/FollowButton';
import ActivityCard from '../components/social/ActivityCard';
import type { FeedItem } from '../hooks/useSocialFeed';

export default function UserProfile() {
  const { uid } = useParams<{ uid: string }>();
  const [profile, setProfile] = useState<any>(null);
  const [followers, setFollowers] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [activities, setActivities] = useState<any[]>([]);

  useEffect(() => {
    if (!uid) return;
    getDoc(doc(db, 'users', uid)).then(snap => {
      if (snap.exists()) setProfile({ uid: snap.id, ...snap.data() });
    });
    getFollowerCount(uid).then(setFollowers);
    getFollowingCount(uid).then(setFollowingCount);

    const q = query(
      collection(db, 'activities'),
      where('authorId', '==', uid),
      where('visibility', 'in', ['public', 'followers']),
      orderBy('createdAt', 'desc'),
      limit(10)
    );
    getDocs(q).then(snap => setActivities(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
  }, [uid]);

  if (!profile) return <div className="p-6 text-center text-muted-foreground animate-pulse">Loading...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center text-2xl font-bold">
          {(profile.displayName || '?').charAt(0)}
        </div>
        <div className="flex-1">
          <h1 className="text-lg font-bold">{profile.displayName}</h1>
          <div className="flex gap-4 text-xs text-muted-foreground mt-1">
            <span><strong className="text-foreground">{followers}</strong> followers</span>
            <span><strong className="text-foreground">{followingCount}</strong> following</span>
          </div>
        </div>
        {uid && <FollowButton targetUid={uid} />}
      </div>

      <h3 className="text-sm font-semibold">Activity</h3>
      <div className="space-y-3">
        {activities.map(a => (
          <ActivityCard key={a.id} feedItem={{
            id: a.id, activityId: a.id, authorId: a.authorId,
            authorName: a.authorName, type: a.type,
            summary: a.type === 'run'
              ? `${((a.distance || 0) / 1000).toFixed(1)} km · ${a.avgPace || ''}`
              : `${a.exerciseCount || 0} exercises · ${a.prsHit || 0} PRs`,
            createdAt: a.createdAt,
          } as FeedItem} />
        ))}
        {activities.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-8">No public activities yet</p>
        )}
      </div>
    </div>
  );
}
