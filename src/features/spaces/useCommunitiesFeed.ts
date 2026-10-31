import { useCallback, useEffect, useRef, useState } from "react";
import { collection, getDocs, limit, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { logger } from "@/lib/logger";
import { useUid } from "@/lib/auth";
import { isMemberFacing, type SpacePostDoc } from "./spaceTypes";

export interface CommunityFeedItem {
  spaceId: string;
  postId: string;
  post: SpacePostDoc;
}

const PER_SPACE_LIMIT = 10;
const TOTAL_CAP = 30;
export const MAX_SPACES_IN_FEED = 6;

/**
 * SOC-P3a — the Feed's Spaces source (Phase 3 of the Runna-model
 * social arc): recent posts from the caller's JOINED spaces, merged
 * newest-first. This is the context stream — members' posts reach the
 * Feed tab without visiting each space. The retired weekly coach posts
 * are dropped (`isMemberFacing`).
 *
 * v1 scope (deliberate): space posts only. Challenge events interleave
 * later if this stream earns it — the critics' sequencing was content
 * first (coach prompts), engagement second (likes/comments), stream
 * last, and adding a second heterogeneous source before the first one
 * proves out is speculative complexity.
 *
 * Read discipline: fires only when `enabled` (the sub-tab is active) —
 * bounded at MAX_SPACES_IN_FEED joined spaces × PER_SPACE_LIMIT posts per
 * refresh, one-shot reads (no listeners), merged and capped client-side.
 */
export function useCommunitiesFeed(enabled: boolean, joinedSpaceIds: string[]) {
  const uid = useUid();
  const [result, setResult] = useState<{
    key: string;
    items: CommunityFeedItem[];
  }>({ key: "", items: [] });
  const [loading, setLoading] = useState(false);
  const genRef = useRef(0);

  const idsKey = joinedSpaceIds.slice(0, MAX_SPACES_IN_FEED).join(",");
  // Two accounts can join the same Spaces. Their cached feed state and
  // in-flight reads must still be separate.
  const readKey = `${uid ?? "signed-out"}:${idsKey}`;

  const load = useCallback(async () => {
    const ids = idsKey ? idsKey.split(",") : [];
    const myGen = ++genRef.current;
    if (ids.length === 0) {
      setResult({ key: readKey, items: [] });
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
            return snap.docs
              .map((d) => ({
                spaceId,
                postId: d.id,
                post: d.data() as SpacePostDoc,
              }))
              .filter((item) => isMemberFacing(item.post));
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
      setResult({ key: readKey, items: merged });
    } finally {
      if (genRef.current === myGen) setLoading(false);
    }
  }, [idsKey, readKey]);

  const loadedKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!enabled) return;
    if (loadedKeyRef.current === readKey) return;
    loadedKeyRef.current = readKey;
    void load();
  }, [enabled, readKey, load]);

  return {
    items: result.key === readKey ? result.items : [],
    loading:
      enabled && (loading || (idsKey.length > 0 && result.key !== readKey)),
    refresh: useCallback(async () => {
      loadedKeyRef.current = readKey;
      await load();
    }, [load, readKey]),
    /** Drop a post locally (author delete from the feed card). */
    remove: (spaceId: string, postId: string) =>
      setResult((prev) =>
        prev.key === readKey
          ? {
              ...prev,
              items: prev.items.filter(
                (i) => i.spaceId !== spaceId || i.postId !== postId
              ),
            }
          : prev
      ),
  };
}
