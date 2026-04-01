import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { doc, getDoc, collection, getDocs, query, where, orderBy, limit } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { getFollowerCount, getFollowingCount, blockUser } from '../lib/socialApi';
import { useAuth } from '../lib/auth';
import FollowButton from '../components/social/FollowButton';
import ActivityCard from '../components/social/ActivityCard';
import type { FeedItem } from '../hooks/useSocialFeed';
import { Skeleton } from '../components/LoadingSkeleton';
import { TIER_COLORS, BADGE_DEFINITIONS, type EarnedBadge } from '../features/streaks/badges';
import { Flame, MoreHorizontal, Ban, Flag, ChevronLeft } from 'lucide-react';
import { toast } from 'sonner';
import ReportModal from '../components/social/ReportModal';

export default function UserProfile() {
  const { uid } = useParams<{ uid: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<{ uid: string; displayName?: string; avatarUrl?: string; email?: string; bio?: string } | null>(null);
  const [followers, setFollowers] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [showMenu, setShowMenu] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [activities, setActivities] = useState<{ id: string; distance?: number; authorId?: string; authorName?: string; type?: string; avgPace?: string | number; exerciseCount?: number; prsHit?: number; createdAt?: unknown; [key: string]: unknown }[]>([]);
  const [stats, setStats] = useState<{ totalKm: number; totalSessions: number } | null>(null);
  const [badges, setBadges] = useState<EarnedBadge[]>([]);
  const [streak, setStreak] = useState<number>(0);
  const [statsLoading, setStatsLoading] = useState(true);

  useEffect(() => {
    if (!uid) return;
    setStatsLoading(true);

    const profilePromise = getDoc(doc(db, 'users', uid)).then(snap => {
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
    const activitiesPromise = getDocs(q).then(snap => {
      const acts = snap.docs.map(d => ({ id: d.id, ...d.data() } as { id: string; distance?: number; authorId?: string; authorName?: string; type?: string; avgPace?: string | number; exerciseCount?: number; prsHit?: number; createdAt?: unknown; [key: string]: unknown }));
      setActivities(acts);

      let totalKm = 0;
      let totalSessions = 0;
      acts.forEach((a) => {
        totalSessions++;
        if (a.distance) totalKm += a.distance / 1000;
      });
      setStats({ totalKm, totalSessions });
    });

    const badgesPromise = getDoc(doc(db, 'users', uid, 'streaks', 'data')).then(snap => {
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

    Promise.all([profilePromise, activitiesPromise, badgesPromise]).finally(() => {
      setStatsLoading(false);
    });
  }, [uid]);

  const isOwnProfile = user?.uid === uid;

  const handleBlock = async () => {
    if (!user || !uid || !profile) return;
    if (!window.confirm(`Block ${profile.displayName || 'this user'}? They won't be able to see your activity and you won't see theirs.`)) return;
    try {
      await blockUser(user.uid, uid);
      toast.success(`Blocked ${profile.displayName || 'user'}`);
      navigate(-1);
    } catch {
      toast.error('Failed to block user');
    }
  };

  if (!profile) return <div className="p-6 text-center text-muted-foreground animate-pulse">Loading...</div>;

  return (
    <div className="space-y-4">
      {/* Back header */}
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors -mb-2"
      >
        <ChevronLeft className="w-4 h-4" />
        Back
      </button>

      <div className="flex items-center gap-4">
        <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center text-2xl font-bold overflow-hidden">
          {profile.avatarUrl ? (
            <img
              src={profile.avatarUrl}
              alt={profile.displayName || 'User avatar'}
              className="w-full h-full object-cover"
              loading="lazy"
              decoding="async"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).parentElement!.textContent = (profile.displayName || profile.email || '?').charAt(0).toUpperCase(); }}
            />
          ) : (
            (profile.displayName || profile.email || '?').charAt(0).toUpperCase()
          )}
        </div>
        <div className="flex-1">
          <h1 className="text-lg font-extrabold">{profile.displayName}</h1>
          {profile.bio && (
            <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">{profile.bio}</p>
          )}
          <div className="flex gap-4 text-xs text-muted-foreground mt-1">
            <span><strong className="text-foreground">{followers}</strong> followers</span>
            <span><strong className="text-foreground">{followingCount}</strong> following</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {uid && <FollowButton targetUid={uid} />}
          {!isOwnProfile && uid && (
            <div className="relative">
              <button
                onClick={() => setShowMenu(!showMenu)}
                className="p-2 rounded-lg bg-muted hover:bg-muted/80 transition-colors"
                aria-label="More options"
              >
                <MoreHorizontal className="w-4 h-4 text-muted-foreground" />
              </button>
              {showMenu && (
                <>
                  <div className="fixed inset-0 z-10" role="button" tabIndex={0} aria-label="Close menu" onClick={() => setShowMenu(false)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setShowMenu(false); }} />
                  <div className="absolute right-0 top-full mt-1 z-20 w-44 bg-card rounded-xl border border-border/50 shadow-xl overflow-hidden">
                    <button
                      onClick={() => { setShowMenu(false); setShowReport(true); }}
                      className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-foreground hover:bg-muted transition-colors"
                    >
                      <Flag className="w-4 h-4" />
                      Report user
                    </button>
                    <button
                      onClick={() => { setShowMenu(false); handleBlock(); }}
                      className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-destructive hover:bg-destructive/10 transition-colors"
                    >
                      <Ban className="w-4 h-4" />
                      Block user
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
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
            <span className="flex-1 text-center py-1.5 rounded-lg bg-card text-xs font-medium text-foreground font-mono tabular-nums">
              {stats.totalKm.toFixed(1)} km
            </span>
            <span className="flex-1 text-center py-1.5 rounded-lg bg-card text-xs font-medium text-foreground font-mono tabular-nums">
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
        {activities.length === 0 && isOwnProfile && !statsLoading && (
          <div className="text-center py-10 px-6 space-y-3">
            <p className="text-sm font-medium text-foreground">Your profile is looking quiet</p>
            <p className="text-xs text-muted-foreground max-w-[260px] mx-auto">
              Complete a workout or run to share your first activity. Turn on auto-posting in Settings to share automatically.
            </p>
            <div className="flex justify-center gap-3 pt-1">
              <Link to="/program" className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold">
                Log a workout
              </Link>
              <Link to="/settings" className="px-4 py-2 rounded-xl bg-muted text-foreground text-xs font-semibold">
                Settings
              </Link>
            </div>
          </div>
        )}
        {activities.length === 0 && !isOwnProfile && !statsLoading && (
          <p className="text-xs text-muted-foreground text-center py-8">No public activities yet</p>
        )}
      </div>

      {showReport && uid && (
        <ReportModal targetType="user" targetId={uid} onClose={() => setShowReport(false)} />
      )}
    </div>
  );
}
