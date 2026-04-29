import { useState, useEffect, useCallback, useRef } from 'react';
import { getDiscoverFeed, batchGetKudos } from '../lib/socialApi';
import { captureError } from '@/lib/errorReporting';
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
      const rawItems = result.items as { id: string; authorId?: string; authorName?: string; authorPhotoURL?: string; type?: string; summary?: string; createdAt?: unknown; kudosCount?: number; prHit?: boolean; prExercise?: string; prWeight?: number; badgeEarned?: string; challengeMilestone?: string }[];

      // Convert activity docs to FeedItem shape
      let feedItems: FeedItem[] = rawItems.map(item => ({
        id: item.id,
        activityId: item.id,
        authorId: item.authorId || '',
        authorName: item.authorName || '',
        ...(item.authorPhotoURL ? { authorPhotoURL: item.authorPhotoURL } : {}),
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

      // Filter out blocked users
      if (blockedUsers && blockedUsers.size > 0) {
        feedItems = feedItems.filter(item => !blockedUsers.has(item.authorId));
      }

      if (refresh) {
        setItems(feedItems);
      } else {
        // Dedup by id on append; see useSocialFeed.ts for rationale.
        setItems(prev => {
          const seen = new Set(prev.map(i => i.id));
          const fresh = feedItems.filter(i => !seen.has(i.id));
          return fresh.length === feedItems.length ? [...prev, ...feedItems] : [...prev, ...fresh];
        });
      }
      lastDocRef.current = result.lastDoc;
      setHasMore(rawItems.length === 20);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      captureError(e instanceof Error ? e : new Error(msg), 'network');
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
