import { useState, useEffect, useCallback } from 'react';
import { getDiscoverFeed, batchGetKudos } from '../lib/socialApi';
import { useAuth } from '../lib/auth';
import type { DocumentSnapshot } from 'firebase/firestore';
import type { FeedItem } from './useSocialFeed';

export function useDiscoverFeed() {
  const { user } = useAuth();
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastDoc, setLastDoc] = useState<DocumentSnapshot | undefined>();
  const [hasMore, setHasMore] = useState(true);

  const loadFeed = useCallback(async (refresh = false) => {
    setLoading(true);
    try {
      const result = await getDiscoverFeed(20, refresh ? undefined : lastDoc);
      const rawItems = result.items as any[];

      // Convert activity docs to FeedItem shape
      const feedItems: FeedItem[] = rawItems.map(item => ({
        id: item.id,
        activityId: item.id,
        authorId: item.authorId,
        authorName: item.authorName,
        type: item.type,
        summary: item.summary || '',
        createdAt: item.createdAt,
        activity: item,
        kudosCount: item.kudosCount || 0,
        prHit: item.prHit,
        prExercise: item.prExercise,
        prWeight: item.prWeight,
        badgeEarned: item.badgeEarned,
        challengeMilestone: item.challengeMilestone,
      }));

      // Batch get kudos status for current user
      if (user) {
        const kudosMap = await batchGetKudos(feedItems.map(i => i.activityId), user.uid);
        feedItems.forEach(item => { item.liked = kudosMap[item.activityId] || false; });
      }

      if (refresh) {
        setItems(feedItems);
      } else {
        setItems(prev => [...prev, ...feedItems]);
      }
      setLastDoc(result.lastDoc);
      setHasMore(rawItems.length === 20);
    } catch (e) {
      console.error('Discover feed error:', e);
    }
    setLoading(false);
  }, [user, lastDoc]);

  useEffect(() => { loadFeed(true); }, []);

  return {
    items, loading, hasMore,
    refresh: () => loadFeed(true),
    loadMore: () => { if (hasMore && !loading) loadFeed(false); },
  };
}
