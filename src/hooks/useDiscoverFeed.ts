import {
  useState,
  useEffect,
  useLayoutEffect,
  useCallback,
  useRef,
} from "react";
import { getDiscoverFeed, batchGetKudos } from "../lib/socialApi";
import { captureError } from "@/lib/errorReporting";
import { useUid } from "../lib/auth";
import type { DocumentSnapshot } from "firebase/firestore";
import type { FeedItem } from "./useSocialFeed";
import { activityToFeedItem } from "@/lib/activityFeedItem";

export function useDiscoverFeed(enabled = true, blockedUsers?: Set<string>) {
  const uid = useUid();
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const lastDocRef = useRef<DocumentSnapshot | undefined>(undefined);
  const [hasMore, setHasMore] = useState(true);

  /* SOCIAL-PRIVACY-01 — uid + generation ownership (see useSocialFeed).
     The discover feed is public, but its kudos-status enrichment is
     per-user and a switch mid-fetch must not commit account A's liked
     state (or items) under account B. The list resets in the render that
     sees the new uid; `genRef` bumps (and the cursor clears) in the
     layout effect of that same commit, before any response from A can
     land; each load commits only if it still owns the current
     generation. */
  const genRef = useRef(0);
  const [ownerUid, setOwnerUid] = useState<string | null>(uid);
  if (ownerUid !== uid) {
    setOwnerUid(uid);
    setItems([]);
    setHasMore(true);
  }
  useLayoutEffect(() => {
    genRef.current++;
    lastDocRef.current = undefined;
  }, [uid]);

  const loadFeed = useCallback(
    async (refresh = false) => {
      if (!enabled) return;
      const myGen = genRef.current;
      const isCurrent = () => genRef.current === myGen;
      setLoading(true);
      setError(null);
      try {
        const result = await getDiscoverFeed(
          20,
          refresh ? undefined : lastDocRef.current
        );
        if (!isCurrent()) return;
        const rawItems = result.items as ({ id: string } & Record<
          string,
          unknown
        >)[];

        // Convert activity docs to FeedItem shape (shared with the
        // profile page, so a profile's sessions are the feed's cards).
        let feedItems: FeedItem[] = rawItems.map((item) =>
          activityToFeedItem(item.id, item)
        );

        // Batch get kudos status for current user — immutable map (#22)
        if (uid) {
          const kudosMap = await batchGetKudos(
            feedItems.map((i) => i.activityId),
            uid
          );
          feedItems = feedItems.map((item) => ({
            ...item,
            liked: kudosMap[item.activityId] || false,
          }));
        }

        // Filter out blocked users
        if (blockedUsers && blockedUsers.size > 0) {
          feedItems = feedItems.filter(
            (item) => !blockedUsers.has(item.authorId)
          );
        }

        // Re-check ownership after the kudos batch (a second await).
        if (!isCurrent()) return;
        if (refresh) {
          setItems(feedItems);
        } else {
          // Dedup by id on append; see useSocialFeed.ts for rationale.
          setItems((prev) => {
            const seen = new Set(prev.map((i) => i.id));
            const fresh = feedItems.filter((i) => !seen.has(i.id));
            return fresh.length === feedItems.length
              ? [...prev, ...feedItems]
              : [...prev, ...fresh];
          });
        }
        lastDocRef.current = result.lastDoc;
        setHasMore(rawItems.length === 20);
      } catch (e) {
        if (!isCurrent()) return;
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        captureError(e instanceof Error ? e : new Error(msg), "network");
      }
      if (isCurrent()) setLoading(false);
    },
    [uid, enabled, blockedUsers]
  );

  useEffect(() => {
    if (!enabled) return;
    const init = async () => {
      await loadFeed(true);
    };
    init();
  }, [loadFeed, enabled]);

  return {
    items,
    loading,
    hasMore,
    error,
    refresh: () => loadFeed(true),
    loadMore: () => {
      if (hasMore && !loading) loadFeed(false);
    },
  };
}
