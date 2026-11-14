/**
 * useHiddenActivities — the posts the signed-in person hid from their
 * feed (S4c: the report form's "Hide from my feed"), and the way to show
 * one again (App1 Q38: Settings → Social & privacy → Hidden posts).
 *
 * Stored in the account, `users/{uid}/hiddenPosts` (`src/lib/hiddenPosts.ts`),
 * so a hidden post stays hidden on every device the person signs in on.
 * It lived in this device's local storage until App1; the first read for
 * an account carries the device's old set across (`migrateLocalHiddenPosts`).
 *
 * One live listener per account, shared by every consumer (the feed, the
 * Social tab's unread count, the report form, the Settings list) and
 * stopped when the last one unmounts. A hide or an unhide shows at once:
 * the listener hears the write before the server answers, offline too.
 *
 * Shape:
 *   hidden  — the hidden post ids, one Set until its contents change
 *   posts   — the same posts with when each was hidden and its author,
 *             newest hidden first, for the Settings list
 *   ready   — the account's list has been read (or failed to be, open)
 *   hide    — hide a post; the author's id lets the list leave out a
 *             post from someone blocked without reading it
 *   unhide  — show it again; resolves false when the write was refused
 */
import { useCallback, useSyncExternalStore } from "react";
import { useUid } from "@/lib/auth";
import { captureError } from "@/lib/errorReporting";
import {
  hidePost,
  migrateLocalHiddenPosts,
  subscribeHiddenPosts,
  unhidePost,
  type HiddenPost,
} from "@/lib/hiddenPosts";

interface HiddenState {
  posts: HiddenPost[];
  hidden: Set<string>;
  ready: boolean;
}

const EMPTY: HiddenState = { posts: [], hidden: new Set(), ready: false };

/* Per account: the last state the listener delivered, the listener's
   unsubscribe, and the consumers to tell when the state changes. */
const states = new Map<string, HiddenState>();
const subscriptions = new Map<string, () => void>();
const consumers = new Map<string, Set<() => void>>();
/* The accounts whose device copy has been carried across this session. */
const migrated = new Set<string>();

function report(e: unknown, step: string) {
  captureError(e instanceof Error ? e : new Error(String(e)), "network", {
    hook: "useHiddenActivities",
    step,
  });
}

function publish(uid: string, state: HiddenState) {
  states.set(uid, state);
  consumers.get(uid)?.forEach((fn) => fn());
}

/* The feed and the unread count depend on `hidden`: a new Set on every
   snapshot would refilter them for nothing. */
function sameIds(current: Set<string> | undefined, posts: HiddenPost[]) {
  return (
    !!current &&
    current.size === posts.length &&
    posts.every((p) => current.has(p.activityId))
  );
}

function ensureListening(uid: string) {
  if (subscriptions.has(uid)) return;
  if (!migrated.has(uid)) {
    migrated.add(uid);
    migrateLocalHiddenPosts(uid).catch((e) => report(e, "migrate"));
  }
  /* Fail-open but READY, as the block list is: a failed listener must not
     hold the Settings list on "Loading…" for ever. What was known stays;
     the next consumer to mount listens again. */
  let live = true;
  const failed = (e: unknown) => {
    live = false;
    subscriptions.delete(uid);
    publish(uid, { ...(states.get(uid) ?? EMPTY), ready: true });
    report(e, "listen");
  };
  try {
    const unsubscribe = subscribeHiddenPosts(
      uid,
      (posts) => {
        const known = states.get(uid)?.hidden;
        publish(uid, {
          posts,
          hidden:
            known && sameIds(known, posts)
              ? known
              : new Set(posts.map((p) => p.activityId)),
          ready: true,
        });
      },
      failed
    );
    if (live) subscriptions.set(uid, unsubscribe);
  } catch (e) {
    failed(e);
  }
}

function subscribe(uid: string | null, onChange: () => void): () => void {
  if (!uid) return () => {};
  let bucket = consumers.get(uid);
  if (!bucket) {
    bucket = new Set();
    consumers.set(uid, bucket);
  }
  const mine = bucket;
  mine.add(onChange);
  ensureListening(uid);
  return () => {
    mine.delete(onChange);
    if (mine.size > 0) return;
    /* The last consumer gone: stop listening and forget the list, so a
       later sign-in, or the next account on this device, reads its own. */
    subscriptions.get(uid)?.();
    subscriptions.delete(uid);
    consumers.delete(uid);
    states.delete(uid);
  };
}

export interface UseHiddenActivitiesResult {
  hidden: Set<string>;
  posts: HiddenPost[];
  ready: boolean;
  hide: (activityId: string, authorId?: string) => void;
  unhide: (activityId: string) => Promise<boolean>;
}

export function useHiddenActivities(): UseHiddenActivitiesResult {
  const uid = useUid();

  const state = useSyncExternalStore(
    useCallback((cb: () => void) => subscribe(uid, cb), [uid]),
    useCallback(() => (uid ? (states.get(uid) ?? EMPTY) : EMPTY), [uid]),
    () => EMPTY
  );

  /* Not awaited by the report form: the write lands in the listener at
     once and reaches the server when it can, offline included. A refusal
     takes the post back out of the list, and is reported. */
  const hide = useCallback(
    (activityId: string, authorId?: string) => {
      if (!uid || !activityId) return;
      hidePost(uid, activityId, authorId).catch((e) => report(e, "hide"));
    },
    [uid]
  );

  const unhide = useCallback(
    async (activityId: string) => {
      if (!uid) return false;
      try {
        await unhidePost(uid, activityId);
        return true;
      } catch (e) {
        report(e, "unhide");
        return false;
      }
    },
    [uid]
  );

  return {
    hidden: state.hidden,
    posts: state.posts,
    ready: state.ready,
    hide,
    unhide,
  };
}
