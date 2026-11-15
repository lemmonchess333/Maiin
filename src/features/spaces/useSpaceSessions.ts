/**
 * A Space's members' sessions (Run27 call 11): the public posts of the
 * people in the Space, newest first, a page at a time, as Strava's club
 * Recent Activity.
 *
 * The server keeps one row per post that may be shown in the Space,
 * `spaces/{spaceId}/sessions/{activityId}` (functions/lib/spaceFeed.js): a
 * public post, not flagged, whose author is a member and not restricted.
 * A row only points to a post. Every card is built from the post itself,
 * read on its own, where the rules check who may see it and a block either
 * way, and a post read back as anything but public is left out, so a row
 * the server has not yet removed never shows a followers-only or private
 * session. People blocked either way and posts the viewer hid are left out
 * at render, so a block or a hide made on this page takes effect at once.
 * A run's map is the post's own, cut at the author's privacy zones when it
 * was shared, the same card Following and Explore draw.
 *
 * Nothing is read until `enabled` (the page's Sessions tab), and not before
 * the viewer's block list is known, so no card of someone blocked is drawn
 * while it loads.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useUid } from "@/lib/auth";
import { batchGetKudos, fetchActivitiesByIds } from "@/lib/socialApi";
import { activityToFeedItem } from "@/lib/activityFeedItem";
import type { FeedItem } from "@/lib/activityFeedTypes";
import { captureError } from "@/lib/errorReporting";
import { toast } from "@/lib/toast";
import { useBlockedUsers } from "@/hooks/useBlockedUsers";
import { useHiddenActivities } from "@/hooks/useHiddenActivities";

/** Rows one page reads. A page can show fewer: some rows point to posts
 *  the viewer may not see. */
export const SPACE_SESSIONS_PAGE_SIZE = 20;

interface Row {
  activityId?: unknown;
}

/** One page of a Space's rows, newest first, after `cursor` when given. */
function rowsPage(spaceId: string, cursor: QueryDocumentSnapshot | null) {
  const rows = collection(db, "spaces", spaceId, "sessions");
  return cursor
    ? query(
        rows,
        orderBy("createdAt", "desc"),
        startAfter(cursor),
        limit(SPACE_SESSIONS_PAGE_SIZE)
      )
    : query(
        rows,
        orderBy("createdAt", "desc"),
        limit(SPACE_SESSIONS_PAGE_SIZE)
      );
}

/** The post ids a page of rows names. */
function rowIds(docs: QueryDocumentSnapshot[]): string[] {
  return docs.map((d) => {
    const id = (d.data() as Row).activityId;
    return typeof id === "string" && id ? id : d.id;
  });
}

/** The cards one page of rows makes: each post read on its own (the rules
 *  refuse one across a block either way, which reads as no post), kept only
 *  while it is still public. */
async function cardsFor(ids: string[], uid: string): Promise<FeedItem[]> {
  if (ids.length === 0) return [];
  const [posts, kudos] = await Promise.all([
    fetchActivitiesByIds(ids),
    batchGetKudos(ids, uid),
  ]);
  return ids.flatMap((id) => {
    const post = posts[id];
    if (!post || post.visibility !== "public") return [];
    return [{ ...activityToFeedItem(id, post), liked: kudos[id] || false }];
  });
}

export interface SpaceSessions {
  /** null until the first page has been read. */
  items: FeedItem[] | null;
  hasMore: boolean;
  loadingMore: boolean;
  /** The first page could not be read. */
  failed: boolean;
  loadMore: () => void;
  retry: () => void;
}

export function useSpaceSessions(
  spaceId: string | undefined,
  enabled: boolean
): SpaceSessions {
  const uid = useUid();
  const { blocked, ready: blocksReady } = useBlockedUsers();
  const { hidden } = useHiddenActivities();
  const key = uid && spaceId ? `${uid}:${spaceId}` : null;
  const [state, setState] = useState<{
    key: string | null;
    items: FeedItem[] | null;
    cursor: QueryDocumentSnapshot | null;
    hasMore: boolean;
    failed: boolean;
  }>({ key, items: null, cursor: null, hasMore: false, failed: false });
  const [loadingMore, setLoadingMore] = useState(false);
  const [nonce, setNonce] = useState(0);
  /* Bumped by each first-page read, so a Load more that answers after the
     list was read again cannot append to it. */
  const generation = useRef(0);
  const current = state.key === key ? state : null;

  useEffect(() => {
    if (!enabled || !key || !uid || !spaceId || !blocksReady) return;
    let cancelled = false;
    const mine = ++generation.current;
    (async () => {
      try {
        const snap = await getDocs(rowsPage(spaceId, null));
        const items = await cardsFor(rowIds(snap.docs), uid);
        if (cancelled || mine !== generation.current) return;
        setState({
          key,
          items,
          cursor: snap.docs.at(-1) ?? null,
          hasMore: snap.docs.length >= SPACE_SESSIONS_PAGE_SIZE,
          failed: false,
        });
      } catch (e) {
        if (cancelled) return;
        captureError(e instanceof Error ? e : new Error(String(e)), "network", {
          hook: "useSpaceSessions",
        });
        setState((prev) =>
          prev.key === key
            ? { ...prev, failed: prev.items === null }
            : {
                key,
                items: null,
                cursor: null,
                hasMore: false,
                failed: true,
              }
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, key, uid, spaceId, blocksReady, nonce]);

  const loadMore = useCallback(() => {
    if (!uid || !spaceId || !current?.cursor || !current.hasMore) return;
    if (loadingMore) return;
    const mine = generation.current;
    const cursor = current.cursor;
    setLoadingMore(true);
    (async () => {
      try {
        const snap = await getDocs(rowsPage(spaceId, cursor));
        const more = await cardsFor(rowIds(snap.docs), uid);
        if (mine !== generation.current) return;
        setState((prev) => {
          if (prev.key !== key) return prev;
          const seen = new Set((prev.items ?? []).map((i) => i.id));
          return {
            ...prev,
            items: [
              ...(prev.items ?? []),
              ...more.filter((i) => !seen.has(i.id)),
            ],
            cursor: snap.docs.at(-1) ?? prev.cursor,
            hasMore: snap.docs.length >= SPACE_SESSIONS_PAGE_SIZE,
          };
        });
      } catch (e) {
        // The sessions already shown stay, and the button stays to try again.
        toast.error("Couldn’t load more sessions. Try again.");
        captureError(e instanceof Error ? e : new Error(String(e)), "network", {
          hook: "useSpaceSessions",
          step: "loadMore",
        });
      } finally {
        setLoadingMore(false);
      }
    })();
  }, [uid, spaceId, key, current, loadingMore]);

  const retry = useCallback(() => setNonce((n) => n + 1), []);

  const items = useMemo(
    () =>
      current?.items?.filter(
        (item) => !blocked.has(item.authorId) && !hidden.has(item.activityId)
      ) ?? null,
    [current, blocked, hidden]
  );

  return {
    items,
    hasMore: current?.hasMore ?? false,
    loadingMore,
    failed: current?.failed ?? false,
    loadMore,
    retry,
  };
}
