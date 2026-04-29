import { useSocialFeed } from '../hooks/useSocialFeed';
import { useDiscoverFeed } from '../hooks/useDiscoverFeed';
import { useCrews } from '../hooks/useCrews';
import { useBlockedUsers } from '../hooks/useBlockedUsers';
import { useSuggestedPeople } from '../hooks/useSuggestedPeople';
import { useState, useRef, useCallback, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { searchUsers, getBoundedFollowingCount } from '../lib/socialApi';
import ActivityCard from '../components/social/ActivityCard';
import LeaderboardCard from '../components/social/LeaderboardCard';
import TrajectoryCard from '../components/social/TrajectoryCard';
import Avatar from '../components/Avatar';
import { ActivityCardSkeleton } from '../components/LoadingSkeleton';
import FollowButton from '../components/social/FollowButton';
import { ChallengeList } from '../features/challenges/ChallengeList';
import FullLeaderboard from '../components/social/FullLeaderboard';
import { Share2, Users, Globe, Dumbbell, Footprints, Zap, Target, Flame, Salad, PersonStanding, Medal, Sunrise, Loader2, X, Search } from 'lucide-react';
import { toast } from 'sonner';
import { THEME } from '../lib/theme';
import { EmptyState } from '../components/EmptyState';
import { motion, AnimatePresence } from 'framer-motion';
import { useFocusTrap } from '@/hooks/useFocusTrap';

/* "discover" used to mean two different things: a top-level tab AND
   a feed sub-tab. The top-level tab is now `find` (search + invite +
   suggestions) and the feed sub-tab is `explore` (public activity).
   Naming collision audited and removed. */
type SocialTab = 'feed' | 'crews' | 'find';
type FeedSubTab = 'following' | 'explore';

// Crew icons live in src/lib/crewIcons so the Crew page can render
// the same glyph the list row shows.
import { CREW_ICON_MAP as ICON_MAP } from '../lib/crewIcons';

export default function Social() {
  const { user, profile } = useAuth();
  /* useBlockedUsers now returns { blocked, addBlocked, removeBlocked }
     so ActivityCard can mutate the shared set after a block write
     completes. We only care about the Set here for filtering — the
     mutators are consumed by ActivityCard which calls useBlockedUsers
     itself. The module-level cache keeps the two instances in sync. */
  const { blocked: blockedUsers } = useBlockedUsers();
  const [tab, setTab] = useState<SocialTab>('feed');
  /**
   * Smart default: new / zero-follow users land on Discover; users
   * with any follows land on Following. One cheap limit(2) read
   * decides both "do I have any follows" (smart default tab) AND
   * "do I have ≥2 follows" (leaderboard vs trajectory card).
   * While we wait, we default to 'explore' so a brand-new user
   * never sees a flash of the empty Following state before
   * resolution. `followingCount` is bounded at 2 — we only care
   * about the threshold, not the exact number.
   */
  const [feedSubTab, setFeedSubTab] = useState<FeedSubTab>('explore');
  const [followingCount, setFollowingCount] = useState<number | null>(null);
  useEffect(() => {
    if (!user || followingCount !== null) return;
    let cancelled = false;
    getBoundedFollowingCount(user.uid, 2)
      .then((n) => {
        if (cancelled) return;
        setFollowingCount(n);
        setFeedSubTab(n > 0 ? 'following' : 'explore');
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
  /* Following feed is enabled only when the user is on the Feed tab
     AND the Following sub-tab. Previously it fetched on every Social
     mount even when the user landed straight on Discover and never
     opened Following — wasted reads on the cold start. */
  const followingFeed = useSocialFeed(false, blockedUsers, tab === 'feed' && feedSubTab === 'following');
  const exploreFeed = useDiscoverFeed(feedSubTab === 'explore', blockedUsers);
  const activeFeed = feedSubTab === 'following' ? followingFeed : exploreFeed;

  // Suggested People — fetches lazily only when the Discover tab is shown.
  const { people: suggestedPeople, loading: suggestedLoading, refresh: refreshSuggestions, remove: removeSuggestion } =
    useSuggestedPeople(tab === 'find', blockedUsers);

  // Crews
  const { crews, currentCrew, joinCrew, leaveCrew, createCrew } = useCrews();
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDesc, setNewGroupDesc] = useState('');
  const [newGroupIcon, setNewGroupIcon] = useState('');
  const [creatingCrew, setCreatingCrew] = useState(false);

  // Leave crew modal (#19)
  const [leavingCrewId, setLeavingCrewId] = useState<string | null>(null);
  /* Per-crew busy state — tracks the crew the user is currently
     joining so the row button can disable + show "Joining…". Without
     this, double-taps would double-fire joinCrew. */
  const [joiningCrewId, setJoiningCrewId] = useState<string | null>(null);
  /* Busy flag for the leave-confirm sheet so a slow Firestore write
     can't be triggered twice (Cancel/Leave double tap would otherwise
     race). */
  const [leavingInFlight, setLeavingInFlight] = useState(false);

  // Find tab state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{ uid: string; displayName?: string; photoURL?: string; crewId?: string }[]>([]);
  const [searching, setSearching] = useState(false);
  /* Distinct error state lets the empty-results UI distinguish "no
     match for this query" (legitimate empty state) from "the network
     ate the request" (retryable). Previously failures collapsed into
     setSearchResults([]) which surfaced the same "No users found"
     copy as a real empty result, which lied to the user. */
  const [searchError, setSearchError] = useState<string | null>(null);
  const leaveCrewRef = useFocusTrap<HTMLDivElement>(!!leavingCrewId);
  const createCrewRef = useFocusTrap<HTMLDivElement>(showCreateGroup);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout>>(null);
  /* Sequencing guard: a slow request followed by a faster one could
     otherwise have its stale results overwrite the fresh ones. Each
     handleSearch invocation increments this counter; the resolution
     handler only writes results when the counter is still equal to
     the value captured at start. */
  const searchSeqRef = useRef(0);

  const MIN_SEARCH_LEN = 2;

  const handleSearch = useCallback(async (q?: string) => {
    const query = (q ?? searchQuery).trim();
    /* Min-length gate: 1-char queries hit the index hard and rarely
       produce useful results. Anything shorter just clears stale UI. */
    if (query.length < MIN_SEARCH_LEN) {
      setSearchResults([]);
      setSearchError(null);
      setSearching(false);
      return;
    }
    const seq = ++searchSeqRef.current;
    setSearching(true);
    setSearchError(null);
    try {
      const results = await searchUsers(query);
      if (seq !== searchSeqRef.current) return; // stale, newer search in flight
      const filtered = results
        .filter((u) => u.uid !== user?.uid)
        // Don't surface blocked users in search hits — same shared cache
        // the feed filters use, so a block from one surface flows here.
        .filter((u) => !blockedUsers.has(u.uid));
      setSearchResults(filtered);
    } catch {
      if (seq !== searchSeqRef.current) return;
      setSearchResults([]);
      setSearchError("Couldn't search right now. Try again.");
    }
    if (seq === searchSeqRef.current) setSearching(false);
  }, [searchQuery, user?.uid, blockedUsers]);

  const handleSearchInputChange = (value: string) => {
    setSearchQuery(value);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    if (value.trim().length >= MIN_SEARCH_LEN) {
      searchDebounceRef.current = setTimeout(() => handleSearch(value), 300);
    } else {
      /* Empty input → clear results immediately. Previously the input
         clearing left stale results on screen because the debounce
         block only fired for non-empty values, so the previous query's
         results stayed up indefinitely. */
      setSearchResults([]);
      setSearchError(null);
    }
  };

  /* Clean up any pending debounced search on unmount so a tab change
     mid-typing doesn't fire setState on an unmounted component. */
  useEffect(() => {
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, []);

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
      <motion.header variants={itemVariant} className="pt-1">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-extrabold text-foreground">Social</h1>
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
        {(['feed', 'crews', 'find'] as SocialTab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${
              tab === t ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
            }`}
          >
            {t === 'feed' ? 'Feed' : t === 'crews' ? 'Crews' : 'Find'}
          </button>
        ))}
      </div>

      {/* ========== FEED TAB ========== */}
      {tab === 'feed' && (
        <section aria-label="Activity feed">
        <div ref={feedContainerRef} className="!mt-3" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
          {/* Feed sub-tabs: Following | Explore */}
          <div className="flex gap-2">
            {(['following', 'explore'] as FeedSubTab[]).map(st => (
              <button key={st} onClick={() => setFeedSubTab(st)}
                className={`px-4 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  feedSubTab === st
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground'
                }`}>
                {st === 'following' ? 'Following' : 'Explore'}
              </button>
            ))}
          </div>

          {feedSubTab === 'following' && (
            <div className="mt-4 space-y-3">
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
              {/* Trajectory pairing: when the slot is the solo
                  trajectory card (thin social graph), follow it with
                  a low-key social next-step so the surface points
                  somewhere instead of dead-ending on personal stats.
                  One row, text-link CTA — same compact pattern as
                  the empty-feed prompt below. */}
              {followingCount !== null && followingCount < 2 && (
                <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-card border border-border/40">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                      style={{ background: `${THEME.brand}14` }}
                    >
                      <Users size={16} style={{ color: THEME.brand }} />
                    </div>
                    <p className="text-xs text-muted-foreground leading-snug">
                      Follow people or join a crew to compete this week
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setTab('find')}
                    className="text-xs font-medium text-primary hover:text-primary/80 transition-colors shrink-0"
                  >
                    Find people
                  </button>
                </div>
              )}
            </div>
          )}

          {pullRefreshing && (
            <div className="flex items-center justify-center py-2" aria-live="polite">
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
            </div>
          )}

          {/* The full-width refresh button that used to live here was
              an unlabelled lone icon between the trajectory card and
              the first activity row — looked like orphan chrome. The
              feed already has pull-to-refresh wired via the touch
              handlers on this container, so the button was redundant
              affordance for the same action. Removed in PR-bug-fix. */}

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
              {feedSubTab === 'explore' ? (
                <EmptyState
                  icon={<Globe size={32} />}
                  title="Be the first to share"
                  description="Complete a workout or run and it'll appear here for the community"
                  accentColor={THEME.brand}
                  action={{ label: 'Start a workout', href: '/program' }}
                />
              ) : (
                /* Inline prompt — sits as a supporting element under
                   TrajectoryCard. Was previously a full centered empty
                   state with a primary-purple "Find people to follow"
                   button which competed visually with the trajectory
                   card above it (two heroes stacked). Compressed to
                   one row with a text-link CTA so the trajectory card
                   stays the hero of the surface. Same compact pattern
                   as ChallengeList's empty state on the Crews tab. */
                <div className="flex items-center justify-between gap-3 p-3.5 rounded-xl bg-card border border-border/40">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                      style={{ background: `${THEME.brand}14` }}
                    >
                      <Users size={16} style={{ color: THEME.brand }} />
                    </div>
                    <p className="text-xs text-muted-foreground leading-snug">
                      Follow people to see their workouts and compete this week
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setTab('find')}
                    className="text-xs font-medium text-primary hover:text-primary/80 transition-colors shrink-0"
                  >
                    Find people
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
          <ChallengeList onFindFriends={() => setTab('find')} />

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
                  /* Crew row — body links to the per-crew page; the
                     Join/Leave button is a sibling so its click
                     doesn't bubble into the navigation. */
                  <div key={crew.id} className="flex items-center gap-3 p-3 rounded-xl bg-card">
                    <Link to={`/crew/${crew.id}`} className="flex items-center gap-3 flex-1 min-w-0">
                      {IconComp ? (
                        <IconComp size={24} className="text-muted-foreground shrink-0" />
                      ) : (
                        <span className="text-2xl shrink-0">{crew.icon}</span>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{crew.name}</p>
                        <p className="text-sm text-muted-foreground truncate">{subtext}</p>
                      </div>
                    </Link>
                    <button
                      onClick={async (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (isMember) {
                          /* Tapping a member crew opens the leave-confirm sheet
                             rather than firing leaveCrew directly. The button
                             label stays positive ("Joined") because membership
                             is the success state — destructive copy belongs
                             behind the confirm flow. */
                          setLeavingCrewId(crew.id);
                          return;
                        }
                        if (joiningCrewId) return;
                        setJoiningCrewId(crew.id);
                        try {
                          await joinCrew(crew.id);
                        } finally {
                          setJoiningCrewId(null);
                        }
                      }}
                      disabled={!isMember && joiningCrewId === crew.id}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all shrink-0 disabled:opacity-60 ${
                        isMember ? 'bg-muted text-muted-foreground' : 'bg-primary text-primary-foreground'
                      }`}>
                      {isMember
                        ? 'Joined'
                        : joiningCrewId === crew.id
                          ? 'Joining…'
                          : 'Join'}
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
                    disabled={leavingInFlight}
                    className="flex-1 py-3 rounded-xl bg-muted text-foreground font-medium text-sm disabled:opacity-60">
                    Cancel
                  </button>
                  <button onClick={async () => {
                    if (leavingInFlight) return;
                    setLeavingInFlight(true);
                    try {
                      await leaveCrew();
                      setLeavingCrewId(null);
                      toast.success('Left crew');
                    } catch {
                      toast.error("Couldn't leave. Try again.");
                    } finally {
                      setLeavingInFlight(false);
                    }
                  }}
                    disabled={leavingInFlight}
                    className="flex-1 py-3 rounded-xl bg-destructive text-destructive-foreground font-medium text-sm disabled:opacity-60">
                    {leavingInFlight ? 'Leaving…' : 'Leave'}
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

      {/* ========== FIND TAB ==========
          Holds the people-discovery affordances that aren't crews:
          invite link, search, suggested people. Renamed from
          "Discover" to remove the naming collision with the Feed
          sub-tab also called Discover (now Explore). */}
      {tab === 'find' && (
        <section aria-label="Find people">
        <div className="space-y-6">
          {/* Section order rebuilt per audit: search-first because
              that's the highest-intent task on this surface. Suggested
              people next (most relevant social action). Popular crews
              third — always shown so the page never dead-ends when
              suggestions are empty (the previous IA left a mostly-
              blank page on cold-start users). Invite is the last
              section: still accessible, but no longer the dominant
              visual element. */}

          {/* Search.
              Single field with an embedded search icon prefix and an
              inline clear/spinner affordance on the right. The
              previously-separate "Go" submit button was redundant —
              the input auto-searches after 300ms of typing and Enter
              still fires immediately — so it's been folded into the
              field instead of competing for visual weight beside it. */}
          <div className="space-y-3">
            <p className="text-small font-semibold text-foreground">Find someone</p>
            <div className="relative">
              <Search
                className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none"
                aria-hidden="true"
              />
              <input
                type="text"
                placeholder="Search athletes"
                value={searchQuery}
                onChange={e => handleSearchInputChange(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current); handleSearch(); } }}
                aria-label="Search athletes"
                className="w-full h-12 pl-10 pr-11 rounded-xl bg-muted border border-border/50 text-sm text-foreground placeholder:text-muted-foreground"
              />
              {searching ? (
                <div
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                >
                  <Loader2 className="w-4 h-4 animate-spin" />
                </div>
              ) : searchQuery.length > 0 ? (
                /* Inline clear affordance — quicker than holding
                   backspace on mobile and clears results in one tap
                   via the empty-input branch of handleSearchInputChange. */
                <button
                  type="button"
                  onClick={() => handleSearchInputChange('')}
                  aria-label="Clear search"
                  className="absolute right-1 top-1 h-10 w-10 flex items-center justify-center text-muted-foreground hover:text-foreground"
                >
                  <X className="w-4 h-4" />
                </button>
              ) : null}
            </div>
            {searchResults.length > 0 && (
              <div className="space-y-2">
                {searchResults.map((u) => (
                  /* Tap-through to profile: avatar + name link to the
                     user's profile so search becomes the start of a
                     real social action, not just "see name → follow".
                     FollowButton stays a sibling so its click doesn't
                     bubble through the Link. */
                  <div key={u.uid} className="flex items-center gap-3 p-3 rounded-xl bg-card">
                    <Link
                      to={`/user/${u.uid}`}
                      className="flex items-center gap-3 flex-1 min-w-0"
                    >
                      <Avatar photoURL={u.photoURL} displayName={u.displayName || 'Athlete'} size="md" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{u.displayName || 'Athlete'}</p>
                        {u.crewId && <p className="text-sm text-muted-foreground">Crew member</p>}
                      </div>
                    </Link>
                    <FollowButton targetUid={u.uid} />
                  </div>
                ))}
              </div>
            )}
            {searchQuery.trim() && !searching && searchResults.length === 0 && !searchError && (
              <p className="text-xs text-muted-foreground text-center py-4" aria-live="polite">
                No users found for &ldquo;{searchQuery.trim()}&rdquo;
              </p>
            )}
            {searchError && (
              <div className="flex items-center justify-between p-3 rounded-xl bg-destructive/10 border border-destructive/20" aria-live="polite">
                <p className="text-xs text-destructive">{searchError}</p>
                <button onClick={() => handleSearch()}
                  className="text-xs font-medium text-destructive underline ml-2 shrink-0">Retry</button>
              </div>
            )}
          </div>

          {/* Contact Sync section was removed: it rendered a "Sync
              Contacts" button on native platforms that opened a modal
              saying "available in the Tropos iOS app — download it,"
              which is circular when the user is already IN the iOS
              app. No real Capacitor contacts plugin flow existed
              behind it. Per the audit, hide until properly
              implemented; surfaces (and the modal + state) re-add
              cleanly when there's a real flow to attach. */}

          {/* Suggested People */}
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
              /* Empty state with a real next step rather than a
                 dead-end caption. Falls through to the always-shown
                 Popular crews section below, but adds an explicit
                 jump to Crews so users on this surface understand
                 where the suggestion engine pulls from. */
              <div className="p-4 rounded-xl bg-card border border-border/50 text-center space-y-2">
                <p className="text-sm text-muted-foreground">
                  {profile?.crewId && currentCrew
                    ? "Suggestions show up as people in your crew get active."
                    : "Join a crew or follow people to start seeing suggestions."}
                </p>
                {!profile?.crewId && (
                  <button
                    type="button"
                    onClick={() => setTab('crews')}
                    className="text-sm font-medium text-primary hover:text-primary/80"
                  >
                    Browse crews
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {suggestedPeople.map((p) => (
                  <div key={p.uid} className="flex items-center gap-3 p-3 rounded-xl bg-card">
                    <Avatar photoURL={p.photoURL} displayName={p.displayName} size="md" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{p.displayName}</p>
                      <p className="text-sm text-muted-foreground">
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

          {/* Popular crews — fallback discovery when suggestions are
              empty AND a permanent surface for users to find groups
              they could join. Sorted by memberCount desc, excluding
              crews the user is already a member of. Limit 3 so the
              section stays compact. Hidden entirely if every crew
              is one the user already belongs to. */}
          {(() => {
            const otherCrews = crews
              .filter((c) => c.id !== currentCrew?.id)
              .slice(0, 3);
            if (otherCrews.length === 0) return null;
            return (
              <div className="space-y-2">
                <p className="text-small font-semibold text-foreground">Popular crews</p>
                <div className="space-y-2">
                  {otherCrews.map((crew) => {
                    const IconComp = ICON_MAP[crew.icon];
                    return (
                      <Link
                        key={crew.id}
                        to={`/crew/${crew.id}`}
                        className="flex items-center gap-3 p-3 rounded-xl bg-card"
                      >
                        {IconComp ? (
                          <IconComp size={24} className="text-muted-foreground shrink-0" />
                        ) : (
                          <span className="text-2xl shrink-0">{crew.icon}</span>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{crew.name}</p>
                          <p className="text-sm text-muted-foreground truncate">
                            {crew.description?.trim() || `${crew.memberCount} member${crew.memberCount === 1 ? '' : 's'}`}
                          </p>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* Bring a friend — moved to bottom. Still the primary growth
              path but no longer the dominant element on the page; the
              previous arrangement put it above search which is wrong
              for high-intent users trying to find someone specific. */}
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
                <p className="text-sm text-muted-foreground leading-relaxed mt-0.5">
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

        </div>
        </section>
      )}
      </>)}
    </motion.div>
  );
}
