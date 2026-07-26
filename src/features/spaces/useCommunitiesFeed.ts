import { useCallback, useEffect, useRef, useState } from "react";
import { collection, getDocs, limit, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { logger } from "@/lib/logger";
import type { SpacePostDoc } from "./spaceTypes";

export interface CommunityFeedItem {
  spaceId: string;
  postId: string;
  post: SpacePostDoc;
}

const PER_SPACE_LIMIT = 10;
const TOTAL_CAP = 30;
const SPACES_CAP = 6;

/**
 * SOC-P3a — the "My communities" feed source (Phase 3 of the Runna-model
 * social arc): recent posts from the caller's JOINED spaces, merged
 * newest-first. This is the context stream — the coach's weekly prompt
 * and members' posts reach the Feed tab without visiting each space.
 *
 * v1 scope (deliberate): space posts only. Challenge events interleave
 * later if this stream earns it — the critics' sequencing was content
 * first (coach prompts), engagement second (likes/comments), stream
 * last, and adding a second heterogeneous source before the first one
 * proves out is speculative complexity.
 *
 * Read discipline: fires only when `enabled` (the sub-tab is active) —
 * bounded at SPACES_CAP joined spaces × PER_SPACE_LIMIT posts per
 * refresh, one-shot reads (no listeners), merged and capped client-side.
 */
export function useCommunitiesFeed(enabled: boolean, joinedSpaceIds: string[]) {
  const [items, setItems] = useState<CommunityFeedItem[]>([]);
  const [loading, setLoading] = useState(false);
  const genRef = useRef(0);

  const idsKey = joinedSpaceIds.slice(0, SPACES_CAP).join(",");

  const load = useCallback(async () => {
    const ids = idsKey ? idsKey.split(",") : [];
    const myGen = ++genRef.current;
    if (ids.length === 0) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const perSpace = await Promise.all(
        ids.map(async (spaceId) => {
          try {
            const snap = await getDocs(
              query(
                collection(db, "spaces", spaceId, "posts"),
                orderBy("createdAt", "desc"),
                limit(PER_SPACE_LIMIT)
              )
            );
            return snap.docs.map((d) => ({
              spaceId,
              postId: d.id,
              post: d.data() as SpacePostDoc,
            }));
          } catch (err) {
            // One failed space must not blank the stream.
            logger.error(`[CommunitiesFeed] ${spaceId} load failed`, err);
            return [] as CommunityFeedItem[];
          }
        })
      );
      if (genRef.current !== myGen) return; // superseded refresh/account
      const merged = perSpace
        .flat()
        .sort(
          (a, b) =>
            (b.post.createdAt?.toMillis?.() ?? 0) -
            (a.post.createdAt?.toMillis?.() ?? 0)
        )
        .slice(0, TOTAL_CAP);
      setItems(merged);
    } finally {
      if (genRef.current === myGen) setLoading(false);
    }
  }, [idsKey]);

  const loadedKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!enabled) return;
    if (loadedKeyRef.current === idsKey) return;
    loadedKeyRef.current = idsKey;
    void load();
  }, [enabled, idsKey, load]);

  return {
    items,
    loading,
    refresh: useCallback(async () => {
      loadedKeyRef.current = idsKey;
      await load();
    }, [load, idsKey]),
    /** Drop a post locally (author delete from the feed card). */
    remove: (postId: string) =>
      setItems((prev) => prev.filter((i) => i.postId !== postId)),
  };
}
