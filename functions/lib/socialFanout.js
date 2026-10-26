const { FieldPath } = require("firebase-admin/firestore");
const { transactionAccountsLive } = require("./deletionTransactionGuard");
const { categoryFor, wantsNotification } = require("./notificationPreferences");
/**
 * 2026-05-26 audit PR 3 — server-side feed fan-out + notification
 * creation. Closes findings #3 (feed spam), #6 (notification spam),
 * and #12 (rate limiting on social writes).
 *
 * Pre-PR-3 the client wrote `/feeds/{recipient}/items/{doc}` and
 * `/notifications/{recipient}/items/{doc}` directly. Firestore rules
 * gated impersonation (the `authorId == auth.uid` check) but couldn't
 * gate volume — a hostile script could fan-out 100k feed items into
 * any follower's feed, or write fake-looking notifications.
 *
 * Post-PR-3:
 *   - `/feeds/*` writes are server-only. The `onActivityCreated`
 *     Firestore trigger calls `fanoutActivityToFeeds` after each
 *     `/activities/{aid}` create.
 *   - `/notifications/*` writes are server-only. Notification
 *     creation is folded into `toggleKudosCallable` and
 *     `addCommentCallable` (the only two paths that wrote notifs
 *     pre-PR-3) via `createNotification` here.
 *   - Rate limits come for free: each parent callable already
 *     applies `isRateLimited` per uid, and the trigger fires once
 *     per activity create which is itself bounded by /activities
 *     create-rate (PR 1 schema + per-actor lock).
 *
 * How a post reaches its followers:
 *   A page of followers at a time, each page one transaction that reads
 *   the deletion state of the author and of every recipient before it
 *   writes, so no copy lands in a feed whose account is being deleted nor
 *   carries an author who is. Author-side R1A is also enforced by the
 *   trigger wrapper in `index.js` via
 *   `accountDeletionLocks.shouldSystemWriteProceed` + compensating delete
 *   (matches the `onWorkoutCreated` pattern).
 *
 * How long the copies are kept:
 *   A feed copy carries an `expiresAt` 180 days on and a notification 90
 *   days on, and the `items` TTL policy (firestore.indexes.json) deletes
 *   each then. The post itself stays on its author's profile; the copy is
 *   only its row in a follower's Following feed, and the tray shows the
 *   newest 50 notifications, so a notification months old is one nobody
 *   can reach. Comments share the `items` collection group and carry no
 *   `expiresAt`, so the policy never touches them.
 */

const blockGuard = require("./blockGuard");
const { MAX_DISPLAY_NAME_LENGTH } = require("../profileSanitizer");
const {
  FEED_COPY_RETENTION_DAYS,
  FEED_COPY_PATH,
  buildFeedIndex,
} = require("./feedIndex");

const DAY_MS = 86_400_000;
const NOTIFICATION_RETENTION_DAYS = 90;

/**
 * Fan out a single activity creation to follower feeds + author's
 * own feed. Called from the `onActivityCreated` trigger.
 *
 * Args:
 *   - firestore:    admin.firestore() handle
 *   - activityId:   activity doc id
 *   - authorId:     activity author uid (= followers/{authorId}/users)
 *   - activityData: activity doc data
 *   - serverTimestamp: factory (admin.firestore.FieldValue.serverTimestamp)
 *
 * Returns: { fanned: number } — count of feed items written.
 */
async function fanoutActivityToFeeds({
  firestore,
  activityId,
  authorId,
  activityData,
  serverTimestamp,
}) {
  if (!firestore || !activityId || !authorId) {
    throw new Error(
      "fanoutActivityToFeeds: firestore, activityId, authorId required"
    );
  }
  if (!activityData || activityData.visibility === "private") {
    return { fanned: 0 };
  }

  const feedItem = buildFeedIndex({
    activityId,
    authorId,
    createdAt: serverTimestamp(),
    expiresAt: new Date(Date.now() + FEED_COPY_RETENTION_DAYS * DAY_MS),
  });

  // The author's own feed, then the followers a page at a time, so a post
  // from someone with thousands of followers reaches all of them inside
  // the trigger's time.
  const author = await writeFeedPage({
    firestore,
    authorId,
    activityId,
    feedItem,
    recipientIds: [authorId],
  });
  if (!author.authorLive) return { fanned: 0 };
  let fanned = author.written;
  const followers = firestore
    .collection("followers")
    .doc(authorId)
    .collection("users")
    .orderBy(FieldPath.documentId())
    .limit(FANOUT_PAGE_SIZE);
  let cursor = null;
  for (;;) {
    const page = await (
      cursor ? followers.startAfter(cursor) : followers
    ).get();
    const recipientIds = page.docs
      .map((d) => d.id)
      .filter((id) => id !== authorId);
    if (recipientIds.length > 0) {
      const result = await writeFeedPage({
        firestore,
        authorId,
        activityId,
        feedItem,
        recipientIds,
      });
      if (!result.authorLive) break;
      fanned += result.written;
    }
    if (page.docs.length < FANOUT_PAGE_SIZE) break;
    cursor = page.docs[page.docs.length - 1];
  }
  return { fanned };
}

/** Followers written per transaction: well inside a transaction's 500
 *  writes, and each one's two deletion reads with it. */
const FANOUT_PAGE_SIZE = 100;

/**
 * One page of feed copies, in one transaction that reads the deletion state
 * of the author and of each recipient it writes to, so a copy never lands
 * in a feed whose account is being deleted, nor carries an author who is.
 * Deterministic doc id (= activityId), so an at-least-once trigger
 * re-delivery overwrites the same feed item instead of appending a
 * duplicate: one activity, exactly one item per recipient feed (CROSS-H1).
 */
async function writeFeedPage({
  firestore,
  authorId,
  activityId,
  feedItem,
  recipientIds,
}) {
  return firestore.runTransaction(async (tx) => {
    if (!(await transactionAccountsLive({ firestore, tx, uids: [authorId] }))) {
      return { authorLive: false, written: 0 };
    }
    const live = await Promise.all(
      recipientIds.map((rid) =>
        transactionAccountsLive({ firestore, tx, uids: [rid] })
      )
    );
    let written = 0;
    recipientIds.forEach((rid, i) => {
      if (!live[i]) return;
      tx.set(
        firestore
          .collection("feeds")
          .doc(rid)
          .collection("items")
          .doc(activityId),
        feedItem
      );
      written += 1;
    });
    return { authorLive: true, written };
  });
}

/** The `items` collection group also holds notifications and comments;
 * FEED_COPY_PATH keeps their same-activityId documents out of removal. */
const REMOVE_PAGE_SIZE = 300;

/**
 * Delete every feed copy of an activity. Called from the
 * `onActivityDeleted` trigger, and from `onActivityCreated` when the post
 * was deleted while it was being fanned out.
 *
 * The copies are found by their own `activityId` field (a collection-group
 * query, indexed in firestore.indexes.json) rather than by re-reading the
 * author's followers: someone who has unfollowed since still holds a copy,
 * and copies written under auto ids are not at `{activityId}`.
 *
 * Deleting is idempotent, so a re-delivered or concurrent trigger is safe:
 * a second run finds nothing left to delete.
 *
 * Returns: { removed: number } — count of feed copies deleted.
 */
async function removeActivityFromFeeds({ firestore, activityId }) {
  if (!firestore || !activityId) {
    throw new Error("removeActivityFromFeeds: firestore, activityId required");
  }
  const query = firestore
    .collectionGroup("items")
    .where("activityId", "==", activityId)
    .orderBy(FieldPath.documentId())
    .limit(REMOVE_PAGE_SIZE);
  let removed = 0;
  let cursor = null;
  for (;;) {
    const page = await (cursor ? query.startAfter(cursor) : query).get();
    const copies = page.docs.filter((d) => FEED_COPY_PATH.test(d.ref.path));
    if (copies.length > 0) {
      const batch = firestore.batch();
      for (const d of copies) batch.delete(d.ref);
      await batch.commit();
      removed += copies.length;
    }
    if (page.docs.length < REMOVE_PAGE_SIZE) return { removed };
    // Paged by path, so a page of non-copies cannot be read again forever.
    cursor = page.docs[page.docs.length - 1].ref;
  }
}

const VALID_NOTIFICATION_TYPES = [
  "kudos",
  "comment",
  "follow",
  // Polish2: someone asked to follow the recipient, who approves each
  // follower (onFollowRequestCreated).
  "follow_request",
  // The person asked said yes (onFollowerCreated, on an accepted edge).
  "follow_accepted",
  "challenge_milestone",
  // SOCIAL-FOCUS-01: a Circle member backed the recipient's weekly
  // focus. Deliberately GENERIC — the message never names the backer
  // or the focus, and the client renders it without a profile link.
  "circle_focus_backed",
  // CIRCLE-ACTIVITY-NOTIFICATIONS: a co-member published a high-signal
  // Circle event (fanned by the onGoalSpaceEventCreated trigger to the
  // other members). Unlike circle_focus_backed these are NAMED — the
  // recipient can already see the author + event in the shared Circle
  // timeline, so naming the actor is consistent, not a leak. No push.
  "circle_milestone",
  "circle_needs_support",
  "circle_joined",
  "circle_routine_shared",
  // SOC-P2g: space-post engagement (like = "props" flame, comment). NAMED
  // types — the actor is already visible on the post itself, so naming is
  // consistent, not a leak. These open the post via spaceId and postId
  // (see the sanitiser).
  //
  // Added 2026-07-27, AFTER the callables shipped emitting them: the P2g
  // callables threw here on every single notification, the throw landed in
  // their best-effort catch, and the feature was silently dead in
  // production while both halves' unit tests stayed green. The composition
  // test in socialFanout.test.js ("every type index.js emits is valid")
  // now pins this list against the callables' actual emissions — extend
  // BOTH when adding a notifying callable, and the test will say so.
  "space_post_like",
  "space_post_comment",
];

function sanitiseNotificationData(data) {
  const out = { type: data.type };
  if (typeof data.fromName === "string" && data.fromName) {
    out.fromName = data.fromName.slice(0, MAX_DISPLAY_NAME_LENGTH);
  }
  if (typeof data.activityId === "string" && data.activityId) {
    out.activityId = data.activityId.slice(0, 64);
  }
  if (typeof data.message === "string" && data.message) {
    out.message = data.message.slice(0, 200);
  }
  // SOC-P2g deep-link payload. The tray opens the post via data.spaceId
  // and data.postId (useNotifications.ts parses them; notificationTarget.ts
  // routes on them), so stripping them here ships rows that render but go
  // nowhere —
  // which is exactly what happened before 2026-07-27: the callables SENT
  // spaceId/postId and this allowlist dropped them. spaceId is a closed
  // server-side vocabulary (SPACE_IDS, ~20 short ids) and postId is a
  // Firestore doc id; the caps are generous ceilings, not formats.
  if (typeof data.spaceId === "string" && data.spaceId) {
    out.spaceId = data.spaceId.slice(0, 64);
  }
  if (typeof data.postId === "string" && data.postId) {
    out.postId = data.postId.slice(0, 128);
  }
  return out;
}

/**
 * Whether the recipient has this kind of notification switched on
 * (Settings → Notifications → Activity; notificationPreferences.js).
 *
 * A type with no switch needs no read. When the profile cannot be read,
 * the defaults decide rather than either extreme: refusing everything would
 * drop the notifications people want on a passing error, and a muted kind
 * arriving once is the smaller mistake.
 */
async function recipientWants(firestore, toUid, type) {
  if (categoryFor(type) === null) return true;
  let prefs = null;
  try {
    const snap = await firestore.collection("users").doc(toUid).get();
    prefs = snap.exists ? (snap.data() || {}).notificationPreferences : null;
  } catch {
    prefs = null;
  }
  return wantsNotification(prefs, type);
}

/**
 * Write a notification doc into the recipient's
 * `notifications/{toUid}/items/` collection. Server-controlled:
 *   - `fromUserId` is forced to `fromUid` (the authed caller), not
 *     anything the client supplies in `data`.
 *   - `anonymous: true` omits `fromUserId` from the STORED doc — for
 *     notification types whose contract is that the recipient can
 *     never identify the actor (circle_focus_backed). The recipient
 *     owns read on their notification docs, so anonymity that only
 *     lives in UI copy is not anonymity; it has to be absent from the
 *     data. `fromUid` is still required for the self-notify no-op.
 *   - `type` must be one of the closed union.
 *   - String fields are length-capped.
 *   - Self-notification is a silent no-op.
 *   - A kind the recipient switched off is not written (`muted`).
 *
 * Caller is responsible for rate limiting (kudos/comment CFs already
 * apply per-uid limits via `isRateLimited`).
 */
async function createNotification({
  firestore,
  fromUid,
  toUid,
  data,
  serverTimestamp,
  anonymous = false,
  notificationId,
}) {
  if (!firestore || !fromUid || !toUid) {
    throw new Error("createNotification: firestore, fromUid, toUid required");
  }
  if (fromUid === toUid) return { skipped: true };

  /* BLOCK BACKSTOP. The interaction callables refuse a blocked kudos or
     comment outright, but they are not the only writers here — space post
     likes and comments, follows and circle events all reach this function
     too, and each new surface is another chance to forget the check.

     Guarding at the single point every notification passes through makes the
     rule true by construction rather than by remembering, and the
     notification is the part that actually matters: a suppressed feed row is
     recoverable on read, a delivered push is not.

     Silent skip, not a throw. A blocked notification is not a failure of the
     interaction the caller was performing — the like still counted — and
     raising here would turn a moderation rule into an error path every caller
     would have to handle. */
  if (await blockGuard.isBlockedBetween(firestore, toUid, fromUid)) {
    return { skipped: true, blocked: true };
  }

  if (!data || !VALID_NOTIFICATION_TYPES.includes(data.type)) {
    throw new Error(
      `createNotification: type must be one of ${VALID_NOTIFICATION_TYPES.join(", ")}`
    );
  }

  /* The recipient's switch for this kind. Skipped, not written and hidden:
     the tray shows what is stored, and Settings says an "off" kind is not
     sent. Like the block check, a silent skip: the like or the comment
     still happened. */
  if (!(await recipientWants(firestore, toUid, data.type))) {
    return { skipped: true, muted: true };
  }

  const items = firestore
    .collection("notifications")
    .doc(toUid)
    .collection("items");
  // A deterministic id makes a fan-out from an at-least-once Firestore
  // trigger idempotent: a re-delivery overwrites the same doc instead
  // of minting a duplicate. Auto-id (the default) stays for the
  // callable senders where each call is a distinct notification.
  const itemRef =
    typeof notificationId === "string" && notificationId
      ? items.doc(notificationId)
      : items.doc();

  const notif = {
    ...sanitiseNotificationData(data),
    ...(anonymous ? {} : { fromUserId: fromUid }),
    read: false,
    createdAt: serverTimestamp(),
    expiresAt: new Date(Date.now() + NOTIFICATION_RETENTION_DAYS * DAY_MS),
  };

  return firestore.runTransaction(async (tx) => {
    if (
      !(await transactionAccountsLive({
        firestore,
        tx,
        uids: [fromUid, toUid],
      }))
    )
      return { skipped: true, deleting: true };
    tx.set(itemRef, notif);
    return { notificationId: itemRef.id };
  });
}

/**
 * The name a notification shows for whoever caused it: the sender's own
 * public profile name, read here, never one the caller sends. The props
 * and space-post-like callables took `data.fromName` from the client and
 * put it in the recipient's tray as written ("{name} gave you props"),
 * unfiltered and uncut in the message, so any text could appear there in
 * the app's own words. The follow notification reads the same document.
 * Falls back to "Someone", as those callers did, when there is no name or
 * the read fails: a notification is never worth failing the props for.
 */
async function senderDisplayName(firestore, uid) {
  try {
    const snap = await firestore.doc(`users/${uid}/public/profile`).get();
    const name = snap.exists ? snap.data().displayName : null;
    if (typeof name !== "string" || !name.trim()) return "Someone";
    return name.trim().slice(0, MAX_DISPLAY_NAME_LENGTH);
  } catch {
    return "Someone";
  }
}

module.exports = {
  fanoutActivityToFeeds,
  removeActivityFromFeeds,
  createNotification,
  senderDisplayName,
  VALID_NOTIFICATION_TYPES,
  FEED_COPY_RETENTION_DAYS,
  NOTIFICATION_RETENTION_DAYS,
};
