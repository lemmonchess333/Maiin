import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  collection,
  query,
  orderBy,
  limit,
  onSnapshot,
  type Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useUid } from "@/lib/auth";

/**
 * In-app reader for social notifications (kudos / comment / follow /
 * challenge_milestone). The docs are written SERVER-SIDE only — by
 * `toggleKudosCallable` / `addCommentCallable` via `createNotification`
 * (functions/lib/socialFanout.js) into `notifications/{uid}/items`. Until
 * this hook + NotificationsSheet shipped, those writes had no client reader,
 * so kudos/comments were invisible to the recipient — a broken engagement
 * loop. This closes it.
 *
 * Read state: the Firestore rule allows read + delete but NOT update on the
 * notification doc, so we can't flip a per-doc `read` flag from the client.
 * Instead we use the same localStorage last-seen pattern as `useUnreadCount`
 * — the unread BADGE counts items newer than the last time the user opened
 * the tray. That's exactly the badge semantics the category leaders use, and
 * it needs no write permission.
 */
export type NotificationType =
  | "kudos"
  | "comment"
  | "follow"
  | "challenge_milestone"
  // SOCIAL-FOCUS-01 — a Circle member backed the recipient's weekly
  // focus. Deliberately generic: the copy never names the backer or
  // the focus, and the tray row doesn't deep-link to a profile.
  | "circle_focus_backed"
  // CIRCLE-ACTIVITY-NOTIFICATIONS — a co-member published a high-signal
  // Circle event. Named (the recipient already sees them in the shared
  // timeline) and deep-links to the actor's profile.
  | "circle_milestone"
  | "circle_needs_support"
  | "circle_joined"
  | "circle_routine_shared"
  // SOC-P2g — Space-post engagement: props / a comment on the
  // recipient's space post. Rows deep-link to the SPACE (the post
  // lives there), not the actor's profile.
  | "space_post_like"
  | "space_post_comment";

export interface NotificationItem {
  id: string;
  type: NotificationType;
  fromUserId: string;
  fromName?: string;
  activityId?: string;
  /** SOC-P2g — present on space_post_* types; drives the space deep-link. */
  spaceId?: string;
  message?: string;
  /** Resolved server timestamp; null only in the brief pending window. */
  createdAt: Date | null;
}

// NOTIFICATION-TRUST-01: last-seen is scoped BY uid. A shared browser
// can't prove which account wrote an unscoped value, so account B must
// not inherit account A's "seen" pointer. The old unscoped
// `tropos-notif-last-seen` is deliberately NOT migrated — worst case a
// user re-sees up to 50 recent rows as unread once after upgrade, the
// intended privacy-first trade-off.
const LAST_SEEN_KEY_PREFIX = "tropos-notif-last-seen";
function lastSeenKey(uid: string): string {
  return `${LAST_SEEN_KEY_PREFIX}:${uid}`;
}
// Bound the per-client subscription regardless of how active the user's
// social graph is — the tray shows the most recent slice, older history
// is not a use case worth streaming.
const NOTIF_CAP = 50;

const VALID_TYPES: ReadonlySet<string> = new Set<NotificationType>([
  "kudos",
  "comment",
  "follow",
  "challenge_milestone",
  "circle_focus_backed",
  "circle_milestone",
  "circle_needs_support",
  "circle_joined",
  "circle_routine_shared",
  "space_post_like",
  "space_post_comment",
]);

/** Pure: count items strictly newer than the last-seen instant. */
export function countUnread(
  items: NotificationItem[],
  lastSeenMs: number
): number {
  return items.reduce((n, it) => {
    const t = it.createdAt ? it.createdAt.getTime() : Date.now();
    return t > lastSeenMs ? n + 1 : n;
  }, 0);
}

function readLastSeenMs(uid: string | undefined): number {
  if (typeof window === "undefined" || !uid) return 0;
  try {
    const raw = window.localStorage.getItem(lastSeenKey(uid));
    // Malformed value fails CLOSED to never-seen (0) rather than NaN.
    const ms = raw ? new Date(raw).getTime() : 0;
    return Number.isFinite(ms) ? ms : 0;
  } catch {
    return 0;
  }
}

export function useNotifications() {
  const uid = useUid();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  // NOTIFICATION-TRUST-01: a failed read is a DISTINCT state, not an
  // empty tray — the sheet renders "Notifications unavailable" + retry
  // instead of "No notifications yet".
  const [error, setError] = useState(false);
  const [lastSeenMs, setLastSeenMs] = useState<number>(0);
  // Bumped on account switch AND on an explicit retry; the snapshot
  // callbacks commit only if they still own the current generation, so a
  // late callback from a torn-down listener can never write.
  const genRef = useRef(0);
  const [retryNonce, setRetryNonce] = useState(0);

  // Last-seen is uid-owned; recompute when the account changes.
  useEffect(() => {
    setLastSeenMs(readLastSeenMs(uid ?? undefined));
  }, [uid]);

  useEffect(() => {
    if (!uid) return;
    const myGen = ++genRef.current;
    // Account switch / retry → expose an empty, loading generation
    // immediately so the previous account's rows can't linger.
    setItems([]);
    setError(false);
    setLoading(true);
    const q = query(
      collection(db, "notifications", uid, "items"),
      orderBy("createdAt", "desc"),
      limit(NOTIF_CAP)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        if (genRef.current !== myGen) return;
        const next: NotificationItem[] = [];
        snap.docs.forEach((d) => {
          const data = d.data() as Record<string, unknown>;
          const type = data.type;
          if (typeof type !== "string" || !VALID_TYPES.has(type)) return;
          const ts = data.createdAt as Timestamp | undefined;
          next.push({
            id: d.id,
            type: type as NotificationType,
            fromUserId:
              typeof data.fromUserId === "string" ? data.fromUserId : "",
            fromName:
              typeof data.fromName === "string" ? data.fromName : undefined,
            activityId:
              typeof data.activityId === "string" ? data.activityId : undefined,
            spaceId:
              typeof data.spaceId === "string" ? data.spaceId : undefined,
            message:
              typeof data.message === "string" ? data.message : undefined,
            createdAt:
              ts && typeof ts.toDate === "function" ? ts.toDate() : null,
          });
        });
        setItems(next);
        setError(false);
        setLoading(false);
      },
      () => {
        if (genRef.current !== myGen) return;
        // Permission/network error → a TRUTHFUL unavailable state, not a
        // silent empty tray. The sheet offers a retry.
        setItems([]);
        setError(true);
        setLoading(false);
      }
    );
    return unsub;
  }, [uid, retryNonce]);

  // An unavailable read has no countable rows — don't surface a stale
  // unread badge over an error.
  const unreadCount = useMemo(
    () => (error ? 0 : countUnread(items, lastSeenMs)),
    [items, lastSeenMs, error]
  );

  const markAllSeen = useCallback(() => {
    if (!uid) return;
    const now = new Date();
    try {
      window.localStorage.setItem(lastSeenKey(uid), now.toISOString());
    } catch {
      // localStorage unavailable — in-memory state still clears the badge.
    }
    setLastSeenMs(now.getTime());
  }, [uid]);

  /** Re-subscribe after a failed read — bumps the generation, hides the
   *  failed rows synchronously, and ignores the old listener's callbacks. */
  const retry = useCallback(() => setRetryNonce((n) => n + 1), []);

  return { items, loading, error, unreadCount, markAllSeen, retry };
}
