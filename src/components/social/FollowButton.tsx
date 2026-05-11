import { useState, useEffect } from 'react';
import { useAuth } from '../../lib/auth';
import { isFollowing, followUser, unfollowUser } from '../../lib/socialApi';
import { logger } from '../../lib/logger';
import { haptic } from '../../lib/haptic';
import { Spinner } from '@/components/ui/Spinner';

interface FollowButtonProps {
  targetUid: string;
  /**
   * Fired after the follow state has settled server-side. Parents
   * can use this to react — e.g. Suggested People auto-removing a
   * person once you follow them, leaderboards re-running, etc.
   */
  onFollowChange?: (following: boolean) => void;
}

/**
 * Follow/Unfollow toggle with optimistic UI. On click we flip the
 * state immediately for snappiness, then reconcile against the
 * server response; if the write fails we revert. Fixed width keeps
 * the button from jittering across Follow / Following / loading
 * states, and the loading state uses a spinner instead of a literal
 * "..." string.
 */
export default function FollowButton({ targetUid, onFollowChange }: FollowButtonProps) {
  const { user } = useAuth();
  const [following, setFollowing] = useState(false);
  const [initialising, setInitialising] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!user || user.uid === targetUid) {
      setInitialising(false);
      return;
    }
    isFollowing(user.uid, targetUid)
      .then((v) => { if (!cancelled) setFollowing(v); })
      .catch((err) => { if (!cancelled) logger.error('[FollowButton] isFollowing check failed', err); })
      .finally(() => { if (!cancelled) setInitialising(false); });
    return () => { cancelled = true; };
  }, [user, targetUid]);

  const handleToggle = async () => {
    if (!user || busy) return;
    const nextFollowing = !following;
    // Tactile confirmation on the commit — follow is stronger haptic
    // (meaningful new relationship), unfollow is lighter (undo action).
    haptic(nextFollowing ? 'medium' : 'light');
    // Optimistic flip — snap the UI to the target state, reconcile
    // after the server write resolves.
    setFollowing(nextFollowing);
    setBusy(true);
    try {
      if (nextFollowing) {
        await followUser(user.uid, targetUid);
      } else {
        await unfollowUser(user.uid, targetUid);
      }
      onFollowChange?.(nextFollowing);
    } catch (err) {
      // Revert on failure.
      logger.error('[FollowButton] toggle failed', err);
      setFollowing(!nextFollowing);
      haptic('error');
    } finally {
      setBusy(false);
    }
  };

  if (!user || user.uid === targetUid) return null;

  const showSpinner = initialising || busy;

  return (
    <button
      onClick={handleToggle}
      disabled={showSpinner}
      aria-label={following ? 'Unfollow user' : 'Follow user'}
      aria-busy={showSpinner}
      className={`inline-flex items-center justify-center h-8 w-24 rounded-lg text-xs font-medium transition-colors disabled:opacity-80 ${
        following
          ? 'bg-muted text-muted-foreground border border-border'
          : 'bg-primary-strong text-white'
      }`}
    >
      {showSpinner ? (
        // The button itself sets the foreground colour (white for
        // not-following, muted-foreground for following), so the
        // Spinner inherits via variant="inverse" / "muted". Using
        // "inverse" universally because both states' contrast is
        // close enough — keeps the markup branch-free.
        <Spinner size="xs" variant={following ? 'muted' : 'inverse'} label={following ? 'Unfollowing' : 'Following'} />
      ) : following ? 'Following' : 'Follow'}
    </button>
  );
}
