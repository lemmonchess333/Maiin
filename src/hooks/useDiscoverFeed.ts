import {
  useState,
  useEffect,
  useLayoutEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import { getDiscoverFeed, batchGetKudos } from "../lib/socialApi";
import { captureError } from "@/lib/errorReporting";
import { useUid } from "../lib/auth";
import type { DocumentSnapshot } from "firebase/firestore";
import type { FeedItem } from "./useSocialFeed";
import { activityToFeedItem } from "@/lib/activityFeedItem";
import {
  readFeedSnapshot,
  visibleFeedItems,
  writeFeedSnapshot,
} from "@/lib/feedSnapshots";

/** What the session keeps of Explore's last read (`feedSnapshots`). */
interface ExploreSnapshot {
  items: FeedItem[];
  hasMore: boolean;
}
const SOURCE = "explore";

export function useDiscoverFeed(
  enabled = true,
  blockedUsers?: Set<string>,
  hiddenActivityIds?: Set<string>
) {
  const uid = useUid();
  /* Read earlier this session, Explore starts from that read, shown at
     once, and reads again behind it (`feedSnapshots`). */
  const [items, setItems] = useState<FeedItem[]>(
    () => readFeedSnapshot<ExploreSnapshot>(uid, SOURCE)?.items ?? []
  );
  /* True once a read has landed for this account, here or earlier in the
     session: the list (empty or not) is known, and a read in flight is a
     refresh behind it, not a reason for a placeholder. */
  const [loaded, setLoaded] = useState(
    () => readFeedSnapshot<ExploreSnapshot>(uid, SOURCE) !== undefined
  );
  /* What is in flight: the first page again ("refresh", also the state
     before the first read starts) or the next page ("more"). */
  const [inFlight, setInFlight] = useState<"refresh" | "more" | null>(
    "refresh"
  );
  const [error, setError] = useState<string | null>(null);
  const lastDocRef = useRef<DocumentSnapshot | undefined>(undefined);
  const [hasMore, setHasMore] = useState(
    () => readFeedSnapshot<ExploreSnapshot>(uid, SOURCE)?.hasMore ?? true
  );

  /* SOCIAL-PRIVACY-01 — uid + generation ownership (see useSocialFeed).
     The discover feed is public, but its kudos-status enrichment is
     per-user and a switch mid-fetch must not commit account A's liked
     state (or items) under account B. The list resets in the render that
     sees the new uid; `genRef` bumps (and the cursor clears) in the
     layout effect of that same commit, before any response from A can
     land; each load commits only if it still owns the current
     generation. */
  const genRef = useRef(0);
  /* The latest read wins: a refresh started while another read is in
     flight supersedes it, so an older answer never lands over a newer
     one. */
  const readRef = useRef(0);
  const [ownerUid, setOwnerUid] = useState<string | null>(uid);
  if (ownerUid !== uid) {
    const kept = readFeedSnapshot<ExploreSnapshot>(uid, SOURCE);
    setOwnerUid(uid);
    setItems(kept?.items ?? []);
    setHasMore(kept?.hasMore ?? true);
    setLoaded(kept !== undefined);
  }
  useLayoutEffect(() => {
    genRef.current++;
    lastDocRef.current = undefined;
  }, [uid]);

  const loadFeed = useCallback(
    async (refresh = false) => {
      if (!enabled) return;
      const myGen = genRef.current;
      const myRead = ++readRef.current;
      const isCurrent = () =>
        genRef.current === myGen && readRef.current === myRead;
      setInFlight(refresh ? "refresh" : "more");
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

        // Explore is for finding other people: the person's own posts
        // are on their profile and in Following, not here.
        if (uid) feedItems = feedItems.filter((item) => item.authorId !== uid);

        // Filter out blocked users
        if (blockedUsers && blockedUsers.size > 0) {
          feedItems = feedItems.filter(
            (item) => !blockedUsers.has(item.authorId)
          );
        }

        // A post hidden from the feed (the report sheet's Hide from feed)
        // is hidden here too, keyed by activity as in useSocialFeed.
        if (hiddenActivityIds && hiddenActivityIds.size > 0) {
          feedItems = feedItems.filter(
            (item) => !hiddenActivityIds.has(item.activityId)
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
        setLoaded(true);
      } catch (e) {
        if (!isCurrent()) return;
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        captureError(e instanceof Error ? e : new Error(msg), "network");
      }
      if (isCurrent()) setInFlight(null);
    },
    [uid, enabled, blockedUsers, hiddenActivityIds]
  );

  /* Keep the read for the session, so Explore comes back with it. */
  useEffect(() => {
    if (!uid || !loaded) return;
    writeFeedSnapshot<ExploreSnapshot>(uid, SOURCE, { items, hasMore });
  }, [uid, loaded, items, hasMore]);

  useEffect(() => {
    if (!enabled) return;
    const init = async () => {
      await loadFeed(true);
    };
    init();
  }, [loadFeed, enabled]);

  const loading = inFlight !== null;

  /* Posts kept from an earlier read, filtered against the blocks and
     hidden posts as they are now. */
  const visible = useMemo(
    () => visibleFeedItems(items, blockedUsers, hiddenActivityIds),
    [items, blockedUsers, hiddenActivityIds]
  );

  return {
    items: visible,
    /** A read has landed for this account: the list is known. */
    loaded,
    /** A read is in flight: the first page again, or the next page. */
    loading,
    /** The next page is being read (for the spinner under the list). */
    loadingMore: inFlight === "more",
    hasMore,
    error,
    refresh: () => loadFeed(true),
    loadMore: () => {
      if (hasMore && !loading) loadFeed(false);
    },
  };
}
