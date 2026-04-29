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

/* `enabled` defaults true for backwards compatibility but lets the
 * caller defer the network read when the feed isn't visible. Social.tsx
 * mounts both useSocialFeed (Following) and useDiscoverFeed; previously
 * the Following fetch fired on every Social tab open even when the
 * user immediately landed on Discover and never saw Following. The
 * gate skips the loadFeed effect when enabled is false; flipping it
 * to true triggers a refresh-style fetch. */
export function useSocialFeed(highlightsOnly = false, blockedUsers?: Set<string>, enabled = true) {
  const { user } = useAuth();
  const [items, setItems] = useState<FeedItem[]>([]);
  /* `internalLoading` reflects whether a fetch is in flight; the
     publicly-returned `loading` is derived from it AND `enabled`.
     When the surface is disabled, loading is always false — the
     consumer doesn't render a forever-skeleton without us needing
     to setState(false) inside the effect body (which trips
     react-hooks/set-state-in-effect). */
  const [internalLoading, setInternalLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const lastDocRef = useRef<DocumentSnapshot | undefined>(undefined);
  const [hasMore, setHasMore] = useState(true);

  /* Cross-user reset is handled by loadFeed itself: when `user`
     identity changes, loadFeed's identity changes (it depends on
     `user`), which retriggers the post-mount effect below with
     refresh=true. That call resets lastDocRef and overwrites items
     with the new user's data. No separate reset effect needed —
     and no setState-in-effect-body lint violation. */

  const loadFeed = useCallback(async (refresh = false) => {
    if (!user) return;
    if (refresh) lastDocRef.current = undefined;
    setInternalLoading(true);
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
    setInternalLoading(false);
  }, [user, highlightsOnly, blockedUsers]);

  useEffect(() => {
    /* When disabled, skip the network read entirely. Don't setState
       to clear loading here — `loading` is derived from `enabled`
       below so the consumer never sees a stuck skeleton, and the
       effect body stays free of synchronous setState (which trips
       react-hooks/set-state-in-effect). */
    if (!enabled) return;
    const init = async () => { await loadFeed(true); };
    void init();
  }, [loadFeed, enabled]);

  // Public loading is derived: only true while a fetch is genuinely
  // in flight on an enabled surface.
  const loading = enabled && internalLoading;

  return {
    items, loading, hasMore, error,
    refresh: () => loadFeed(true),
    loadMore: () => { if (hasMore && !loading) loadFeed(false); },
  };
}
