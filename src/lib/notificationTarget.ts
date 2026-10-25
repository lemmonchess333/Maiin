import type {
  NotificationItem,
  NotificationType,
} from "@/hooks/useNotifications";

/**
 * Where a notification row goes when it is tapped.
 *
 * A row opens what it is about. Props and a comment open the post
 * (`/activity/{id}`, with its comments open for a comment); the post page
 * is handed whoever acted, and opens their profile when the post can no
 * longer be read. A Space row opens the Space. The rest open the profile
 * of whoever acted, except a Circle backing, which is anonymous.
 */

/** What the post page is handed: who to show when the post can't be
 *  read (deleted, or no longer shared with the reader). */
export interface ActivityPostState {
  fallbackUserId?: string;
}

/** Backing is anonymous in the tray — a profile deep-link would name
 *  the backer, so the row stays a non-navigating acknowledgement. */
function navigatesToActor(type: NotificationType): boolean {
  return type !== "circle_focus_backed";
}

export function notificationTarget(
  n: NotificationItem
): { to: string; state?: ActivityPostState } | null {
  // SOC-P2g: space engagement rows go to the SPACE — that's where the
  // post (and the reply action) lives.
  if (
    (n.type === "space_post_like" || n.type === "space_post_comment") &&
    n.spaceId
  ) {
    return { to: `/space/${n.spaceId}` };
  }
  if ((n.type === "kudos" || n.type === "comment") && n.activityId) {
    const post = `/activity/${encodeURIComponent(n.activityId)}`;
    return {
      to: n.type === "comment" ? `${post}?comments=1` : post,
      state: n.fromUserId ? { fallbackUserId: n.fromUserId } : undefined,
    };
  }
  if (n.fromUserId && navigatesToActor(n.type)) {
    return { to: `/user/${n.fromUserId}` };
  }
  return null;
}
