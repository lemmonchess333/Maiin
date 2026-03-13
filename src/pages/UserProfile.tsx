import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { doc, getDoc, collection, getDocs, query, where, orderBy, limit } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { getFollowerCount, getFollowingCount } from '../lib/socialApi';
import FollowButton from '../components/social/FollowButton';
import ActivityCard from '../components/social/ActivityCard';
import type { FeedItem } from '../hooks/useSocialFeed';
import { Skeleton } from '../components/LoadingSkeleton';
import { TIER_COLORS, BADGE_DEFINITIONS, type EarnedBadge } from '../features/streaks/badges';
import { Flame } from 'lucide-react';

export default function UserProfile() {
  const { uid } = useParams<{ uid: string }>();
  const [profile, setProfile] = useState<{ uid: string; displayName?: string; avatarUrl?: string } | null>(null);
  const [followers, setFollowers] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [activities, setActivities] = useState<{ id: string; distance?: number; authorId?: string; authorName?: string; type?: string; avgPace?: string | number; exerciseCount?: number; prsHit?: number; createdAt?: unknown; [key: string]: unknown }[]>([]);
  const [stats, setStats] = useState<{ totalKm: number; totalSessions: number } | null>(null);
  const [badges, setBadges] = useState<EarnedBadge[]>([]);
  const [streak, setStreak] = useState<number>(0);
  const [statsLoading, setStatsLoading] = useState(true);

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
    getDocs(q).then(snap => {
      const acts = snap.docs.map(d => ({ id: d.id, ...d.data() } as { id: string; distance?: number; authorId?: string; authorName?: string; type?: string; avgPace?: string | number; exerciseCount?: number; prsHit?: number; createdAt?: unknown; [key: string]: unknown }));
      setActivities(acts);

      // Compute stats from activities
      let totalKm = 0;
      let totalSessions = 0;
      acts.forEach((a) => {
        totalSessions++;
        if (a.distance) totalKm += a.distance / 1000;
      });
      setStats({ totalKm, totalSessions });
    });

    // Fetch badges from streaks data
    getDoc(doc(db, 'users', uid, 'streaks', 'data')).then(snap => {
      if (snap.exists()) {
        const data = snap.data();
        setStreak(data.currentStreak ?? 0);
        const earnedMap: Record<string, string> = data.badges ?? {};
        const earned: EarnedBadge[] = BADGE_DEFINITIONS
          .filter(b => earnedMap[b.id])
          .map(b => ({ ...b, earnedAt: earnedMap[b.id] }))
          .sort((a, b) => (b.earnedAt ?? '').localeCompare(a.earnedAt ?? ''))
          .slice(0, 3);
        setBadges(earned);
      }
    }).catch(() => {});

    setStatsLoading(false);
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

      {/* Stat pills */}
      <div className="flex gap-2">
        {statsLoading ? (
          <>
            <Skeleton className="h-8 flex-1 rounded-lg" />
            <Skeleton className="h-8 flex-1 rounded-lg" />
          </>
        ) : stats && (
          <>
            <span className="flex-1 text-center py-1.5 rounded-lg bg-card border border-border/50 text-xs font-medium text-foreground">
              {stats.totalKm.toFixed(1)} km
            </span>
            <span className="flex-1 text-center py-1.5 rounded-lg bg-card border border-border/50 text-xs font-medium text-foreground">
              {stats.totalSessions} sessions
            </span>
          </>
        )}
      </div>

      {/* Badge showcase */}
      {badges.length > 0 && (
        <div className="flex gap-2">
          {badges.map(badge => (
            <div
              key={badge.id}
              className="flex items-center justify-center w-10 h-10 rounded-lg text-lg"
              style={{ border: `2px solid ${TIER_COLORS[badge.tier]}`, background: `${TIER_COLORS[badge.tier]}15` }}
              title={`${badge.name} — ${badge.description}`}
            >
              {badge.icon}
            </div>
          ))}
        </div>
      )}

      {/* Current streak */}
      {streak > 0 && (
        <p className="text-xs text-muted-foreground">
          <Flame size={14} className="text-orange-500 inline" /> <strong className="text-foreground">{streak}-day</strong> streak
        </p>
      )}

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
