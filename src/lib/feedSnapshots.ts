/**
 * The Feed's sources as last read, kept for the session.
 *
 * Following, Spaces and Explore each keep the posts they last read, so
 * switching back to one, or coming back to Social, shows them at once
 * while the source reads again behind them. A placeholder is only for a
 * source with nothing read yet, as Strava and Instagram keep a tab's posts
 * once loaded (DESIGN_GUIDE §8: content that comes back on a tab or view
 * switch just shows).
 *
 * In memory, and for one account at a time: a write for any other account
 * forgets everything first, and a read answers only the account that
 * wrote, so nothing one account read is ever shown to another on a shared
 * phone. Signing out reloads the app, which empties it too.
 *
 * What a source shows is filtered again as it is drawn
 * (`visibleFeedItems`), against the blocks and hidden posts as they are
 * now, so a block or a hide made since the read still hides the post.
 */

let owner: string | null = null;
const snapshots = new Map<string, unknown>();

/** The source's last read for this account, or undefined if it has none. */
export function readFeedSnapshot<T>(
  uid: string | null,
  source: string
): T | undefined {
  if (!uid || uid !== owner) return undefined;
  return snapshots.get(source) as T | undefined;
}

/** Keep the source's read for this account, forgetting any other's. */
export function writeFeedSnapshot<T>(
  uid: string,
  source: string,
  snapshot: T
): void {
  if (owner !== uid) {
    snapshots.clear();
    owner = uid;
  }
  snapshots.set(source, snapshot);
}

/** Each test is a session. */
export function __resetFeedSnapshotsForTests(): void {
  owner = null;
  snapshots.clear();
}

/** The posts the person may see now: none from anyone blocked either way,
 *  and none they hid. The feeds filter as they read too; this holds the
 *  posts kept from an earlier read to the lists as they stand. */
export function visibleFeedItems<
  T extends { authorId: string; activityId: string },
>(items: T[], blocked?: Set<string>, hidden?: Set<string>): T[] {
  if (!blocked?.size && !hidden?.size) return items;
  const shown = items.filter(
    (item) => !blocked?.has(item.authorId) && !hidden?.has(item.activityId)
  );
  return shown.length === items.length ? items : shown;
}
