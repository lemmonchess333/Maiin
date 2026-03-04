import { useSocialFeed } from '../hooks/useSocialFeed';
import { useState } from 'react';
import { useAuth } from '../lib/auth';
import { searchUsers } from '../lib/socialApi';
import ActivityCard from '../components/social/ActivityCard';
import FollowButton from '../components/social/FollowButton';
import LeaderboardCard from '../components/social/LeaderboardCard';
import { RefreshCw } from 'lucide-react';

export default function Social() {
  const { items, loading, refresh, loadMore, hasMore } = useSocialFeed();
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [showSearch, setShowSearch] = useState(false);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    const results = await searchUsers(searchQuery.trim());
    setSearchResults(results.filter((r: any) => r.uid !== user?.uid));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold">Activity</h1>
        <button onClick={() => setShowSearch(!showSearch)}
          className="text-sm px-3 py-1.5 rounded-lg bg-muted">
          {showSearch ? 'Feed' : '🔍 Find People'}
        </button>
      </div>

      {showSearch ? (
        <div className="space-y-3">
          <div className="flex gap-2">
            <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              placeholder="Search by name..." className="flex-1 px-3 py-2 rounded-lg bg-muted border border-border text-sm" />
            <button onClick={handleSearch} className="px-4 py-2 rounded-lg bg-purple-500 text-white text-sm font-medium">Search</button>
          </div>
          {searchResults.map((u: any) => (
            <div key={u.uid} className="flex items-center gap-3 p-3 rounded-xl bg-card border border-border">
              <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-sm font-bold">
                {(u.displayName || '?').charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{u.displayName}</p>
              </div>
              <FollowButton targetUid={u.uid} />
            </div>
          ))}
        </div>
      ) : (
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
              <button onClick={() => setShowSearch(true)}
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
