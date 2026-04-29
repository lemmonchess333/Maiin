import { useState, useEffect, useCallback, useRef } from 'react';
import { getFeed, fetchActivitiesByIds, batchGetKudos } from '../lib/socialApi';
import { useAuth } from '../lib/auth';
import type { DocumentSnapshot } from 'firebase/firestore';
import { logger } from '../lib/logger';

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
  /**
   * Denormalised author avatar URL. Carried on each feed item so
   * ActivityCard renders the author row without a per-card profile
   * fetch. Absent on pre-W1d feed items (written before the
   * denormalization) — UI falls back to initials.
   */
  authorPhotoURL?: string;
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

  // Reset cursor and items when user changes to prevent cross-user data
  // leaks. Was previously written as a setState-during-render guard (the
  // `if (user?.uid !== prevUserId) { setItems([]); ... }` pattern at the
  // top of the function body), which violates React's render-purity rule
  // and trips the same react-hooks/set-state-in-effect lint that hit
  // useUserPRMap. Effect-based reset achieves the same guarantee:
  // when uid flips, the effect fires before the next paint and clears
  // the per-user state.
  useEffect(() => {
    setItems([]);
    setHasMore(true);
    lastDocRef.current = undefined;
  }, [user?.uid]);

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

      let enriched: FeedItem[] = feedItems.map(item => {
        const act = activityMap[item.activityId] as ActivityData | undefined;
        return {
          ...item,
          activity: (act || null) as ActivityData | undefined,
          liked: kudosMap[item.activityId] || false,
          kudosCount: (act?.kudosCount as number) || 0,
          prHit: !!(act?.prHit || item.prHit),
          prExercise: (act?.prExercise as string) || item.prExercise,
          prWeight: (act?.prWeight as number) || item.prWeight,
          badgeEarned: (act?.badgeEarned as string) || item.badgeEarned,
          challengeMilestone: (act?.challengeMilestone as string) || item.challengeMilestone,
        };
      });

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
        // Dedup by id when appending — a refresh + load-more race or a
        // duplicate write across the activities + feeds collections
        // could otherwise produce two cards for the same activity.
        // Existing items always win on order; new items only appear
        // if their id isn't already present.
        setItems(prev => {
          const seen = new Set(prev.map(i => i.id));
          const fresh = enriched.filter(i => !seen.has(i.id));
          return fresh.length === enriched.length ? [...prev, ...enriched] : [...prev, ...fresh];
        });
      }
      lastDocRef.current = result.lastDoc;
      setHasMore(feedItems.length >= 20);
    } catch (e) {
      logger.error('Feed error:', e);
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
