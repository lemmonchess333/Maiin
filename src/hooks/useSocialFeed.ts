import {
  useState,
  useEffect,
  useLayoutEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import { getFeed, fetchActivitiesByIds, batchGetKudos } from "../lib/socialApi";
import { useUid } from "../lib/auth";
import {
  readFeedSnapshot,
  visibleFeedItems,
  writeFeedSnapshot,
} from "../lib/feedSnapshots";
import type { DocumentSnapshot } from "firebase/firestore";
import { logger } from "../lib/logger";
import { captureError } from "../lib/errorReporting";
import { activityToFeedItem } from "../lib/activityFeedItem";
import type { FeedIndex } from "../lib/feedIndex";
import type { FeedItem } from "../lib/activityFeedTypes";
export type { ActivityData, FeedItem } from "../lib/activityFeedTypes";

/** What the session keeps of a source's last read (`feedSnapshots`). */
interface FeedSnapshot {
  items: FeedItem[];
  hasMore: boolean;
}

/* `enabled` defaults true for backwards compatibility but lets the
 * caller defer the network read when the feed isn't visible. Social.tsx
 * mounts both useSocialFeed (Following) and useDiscoverFeed; previously
 * the Following fetch fired on every Social tab open even when the
 * user immediately landed on Discover and never saw Following. The
 * gate skips the loadFeed effect when enabled is false; flipping it
 * to true triggers a refresh-style fetch. */
export function useSocialFeed(
  highlightsOnly = false,
  blockedUsers?: Set<string>,
  enabled = true,
  hiddenActivityIds?: Set<string>
) {
  const uid = useUid();
  const source = highlightsOnly ? "following-highlights" : "following";
  /* A source read earlier this session starts from that read, shown at
     once, and reads again behind it (`feedSnapshots`). */
  const [items, setItems] = useState<FeedItem[]>(
    () => readFeedSnapshot<FeedSnapshot>(uid, source)?.items ?? []
  );
  /* True once a read has landed for this account, here or earlier in the
     session: the list (empty or not) is then known, and a read in flight
     is a refresh behind it, not a reason for a placeholder. */
  const [loaded, setLoaded] = useState(
    () => readFeedSnapshot<FeedSnapshot>(uid, source) !== undefined
  );
  /* What is in flight: the first page again ("refresh", which is also the
     state before the first read starts) or the next page ("more").
     `loading` is derived from it AND `enabled`: when the surface is
     disabled the consumer never sees a stuck skeleton, without a
     setState(false) inside the effect body (which trips
     react-hooks/set-state-in-effect). */
  const [inFlight, setInFlight] = useState<"refresh" | "more" | null>(
    "refresh"
  );
  const [error, setError] = useState<string | null>(null);
  const lastDocRef = useRef<DocumentSnapshot | undefined>(undefined);
  const [hasMore, setHasMore] = useState(
    () => readFeedSnapshot<FeedSnapshot>(uid, source)?.hasMore ?? true
  );

  /* SOCIAL-PRIVACY-01 — uid + generation ownership. The feed load is
     async; a resolve captured under account A must never commit after a
     switch to account B (a late `loadFeed` from A, or an in-flight fetch
     during an account switch on a shared browser). The list resets in the
     render that sees the new uid (adjust-state idiom), and `genRef` bumps
     with the cursor in the layout effect of that same commit; each
     `loadFeed` captures the current generation and commits only if it
     still owns it. Layout, not passive: a passive effect runs after
     paint, and a response from A landing in between would still own the
     generation and repopulate the list the reset had just emptied.
     Complements the HOME-ACCOUNT-01 remount boundary as defence in depth
     (and prevents a stale-account commit inside a single mount). */
  const genRef = useRef(0);
  /* The latest read wins: a refresh started while another read is in
     flight (the blocks changed, a pull, the source switched back to)
     supersedes it, so an older answer never lands over a newer one. */
  const readRef = useRef(0);
  const [ownerUid, setOwnerUid] = useState<string | null>(uid);
  if (ownerUid !== uid) {
    const kept = readFeedSnapshot<FeedSnapshot>(uid, source);
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
      if (!uid) return;
      const myGen = genRef.current;
      const myRead = ++readRef.current;
      const isCurrent = () =>
        genRef.current === myGen && readRef.current === myRead;
      setInFlight(refresh ? "refresh" : "more");
      setError(null);
      try {
        const result = await getFeed(
          uid,
          20,
          refresh ? undefined : lastDocRef.current
        );
        if (!isCurrent()) return;
        const feedItems = result.items as FeedIndex[];

        // Single batched read for all activities + kudos
        const activityIds = feedItems.map((i) => i.activityId);
        const [activityMap, kudosMap] = await Promise.all([
          fetchActivitiesByIds(activityIds),
          batchGetKudos(activityIds, uid),
        ]);

        // A row only points to a post. Derive every display field from a
        // successful parent read, including for old cached feed responses:
        // no summary/highlight/avatar fallback can outlive revoked access.
        let enriched: FeedItem[] = feedItems.flatMap((item) => {
          const act = activityMap[item.activityId];
          if (!act) return [];
          return [
            {
              ...activityToFeedItem(item.activityId, act),
              id: item.id,
              liked: kudosMap[item.activityId] || false,
            },
          ];
        });

        // Filter out blocked users
        if (blockedUsers && blockedUsers.size > 0) {
          enriched = enriched.filter(
            (item) => !blockedUsers.has(item.authorId)
          );
        }

        // S4c: filter out user-hidden activity IDs (Hide-from-feed
        // checkbox on the report modal). hiddenActivityIds is keyed
        // by activityId not feed-item id — there can be multiple feed
        // items for the same activity (e.g. fan-out duplicates) so
        // hiding one hides all renderings.
        if (hiddenActivityIds && hiddenActivityIds.size > 0) {
          enriched = enriched.filter(
            (item) => !hiddenActivityIds.has(item.activityId)
          );
        }

        if (highlightsOnly) {
          enriched = enriched.filter(
            (item) =>
              item.prHit ||
              item.badgeEarned ||
              item.challengeMilestone ||
              (item.activity?.duration && Number(item.activity.duration) > 5400)
          );
        }

        // Re-check ownership: the activities+kudos batch above is a second
        // await, so the account could have switched while it was in flight.
        if (!isCurrent()) return;
        if (refresh) {
          setItems(enriched);
        } else {
          // Dedup by id when appending — a refresh + load-more race or a
          // duplicate write across the activities + feeds collections
          // could otherwise produce two cards for the same activity.
          // Existing items always win on order; new items only appear
          // if their id isn't already present.
          setItems((prev) => {
            const seen = new Set(prev.map((i) => i.id));
            const fresh = enriched.filter((i) => !seen.has(i.id));
            return fresh.length === enriched.length
              ? [...prev, ...enriched]
              : [...prev, ...fresh];
          });
        }
        lastDocRef.current = result.lastDoc;
        setHasMore(feedItems.length >= 20);
        setLoaded(true);
      } catch (e) {
        if (!isCurrent()) return;
        logger.error("Feed error:", e);
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        captureError(e instanceof Error ? e : new Error(msg), "network");
      }
      if (isCurrent()) setInFlight(null);
    },
    [uid, highlightsOnly, blockedUsers, hiddenActivityIds]
  );

  /* Keep the read for the session, so the source comes back with it. */
  useEffect(() => {
    if (!uid || !loaded) return;
    writeFeedSnapshot<FeedSnapshot>(uid, source, { items, hasMore });
  }, [uid, source, loaded, items, hasMore]);

  useEffect(() => {
    /* When disabled, skip the network read entirely. Don't setState
       to clear loading here — `loading` is derived from `enabled`
       below so the consumer never sees a stuck skeleton, and the
       effect body stays free of synchronous setState (which trips
       react-hooks/set-state-in-effect). */
    if (!enabled) return;
    const init = async () => {
      await loadFeed(true);
    };
    void init();
  }, [loadFeed, enabled]);

  // Public loading is derived: only true while a fetch is genuinely
  // in flight on an enabled surface.
  const loading = enabled && inFlight !== null;

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
    loadingMore: enabled && inFlight === "more",
    hasMore,
    error,
    refresh: () => loadFeed(true),
    loadMore: () => {
      if (hasMore && !loading) loadFeed(false);
    },
  };
}
