import { useSocialFeed } from '../hooks/useSocialFeed';
import { useDiscoverFeed } from '../hooks/useDiscoverFeed';
import { useCrews } from '../hooks/useCrews';
import { useState } from 'react';
import { useAuth } from '../lib/auth';
import { searchUsers, searchUsersByEmail } from '../lib/socialApi';
import ActivityCard from '../components/social/ActivityCard';
import LeaderboardCard from '../components/social/LeaderboardCard';
import ProgressPhotos from '../components/social/ProgressPhotos';
import FollowButton from '../components/social/FollowButton';
import { ChallengeList } from '../features/challenges/ChallengeList';
import { RefreshCw, Share2, Search, Users, UserPlus, Mail, Smartphone } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { toast } from 'sonner';

type SocialTab = 'feed' | 'photos' | 'find' | 'challenges';
type FeedSubTab = 'following' | 'discover';
type FeedFilter = 'all' | 'highlights';

export default function Social() {
  const { user, profile } = useAuth();
  const [tab, setTab] = useState<SocialTab>('feed');
  const [feedSubTab, setFeedSubTab] = useState<FeedSubTab>('following');
  const [feedFilter, setFeedFilter] = useState<FeedFilter>('all');

  // Feed hooks
  const followingFeed = useSocialFeed(feedFilter === 'highlights');
  const discoverFeed = useDiscoverFeed();
  const activeFeed = feedSubTab === 'following' ? followingFeed : discoverFeed;

  // Crews
  const { crews, currentCrew, joinCrew, leaveCrew, createCrew } = useCrews();
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDesc, setNewGroupDesc] = useState('');
  const [newGroupIcon, setNewGroupIcon] = useState('');

  // Find tab state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchMode, setSearchMode] = useState<'name' | 'email'>('name');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [showContactModal, setShowContactModal] = useState(false);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const results = searchMode === 'email'
        ? await searchUsersByEmail(searchQuery.trim())
        : await searchUsers(searchQuery.trim());
      setSearchResults(results.filter((u: any) => u.uid !== user?.uid));
    } catch {
      setSearchResults([]);
    }
    setSearching(false);
  };

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
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold">Activity</h1>
      </div>

      {/* Crew banner if no crew */}
      {!profile?.crewId && tab === 'feed' && (
        <button onClick={() => setTab('find')}
          className="w-full flex items-center gap-3 p-3 rounded-xl border border-dashed border-primary/30 bg-primary/5 text-left">
          <Users className="w-5 h-5 text-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-foreground">Join a crew to connect with others</p>
            <p className="text-[10px] text-muted-foreground">Browse crews</p>
          </div>
        </button>
      )}

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
        <>
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

            {/* Filter toggle on Following */}
            {feedSubTab === 'following' && (
              <div className="ml-auto flex gap-1">
                {(['all', 'highlights'] as FeedFilter[]).map(f => (
                  <button key={f} onClick={() => setFeedFilter(f)}
                    className={`px-3 py-1.5 rounded-full text-[10px] font-medium transition-colors ${
                      feedFilter === f
                        ? 'bg-foreground/10 text-foreground'
                        : 'text-muted-foreground'
                    }`}>
                    {f === 'all' ? 'All' : 'Highlights'}
                  </button>
                ))}
              </div>
            )}
          </div>

          {feedSubTab === 'following' && <LeaderboardCard challenge="weekly_hybrid" />}

          {activeFeed.items.length > 0 && (
            <button onClick={activeFeed.refresh}
              className="flex items-center justify-center w-full py-1 text-muted-foreground hover:text-foreground transition-colors">
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          )}

          <div className="space-y-3">
            {activeFeed.items.map(item => (
              <ActivityCard key={item.id} feedItem={item} />
            ))}
          </div>

          {activeFeed.loading && <p className="text-xs text-muted-foreground text-center animate-pulse">Loading...</p>}

          {activeFeed.hasMore && !activeFeed.loading && activeFeed.items.length > 0 && (
            <button onClick={activeFeed.loadMore} className="w-full py-2 text-xs text-purple-500 font-medium">
              Load more
            </button>
          )}

          {!activeFeed.loading && activeFeed.items.length === 0 && (
            <div className="text-center py-16 space-y-3">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-100 to-indigo-100 dark:from-purple-900/30 dark:to-indigo-900/30 flex items-center justify-center mx-auto">
                <p className="text-3xl">{feedSubTab === 'discover' ? '🌍' : '👋'}</p>
              </div>
              <p className="text-sm font-bold text-foreground">
                {feedSubTab === 'discover' ? 'No public activities yet' : 'No activity yet'}
              </p>
              <p className="text-xs text-muted-foreground max-w-[220px] mx-auto">
                {feedSubTab === 'discover'
                  ? "Be the first to share! Your workouts will appear here when set to Public."
                  : feedFilter === 'highlights'
                    ? "No highlights yet. Keep training — your achievements will show up here."
                    : "Follow people to see their workouts and runs here"}
              </p>
              {feedSubTab === 'following' && feedFilter === 'all' && (
                <button onClick={() => setTab('find')}
                  className="mt-2 text-xs px-5 py-2.5 rounded-full bg-purple-500 text-white font-medium active:scale-95 transition-transform">
                  Find People
                </button>
              )}
            </div>
          )}
        </>
      )}

      {/* ========== PROGRESS TAB ========== */}
      {tab === 'photos' && <ProgressPhotos />}

      {/* ========== CHALLENGES TAB ========== */}
      {tab === 'challenges' && <ChallengeList />}

      {/* ========== FIND TAB ========== */}
      {tab === 'find' && (
        <div className="space-y-5">
          {/* Section 1: Invite */}
          <div className="p-4 rounded-2xl bg-card border border-border/50 text-center space-y-3">
            <UserPlus className="w-8 h-8 text-primary mx-auto" />
            <p className="text-sm font-bold text-foreground">Train together</p>
            <p className="text-xs text-muted-foreground">Invite friends to compete on challenges and share workouts</p>
            <button onClick={handleShareInvite}
              className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-medium text-sm active:scale-[0.98] transition-transform">
              <div className="flex items-center justify-center gap-2">
                <Share2 className="w-4 h-4" />
                Share invite link
              </div>
            </button>
          </div>

          {/* Section 2: Search */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Search</p>
              <div className="ml-auto flex gap-1">
                <button onClick={() => setSearchMode('name')}
                  className={`px-2.5 py-1 rounded-full text-[10px] font-medium ${searchMode === 'name' ? 'bg-primary/10 text-primary' : 'text-muted-foreground'}`}>
                  <Search className="w-3 h-3 inline mr-1" />Name
                </button>
                <button onClick={() => setSearchMode('email')}
                  className={`px-2.5 py-1 rounded-full text-[10px] font-medium ${searchMode === 'email' ? 'bg-primary/10 text-primary' : 'text-muted-foreground'}`}>
                  <Mail className="w-3 h-3 inline mr-1" />Email
                </button>
              </div>
            </div>
            <div className="flex gap-2">
              <input
                type={searchMode === 'email' ? 'email' : 'text'}
                placeholder={searchMode === 'email' ? 'Search by email...' : 'Search by name...'}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                className="flex-1 px-4 py-3 rounded-xl bg-muted border border-border/50 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
              <button onClick={handleSearch} disabled={searching || !searchQuery.trim()}
                className="px-4 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50">
                {searching ? '...' : 'Go'}
              </button>
            </div>
            {searchResults.length > 0 && (
              <div className="space-y-2">
                {searchResults.map((u: any) => (
                  <div key={u.uid} className="flex items-center gap-3 p-3 rounded-xl bg-card border border-border/50">
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
          </div>

          {/* Section 3: Suggested People */}
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Suggested people</p>
            {profile?.crewId ? (
              <p className="text-xs text-muted-foreground p-4 rounded-xl bg-muted/50 border border-border/30 text-center">
                People from your crew will appear here as more athletes join.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground p-4 rounded-xl bg-muted/50 border border-border/30 text-center">
                Join a crew to see suggestions
              </p>
            )}
          </div>

          {/* Section 4: QR Code */}
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Your QR Code</p>
            <div className="p-4 rounded-2xl bg-card border border-border/50 flex flex-col items-center gap-4">
              {user && (
                <div className="bg-white p-3 rounded-xl">
                  <QRCodeSVG value={`${window.location.origin}/user/${user.uid}`} size={160} />
                </div>
              )}
              <p className="text-[10px] text-muted-foreground">Others can scan this to find your profile</p>
              <button disabled
                className="w-full py-3 rounded-xl bg-muted text-muted-foreground text-sm font-medium flex items-center justify-center gap-2 opacity-50">
                <Smartphone className="w-4 h-4" />
                Scan a Code — Available on iOS
              </button>
            </div>
          </div>

          {/* Section 5: Contact Sync Stub */}
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Find friends from contacts</p>
            <button onClick={() => setShowContactModal(true)}
              className="w-full py-3 rounded-xl border border-dashed border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors">
              Sync Contacts
            </button>
          </div>

          {/* Contact Sync Modal */}
          {showContactModal && (
            <>
              <div className="fixed inset-0 bg-black/40 z-40" onClick={() => setShowContactModal(false)} />
              <div className="fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl p-5 space-y-4" style={{ background: 'rgba(15,15,20,0.95)', backdropFilter: 'blur(20px)' }}>
                <div className="w-10 h-1 rounded-full bg-border mx-auto" />
                <div className="text-center space-y-3 py-4">
                  <Smartphone className="w-10 h-10 text-primary mx-auto" />
                  <p className="text-base font-semibold text-foreground">Contact syncing</p>
                  <p className="text-sm text-muted-foreground">Contact syncing is available in the Tropos iOS app. Download it to find friends from your phone.</p>
                  <p className="text-xs text-muted-foreground">In the meantime, you can search by email above.</p>
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
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Crews</p>
            <div className="space-y-2">
              {crews.slice(0, 5).map((crew) => {
                const isMember = currentCrew?.id === crew.id;
                return (
                  <div key={crew.id} className="flex items-center gap-3 p-3 rounded-xl bg-card border border-border/50">
                    <span className="text-2xl">{crew.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">{crew.name}</p>
                      <p className="text-[10px] text-muted-foreground">{crew.memberCount} member{crew.memberCount !== 1 ? 's' : ''}</p>
                    </div>
                    <button
                      onClick={() => isMember ? leaveCrew() : joinCrew(crew.id)}
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
              className="w-full py-3 rounded-xl border border-dashed border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors">
              + Create a Crew
            </button>
          </div>

          {/* Create Crew Modal */}
          {showCreateGroup && (
            <>
              <div className="fixed inset-0 bg-black/40 z-40" onClick={() => setShowCreateGroup(false)} />
              <div className="fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl p-5 space-y-4" style={{ background: 'rgba(15,15,20,0.95)', backdropFilter: 'blur(20px)' }}>
                <div className="w-10 h-1 rounded-full bg-border mx-auto" />
                <h3 className="text-base font-semibold text-foreground">Create a Crew</h3>
                <input type="text" placeholder="Crew name" value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-muted border border-border/50 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50" />
                <input type="text" placeholder="Description" value={newGroupDesc}
                  onChange={(e) => setNewGroupDesc(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-muted border border-border/50 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50" />
                <div className="flex gap-2 flex-wrap">
                  {['💪','🏃','🏋️','⚡','🎯','🔥','🥗','🧘','🏅','🌅'].map(e => (
                    <button key={e} onClick={() => setNewGroupIcon(e)}
                      className={`text-2xl p-2 rounded-lg ${newGroupIcon === e ? 'bg-primary/20 ring-2 ring-primary' : 'bg-muted'}`}>
                      {e}
                    </button>
                  ))}
                </div>
                <button
                  onClick={async () => {
                    if (newGroupName.trim()) {
                      await createCrew(newGroupName, newGroupDesc, newGroupIcon || '💪');
                      setShowCreateGroup(false);
                      setNewGroupName('');
                      setNewGroupDesc('');
                      setNewGroupIcon('');
                    }
                  }}
                  disabled={!newGroupName.trim()}
                  className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-medium text-sm disabled:opacity-50">
                  Create Crew
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
