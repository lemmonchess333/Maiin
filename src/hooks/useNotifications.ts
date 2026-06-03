import { useState, useEffect, useMemo, useCallback } from "react";
import {
  collection,
  query,
  orderBy,
  limit,
  onSnapshot,
  type Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";

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
  | "challenge_milestone";

export interface NotificationItem {
  id: string;
  type: NotificationType;
  fromUserId: string;
  fromName?: string;
  activityId?: string;
  message?: string;
  /** Resolved server timestamp; null only in the brief pending window. */
  createdAt: Date | null;
}

const LAST_SEEN_KEY = "tropos-notif-last-seen";
// Bound the per-client subscription regardless of how active the user's
// social graph is — the tray shows the most recent slice, older history
// is not a use case worth streaming.
const NOTIF_CAP = 50;

const VALID_TYPES: ReadonlySet<string> = new Set<NotificationType>([
  "kudos",
  "comment",
  "follow",
  "challenge_milestone",
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

function readLastSeenMs(): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = window.localStorage.getItem(LAST_SEEN_KEY);
    return raw ? new Date(raw).getTime() : 0;
  } catch {
    return 0;
  }
}

export function useNotifications() {
  const { user } = useAuth();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastSeenMs, setLastSeenMs] = useState<number>(() => readLastSeenMs());

  useEffect(() => {
    // Mirrors useUnreadCount: bail without synchronous setState (the Social
    // page only mounts authed; loading stays in its initial true state until
    // the first snapshot resolves it). State is only ever set inside the
    // async snapshot callbacks below.
    if (!user?.uid) return;
    const q = query(
      collection(db, "notifications", user.uid, "items"),
      orderBy("createdAt", "desc"),
      limit(NOTIF_CAP)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
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
            message:
              typeof data.message === "string" ? data.message : undefined,
            createdAt:
              ts && typeof ts.toDate === "function" ? ts.toDate() : null,
          });
        });
        setItems(next);
        setLoading(false);
      },
      () => {
        // Permission/network error — fail closed to an empty tray rather
        // than surfacing a broken state.
        setItems([]);
        setLoading(false);
      }
    );
    return unsub;
  }, [user?.uid]);

  const unreadCount = useMemo(
    () => countUnread(items, lastSeenMs),
    [items, lastSeenMs]
  );

  const markAllSeen = useCallback(() => {
    const now = new Date();
    try {
      window.localStorage.setItem(LAST_SEEN_KEY, now.toISOString());
    } catch {
      // localStorage unavailable — in-memory state still clears the badge.
    }
    setLastSeenMs(now.getTime());
  }, []);

  return { items, loading, unreadCount, markAllSeen };
}
