import { useSocialFeed } from '../hooks/useSocialFeed';
import { useGroups } from '../hooks/useGroups';
import { useState } from 'react';
import { useAuth } from '../lib/auth';
import ActivityCard from '../components/social/ActivityCard';
import LeaderboardCard from '../components/social/LeaderboardCard';
import ProgressPhotos from '../components/social/ProgressPhotos';
import { ChallengeList } from '../features/challenges/ChallengeList';
import { RefreshCw } from 'lucide-react';

type SocialTab = 'feed' | 'photos' | 'find' | 'challenges';

export default function Social() {
  const { items, loading, refresh, loadMore, hasMore } = useSocialFeed();
  const { user: _user } = useAuth();
  const { groups, myGroupIds, joinGroup, leaveGroup, createGroup } = useGroups();
  const [tab, setTab] = useState<SocialTab>('feed');
  const [groupSearch, setGroupSearch] = useState('');
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDesc, setNewGroupDesc] = useState('');
  const [newGroupIcon, setNewGroupIcon] = useState('');

  const filteredGroups = groups.filter(g =>
    g.name.toLowerCase().includes(groupSearch.toLowerCase()) ||
    g.description.toLowerCase().includes(groupSearch.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold">Activity</h1>
      </div>

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

      {tab === 'find' && (
        <div className="space-y-4">
          {/* Search */}
          <input
            type="text"
            placeholder="Search groups..."
            value={groupSearch}
            onChange={(e) => setGroupSearch(e.target.value)}
            className="w-full px-4 py-3 rounded-xl bg-muted border border-border/50 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          />

          {/* Popular Groups */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Popular Groups</p>
            <div className="space-y-2">
              {filteredGroups.map((group) => {
                const isMember = myGroupIds.has(group.id);
                return (
                  <div key={group.id} className="flex items-center gap-3 p-3 rounded-xl bg-card border border-border/50">
                    <span className="text-2xl">{group.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">{group.name}</p>
                      <p className="text-xs text-muted-foreground">{group.description}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{group.memberCount} member{group.memberCount !== 1 ? 's' : ''}</p>
                    </div>
                    <button
                      onClick={() => isMember ? leaveGroup(group.id) : joinGroup(group.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        isMember
                          ? 'bg-muted text-muted-foreground'
                          : 'bg-primary text-primary-foreground'
                      }`}
                    >
                      {isMember ? 'Leave' : 'Join'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Suggested People placeholder */}
          <div className="p-4 rounded-xl bg-muted/50 border border-border/30 text-center space-y-1">
            <p className="text-sm font-medium text-foreground">Suggested People</p>
            <p className="text-xs text-muted-foreground">Follow people to see their workouts. Suggestions appear as more people join.</p>
          </div>

          {/* Create Group button */}
          <button
            onClick={() => setShowCreateGroup(true)}
            className="w-full py-3 rounded-xl border border-dashed border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
          >
            + Create a Group
          </button>

          {/* Create Group Modal */}
          {showCreateGroup && (
            <>
              <div className="fixed inset-0 bg-black/40 z-40" onClick={() => setShowCreateGroup(false)} />
              <div className="fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl p-5 space-y-4" style={{ background: 'rgba(15,15,20,0.95)', backdropFilter: 'blur(20px)' }}>
                <div className="w-10 h-1 rounded-full bg-border mx-auto" />
                <h3 className="text-base font-semibold text-foreground">Create a Group</h3>
                <input
                  type="text"
                  placeholder="Group name"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-muted border border-border/50 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
                <input
                  type="text"
                  placeholder="Description"
                  value={newGroupDesc}
                  onChange={(e) => setNewGroupDesc(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-muted border border-border/50 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
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
                      await createGroup(newGroupName, newGroupDesc, newGroupIcon || '💪');
                      setShowCreateGroup(false);
                      setNewGroupName('');
                      setNewGroupDesc('');
                      setNewGroupIcon('');
                    }
                  }}
                  disabled={!newGroupName.trim()}
                  className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-medium text-sm disabled:opacity-50"
                >
                  Create Group
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'photos' && <ProgressPhotos />}

      {tab === 'challenges' && <ChallengeList />}

      {tab === 'feed' && (
        <>
          <LeaderboardCard challenge="weekly_hybrid" />

          {items.length > 0 && (
            <button onClick={refresh} className="flex items-center justify-center w-full py-1 text-muted-foreground hover:text-foreground transition-colors">
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          )}

          <div className="space-y-3">
            {items.map(item => (
              <ActivityCard key={item.id} feedItem={item} />
            ))}
          </div>

          {loading && <p className="text-xs text-muted-foreground text-center animate-pulse">Loading...</p>}

          {hasMore && !loading && items.length > 0 && (
            <button onClick={loadMore} className="w-full py-2 text-xs text-purple-500 font-medium">
              Load more
            </button>
          )}

          {!loading && items.length === 0 && (
            <div className="text-center py-16 space-y-3">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-100 to-indigo-100 dark:from-purple-900/30 dark:to-indigo-900/30 flex items-center justify-center mx-auto">
                <p className="text-3xl">👋</p>
              </div>
              <p className="text-sm font-bold text-foreground">No activity yet</p>
              <p className="text-xs text-muted-foreground max-w-[200px] mx-auto">Follow people to see their workouts and runs here</p>
              <button onClick={() => setTab('find')}
                className="mt-2 text-xs px-5 py-2.5 rounded-full bg-purple-500 text-white font-medium shadow-[var(--ds-shadow-purple-glow)] active:scale-95 transition-transform">
                Find People
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}