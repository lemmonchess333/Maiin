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
 * Why these helpers live OUTSIDE a transaction:
 *   Fan-out writes are independent appends to N follower feeds.
 *   Wrapping them in a txn would force serialisation under load and
 *   double the cost (txns retry on contention). The cost-benefit
 *   shape differs from kudos/comment counters, which require atomic
 *   sub-doc + counter consistency.
 *
 * Why no per-recipient R1A check inside fan-out:
 *   Skipping deleting recipients would cost N extra reads per
 *   activity post. The deletion executor's Phase D sweeps each
 *   user's `feeds/{uid}/items` collection regardless, so any feed
 *   item written between deletion start and Phase D is cleaned
 *   within the cascade. Author-side R1A is enforced by the trigger
 *   wrapper in `index.js` via `accountDeletionLocks.shouldSystemWriteProceed`
 *   + compensating delete (matches the `onWorkoutCreated` pattern).
 */

function formatDuration(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatPace(secPerKm) {
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${s.toString().padStart(2, "0")}/km`;
}

function buildSummary(activity) {
  if (activity.type === "run") {
    const km = ((activity.distance || 0) / 1000).toFixed(1);
    const time = activity.duration ? formatDuration(activity.duration) : "";
    const pace =
      typeof activity.avgPace === "number"
        ? formatPace(activity.avgPace)
        : activity.avgPace || "";
    const name = activity.runName || "Run";
    return `${name} · ${km}km · ${time} · ${pace} pace`;
  }
  const name = activity.workoutName || "Workout";
  const exCount = activity.exerciseCount || 0;
  const vol = activity.totalVolume
    ? `${Math.round(activity.totalVolume).toLocaleString()} kg volume`
    : "";
  const dur = activity.duration
    ? `${Math.round(activity.duration / 60)} min`
    : "";
  return [name, `${exCount} exercises`, vol, dur].filter(Boolean).join(" · ");
}

function buildFeedItem(activityId, authorId, activity, serverTimestamp) {
  const item = {
    activityId,
    authorId,
    authorName:
      typeof activity.authorName === "string" && activity.authorName.trim()
        ? activity.authorName.slice(0, 100)
        : "Athlete",
    type: activity.type,
    summary: buildSummary(activity),
    createdAt: serverTimestamp(),
  };
  if (typeof activity.authorPhotoURL === "string" && activity.authorPhotoURL) {
    item.authorPhotoURL = activity.authorPhotoURL.slice(0, 500);
  }
  if (activity.prHit) item.prHit = true;
  if (typeof activity.badgeEarned === "string" && activity.badgeEarned) {
    item.badgeEarned = activity.badgeEarned.slice(0, 100);
  }
  if (
    typeof activity.challengeMilestone === "string" &&
    activity.challengeMilestone
  ) {
    item.challengeMilestone = activity.challengeMilestone.slice(0, 100);
  }
  return item;
}

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
      "fanoutActivityToFeeds: firestore, activityId, authorId required",
    );
  }
  if (!activityData || activityData.visibility === "private") {
    return { fanned: 0 };
  }

  const feedItem = buildFeedItem(
    activityId,
    authorId,
    activityData,
    serverTimestamp,
  );

  const followersSnap = await firestore
    .collection("followers")
    .doc(authorId)
    .collection("users")
    .get();

  const recipientIds = new Set(followersSnap.docs.map((d) => d.id));
  recipientIds.add(authorId); // author's own feed

  let fanned = 0;
  for (const rid of recipientIds) {
    const itemRef = firestore
      .collection("feeds")
      .doc(rid)
      .collection("items")
      .doc();
    await itemRef.set(feedItem);
    fanned += 1;
  }
  return { fanned };
}

const VALID_NOTIFICATION_TYPES = [
  "kudos",
  "comment",
  "follow",
  "challenge_milestone",
];

function sanitiseNotificationData(data) {
  const out = { type: data.type };
  if (typeof data.fromName === "string" && data.fromName) {
    out.fromName = data.fromName.slice(0, 100);
  }
  if (typeof data.activityId === "string" && data.activityId) {
    out.activityId = data.activityId.slice(0, 64);
  }
  if (typeof data.message === "string" && data.message) {
    out.message = data.message.slice(0, 200);
  }
  return out;
}

/**
 * Write a notification doc into the recipient's
 * `notifications/{toUid}/items/` collection. Server-controlled:
 *   - `fromUserId` is forced to `fromUid` (the authed caller), not
 *     anything the client supplies in `data`.
 *   - `type` must be one of the closed union.
 *   - String fields are length-capped.
 *   - Self-notification is a silent no-op.
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
}) {
  if (!firestore || !fromUid || !toUid) {
    throw new Error(
      "createNotification: firestore, fromUid, toUid required",
    );
  }
  if (fromUid === toUid) return { skipped: true };

  if (!data || !VALID_NOTIFICATION_TYPES.includes(data.type)) {
    throw new Error(
      `createNotification: type must be one of ${VALID_NOTIFICATION_TYPES.join(", ")}`,
    );
  }

  const itemRef = firestore
    .collection("notifications")
    .doc(toUid)
    .collection("items")
    .doc();

  const notif = {
    ...sanitiseNotificationData(data),
    fromUserId: fromUid,
    read: false,
    createdAt: serverTimestamp(),
  };

  await itemRef.set(notif);
  return { notificationId: itemRef.id };
}

module.exports = {
  fanoutActivityToFeeds,
  createNotification,
  VALID_NOTIFICATION_TYPES,
};
