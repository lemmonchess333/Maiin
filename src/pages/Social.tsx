import { useSocialFeed } from '../hooks/useSocialFeed';
import { useDiscoverFeed } from '../hooks/useDiscoverFeed';
import { useCrews } from '../hooks/useCrews';
import { useBlockedUsers } from '../hooks/useBlockedUsers';
import { useState, useRef, useCallback, useEffect } from 'react';
import { useAuth } from '../lib/auth';
import { searchUsers } from '../lib/socialApi';
import ActivityCard from '../components/social/ActivityCard';
import LeaderboardCard from '../components/social/LeaderboardCard';
import ProgressPhotos from '../components/social/ProgressPhotos';
import FollowButton from '../components/social/FollowButton';
import { ChallengeList } from '../features/challenges/ChallengeList';
import { RefreshCw, Share2, Users, UserPlus, Smartphone, Globe, Dumbbell, Footprints, Zap, Target, Flame, Salad, PersonStanding, Medal, Sunrise, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { THEME } from '../lib/theme';
import { EmptyState } from '../components/EmptyState';
import { motion, AnimatePresence } from 'framer-motion';
import { useFocusTrap } from '@/hooks/useFocusTrap';

type SocialTab = 'feed' | 'photos' | 'find' | 'challenges';
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
  const [feedSubTab, setFeedSubTab] = useState<FeedSubTab>('following');

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
  const [searchResults, setSearchResults] = useState<{ uid: string; displayName?: string; crewId?: string }[]>([]);
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

  return (
    <div className="space-y-4">
      <header>
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold">Social</h1>
        </div>
      </header>

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
              style={{ background: 'rgba(124, 110, 246, 0.04)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
              <button onClick={() => setTab('find')} className="flex items-center gap-3 flex-1 text-left">
                <Users className="w-5 h-5 text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-foreground">Join a crew to connect with others</p>
                  <p className="text-[10px] text-muted-foreground">Browse crews</p>
                </div>
              </button>
              <button onClick={dismissCrewBanner} className="p-1 text-muted-foreground hover:text-foreground transition-colors" aria-label="Dismiss">
                <X size={14} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tab bar */}
      <div className="flex gap-1 p-1 rounded-xl bg-muted">
        {(['feed', 'photos', 'challenges', 'find'] as SocialTab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              tab === t ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'
            }`}
          >
            {t === 'feed' ? 'Feed' : t === 'photos' ? 'Progress' : t === 'challenges' ? 'Challenges' : 'Find'}
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

          {feedSubTab === 'following' && <div className="mt-4"><LeaderboardCard challenge="weekly_hybrid" /></div>}

          {pullRefreshing && (
            <div className="flex items-center justify-center py-2" aria-live="polite">
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
            </div>
          )}

          {activeFeed.items.length > 0 && !pullRefreshing && (
            <button onClick={activeFeed.refresh}
              aria-label="Refresh feed"
              className="flex items-center justify-center w-full py-1 text-muted-foreground hover:text-foreground transition-colors">
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

          {activeFeed.loading && (
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
                  icon={<Globe size={28} />}
                  title="Be the first to share"
                  description="Complete a workout or run, and it'll show up here for others to see."
                  accentColor={THEME.brand}
                />
              ) : (
                <EmptyState
                  icon={<Users size={28} />}
                  title="No activity yet"
                  description="Follow people to see their workouts and runs here"
                  accentColor={THEME.brand}
                  action={{ label: 'Find People', onClick: () => setTab('find') }}
                />
              )}
            </div>
          )}
        </div>
        </section>
      )}

      {/* ========== PROGRESS TAB ========== */}
      {tab === 'photos' && <ProgressPhotos />}

      {/* ========== CHALLENGES TAB ========== */}
      {tab === 'challenges' && <ChallengeList />}

      {/* ========== FIND TAB ========== */}
      {tab === 'find' && (
        <section aria-label="Find people">
        <div className="space-y-6">
          {/* Section 1: Invite */}
          <div className="p-4 rounded-2xl bg-card text-center space-y-3">
            <UserPlus className="w-8 h-8 text-primary mx-auto" />
            <p className="text-sm font-bold text-foreground">Train together</p>
            <p className="text-xs text-muted-foreground">Invite friends to compete on challenges and share workouts</p>
            <button onClick={handleShareInvite}
              className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-medium text-sm active:scale-[0.97] transition-transform">
              <div className="flex items-center justify-center gap-2">
                <Share2 className="w-4 h-4" />
                Share invite link
              </div>
            </button>
          </div>

          {/* Section 2: Search */}
          <div className="space-y-3">
            <p className="text-[15px] font-semibold text-foreground">Search by name</p>
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Search by name..."
                value={searchQuery}
                onChange={e => handleSearchInputChange(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current); handleSearch(); } }}
                className="flex-1 h-12 px-4 rounded-xl bg-muted border border-border/50 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
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
                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">
                      {(u.displayName || '?').charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{u.displayName || 'Athlete'}</p>
                      {u.crewId && <p className="text-[10px] text-muted-foreground">Crew member</p>}
                    </div>
                    <FollowButton targetUid={u.uid} />
                  </div>
                ))}
              </div>
            )}
            {/* No search results state (#20) */}
            {searchQuery.trim() && !searching && searchResults.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-4" aria-live="polite">
                No users found for &ldquo;{searchQuery.trim()}&rdquo;
              </p>
            )}
          </div>

          {/* Section 3: Suggested People (#16) */}
          <div className="space-y-2">
            <p className="text-[15px] font-semibold text-foreground">Suggested people</p>
            {profile?.crewId && currentCrew ? (
              <p className="text-xs text-muted-foreground p-4 rounded-xl bg-muted/50 border border-border/30 text-center">
                People from your crew will appear here as more athletes join.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground p-4 rounded-xl bg-muted/50 border border-border/30 text-center">
                Join a crew to see suggestions
              </p>
            )}
          </div>

          {/* Section 4: Contact Sync Stub */}
          <div className="space-y-2">
            <p className="text-[15px] font-semibold text-foreground">Find friends from contacts</p>
            <button onClick={() => setShowContactModal(true)}
              className="w-full py-3 rounded-lg border border-border/50 bg-muted text-foreground text-sm font-medium hover:bg-muted/80 transition-colors"
              style={{ borderLeft: '3px solid rgba(124, 110, 246, 0.5)' }}>
              Sync Contacts
            </button>
          </div>

          {/* Contact Sync Modal */}
          {showContactModal && (
            <>
              <div className="fixed inset-0 bg-black/40 z-40" role="presentation" onClick={() => setShowContactModal(false)} />
              <div ref={contactModalRef} role="dialog" aria-modal="true" className="fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl p-5 space-y-4" style={{ background: 'var(--glass-bg)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', border: '1px solid var(--glass-border)' }}>
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

          {/* Crews Section */}
          <div className="space-y-3">
            <p className="text-[15px] font-semibold text-foreground">Crews</p>
            <div className="space-y-2">
              {crews.slice(0, 5).map((crew) => {
                const isMember = currentCrew?.id === crew.id;
                const IconComp = ICON_MAP[crew.icon];
                return (
                  <div key={crew.id} className="flex items-center gap-3 p-3 rounded-xl bg-card">
                    {/* Crew icon — render Lucide component if available (#18) */}
                    {IconComp ? (
                      <IconComp size={24} className="text-muted-foreground" />
                    ) : (
                      <span className="text-2xl">{crew.icon}</span>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">{crew.name}</p>
                      <p className="text-[10px] text-muted-foreground">{crew.memberCount} member{crew.memberCount !== 1 ? 's' : ''}</p>
                    </div>
                    <button
                      onClick={() => {
                        if (isMember) {
                          setLeavingCrewId(crew.id);
                        } else {
                          joinCrew(crew.id);
                        }
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        isMember ? 'bg-muted text-muted-foreground' : 'bg-primary text-primary-foreground'
                      }`}>
                      {isMember ? 'Leave' : 'Join'}
                    </button>
                  </div>
                );
              })}
            </div>

            <button onClick={() => setShowCreateGroup(true)}
              className="w-full py-3 rounded-xl border border-dashed border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
              style={{ background: 'rgba(124, 110, 246, 0.03)' }}>
              + Create a Crew
            </button>
          </div>

          {/* Leave Crew Confirmation Modal (#19) */}
          {leavingCrewId && (
            <>
              <div className="fixed inset-0 bg-black/40 z-40" role="presentation" onClick={() => setLeavingCrewId(null)} />
              <div ref={leaveCrewRef} role="dialog" aria-modal="true" className="fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl p-5 space-y-4" style={{ background: 'var(--glass-bg)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', border: '1px solid var(--glass-border)' }}>
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

          {/* Create Crew Modal (#10 — error handling + loading) */}
          {showCreateGroup && (
            <>
              <div className="fixed inset-0 bg-black/40 z-40" role="presentation" onClick={() => setShowCreateGroup(false)} />
              <div ref={createCrewRef} role="dialog" aria-modal="true" className="fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl p-5 space-y-4" style={{ background: 'var(--glass-bg)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', border: '1px solid var(--glass-border)' }}>
                <div className="w-10 h-1 rounded-full bg-border mx-auto" />
                <h3 className="text-base font-semibold text-foreground">Create a Crew</h3>
                <input type="text" placeholder="Crew name" value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-muted border border-border/50 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50" />
                <input type="text" placeholder="Description" value={newGroupDesc}
                  onChange={(e) => setNewGroupDesc(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-muted border border-border/50 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50" />
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
        </div>
        </section>
      )}
    </div>
  );
}
