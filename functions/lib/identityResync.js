"use strict";

/**
 * A person's name and photo, carried to the copies of them other people
 * read: their recent posts and comments, and the places they are a member.
 *
 * Every social write copies the author's name and photo onto the document
 * (the feed idiom: a post draws without reading its author's profile), and
 * nothing copied them again. Someone who renamed themselves, or changed or
 * removed their photo, kept the old one on everything they had written.
 * onPublicProfileIdentityChanged calls `resyncAuthorIdentity` when the
 * public profile's name or photo changes.
 *
 * What it reaches, each bounded:
 * - their own activities from the last RECENT_DAYS days, newest first, at
 *   most ACTIVITY_CAP (the profile's own index: authorId, visibility,
 *   createdAt);
 * - their activity comments, Space posts and Space post comments, at most
 *   SCAN_CAP read per kind, of which those from the last RECENT_DAYS days
 *   are updated. Activity comments share the `items` collection group
 *   with feed copies, which carry an authorId too; ordering by `text`
 *   leaves out every document without one, so the query reads comments
 *   only (the items authorId+text index);
 * - their Space memberships (one read per known space), Circle
 *   memberships, and their place in challenges that ended in the last
 *   RECENT_DAYS days or have not ended;
 * - the notifications they sent in the last RECENT_DAYS days, newest
 *   first, at most SCAN_CAP, for the name alone: a notification stores no
 *   photo. These share the `items` collection group too, but only a
 *   notification carries a `fromUserId` (comments and feed copies carry
 *   an authorId), so the query reads notifications only (the items
 *   fromUserId+createdAt index), and each path is checked as well. Its
 *   sentence names the sender first ("Alice gave you props"), so that
 *   carries the new name with `fromName`. An anonymous one stores no
 *   sender and is never found.
 * - the posts that name them among the givers of their props
 *   (`recentPropsBy`, socialCounters.toggleKudos), from the last
 *   RECENT_DAYS days, newest first, at most SCAN_CAP (the activities
 *   recentPropsByUids+createdAt index). Only their own entry changes.
 * Feed copies hold no name (feedIndex.js), so they are not touched.
 *
 * The rules each write keeps:
 * - Only the field that changed is carried, and only where it differs, so
 *   a second run writes nothing.
 * - The values are read from the public profile inside each transaction,
 *   not taken from the event, so an older delivery cannot put back a name
 *   a newer one replaced: a rename that lands while a batch is in flight
 *   waits for it, then fires its own resync.
 * - A name the word filter refuses, or none, is never carried. The name
 *   filter (onPublicProfileWritten) takes such a name back to none; the
 *   copies keep the last good name.
 * - A restricted account reaches no one (S4e): its new name or photo is
 *   not carried into other people's threads. A removed photo still is.
 * - An account being deleted is left alone: each transaction reads the
 *   deletion state with the documents it writes, and stops when it is
 *   set. A document is only ever updated, never created, so a copy the
 *   deletion already removed stays removed.
 * - A Tropos Team post (`official`) keeps the team's name.
 */

const { publicPhotoUrl } = require("./publicPhotoUrl");
const { displayNameRefusal } = require("./objectionableText");
const { transactionAccountsLive } = require("./deletionTransactionGuard");
const { isRestricted } = require("./restriction");
const { SPACE_IDS } = require("./spaceIds");
const { MAX_DISPLAY_NAME_LENGTH } = require("../profileSanitizer");

const DAY_MS = 86400000;
/** How far back content is carried: the posts and comments people still
 *  scroll to. */
const RECENT_DAYS = 90;
/** The most activities one run updates. */
const ACTIVITY_CAP = 200;
/** The most documents one run reads of each collection-group kind. */
const SCAN_CAP = 500;
/** Circle memberships one run reads; a person is in a handful. */
const CIRCLE_CAP = 50;
/** Challenges one run looks in; a few are minted a week. */
const CHALLENGE_CAP = 100;
/** Documents per transaction: well inside Firestore's 500 writes. */
const CHUNK = 100;
/** The longest sentence createNotification stores (socialFanout.js);
 *  pinned to it by identityResync.test.js. */
const NOTIFICATION_MESSAGE_MAX = 200;

const COMMENT_PATH = /^comments\/[^/]+\/items\/[^/]+$/;
const NOTIFICATION_PATH = /^notifications\/[^/]+\/items\/[^/]+$/;
const SPACE_POST_PATH = /^spaces\/[^/]+\/posts\/[^/]+$/;
const SPACE_COMMENT_PATH = /^spaces\/[^/]+\/posts\/[^/]+\/comments\/[^/]+$/;
const CIRCLE_MEMBER_PATH = /^goalSpaces\/[^/]+\/members\/[^/]+$/;

/**
 * Each kind of copy: the name and photo fields it holds, how it marks no
 * photo (`delete` the field, or store `null`), and whose it is.
 */
const AUTHORED = {
  name: "authorName",
  photo: "authorPhotoURL",
  noPhoto: "delete",
  owner: "authorId",
};
const KINDS = {
  activity: AUTHORED,
  comment: AUTHORED,
  spacePost: AUTHORED,
  spaceComment: AUTHORED,
  // Keyed by uid: the document id is the person.
  spaceMember: { name: "displayName", photo: "photoURL", noPhoto: "delete", owner: null },
  circleMember: { name: "displayName", photo: "photoURL", noPhoto: "null", owner: "uid" },
  participant: { name: "displayName", photo: "photoURL", noPhoto: "delete", owner: null },
  // A name and the sentence that starts with it; no photo (notificationPatch).
  notification: { name: "fromName", photo: null, noPhoto: null, owner: "fromUserId" },
  // Their entry in another person's post's givers (propsGiverPatch).
  propsGiver: { name: "name", photo: "photoURL", noPhoto: "delete", owner: null },
};

/** A Firestore Timestamp, a Date or a number, in milliseconds; NaN when none. */
function millis(value) {
  if (typeof value === "number") return value;
  if (value instanceof Date) return value.getTime();
  if (value && typeof value.toMillis === "function") return value.toMillis();
  return NaN;
}

/** The profile's name when it may be carried, else null. */
function carriedName(value) {
  if (typeof value !== "string") return null;
  const name = value.trim().slice(0, MAX_DISPLAY_NAME_LENGTH);
  if (!name || displayNameRefusal(name)) return null;
  return name;
}

/**
 * What to write, from the public profile as it is now. `name` is the name
 * to carry, or undefined to leave names alone; `photo` is the photo URL,
 * null to remove photos, or undefined to leave them alone.
 */
function wantedIdentity(profile, { fields, restricted }) {
  const data = profile || {};
  const wanted = {};
  if (fields.name && !restricted) {
    const name = carriedName(data.displayName);
    if (name) wanted.name = name;
  }
  if (fields.photo) {
    const photo = publicPhotoUrl(data.photoURL) || null;
    // A restricted account may take its photo down, not put a new one up.
    if (photo === null || !restricted) wanted.photo = photo;
  }
  return wanted;
}

/**
 * A notification names its sender twice: `fromName`, and the sentence the
 * tray shows, which createNotification's callers start with that name
 * ("Alice gave you props"). Both carry the new name. A sentence that does
 * not start with the old name is left as written, and a notification with
 * no `fromName` is given none.
 */
function notificationPatch(data, name) {
  const old = data.fromName;
  if (name === undefined || typeof old !== "string" || old === name) {
    return null;
  }
  const patch = { fromName: name };
  if (typeof data.message === "string" && old && data.message.startsWith(old)) {
    patch.message = (name + data.message.slice(old.length)).slice(
      0,
      NOTIFICATION_MESSAGE_MAX
    );
  }
  return patch;
}

/**
 * A post's givers (`recentPropsBy`) hold each giver's name and photo in a
 * list, so their entry is rewritten in place and the rest kept as they
 * are. No entry for them, nothing to write.
 */
function propsGiverPatch(data, uid, wanted) {
  const list = Array.isArray(data.recentPropsBy) ? data.recentPropsBy : [];
  let changed = false;
  const next = list.map((giver) => {
    if (!giver || giver.uid !== uid) return giver;
    const entry = { ...giver };
    if (wanted.name !== undefined && entry.name !== wanted.name) {
      entry.name = wanted.name;
      changed = true;
    }
    if (wanted.photo === null && entry.photoURL !== undefined) {
      delete entry.photoURL;
      changed = true;
    } else if (wanted.photo && entry.photoURL !== wanted.photo) {
      entry.photoURL = wanted.photo;
      changed = true;
    }
    return entry;
  });
  return changed ? { recentPropsBy: next } : null;
}

/** The update `data` (a copy of `kind`) needs to show `wanted`, or null. */
function patchFor(data, kind, wanted, deleteField, uid) {
  if (kind === "notification") return notificationPatch(data, wanted.name);
  if (kind === "propsGiver") return propsGiverPatch(data, uid, wanted);
  const spec = KINDS[kind];
  const patch = {};
  if (wanted.name !== undefined && data[spec.name] !== wanted.name) {
    patch[spec.name] = wanted.name;
  }
  if (wanted.photo !== undefined) {
    const current = data[spec.photo];
    if (wanted.photo === null) {
      if (spec.noPhoto === "null" ? current !== null : current !== undefined) {
        patch[spec.photo] = spec.noPhoto === "null" ? null : deleteField();
      }
    } else if (current !== wanted.photo) {
      patch[spec.photo] = wanted.photo;
    }
  }
  return Object.keys(patch).length > 0 ? patch : null;
}

/** Recent enough to carry: written in the window, or not yet stamped. */
function isRecent(data, cutoff) {
  const at = millis(data.createdAt);
  return !Number.isFinite(at) || at >= cutoff;
}

/**
 * The copies to look at: `{ ref, kind }` for each, and which kinds were
 * cut short by their cap. Notifications hold a name and no photo, so they
 * are looked for only when there is a name to carry (`names`).
 */
async function findCopies({ firestore, uid, cutoff, names }) {
  const targets = [];
  const truncated = [];
  const add = (kind, docs, keep = () => true) => {
    for (const doc of docs) {
      if (keep(doc)) targets.push({ ref: doc.ref, kind });
    }
  };

  const activities = await firestore
    .collection("activities")
    .where("authorId", "==", uid)
    .where("visibility", "in", ["public", "followers", "private"])
    .where("createdAt", ">=", new Date(cutoff))
    .orderBy("createdAt", "desc")
    .limit(ACTIVITY_CAP)
    .get();
  add("activity", activities.docs);
  if (activities.docs.length >= ACTIVITY_CAP) truncated.push("activity");

  const propped = await firestore
    .collection("activities")
    .where("recentPropsByUids", "array-contains", uid)
    .where("createdAt", ">=", new Date(cutoff))
    .orderBy("createdAt", "desc")
    .limit(SCAN_CAP)
    .get();
  add("propsGiver", propped.docs);
  if (propped.docs.length >= SCAN_CAP) truncated.push("propsGiver");

  const byAuthor = (group) =>
    firestore.collectionGroup(group).where("authorId", "==", uid);
  const groups = [
    // orderBy("text") leaves out the feed copies (see the header).
    ["comment", byAuthor("items").orderBy("text"), COMMENT_PATH],
    ["spacePost", byAuthor("posts"), SPACE_POST_PATH],
    ["spaceComment", byAuthor("comments"), SPACE_COMMENT_PATH],
  ];
  for (const [kind, query, path] of groups) {
    const snap = await query.limit(SCAN_CAP).get();
    add(kind, snap.docs, (doc) => {
      const data = doc.data() || {};
      return (
        path.test(doc.ref.path) &&
        data.official !== true &&
        isRecent(data, cutoff)
      );
    });
    if (snap.docs.length >= SCAN_CAP) truncated.push(kind);
  }

  const memberships = SPACE_IDS.map((spaceId) =>
    firestore.doc(`spaces/${spaceId}/members/${uid}`)
  );
  const spaceMembers = await firestore.getAll(...memberships);
  add("spaceMember", spaceMembers, (doc) => doc.exists);

  const circles = await firestore
    .collectionGroup("members")
    .where("uid", "==", uid)
    .limit(CIRCLE_CAP)
    .get();
  add("circleMember", circles.docs, (doc) =>
    CIRCLE_MEMBER_PATH.test(doc.ref.path)
  );

  const challenges = await firestore
    .collection("challenges")
    .where("endDate", ">=", new Date(cutoff))
    .limit(CHALLENGE_CAP)
    .select()
    .get();
  if (challenges.docs.length >= CHALLENGE_CAP) truncated.push("participant");
  if (challenges.docs.length > 0) {
    const places = await firestore.getAll(
      ...challenges.docs.map((c) =>
        firestore.doc(`challenges/${c.id}/participants/${uid}`)
      )
    );
    add("participant", places, (doc) => doc.exists);
  }

  if (names) {
    // Only a notification carries a fromUserId (see the header); the path
    // check keeps it that way if another kind ever does.
    const sent = await firestore
      .collectionGroup("items")
      .where("fromUserId", "==", uid)
      .where("createdAt", ">=", new Date(cutoff))
      .orderBy("createdAt", "desc")
      .limit(SCAN_CAP)
      .get();
    add("notification", sent.docs, (doc) =>
      NOTIFICATION_PATH.test(doc.ref.path)
    );
    if (sent.docs.length >= SCAN_CAP) truncated.push("notification");
  }

  return { targets, truncated };
}

/**
 * Carry `uid`'s current public name and/or photo (`fields` says which
 * changed) to the copies other people read. Returns what it did, as
 * counts, for the trigger's log; never a name.
 */
async function resyncAuthorIdentity({
  firestore,
  uid,
  fields,
  now,
  deleteField,
}) {
  const result = { updated: {}, truncated: [], stopped: null };
  if (!firestore || !uid || !fields || !(fields.name || fields.photo)) {
    result.stopped = "nothing-changed";
    return result;
  }
  const profileRef = firestore.doc(`users/${uid}/public/profile`);
  const restricted = await isRestricted(firestore, uid);
  const first = wantedIdentity((await profileRef.get()).data(), {
    fields,
    restricted,
  });
  if (first.name === undefined && first.photo === undefined) {
    result.stopped = "nothing-to-carry";
    return result;
  }

  const cutoff = now - RECENT_DAYS * DAY_MS;
  const { targets, truncated } = await findCopies({
    firestore,
    uid,
    cutoff,
    names: first.name !== undefined,
  });
  result.truncated = truncated;

  for (let i = 0; i < targets.length; i += CHUNK) {
    const chunk = targets.slice(i, i + CHUNK);
    const outcome = await firestore.runTransaction(async (tx) => {
      const [profile, live, ...snaps] = await Promise.all([
        tx.get(profileRef),
        transactionAccountsLive({ firestore, tx, uids: [uid] }),
        ...chunk.map((t) => tx.get(t.ref)),
      ]);
      if (!live) return { stopped: "deleting" };
      if (!profile.exists) return { stopped: "no-profile" };
      const wanted = wantedIdentity(profile.data(), { fields, restricted });
      const counts = {};
      snaps.forEach((snap, index) => {
        if (!snap.exists) return;
        const { kind } = chunk[index];
        const data = snap.data() || {};
        const owner = KINDS[kind].owner;
        if (owner && data[owner] !== uid) return;
        if (data.official === true) return;
        const patch = patchFor(data, kind, wanted, deleteField, uid);
        if (!patch) return;
        tx.update(snap.ref, patch);
        counts[kind] = (counts[kind] || 0) + 1;
      });
      return { counts };
    });
    if (outcome.stopped) {
      result.stopped = outcome.stopped;
      return result;
    }
    for (const [kind, n] of Object.entries(outcome.counts)) {
      result.updated[kind] = (result.updated[kind] || 0) + n;
    }
  }
  return result;
}

module.exports = {
  resyncAuthorIdentity,
  wantedIdentity,
  RECENT_DAYS,
  ACTIVITY_CAP,
  SCAN_CAP,
  NOTIFICATION_MESSAGE_MAX,
};
