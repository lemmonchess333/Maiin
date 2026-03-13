import { useState, useEffect, useCallback, useRef } from 'react';
import { getFeed, batchGetActivities, batchGetKudos } from '../lib/socialApi';
import { useAuth } from '../lib/auth';
import type { DocumentSnapshot } from 'firebase/firestore';

export interface ActivityData {
  authorId?: string;
  authorName?: string;
  type?: string;
  distance?: number;
  avgPace?: number | string;
  duration?: number;
  elevationGain?: number;
  routePreview?: { lat: number; lon: number }[];
  totalVolume?: number;
  exerciseCount?: number;
  muscleGroups?: string[];
  commentCount?: number;
  prHit?: boolean;
  prExercise?: string;
  prWeight?: number;
  badgeEarned?: string;
  challengeMilestone?: string;
  kudosCount?: number;
  [key: string]: unknown;
}

export interface FeedItem {
  id: string;
  activityId: string;
  authorId: string;
  authorName: string;
  type: 'run' | 'workout';
  summary: string;
  createdAt: { toDate: () => Date } | unknown;
  // Enriched at feed level — no per-card reads needed
  activity?: ActivityData;
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
  const lastDocRef = useRef<DocumentSnapshot | undefined>(undefined);
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

      const actData = (id: string) => activityMap[id] as ActivityData | undefined;
      let enriched: FeedItem[] = feedItems.map(item => ({
        ...item,
        activity: (activityMap[item.activityId] || null) as ActivityData | undefined,
        liked: kudosMap[item.activityId] || false,
        kudosCount: (actData(item.activityId)?.kudosCount as number) || 0,
        prHit: !!(actData(item.activityId)?.prHit || item.prHit),
        prExercise: (actData(item.activityId)?.prExercise as string) || item.prExercise,
        prWeight: (actData(item.activityId)?.prWeight as number) || item.prWeight,
        badgeEarned: (actData(item.activityId)?.badgeEarned as string) || item.badgeEarned,
        challengeMilestone: (actData(item.activityId)?.challengeMilestone as string) || item.challengeMilestone,
      }));

      if (highlightsOnly) {
        enriched = enriched.filter(item =>
          item.prHit ||
          item.badgeEarned ||
          item.challengeMilestone ||
          (item.activity?.duration && Number(item.activity.duration) > 5400)
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

  useEffect(() => { const init = async () => { await loadFeed(true); }; init(); }, [loadFeed]);

  return {
    items, loading, hasMore,
    refresh: () => loadFeed(true),
    loadMore: () => { if (hasMore && !loading) loadFeed(false); },
  };
}
