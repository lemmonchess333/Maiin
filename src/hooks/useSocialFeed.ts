import { useState, useEffect, useCallback } from 'react';
import { getFeed } from '../lib/socialApi';
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
      if (refresh) {
        setItems(result.items as FeedItem[]);
      } else {
        setItems(prev => [...prev, ...(result.items as FeedItem[])]);
      }
      setLastDoc(result.lastDoc);
      setHasMore(result.items.length === 20);
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
