/**
 * Report target ids for the content that lives inside something else.
 *
 * The server (functions/lib/reportTargets.js) takes a comment or a space
 * post as colon-joined document ids and splits them itself. These build
 * exactly that shape, and reportTargets.cross.test.ts runs what they build
 * through the server's own parser, so a report can never be refused for
 * the shape of its id. An activity or a user is reported by its plain id.
 */

/** A comment on a feed activity: "activityId:commentId". */
export function commentReportTargetId(
  activityId: string,
  commentId: string
): string {
  return `${activityId}:${commentId}`;
}

/** A post in a Community Space: "spaceId:postId". */
export function spacePostReportTargetId(
  spaceId: string,
  postId: string
): string {
  return `${spaceId}:${postId}`;
}

/** A comment on a Space post: "spaceId:postId:commentId". */
export function spacePostCommentReportTargetId(
  spaceId: string,
  postId: string,
  commentId: string
): string {
  return `${spaceId}:${postId}:${commentId}`;
}
