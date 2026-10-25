import type {
  NotificationItem,
  NotificationType,
} from "@/hooks/useNotifications";

/**
 * Where a notification row goes when it is tapped.
 *
 * A row opens what it is about. Props and a comment open the post, with
 * its comments open for a comment: an activity at `/activity/{id}`, a
 * Space post at `/space/{spaceId}/post/{postId}`. The activity page is
 * handed whoever acted, and opens their profile when the post can no
 * longer be read; the Space post page opens the Space instead. A Space
 * row stored without its post's id opens the Space. The rest open the
 * profile of whoever acted, except a Circle backing, which is anonymous.
 */

/** What the post page is handed: who to show when the post can't be
 *  read (deleted, or no longer shared with the reader). */
export interface ActivityPostState {
  fallbackUserId?: string;
}

/** What the Space post page is handed: open the Space in the post's place
 *  when the post can't be read (deleted, refused, or across a block). */
export interface SpacePostState {
  fallbackToSpace?: boolean;
}

/** Backing is anonymous in the tray — a profile deep-link would name
 *  the backer, so the row stays a non-navigating acknowledgement. */
function navigatesToActor(type: NotificationType): boolean {
  return type !== "circle_focus_backed";
}

/** The page for one Space post, with its comments open when asked. */
function spacePostPath(
  spaceId: string,
  postId: string,
  { comments = false }: { comments?: boolean } = {}
): string {
  const post = `/space/${encodeURIComponent(spaceId)}/post/${encodeURIComponent(postId)}`;
  return comments ? `${post}?comments=1` : post;
}

export function notificationTarget(
  n: NotificationItem
): { to: string; state?: ActivityPostState | SpacePostState } | null {
  if (
    (n.type === "space_post_like" || n.type === "space_post_comment") &&
    n.spaceId
  ) {
    if (!n.postId) return { to: `/space/${encodeURIComponent(n.spaceId)}` };
    return {
      to: spacePostPath(n.spaceId, n.postId, {
        comments: n.type === "space_post_comment",
      }),
      state: { fallbackToSpace: true },
    };
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
