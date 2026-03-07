import { useState, useEffect, useCallback } from 'react';
import { getFeed, batchGetActivities, batchGetKudos } from '../lib/socialApi';
import { useAuth } from '../lib/auth';
import type { DocumentSnapshot } from 'firebase/firestore';

export interface FeedItem {
  id: string;
  activityId: string;
  authorId: string;
  authorName: string;
  type: 'run' | 'workout';
  summary: string;
  createdAt: any;
  // Enriched at feed level — no per-card reads needed
  activity?: any;
  liked?: boolean;
  kudosCount?: number;
}

export function useSocialFeed() {
  const { user } = useAuth();
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastDoc, setLastDoc] = useState<DocumentSnapshot | undefined>();
  const [hasMore, setHasMore] = useState(true);

  const loadFeed = useCallback(async (refresh = false) => {
    if (!user) return;
    setLoading(true);
    try {
      const result = await getFeed(user.uid, 20, refresh ? undefined : lastDoc);
      const feedItems = result.items as FeedItem[];

      // Single batched read for all activities + kudos
      const activityIds = feedItems.map(i => i.activityId);
      const [activityMap, kudosMap] = await Promise.all([
        batchGetActivities(activityIds),
        batchGetKudos(activityIds, user.uid),
      ]);

      const enriched: FeedItem[] = feedItems.map(item => ({
        ...item,
        activity: activityMap[item.activityId] || null,
        liked: kudosMap[item.activityId] || false,
        kudosCount: activityMap[item.activityId]?.kudosCount || 0,
      }));

      if (refresh) {
        setItems(enriched);
      } else {
        setItems(prev => [...prev, ...enriched]);
      }
      setLastDoc(result.lastDoc);
      setHasMore(feedItems.length === 20);
    } catch (e) {
      console.error('Feed error:', e);
    }
    setLoading(false);
  }, [user, lastDoc]);

  useEffect(() => { loadFeed(true); }, [user]);

  return {
    items, loading, hasMore,
    refresh: () => loadFeed(true),
    loadMore: () => { if (hasMore && !loading) loadFeed(false); },
  };
}