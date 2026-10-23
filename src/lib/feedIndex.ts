/** Only this version is readable: historical rows contain session details
 * whose permissions could outlive the parent post. Keep in step with
 * functions/lib/feedIndex.js and the feeds read rule. */
export const FEED_INDEX_VERSION = 2;

export interface FeedIndex {
  id: string;
  activityId: string;
  authorId: string;
  createdAt: unknown;
}
