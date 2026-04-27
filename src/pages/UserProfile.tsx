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
import { Flame, MoreHorizontal, Ban, Flag, ChevronLeft, Dumbbell } from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { THEME } from '../lib/theme';
import Avatar from '../components/Avatar';
import ReportModal from '../components/social/ReportModal';
import ProgressPhotos from '../components/social/ProgressPhotos';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';

export default function UserProfile() {
  const { uid } = useParams<{ uid: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<{ uid: string; displayName?: string; avatarUrl?: string; email?: string } | null>(null);
  const [followers, setFollowers] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [showMenu, setShowMenu] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [showBlockConfirm, setShowBlockConfirm] = useState(false);
  const [activities, setActivities] = useState<{ id: string; distance?: number; authorId?: string; authorName?: string; type?: string; avgPace?: string | number; exerciseCount?: number; prsHit?: number; createdAt?: unknown; [key: string]: unknown }[]>([]);
  const [stats, setStats] = useState<{ totalKm: number; totalSessions: number } | null>(null);
  const [badges, setBadges] = useState<EarnedBadge[]>([]);
  const [streak, setStreak] = useState<number>(0);
  const [statsLoading, setStatsLoading] = useState(true);

  useEffect(() => {
    if (!uid) return;
    // Derive own-profile branch inside the effect so it re-evaluates if the
    // signed-in user changes. Matches the isOwnProfile derivation below for
    // render-time gating, but we can't use that binding here — it's declared
    // after this effect.
    const isOwnProfile = user?.uid === uid;
    setStatsLoading(true);

    // NOTE: users/{uid} is doc-level owner-only per firestore.rules:55-56, so
    // this read succeeds only for the viewer's own profile. For cross-user
    // views the promise rejects with permission-denied. Pre-existing bug —
    // separate prompt to fix. The .catch swallows it so the shared Promise.all
    // below doesn't throw, and the public-doc read carries the cross-user-
    // visible fields regardless.
    const profilePromise = getDoc(doc(db, 'users', uid)).then(snap => {
      if (snap.exists()) setProfile({ uid: snap.id, ...snap.data() });
    }).catch(() => {});
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

    // Cross-user-readable streak + display fields + badgeSummary from the
    // public projection. Populated by Onboarding, createDefaultProfile,
    // updateProfile, the streak mirror-write in useStreaks, and awardBadge.
    // Legacy users pre-backfill may not have this doc or may lack
    // badgeSummary — default to zero/empty silently in that case.
    const publicProfilePromise = getDoc(doc(db, 'users', uid, 'public', 'profile')).then(snap => {
      if (!snap.exists()) return;
      const data = snap.data();
      setStreak((data.currentStreak as number) ?? 0);
      // Backfill the local `profile` state with the cross-user-safe fields
      // when the main user-doc read above failed (cross-user case).
      setProfile((prev) => prev ?? ({
        uid,
        displayName: (data.displayName as string | null) ?? undefined,
        avatarUrl: (data.photoURL as string | null) ?? undefined,
      }));

      // Cross-user badges reconstruct from the badgeSummary projection. Own
      // profile still goes through streaks/data (see badgesPromise below)
      // so the badge timestamps are the live values, not the summary mirror.
      if (!isOwnProfile) {
        const summary = (data.badgeSummary as { earnedMap?: Record<string, string> } | undefined);
        const earnedMap = summary?.earnedMap ?? {};
        const earned: EarnedBadge[] = [];
        for (const [id, earnedAt] of Object.entries(earnedMap)) {
          const def = BADGE_DEFINITIONS.find(b => b.id === id);
          if (!def) {
            // Schema drift: the public summary references a badge id the
            // client catalog doesn't know. Log once per id, skip silently.
            console.warn(`[UserProfile] unknown badge id in badgeSummary: ${id}`);
            continue;
          }
          earned.push({ ...def, earnedAt });
        }
        earned.sort((a, b) => (b.earnedAt ?? '').localeCompare(a.earnedAt ?? ''));
        setBadges(earned.slice(0, 3));
      }
    }).catch(() => {});

    // Own-profile badges still read from streaks/data (owner-only rule). For
    // cross-user views the badgeSummary path above has already populated
    // `badges` state — this fetch is skipped to avoid a pointless
    // permission-denied round-trip.
    const badgesPromise = isOwnProfile
      ? getDoc(doc(db, 'users', uid, 'streaks', 'data')).then(snap => {
          if (snap.exists()) {
            const data = snap.data();
            const earnedMap: Record<string, string> = data.badges ?? {};
            const earned: EarnedBadge[] = BADGE_DEFINITIONS
              .filter(b => earnedMap[b.id])
              .map(b => ({ ...b, earnedAt: earnedMap[b.id] }))
              .sort((a, b) => (b.earnedAt ?? '').localeCompare(a.earnedAt ?? ''))
              .slice(0, 3);
            setBadges(earned);
          }
        }).catch(() => {})
      : Promise.resolve();

    Promise.all([profilePromise, activitiesPromise, publicProfilePromise, badgesPromise]).finally(() => {
      setStatsLoading(false);
    });
  }, [uid, user?.uid]);

  const isOwnProfile = user?.uid === uid;

  const handleBlock = async () => {
    if (!user || !uid || !profile) return;
    try {
      await blockUser(user.uid, uid);
      toast.success(`Blocked ${profile.displayName || 'user'}`);
      navigate(-1);
    } catch {
      toast.error('Failed to block user');
    }
  };

  const itemVariant = { hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0, transition: { duration: 0.3 } } };

  if (!profile) return <div className="p-6 text-center text-muted-foreground animate-pulse">Loading...</div>;

  return (
    <motion.div className="space-y-4" initial="hidden" animate="visible"
      variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.06 } } }}>
      {/* Back header */}
      <motion.div variants={itemVariant}>
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors -mb-2"
      >
        <ChevronLeft className="w-4 h-4" />
        Back
      </button>
      </motion.div>

      <motion.div variants={itemVariant} className="flex items-center gap-4">
        <Avatar
          photoURL={profile.avatarUrl}
          displayName={profile.displayName || '?'}
          size="xl"
          className="w-16 h-16 text-2xl"
        />
        <div className="flex-1">
          <h1 className="text-lg font-extrabold">{profile.displayName}</h1>
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
                      onClick={() => { setShowMenu(false); setShowBlockConfirm(true); }}
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
      </motion.div>

      {/* Stat pills */}
      <div className="flex gap-2">
        {statsLoading ? (
          <>
            <Skeleton className="h-8 flex-1 rounded-lg" />
            <Skeleton className="h-8 flex-1 rounded-lg" />
          </>
        ) : stats && (
          <>
            <span className="flex-1 text-center py-1.5 rounded-xl bg-card text-xs font-medium text-foreground font-mono tabular-nums shadow-sm">
              {stats.totalKm.toFixed(1)} km
            </span>
            <span className="flex-1 text-center py-1.5 rounded-xl bg-card text-xs font-medium text-foreground font-mono tabular-nums shadow-sm">
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

      {/* Progress Photos — own-profile only. Moved here from the
          Social page (used to be a top-level tab) because progress
          photos are private/personal artefacts that belong with the
          owner's stats and activity history, not in a public-facing
          social destination. The component handles upload, encryption,
          and the compare/empty states internally. */}
      {isOwnProfile && (
        <section aria-label="Progress photos" className="space-y-2">
          <h3 className="text-sm font-semibold">Progress photos</h3>
          <ProgressPhotos />
        </section>
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
          <div className="text-center py-10 px-6 space-y-3">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto"
              style={{ background: `${THEME.brand}15`, border: `1px solid ${THEME.brand}25` }}>
              <Dumbbell size={24} style={{ color: THEME.brand }} />
            </div>
            <p className="text-sm font-medium text-foreground">No public activities yet</p>
            <p className="text-xs text-muted-foreground">When they share a workout or run, it'll appear here</p>
          </div>
        )}
      </div>

      {showReport && uid && (
        <ReportModal targetType="user" targetId={uid} onClose={() => setShowReport(false)} />
      )}

      <ConfirmDialog
        open={showBlockConfirm}
        title={`Block ${profile.displayName || 'this user'}?`}
        description="They won't be able to see your activity and you won't see theirs."
        confirmLabel="Block"
        destructive
        onConfirm={() => { setShowBlockConfirm(false); handleBlock(); }}
        onCancel={() => setShowBlockConfirm(false)}
      />
    </motion.div>
  );
}
