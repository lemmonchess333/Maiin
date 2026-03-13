import { useState, useEffect, useCallback, useRef } from 'react';
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
  createdAt: unknown;
  // Enriched at feed level — no per-card reads needed
  activity?: Record<string, unknown>;
  liked?: boolean;
  kudosCount?: number;
  // Highlight fields for filtering
  prHit?: boolean;
  prExercise?: string;
  prWeight?: number;
  badgeEarned?: string;
  challengeMilestone?: string;
}

export function useSocialFeed(highlightsOnly = false) {
  const { user } = useAuth();
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const lastDocRef = useRef<DocumentSnapshot | undefined>();
  const [hasMore, setHasMore] = useState(true);

  const loadFeed = useCallback(async (refresh = false) => {
    if (!user) return;
    setLoading(true);
    try {
      const result = await getFeed(user.uid, 20, refresh ? undefined : lastDocRef.current);
      const feedItems = result.items as FeedItem[];

      // Single batched read for all activities + kudos
      const activityIds = feedItems.map(i => i.activityId);
      const [activityMap, kudosMap] = await Promise.all([
        batchGetActivities(activityIds),
        batchGetKudos(activityIds, user.uid),
      ]);

      let enriched: FeedItem[] = feedItems.map(item => ({
        ...item,
        activity: activityMap[item.activityId] || null,
        liked: kudosMap[item.activityId] || false,
        kudosCount: activityMap[item.activityId]?.kudosCount || 0,
        prHit: activityMap[item.activityId]?.prHit || item.prHit || false,
        prExercise: activityMap[item.activityId]?.prExercise || item.prExercise,
        prWeight: activityMap[item.activityId]?.prWeight || item.prWeight,
        badgeEarned: activityMap[item.activityId]?.badgeEarned || item.badgeEarned,
        challengeMilestone: activityMap[item.activityId]?.challengeMilestone || item.challengeMilestone,
      }));

      if (highlightsOnly) {
        enriched = enriched.filter(item =>
          item.prHit ||
          item.badgeEarned ||
          item.challengeMilestone ||
          (item.activity?.duration && item.activity.duration > 5400)
        );
      }

      if (refresh) {
        setItems(enriched);
      } else {
        setItems(prev => [...prev, ...enriched]);
      }
      lastDocRef.current = result.lastDoc;
      setHasMore(feedItems.length === 20);
    } catch (e) {
      console.error('Feed error:', e);
    }
    setLoading(false);
  }, [user, highlightsOnly]);

  useEffect(() => { loadFeed(true); }, [loadFeed]);

  return {
    items, loading, hasMore,
    refresh: () => loadFeed(true),
    loadMore: () => { if (hasMore && !loading) loadFeed(false); },
  };
}
