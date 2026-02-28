import { useState, useEffect } from 'react';
import { useAuth } from '../../lib/auth';
import { isFollowing, followUser, unfollowUser } from '../../lib/socialApi';

export default function FollowButton({ targetUid }: { targetUid: string }) {
  const { user } = useAuth();
  const [following, setFollowing] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || user.uid === targetUid) { setLoading(false); return; }
    isFollowing(user.uid, targetUid).then(v => { setFollowing(v); setLoading(false); });
  }, [user, targetUid]);

  const handleToggle = async () => {
    if (!user) return;
    setLoading(true);
    if (following) {
      await unfollowUser(user.uid, targetUid);
      setFollowing(false);
    } else {
      await followUser(user.uid, targetUid);
      setFollowing(true);
    }
    setLoading(false);
  };

  if (!user || user.uid === targetUid) return null;

  return (
    <button onClick={handleToggle} disabled={loading}
      className={`text-xs px-4 py-1.5 rounded-lg font-medium transition-colors ${
        following
          ? 'bg-muted text-muted-foreground border border-border'
          : 'bg-purple-500 text-white'
      }`}>
      {loading ? '...' : following ? 'Following' : 'Follow'}
    </button>
  );
}
