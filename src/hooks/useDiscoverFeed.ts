import { useState, useEffect, useCallback, useRef } from 'react';
import { getDiscoverFeed, batchGetKudos } from '../lib/socialApi';
import { useAuth } from '../lib/auth';
import type { DocumentSnapshot } from 'firebase/firestore';
import type { FeedItem, ActivityData } from './useSocialFeed';

export function useDiscoverFeed(enabled = true, blockedUsers?: Set<string>) {
  const { user } = useAuth();
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const lastDocRef = useRef<DocumentSnapshot | undefined>(undefined);
  const [hasMore, setHasMore] = useState(true);

  const loadFeed = useCallback(async (refresh = false) => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    try {
      const result = await getDiscoverFeed(20, refresh ? undefined : lastDocRef.current);
      const rawItems = result.items as { id: string; authorId?: string; authorName?: string; type?: string; summary?: string; createdAt?: unknown; kudosCount?: number; prHit?: boolean; prExercise?: string; prWeight?: number; badgeEarned?: string; challengeMilestone?: string }[];

      // Convert activity docs to FeedItem shape
      let feedItems: FeedItem[] = rawItems.map(item => ({
        id: item.id,
        activityId: item.id,
        authorId: item.authorId || '',
        authorName: item.authorName || '',
        type: (item.type || 'workout') as 'run' | 'workout',
        summary: item.summary || '',
        createdAt: item.createdAt,
        activity: {
          authorId: item.authorId,
          authorName: item.authorName,
          type: item.type,
          kudosCount: item.kudosCount,
          prHit: item.prHit,
          prExercise: item.prExercise,
          prWeight: item.prWeight,
          badgeEarned: item.badgeEarned,
          challengeMilestone: item.challengeMilestone,
          ...item,
        } as ActivityData,
        kudosCount: item.kudosCount || 0,
        prHit: item.prHit,
        prExercise: item.prExercise,
        prWeight: item.prWeight,
        badgeEarned: item.badgeEarned,
        challengeMilestone: item.challengeMilestone,
      }));

      // Batch get kudos status for current user — immutable map (#22)
      if (user) {
        const kudosMap = await batchGetKudos(feedItems.map(i => i.activityId), user.uid);
        feedItems = feedItems.map(item => ({ ...item, liked: kudosMap[item.activityId] || false }));
      }

      // Filter out blocked users (#1)
      if (blockedUsers && blockedUsers.size > 0) {
        feedItems = feedItems.filter(item => !blockedUsers.has(item.authorId));
      }

      if (refresh) {
        setItems(feedItems);
      } else {
        setItems(prev => [...prev, ...feedItems]);
      }
      lastDocRef.current = result.lastDoc;
      setHasMore(rawItems.length === 20);
    } catch (e) {
      console.error('Discover feed error:', e);
      setError(e instanceof Error ? e.message : 'Failed to load discover feed');
    }
    setLoading(false);
  }, [user, enabled, blockedUsers]);

  useEffect(() => {
    if (!enabled) return;
    const init = async () => { await loadFeed(true); };
    init();
  }, [loadFeed, enabled]);

  return {
    items, loading, hasMore, error,
    refresh: () => loadFeed(true),
    loadMore: () => { if (hasMore && !loading) loadFeed(false); },
  };
}
