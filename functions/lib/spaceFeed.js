"use strict";

/**
 * A Space's members' sessions (Run27 call 11): the public posts of the
 * people in a Space, newest first, as Strava's club Recent Activity.
 *
 * `spaces/{spaceId}/sessions/{activityId}` = `{ activityId, authorId,
 * createdAt }` is a routing row, as a follower's feed row is
 * (lib/feedIndex.js): it names the post and nothing of it. The app reads a
 * page of rows and then each post itself, whose rules enforce its current
 * visibility and a block either way, and shows only a post still public.
 * Anyone signed in reads the rows, as anyone reads a Space's members and
 * posts; only this module writes them.
 *
 * A row stands for a post exactly while all of these hold, and each writer
 * below reads them again rather than trusting the event that woke it:
 *
 * - the post is public (`visibility == "public"`) and not flagged. A
 *   followers-only or private post never gets a row, so a post narrowed
 *   later loses its row on that write;
 * - its author is a member of the Space (`spaces/{id}/members/{uid}`);
 * - its author is not restricted (`globalRestrictedUids/{uid}`): a
 *   restricted account reaches no one (S4e), and the app cannot see who is
 *   restricted, so the rows are where it is held;
 * - its author is not being deleted.
 *
 * Writers: `syncActivityRows` for any write to a post (created, made public
 * or narrowed, flagged, deleted), `syncMemberRows` for a join or a leave,
 * `removeAuthorRows` when an account is restricted or deleted, and
 * `restoreAuthorRows` when a restriction is lifted. Each is idempotent: a
 * retried or doubled delivery reads the same facts and writes the same rows.
 *
 * Membership is found through the `members.uid` collection-group index the
 * deletion executor already uses (the member document mirrors its id into
 * `uid`), filtered to the known Space ids, so Circle members never match.
 */

const { SPACE_IDS } = require("./spaceIds");
const { transactionAccountsLive } = require("./deletionTransactionGuard");

const ROWS = "sessions";
const DAY_MS = 24 * 60 * 60 * 1000;
const KNOWN_SPACES = new Set(SPACE_IDS);
const MEMBER_PATH = /^spaces\/([^/]+)\/members\/([^/]+)$/;
const ROW_PATH = /^spaces\/([^/]+)\/sessions\/([^/]+)$/;
/** Firestore's limit is 500 writes a batch; this leaves room. */
const BATCH_WRITES = 400;

/**
 * Tropos heuristic: joining a Space brings in the member's public posts of
 * the last four weeks, at most 20, so a Space they join is not empty of
 * them until they next train, and joining does not publish a year of
 * history into a room they have just walked into.
 */
const JOIN_BACKFILL_DAYS = 28;
const JOIN_BACKFILL_MAX = 20;

/** The Space id a member document's path names, or null. */
function memberSpaceId(path, uid) {
  const match = MEMBER_PATH.exec(path || "");
  if (!match || match[2] !== uid || !KNOWN_SPACES.has(match[1])) return null;
  return match[1];
}

/** The Space id a row's path names, or null. */
function rowSpaceId(path) {
  const match = ROW_PATH.exec(path || "");
  return match ? match[1] : null;
}

/** The query that finds the Spaces `uid` is in. */
function membershipsQuery(db, uid) {
  return db.collectionGroup("members").where("uid", "==", uid);
}

/** The known Spaces a membership query's documents say `uid` is in. */
function spaceIdsFrom(snapshot, uid) {
  const ids = new Set();
  for (const doc of snapshot.docs) {
    const spaceId = memberSpaceId(doc.ref.path, uid);
    if (spaceId) ids.add(spaceId);
  }
  return [...ids].sort();
}

/** The Spaces `uid` is a member of, sorted. */
async function joinedSpaceIds(db, uid) {
  if (typeof uid !== "string" || !uid) return [];
  return spaceIdsFrom(await membershipsQuery(db, uid).get(), uid);
}

/** Whether a post may stand in a Space's list at all. */
function shownInSpaces(activity) {
  return (
    !!activity &&
    activity.visibility === "public" &&
    activity.flagged !== true &&
    typeof activity.authorId === "string" &&
    activity.authorId.length > 0 &&
    (activity.type === "run" || activity.type === "workout") &&
    activity.createdAt != null
  );
}

/**
 * Whether a write to a post can change its rows, so the trigger reads
 * nothing for the many writes that cannot (props and comment counts, a
 * map image, photos). A post made public, narrowed, flagged or deleted can.
 * A post created public can; one created followers-only or private cannot,
 * since making it public later is a write of its own.
 */
function activityWriteMayMoveRows(before, after) {
  if (!after) return true;
  if (!before) return shownInSpaces(after);
  return (
    before.visibility !== after.visibility ||
    (before.flagged === true) !== (after.flagged === true) ||
    before.authorId !== after.authorId
  );
}

/** A stored time as milliseconds: a Firestore Timestamp, a Date or a number. */
function millisOf(value) {
  if (value == null) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (value instanceof Date) return value.getTime();
  return 0;
}

function rowFor(activityId, activity) {
  return {
    activityId,
    authorId: activity.authorId,
    createdAt: activity.createdAt,
  };
}

/** Whether a stored row already says what `row` says. */
function sameRow(stored, row) {
  return (
    !!stored &&
    stored.activityId === row.activityId &&
    stored.authorId === row.authorId &&
    millisOf(stored.createdAt) === millisOf(row.createdAt)
  );
}

function rowRef(db, spaceId, activityId) {
  return db
    .collection("spaces")
    .doc(spaceId)
    .collection("sessions")
    .doc(activityId);
}

function restrictionRef(db, uid) {
  return db.collection("globalRestrictedUids").doc(uid);
}

/**
 * Make one post's rows match what is true of it now: a row in each Space
 * its author is in while the post may be shown, none anywhere otherwise
 * (deleted, narrowed, flagged, a restricted author, an author being
 * deleted). Resolves to `{ added, removed }`.
 */
async function syncActivityRows(db, activityId) {
  if (typeof activityId !== "string" || !activityId) {
    return { added: 0, removed: 0 };
  }
  const activityRef = db.collection("activities").doc(activityId);
  const rowsQuery = db
    .collectionGroup("sessions")
    .where("activityId", "==", activityId);
  return db.runTransaction(async (tx) => {
    const [activitySnap, rowsSnap] = await Promise.all([
      tx.get(activityRef),
      tx.get(rowsQuery),
    ]);
    const activity = activitySnap.exists ? activitySnap.data() || {} : null;
    const rows = rowsSnap.docs.filter(
      (doc) => rowSpaceId(doc.ref.path) && doc.id === activityId
    );

    let target = [];
    if (shownInSpaces(activity)) {
      const authorId = activity.authorId;
      const [restricted, live, memberships] = await Promise.all([
        tx.get(restrictionRef(db, authorId)),
        transactionAccountsLive({ firestore: db, tx, uids: [authorId] }),
        tx.get(membershipsQuery(db, authorId)),
      ]);
      if (!restricted.exists && live)
        target = spaceIdsFrom(memberships, authorId);
    }

    const keep = new Set(target);
    const stored = new Map(rows.map((doc) => [rowSpaceId(doc.ref.path), doc]));
    let removed = 0;
    for (const [spaceId, doc] of stored) {
      if (keep.has(spaceId)) continue;
      tx.delete(doc.ref);
      removed += 1;
    }
    let added = 0;
    for (const spaceId of target) {
      const row = rowFor(activityId, activity);
      const existing = stored.get(spaceId);
      if (existing && sameRow(existing.data(), row)) continue;
      tx.set(rowRef(db, spaceId, activityId), row);
      added += 1;
    }
    return { added, removed };
  });
}

/**
 * Make one member's rows in one Space match their membership: on a join,
 * their public posts of the last JOIN_BACKFILL_DAYS (at most
 * JOIN_BACKFILL_MAX) are added; on a leave, every row of theirs in the
 * Space goes. A restricted account, or one being deleted, keeps no row.
 * A row already there for a post that is still shown is left alone, so
 * running this for a member changes nothing older than the backfill.
 * Resolves to `{ added, removed }`.
 */
async function syncMemberRows(db, spaceId, uid, { now = Date.now() } = {}) {
  if (!KNOWN_SPACES.has(spaceId) || typeof uid !== "string" || !uid) {
    return { added: 0, removed: 0 };
  }
  const memberRef = db
    .collection("spaces")
    .doc(spaceId)
    .collection("members")
    .doc(uid);
  const rowsQuery = db
    .collection("spaces")
    .doc(spaceId)
    .collection("sessions")
    .where("authorId", "==", uid);
  const postsQuery = db
    .collection("activities")
    .where("authorId", "==", uid)
    .where("visibility", "==", "public")
    .orderBy("createdAt", "desc")
    .limit(JOIN_BACKFILL_MAX);
  const cutoff = now - JOIN_BACKFILL_DAYS * DAY_MS;

  return db.runTransaction(async (tx) => {
    const [member, rowsSnap, restricted, live, posts] = await Promise.all([
      tx.get(memberRef),
      tx.get(rowsQuery),
      tx.get(restrictionRef(db, uid)),
      transactionAccountsLive({ firestore: db, tx, uids: [uid] }),
      tx.get(postsQuery),
    ]);
    const rows = rowsSnap.docs.filter(
      (doc) => rowSpaceId(doc.ref.path) === spaceId
    );

    if (!member.exists || restricted.exists || !live) {
      rows.forEach((doc) => tx.delete(doc.ref));
      return { added: 0, removed: rows.length };
    }

    const have = new Set(rows.map((doc) => doc.id));
    let added = 0;
    for (const post of posts.docs) {
      const activity = post.data() || {};
      if (activity.authorId !== uid || !shownInSpaces(activity)) continue;
      if (millisOf(activity.createdAt) < cutoff) continue;
      if (have.has(post.id)) continue;
      tx.set(rowRef(db, spaceId, post.id), rowFor(post.id, activity));
      added += 1;
    }
    return { added, removed: 0 };
  });
}

/** Delete documents in batches Firestore accepts. */
async function deleteAll(db, refs) {
  for (let i = 0; i < refs.length; i += BATCH_WRITES) {
    const batch = db.batch();
    refs.slice(i, i + BATCH_WRITES).forEach((ref) => batch.delete(ref));
    await batch.commit();
  }
}

/**
 * Take every row of `uid`'s posts out of every Space: a restriction, and
 * account deletion. Resolves to how many were removed.
 */
async function removeAuthorRows(db, uid) {
  if (typeof uid !== "string" || !uid) return 0;
  const snap = await db
    .collectionGroup("sessions")
    .where("authorId", "==", uid)
    .get();
  const refs = snap.docs
    .filter(
      (doc) => rowSpaceId(doc.ref.path) && (doc.data() || {}).authorId === uid
    )
    .map((doc) => doc.ref);
  await deleteAll(db, refs);
  return refs.length;
}

/**
 * A restriction lifted: the member's recent public posts come back to the
 * Spaces they are in, as on a join. Resolves to how many rows were added.
 */
async function restoreAuthorRows(db, uid, { now = Date.now() } = {}) {
  let added = 0;
  for (const spaceId of await joinedSpaceIds(db, uid)) {
    added += (await syncMemberRows(db, spaceId, uid, { now })).added;
  }
  return added;
}

module.exports = {
  ROWS,
  JOIN_BACKFILL_DAYS,
  JOIN_BACKFILL_MAX,
  memberSpaceId,
  rowSpaceId,
  joinedSpaceIds,
  shownInSpaces,
  activityWriteMayMoveRows,
  syncActivityRows,
  syncMemberRows,
  removeAuthorRows,
  restoreAuthorRows,
};
