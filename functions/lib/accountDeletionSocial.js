"use strict";

const crypto = require("crypto");
const { FieldPath } = require("firebase-admin/firestore");

const PAGE_SIZE = 150;
const YEAR_MS = 365 * 86400000;

// A deleted comment keeps its place in a conversation. The original text is
// held separately for the agreed moderation retention period: Firestore rules
// cannot hide selected fields on an otherwise readable comment document.
async function anonymiseComment({ firestore, ref, uid, now }) {
  const evidenceId = crypto.createHash("sha256").update(ref.path).digest("hex");
  await firestore.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.data().authorId !== uid) return;
    tx.set(firestore.doc(`deletedCommentEvidence/${evidenceId}`), {
      originalText: snap.data().text || "",
      createdAt: new Date(now),
      expiresAt: new Date(now + YEAR_MS),
    });
    // Replace, rather than merge, so denormalised identity fields cannot linger.
    tx.set(ref, {
      authorId: null,
      authorName: "Deleted user",
      authorPhotoURL: null,
      text: "Comment deleted",
      createdAt: snap.data().createdAt || now,
      deleted: true,
      reactions: {},
    });
  });
}

async function removeReaction({ firestore, ref, uid, field }) {
  await firestore.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return;
    const parts = field.split(".");
    const data = snap.data();
    const values = parts.reduce((value, key) => value?.[key], data);
    if (Array.isArray(values) && values.includes(uid)) {
      tx.update(ref, { [field]: values.filter((value) => value !== uid) });
    }
  });
}

async function removeCountedEdge({ firestore, ref, parent, counter }) {
  await firestore.runTransaction(async (tx) => {
    const [edge, owner] = await Promise.all([tx.get(ref), tx.get(parent)]);
    if (!edge.exists) return;
    tx.delete(ref);
    if (owner.exists) {
      tx.update(parent, { [counter]: Math.max(0, (Number(owner.data()[counter]) || 0) - 1) });
    }
  });
}

/**
 * Cross-user erasure, including old records that predate membership indexes.
 * All scans are paged and checkpointed. In particular, a collection-group
 * documentId == uid query is INVALID: those comparisons require a full path.
 * The two legacy ID-only groups therefore use a resumable reference scan.
 * No user content is stored in the public deletion-status document.
 */
async function cleanupSocial({ firestore, uid, now, checkpoint }) {
  const workRef = firestore.doc(`accountDeletionWork/${uid}`);
  const work = (await workRef.get()).data() || {};

  async function scan(name, query, visit) {
    const saved = work[name];
    if (saved?.done) return;
    let cursor = saved?.cursor;
    for (;;) {
      await checkpoint();
      let page = query.orderBy(FieldPath.documentId()).limit(PAGE_SIZE);
      if (cursor) page = page.startAfter(firestore.doc(cursor));
      const snap = await page.get();
      for (const doc of snap.docs) {
        await checkpoint();
        await visit(doc);
        cursor = doc.ref.path;
        // Advance only AFTER the effect commits. Replays remain idempotent.
        await workRef.set({ [name]: { cursor, done: false } }, { merge: true });
      }
      if (snap.size < PAGE_SIZE) {
        await workRef.set({ [name]: { done: true } }, { merge: true });
        return;
      }
    }
  }

  const group = (name, field, op = "==") =>
    firestore.collectionGroup(name).where(field, op, uid);
  const is = (doc, pattern) => pattern.test(doc.ref.path);
  for (const field of ["authorId", "fromUserId"]) {
    await scan(`items_${field}`, group("items", field), async (doc) => {
      if (is(doc, /^(feeds|notifications)\/[^/]+\/items\/[^/]+$/)) {
        await doc.ref.delete();
      } else if (is(doc, /^comments\/[^/]+\/items\/[^/]+$/) && field === "authorId") {
        await anonymiseComment({ firestore, ref: doc.ref, uid, now });
      }
    });
  }
  await scan("authored_posts", group("posts", "authorId"), async (doc) => {
    if (is(doc, /^spaces\/[^/]+\/posts\/[^/]+$/)) await firestore.recursiveDelete(doc.ref);
  });
  await scan("post_comments", group("comments", "authorId"), async (doc) => {
    if (is(doc, /^spaces\/[^/]+\/posts\/[^/]+\/comments\/[^/]+$/)) {
      await anonymiseComment({ firestore, ref: doc.ref, uid, now });
    }
  });
  for (const reaction of ["muscle", "fire"]) {
    const field = `reactions.${reaction}`;
    for (const collection of ["items", "comments"]) {
      await scan(`${collection}_${reaction}`, group(collection, field, "array-contains"), async (doc) => {
        if (is(doc, /^comments\/[^/]+\/items\/[^/]+$/) ||
            is(doc, /^spaces\/[^/]+\/posts\/[^/]+\/comments\/[^/]+$/)) {
          await removeReaction({ firestore, ref: doc.ref, uid, field });
        }
      });
    }
  }
  // These old edges have the UID only in the document ID. Scan references,
  // not profile/content fields, and resume after the last committed edge.
  await scan("legacy_users", firestore.collectionGroup("users").select(), async (doc) => {
    const path = doc.ref.path.split("/");
    if (path.length !== 4 || doc.id !== uid) return;
    if (path[0] === "kudos") {
      await removeCountedEdge({ firestore, ref: doc.ref, parent: firestore.doc(`activities/${path[1]}`), counter: "kudosCount" });
    } else if (["following", "followers", "blocks"].includes(path[0])) {
      await doc.ref.delete();
    }
  });
  await scan("legacy_likes", firestore.collectionGroup("likes").select(), async (doc) => {
    if (doc.id === uid && is(doc, /^spaces\/[^/]+\/posts\/[^/]+\/likes\/[^/]+$/)) {
      await removeCountedEdge({ firestore, ref: doc.ref, parent: doc.ref.parent.parent, counter: "likeCount" });
    }
  });
  // Legacy crew, circle and challenge documents can outlive their parents.
  for (const collection of ["members", "participants"]) {
    await scan(`legacy_${collection}`, firestore.collectionGroup(collection).select(), async (doc) => {
      const parts = doc.ref.path.split("/");
      if (parts.length !== 4 || doc.id !== uid) return;
      if (collection === "members" && ["groups", "goalSpaces"].includes(parts[0])) {
        await removeCountedEdge({ firestore, ref: doc.ref, parent: doc.ref.parent.parent, counter: "memberCount" });
      } else if ((collection === "members" && parts[0] === "spaces") ||
                 (collection === "participants" && parts[0] === "challenges")) {
        await doc.ref.delete();
      }
    });
  }
  await scan("goal_events", group("events", "uid"), async (doc) => {
    if (is(doc, /^goalSpaces\/[^/]+\/events\/[^/]+$/)) await doc.ref.delete();
  });
  await scan("goal_support", group("events", "supporterIds", "array-contains"), async (doc) => {
    if (is(doc, /^goalSpaces\/[^/]+\/events\/[^/]+$/)) {
      await removeReaction({ firestore, ref: doc.ref, uid, field: "supporterIds" });
    }
  });
  await scan("goal_members", group("members", "uid"), async (doc) => {
    if (is(doc, /^goalSpaces\/[^/]+\/members\/[^/]+$/)) {
      await removeCountedEdge({ firestore, ref: doc.ref, parent: doc.ref.parent.parent, counter: "memberCount" });
    }
  });
  await scan("owned_goals", firestore.collection("goalSpaces").where("ownerId", "==", uid), async (doc) => {
    const data = doc.data();
    if (data.inviteCode) await firestore.doc(`goalSpaceInvites/${data.inviteCode}`).delete();
    await doc.ref.update({ ownerId: null, title: "Closed circle", active: false, inviteCode: null });
  });
  // Reports have a separate bounded moderation purpose. Drop free-form text,
  // author snapshots, target IDs and authority records, retaining only the
  // approved non-identifying audit fields. No HMAC secret: omit targetUid.
  for (const field of ["reporterId", "targetUid"]) {
    await scan(`reports_${field}`, firestore.collection("reports").where(field, "==", uid), async (doc) => {
      const data = doc.data();
      const batch = firestore.batch();
      const common = {
        reportId: doc.id,
        category: data.category || "other",
        targetType: data.targetType || "unknown",
        createdAt: data.createdAt || now,
        expiresAt: new Date(now + YEAR_MS),
      };
      if (field === "reporterId") {
        // Preserve the case against another user, including its authority.
        batch.set(doc.ref, { ...common, reporterId: null,
          targetId: data.targetId || null, targetUid: data.targetUid || null,
          reason: data.reason || data.category || "other", status: data.status || "pending" });
      } else {
        batch.set(doc.ref, { ...common, status: "deleted-account" });
        batch.delete(firestore.doc(`reportAuthority/${doc.id}`));
      }
      await batch.commit();
    });
  }
  await scan("rate_limits", firestore.collection("rateLimits")
    .where(FieldPath.documentId(), ">=", `${uid}_`)
    .where(FieldPath.documentId(), "<", `${uid}_\uf8ff`), (doc) => doc.ref.delete());
  await firestore.doc(`rateLimits/verifyemail_${uid}_verificationEmail`).delete();
  await firestore.doc(`globalRestrictedUids/${uid}`).delete();
}

module.exports = { cleanupSocial, anonymiseComment, removeReaction, removeCountedEdge };
