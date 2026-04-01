import { useState, useEffect, useCallback, useRef } from 'react';
import { getFeed, fetchActivitiesByIds, batchGetKudos } from '../lib/socialApi';
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
  exercises?: { name: string; summary: string }[];
  prCount?: number;
  activityTitle?: string;
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

export function useSocialFeed(highlightsOnly = false, blockedUsers?: Set<string>) {
  const { user } = useAuth();
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const lastDocRef = useRef<DocumentSnapshot | undefined>(undefined);
  const [hasMore, setHasMore] = useState(true);

  // Reset cursor and items when user changes to prevent cross-user data leaks
  const [prevUserId, setPrevUserId] = useState<string | undefined>(undefined);
  if (user?.uid !== prevUserId) {
    setPrevUserId(user?.uid);
    setItems([]);
    setHasMore(true);
  }

  const loadFeed = useCallback(async (refresh = false) => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const result = await getFeed(user.uid, 20, refresh ? undefined : lastDocRef.current);
      const feedItems = result.items as FeedItem[];

      // Single batched read for all activities + kudos
      const activityIds = feedItems.map(i => i.activityId);
      const [activityMap, kudosMap] = await Promise.all([
        fetchActivitiesByIds(activityIds),
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

      // Filter out blocked users
      if (blockedUsers && blockedUsers.size > 0) {
        enriched = enriched.filter(item => !blockedUsers.has(item.authorId));
      }

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
      setHasMore(feedItems.length >= 20);
    } catch (e) {
      console.error('Feed error:', e);
      setError(e instanceof Error ? e.message : 'Failed to load feed');
    }
    setLoading(false);
  }, [user, highlightsOnly, blockedUsers]);

  useEffect(() => { const init = async () => { await loadFeed(true); }; init(); }, [loadFeed]);

  return {
    items, loading, hasMore, error,
    refresh: () => loadFeed(true),
    loadMore: () => { if (hasMore && !loading) loadFeed(false); },
  };
}
