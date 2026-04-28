import { useSocialFeed } from '../hooks/useSocialFeed';
import { useDiscoverFeed } from '../hooks/useDiscoverFeed';
import { useCrews } from '../hooks/useCrews';
import { useBlockedUsers } from '../hooks/useBlockedUsers';
import { useSuggestedPeople } from '../hooks/useSuggestedPeople';
import { useState, useRef, useCallback, useEffect } from 'react';
import { useAuth } from '../lib/auth';
import { searchUsers, getBoundedFollowingCount } from '../lib/socialApi';
import ActivityCard from '../components/social/ActivityCard';
import LeaderboardCard from '../components/social/LeaderboardCard';
import TrajectoryCard from '../components/social/TrajectoryCard';
import Avatar from '../components/Avatar';
import { ActivityCardSkeleton } from '../components/LoadingSkeleton';
import { isNativePlatform } from '../lib/platform';
import FollowButton from '../components/social/FollowButton';
import { ChallengeList } from '../features/challenges/ChallengeList';
import FullLeaderboard from '../components/social/FullLeaderboard';
import { RefreshCw, Share2, Users, Smartphone, Globe, Dumbbell, Footprints, Zap, Target, Flame, Salad, PersonStanding, Medal, Sunrise, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { THEME } from '../lib/theme';
import { EmptyState } from '../components/EmptyState';
import { motion, AnimatePresence } from 'framer-motion';
import { useFocusTrap } from '@/hooks/useFocusTrap';

type SocialTab = 'feed' | 'crews' | 'discover';
type FeedSubTab = 'following' | 'discover';

// Icon map for crew icons (#18)
const ICON_MAP: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  dumbbell: Dumbbell,
  footprints: Footprints,
  zap: Zap,
  target: Target,
  flame: Flame,
  salad: Salad,
  person: PersonStanding,
  medal: Medal,
  sunrise: Sunrise,
};

export default function Social() {
  const { user, profile } = useAuth();
  const blockedUsers = useBlockedUsers();
  const [tab, setTab] = useState<SocialTab>('feed');
  /**
   * Smart default: new / zero-follow users land on Discover; users
   * with any follows land on Following. One cheap limit(2) read
   * decides both "do I have any follows" (smart default tab) AND
   * "do I have ≥2 follows" (leaderboard vs trajectory card).
   * While we wait, we default to 'discover' so a brand-new user
   * never sees a flash of the empty Following state before
   * resolution. `followingCount` is bounded at 2 — we only care
   * about the threshold, not the exact number.
   */
  const [feedSubTab, setFeedSubTab] = useState<FeedSubTab>('discover');
  const [followingCount, setFollowingCount] = useState<number | null>(null);
  useEffect(() => {
    if (!user || followingCount !== null) return;
    let cancelled = false;
    getBoundedFollowingCount(user.uid, 2)
      .then((n) => {
        if (cancelled) return;
        setFollowingCount(n);
        setFeedSubTab(n > 0 ? 'following' : 'discover');
      })
      .catch(() => {
        // On error, treat as zero — safe empty state + trajectory card.
        if (!cancelled) setFollowingCount(0);
      });
    return () => { cancelled = true; };
  }, [user, followingCount]);
  const [showFullLeaderboard, setShowFullLeaderboard] = useState(false);

  // Crew banner dismiss state
  const [crewBannerDismissed, setCrewBannerDismissed] = useState(
    () => !!localStorage.getItem('tropos_crew_banner_dismissed')
  );
  const dismissCrewBanner = () => {
    setCrewBannerDismissed(true);
    localStorage.setItem('tropos_crew_banner_dismissed', '1');
  };

  // Feed hooks — discover only fetches when active (#7)
  const followingFeed = useSocialFeed(false, blockedUsers);
  const discoverFeed = useDiscoverFeed(feedSubTab === 'discover', blockedUsers);
  const activeFeed = feedSubTab === 'following' ? followingFeed : discoverFeed;

  // Suggested People — fetches lazily only when the Discover tab is shown.
  const { people: suggestedPeople, loading: suggestedLoading, refresh: refreshSuggestions, remove: removeSuggestion } =
    useSuggestedPeople(tab === 'discover', blockedUsers);

  // Crews
  const { crews, currentCrew, joinCrew, leaveCrew, createCrew } = useCrews();
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDesc, setNewGroupDesc] = useState('');
  const [newGroupIcon, setNewGroupIcon] = useState('');
  const [creatingCrew, setCreatingCrew] = useState(false);

  // Leave crew modal (#19)
  const [leavingCrewId, setLeavingCrewId] = useState<string | null>(null);

  // Find tab state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{ uid: string; displayName?: string; photoURL?: string; crewId?: string }[]>([]);
  const [searching, setSearching] = useState(false);
  const [showContactModal, setShowContactModal] = useState(false);
  const contactModalRef = useFocusTrap<HTMLDivElement>(showContactModal);
  const leaveCrewRef = useFocusTrap<HTMLDivElement>(!!leavingCrewId);
  const createCrewRef = useFocusTrap<HTMLDivElement>(showCreateGroup);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  const handleSearch = useCallback(async (q?: string) => {
    const query = (q ?? searchQuery).trim();
    if (!query) return;
    setSearching(true);
    try {
      const results = await searchUsers(query);
      setSearchResults(results.filter((u) => u.uid !== user?.uid));
    } catch {
      setSearchResults([]);
    }
    setSearching(false);
  }, [searchQuery, user?.uid]);

  const handleSearchInputChange = (value: string) => {
    setSearchQuery(value);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    if (value.trim()) {
      searchDebounceRef.current = setTimeout(() => handleSearch(value), 300);
    }
  };

  // Pull-to-refresh with iOS conflict fix (#9)
  const [pullRefreshing, setPullRefreshing] = useState(false);
  const pullStartY = useRef(0);
  const isSwiping = useRef(false);
  const feedContainerRef = useRef<HTMLDivElement>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    pullStartY.current = e.touches[0].clientY;
    isSwiping.current = false;
  };

  useEffect(() => {
    const el = feedContainerRef.current;
    if (!el) return;
    const handler = (e: TouchEvent) => {
      const diff = e.touches[0].clientY - pullStartY.current;
      if (diff > 0 && window.scrollY <= 0) {
        isSwiping.current = true;
        e.preventDefault();
      }
    };
    el.addEventListener('touchmove', handler, { passive: false });
    return () => el.removeEventListener('touchmove', handler);
  }, []);

  const handleTouchEnd = async (e: React.TouchEvent) => {
    const diff = e.changedTouches[0].clientY - pullStartY.current;
    if (diff > 80 && isSwiping.current && !pullRefreshing) {
      setPullRefreshing(true);
      await activeFeed.refresh();
      setPullRefreshing(false);
    }
    isSwiping.current = false;
  };

  // Infinite scroll sentinel — stable ref for loadMore (#21)
  const sentinelRef = useRef<HTMLDivElement>(null);
  const feedLoadMoreRef = useRef(activeFeed.loadMore);
  feedLoadMoreRef.current = activeFeed.loadMore;
  const { hasMore: feedHasMore, loading: feedLoading } = activeFeed;

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          feedLoadMoreRef.current();
        }
      },
      { rootMargin: '200px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [feedHasMore, feedLoading]);

  const handleShareInvite = async () => {
    const text = "I'm tracking my lifts and runs on Tropos. Join me and let's compete!";
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Join me on Tropos', text, url: window.location.origin });
      } catch { /* user cancelled */ }
    } else {
      await navigator.clipboard.writeText(text + ' ' + window.location.origin);
      toast.success('Invite link copied!');
    }
  };

  const itemVariant = { hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0, transition: { duration: 0.3 } } };

  return (
    <motion.div className="space-y-4" initial="hidden" animate="visible"
      variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.06 } } }}>
      <motion.header variants={itemVariant}>
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-extrabold">Social</h1>
        </div>
      </motion.header>

      {/* Crew banner if no crew — dismissible */}
      <AnimatePresence>
        {!profile?.crewId && tab === 'feed' && !crewBannerDismissed && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="w-full flex items-center gap-3 p-3 rounded-xl border border-purple-200 dark:border-purple-900/40"
              style={{ background: `${THEME.brand}14` }}>
              <button onClick={() => setTab('crews')} className="flex items-center gap-3 flex-1 text-left">
                <Users className="w-5 h-5 text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-foreground">Join a crew to connect with others</p>
                  <p className="text-xs text-muted-foreground">Browse crews</p>
                </div>
              </button>
              <button onClick={dismissCrewBanner} className="p-1 text-muted-foreground hover:text-foreground transition-colors" aria-label="Dismiss">
                <X size={14} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Full Leaderboard overlay */}
      {showFullLeaderboard && (
        <FullLeaderboard onBack={() => setShowFullLeaderboard(false)} />
      )}

      {/* Tab bar */}
      {!showFullLeaderboard && (<>
      <div className="flex gap-1 p-1 rounded-xl bg-muted">
        {(['feed', 'crews', 'discover'] as SocialTab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${
              tab === t ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
            }`}
          >
            {t === 'feed' ? 'Feed' : t === 'crews' ? 'Crews' : 'Discover'}
          </button>
        ))}
      </div>

      {/* ========== FEED TAB ========== */}
      {tab === 'feed' && (
        <section aria-label="Activity feed">
        <div ref={feedContainerRef} className="!mt-3" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
          {/* Feed sub-tabs: Following | Discover */}
          <div className="flex gap-2">
            {(['following', 'discover'] as FeedSubTab[]).map(st => (
              <button key={st} onClick={() => setFeedSubTab(st)}
                className={`px-4 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  feedSubTab === st
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground'
                }`}>
                {st === 'following' ? 'Following' : 'Discover'}
              </button>
            ))}
          </div>

          {feedSubTab === 'following' && (
            <div className="mt-4">
              {/*
                If the user has <2 follows, a real leaderboard would just
                show them (and maybe one other person) — reads as "app is
                empty". Replace the slot with a trajectory card that
                reframes the space around personal progression: week-over-
                week hybrid score. Keeps the slot useful until the user
                builds a social graph. `followingCount === null` = still
                loading → render nothing so we don't flash the wrong card.
              */}
              {followingCount !== null && (
                followingCount >= 2
                  ? <LeaderboardCard challenge="weekly_hybrid" onViewFull={() => setShowFullLeaderboard(true)} />
                  : <TrajectoryCard />
              )}
            </div>
          )}

          {pullRefreshing && (
            <div className="flex items-center justify-center py-2" aria-live="polite">
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
            </div>
          )}

          {activeFeed.items.length > 0 && !pullRefreshing && (
            <button onClick={activeFeed.refresh}
              aria-label="Refresh feed"
              className="flex items-center justify-center w-full py-3 text-muted-foreground hover:text-foreground transition-colors">
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          )}

          {feedSubTab === 'following' && followingFeed.error && (
            <div className="flex items-center justify-between p-3 rounded-xl bg-destructive/10 border border-destructive/20" aria-live="polite">
              <p className="text-xs text-destructive">{followingFeed.error}</p>
              <button onClick={followingFeed.refresh}
                className="text-xs font-medium text-destructive underline ml-2 shrink-0">Retry</button>
            </div>
          )}

          {/* Discover feed errors are silenced — empty state handles both no-data and error */}

          <div className="space-y-3">
            {activeFeed.items.map(item => (
              <ActivityCard key={item.id} feedItem={item} />
            ))}
          </div>

          {/*
            Two different loading states:
              - Initial load (no items yet) — render 3 staggered
                skeleton cards so the feed surface has visual weight
                while waiting for the first batch. Feels dramatically
                snappier than flashing blank then popping in content.
              - Pagination load (items already present) — keep the
                small centred spinner; full skeletons below real
                cards would be visually noisy.
          */}
          {activeFeed.loading && activeFeed.items.length === 0 && (
            <div className="space-y-3" aria-live="polite" aria-label="Loading feed">
              <ActivityCardSkeleton stagger={0} />
              <ActivityCardSkeleton stagger={1} />
              <ActivityCardSkeleton stagger={2} />
            </div>
          )}
          {activeFeed.loading && activeFeed.items.length > 0 && (
            <div className="flex items-center justify-center py-4" aria-live="polite">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            </div>
          )}

          {/* Infinite scroll sentinel */}
          {activeFeed.hasMore && !activeFeed.loading && activeFeed.items.length > 0 && (
            <div ref={sentinelRef} className="h-1" aria-hidden="true" />
          )}

          {/* Empty state — show when no results (including silenced errors) */}
          {!activeFeed.loading && activeFeed.items.length === 0 && (
            <div className="mt-6" aria-live="polite">
              {feedSubTab === 'discover' ? (
                <EmptyState
                  icon={<Globe size={32} />}
                  title="Be the first to share"
                  description="Complete a workout or run and it'll appear here for the community"
                  accentColor={THEME.brand}
                  action={{ label: 'Start a workout', href: '/program' }}
                />
              ) : (
                <div className="text-center py-12 px-6 space-y-4">
                  <div
                    className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto"
                    style={{ background: `${THEME.brand}15`, border: `1px solid ${THEME.brand}25` }}
                  >
                    <Users size={32} style={{ color: THEME.brand }} />
                  </div>
                  <div className="space-y-1.5">
                    <p className="text-sm font-semibold text-foreground">Follow someone to start competing</p>
                    <p className="text-xs text-muted-foreground max-w-[240px] mx-auto leading-relaxed">
                      Their workouts, runs, and milestones will show up here
                    </p>
                  </div>
                  <button
                    onClick={() => setTab('discover')}
                    className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-medium text-sm active:scale-[0.97] transition-transform"
                  >
                    Find people to follow
                  </button>
                  <button
                    onClick={() => setFeedSubTab('discover')}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Or explore the community &rarr;
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
        </section>
      )}

      {/* ========== CREWS TAB ==========
          Crews + challenges share this tab. Long-term (PR 3) challenges
          live inside individual crew pages and "Crews" becomes a list
          of crew homes — for now they sit side-by-side so neither
          feature loses an entry point. Progress photos used to be a
          peer tab here; they moved to the user's own profile because
          they're a private/personal artifact, not social content. */}
      {tab === 'crews' && (
        <section aria-label="Crews and challenges" className="space-y-6">
          {/* Challenges — placed first because they're the active /
              competitive surface. Empty-state CTA jumps to Discover so
              users have a clear path to find people to challenge. */}
          <ChallengeList onFindFriends={() => setTab('discover')} />

          {/* Crews list */}
          <div className="space-y-3">
            <p className="text-small font-semibold text-foreground">Crews</p>
            <div className="space-y-2">
              {crews.slice(0, 5).map((crew) => {
                const isMember = currentCrew?.id === crew.id;
                const IconComp = ICON_MAP[crew.icon];
                /* Subtext priority:
                   1. crew.description (set on creation) — gives the
                      crew an actual purpose line.
                   2. "Be the first to join" when no members — softer
                      than "0 members" which reads as a dead room.
                   3. Member count otherwise. */
                const subtext = crew.description?.trim()
                  ? crew.description
                  : crew.memberCount === 0
                    ? 'Be the first to join'
                    : `${crew.memberCount} member${crew.memberCount === 1 ? '' : 's'}`;
                return (
                  <div key={crew.id} className="flex items-center gap-3 p-3 rounded-xl bg-card">
                    {IconComp ? (
                      <IconComp size={24} className="text-muted-foreground shrink-0" />
                    ) : (
                      <span className="text-2xl shrink-0">{crew.icon}</span>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{crew.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{subtext}</p>
                    </div>
                    <button
                      onClick={() => {
                        if (isMember) {
                          setLeavingCrewId(crew.id);
                        } else {
                          joinCrew(crew.id);
                        }
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all shrink-0 ${
                        isMember ? 'bg-muted text-muted-foreground' : 'bg-primary text-primary-foreground'
                      }`}>
                      {isMember ? 'Leave' : 'Join'}
                    </button>
                  </div>
                );
              })}
            </div>

            <button onClick={() => setShowCreateGroup(true)}
              className="w-full py-3 rounded-xl bg-card border border-border/50 shadow-sm text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              + Create a Crew
            </button>
          </div>

          {/* Leave Crew Confirmation Modal */}
          {leavingCrewId && (
            <>
              <div className="fixed inset-0 bg-black/50 z-40" role="presentation" onClick={() => setLeavingCrewId(null)} />
              <div ref={leaveCrewRef} role="dialog" aria-modal="true" className="fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl p-5 space-y-4" style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
                <div className="w-10 h-1 rounded-full bg-border mx-auto" />
                <p className="text-base font-semibold text-foreground">Leave crew?</p>
                <p className="text-sm text-muted-foreground">You can rejoin this crew later.</p>
                <div className="flex gap-2">
                  <button onClick={() => setLeavingCrewId(null)}
                    className="flex-1 py-3 rounded-xl bg-muted text-foreground font-medium text-sm">
                    Cancel
                  </button>
                  <button onClick={async () => {
                    await leaveCrew();
                    setLeavingCrewId(null);
                    toast.success('Left crew');
                  }}
                    className="flex-1 py-3 rounded-xl bg-destructive text-destructive-foreground font-medium text-sm">
                    Leave
                  </button>
                </div>
              </div>
            </>
          )}

          {/* Create Crew Modal */}
          {showCreateGroup && (
            <>
              <div className="fixed inset-0 bg-black/50 z-40" role="presentation" onClick={() => setShowCreateGroup(false)} />
              <div ref={createCrewRef} role="dialog" aria-modal="true" className="fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl p-5 space-y-4" style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
                <div className="w-10 h-1 rounded-full bg-border mx-auto" />
                <h3 className="text-base font-semibold text-foreground">Create a Crew</h3>
                <input type="text" placeholder="Crew name" value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-muted border border-border/50 text-sm text-foreground" />
                <input type="text" placeholder="Description" value={newGroupDesc}
                  onChange={(e) => setNewGroupDesc(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-muted border border-border/50 text-sm text-foreground" />
                <div className="flex gap-2 flex-wrap">
                  {[
                    { name: 'dumbbell', Icon: Dumbbell },
                    { name: 'footprints', Icon: Footprints },
                    { name: 'zap', Icon: Zap },
                    { name: 'target', Icon: Target },
                    { name: 'flame', Icon: Flame },
                    { name: 'salad', Icon: Salad },
                    { name: 'person', Icon: PersonStanding },
                    { name: 'medal', Icon: Medal },
                    { name: 'sunrise', Icon: Sunrise },
                  ].map(({ name, Icon }) => (
                    <button key={name} onClick={() => setNewGroupIcon(name)}
                      className={`p-2.5 rounded-lg ${newGroupIcon === name ? 'bg-primary/20 ring-2 ring-primary' : 'bg-muted'}`}>
                      <Icon size={24} className={newGroupIcon === name ? 'text-primary' : 'text-muted-foreground'} />
                    </button>
                  ))}
                </div>
                <button
                  onClick={async () => {
                    if (!newGroupName.trim() || creatingCrew) return;
                    setCreatingCrew(true);
                    try {
                      await createCrew(newGroupName, newGroupDesc, newGroupIcon || 'dumbbell');
                      setShowCreateGroup(false);
                      setNewGroupName('');
                      setNewGroupDesc('');
                      setNewGroupIcon('');
                      toast.success('Crew created!');
                    } catch {
                      toast.error('Failed to create crew. Please try again.');
                    } finally {
                      setCreatingCrew(false);
                    }
                  }}
                  disabled={!newGroupName.trim() || creatingCrew}
                  className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-medium text-sm disabled:opacity-50">
                  {creatingCrew ? 'Creating...' : 'Create Crew'}
                </button>
              </div>
            </>
          )}
        </section>
      )}

      {/* ========== DISCOVER TAB ==========
          Renamed from "Find". Holds the discovery affordances that
          aren't crews: invite link, search, contact sync, suggested
          people. Crews moved to their own tab so this surface stays
          focused on "find a person, bring a friend in." */}
      {tab === 'discover' && (
        <section aria-label="Find people">
        <div className="space-y-6">
          {/* Section 1: Invite link CTA — primary growth path on web.
              Compressed from py-4/mb-3 to py-3/mb-2 because at the
              previous size it visually competed with the search +
              suggested-people sections that come after it. */}
          <div
            className="p-3 rounded-2xl border"
            style={{
              background: `linear-gradient(135deg, ${THEME.brand}18, ${THEME.brand}08)`,
              borderColor: `${THEME.brand}33`,
            }}
          >
            <div className="flex items-start gap-3 mb-2">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: `${THEME.brand}25` }}
              >
                <Share2 className="w-4 h-4" style={{ color: THEME.brand }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">Bring a friend</p>
                <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">
                  Train together. Stay consistent.
                </p>
              </div>
            </div>
            <button
              onClick={handleShareInvite}
              className="w-full py-2.5 rounded-xl text-primary-foreground font-medium text-sm active:scale-[0.97] transition-transform"
              style={{ background: THEME.brand }}
            >
              Share invite link
            </button>
          </div>

          {/* Section 2: Search */}
          <div className="space-y-3">
            <p className="text-small font-semibold text-foreground">Search by name</p>
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Search by name..."
                value={searchQuery}
                onChange={e => handleSearchInputChange(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current); handleSearch(); } }}
                className="flex-1 h-12 px-4 rounded-xl bg-muted border border-border/50 text-sm text-foreground placeholder:text-muted-foreground"
              />
              <button onClick={() => handleSearch()} disabled={searching || !searchQuery.trim()}
                className="h-12 w-12 rounded-xl bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 shrink-0">
                {searching ? '...' : 'Go'}
              </button>
            </div>
            {searchResults.length > 0 && (
              <div className="space-y-2">
                {searchResults.map((u) => (
                  <div key={u.uid} className="flex items-center gap-3 p-3 rounded-xl bg-card">
                    <Avatar photoURL={u.photoURL} displayName={u.displayName || 'Athlete'} size="md" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{u.displayName || 'Athlete'}</p>
                      {u.crewId && <p className="text-xs text-muted-foreground">Crew member</p>}
                    </div>
                    <FollowButton targetUid={u.uid} />
                  </div>
                ))}
              </div>
            )}
            {searchQuery.trim() && !searching && searchResults.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-4" aria-live="polite">
                No users found for &ldquo;{searchQuery.trim()}&rdquo;
              </p>
            )}
          </div>

          {/*
            Section 3: Contact Sync — hidden on web because the
            implementation lives behind a Capacitor contacts plugin
            that isn't available in a browser. Rather than surface a
            button that opens a modal saying "only in the iOS app",
            we just hide the section until the user is in the native
            shell. Surfaces back automatically on iOS / Android builds.
          */}
          {isNativePlatform() && (
            <div className="space-y-2">
              <p className="text-small font-semibold text-foreground">Find friends from contacts</p>
              <button onClick={() => setShowContactModal(true)}
                className="w-full py-3 rounded-lg border border-border/50 bg-muted text-foreground text-sm font-medium hover:bg-muted/80 transition-colors"
                style={{ borderLeft: `3px solid ${THEME.brand}80` }}>
                Sync Contacts
              </button>
            </div>
          )}

          {/* Section 4: Suggested People */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-small font-semibold text-foreground">Suggested people</p>
              {suggestedPeople.length > 0 && !suggestedLoading && (
                <button
                  onClick={refreshSuggestions}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Refresh suggestions"
                >
                  Refresh
                </button>
              )}
            </div>
            {suggestedLoading && suggestedPeople.length === 0 ? (
              <div className="p-4 rounded-xl bg-card border border-border/50 flex items-center justify-center">
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              </div>
            ) : suggestedPeople.length === 0 ? (
              <div className="p-4 rounded-xl bg-card border border-border/50 text-center">
                <p className="text-xs text-muted-foreground">
                  {profile?.crewId && currentCrew
                    ? 'Suggestions appear as more athletes join your crew'
                    : 'Suggestions appear as you join crews and follow athletes'}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {suggestedPeople.map((p) => (
                  <div key={p.uid} className="flex items-center gap-3 p-3 rounded-xl bg-card">
                    <Avatar photoURL={p.photoURL} displayName={p.displayName} size="md" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{p.displayName}</p>
                      <p className="text-xs text-muted-foreground">
                        {p.reason === 'in_your_crew' ? 'In your crew' : 'Recent post'}
                      </p>
                    </div>
                    <FollowButton
                      targetUid={p.uid}
                      onFollowChange={(isFollowing) => {
                        // Moved from "Suggested" to the user's Following feed —
                        // remove from the suggestion list for immediate feedback.
                        if (isFollowing) removeSuggestion(p.uid);
                      }}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Contact Sync Modal */}
          {showContactModal && (
            <>
              <div className="fixed inset-0 bg-black/50 z-40" role="presentation" onClick={() => setShowContactModal(false)} />
              <div ref={contactModalRef} role="dialog" aria-modal="true" className="fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl p-5 space-y-4" style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
                <div className="w-10 h-1 rounded-full bg-border mx-auto" />
                <div className="text-center space-y-3 py-4">
                  <Smartphone className="w-10 h-10 text-primary mx-auto" />
                  <p className="text-base font-semibold text-foreground">Contact syncing</p>
                  <p className="text-sm text-muted-foreground">Contact syncing is available in the Tropos iOS app. Download it to find friends from your phone.</p>
                  <p className="text-xs text-muted-foreground">In the meantime, you can search by name above.</p>
                </div>
                <button onClick={() => setShowContactModal(false)}
                  className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-medium text-sm">
                  Got it
                </button>
              </div>
            </>
          )}

        </div>
        </section>
      )}
      </>)}
    </motion.div>
  );
}
