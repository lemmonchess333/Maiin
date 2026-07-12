/**
 * Spc1 PR4 — account-deletion cleanup for Community Spaces.
 *
 * Without it, deleting an account leaves two artefacts:
 *   - the member doc under every space they joined (ghost member —
 *     still counted by the directory's aggregate member counts);
 *   - their authored posts (frozen displayName/photo snapshots, and
 *     the post photo's download URL pointing at a blob the storage
 *     prefix sweep is about to delete).
 *
 * Policy: authored posts are DELETED, not anonymised — posts are
 * top-level room content (nothing threads off them yet; comments are
 * a later slice), so removal is GDPR-cleanest with no thread-
 * continuity cost. Post photo BLOBS are swept separately by the
 * executor's `space-photos/{uid}/` storage prefix.
 *
 * The sweep iterates the KNOWN space ids (lib/spaceIds.js — bounded
 * config, parity-pinned to the client) rather than a collectionGroup:
 * precise blast radius, no composite index, and `members` /`posts`
 * collection names can't collide with goalSpaces/crews equivalents.
 * Per-space failures are logged and skipped — one bad space must
 * never wedge an account deletion.
 */

const { SPACE_IDS } = require("./spaceIds");

async function cleanupSpacesForUser({ firestore, uid, logger = console }) {
  for (const spaceId of SPACE_IDS) {
    try {
      // Membership — single known doc; missing-doc delete is a no-op.
      await firestore.doc(`spaces/${spaceId}/members/${uid}`).delete();

      // Authored posts — subcollection where-query (no collection-
      // group index needed; post docs carry `authorId`).
      const postsSnap = await firestore
        .collection("spaces")
        .doc(spaceId)
        .collection("posts")
        .where("authorId", "==", uid)
        .get();
      for (const postDoc of postsSnap.docs) {
        await postDoc.ref.delete();
      }
    } catch (err) {
      logger.warn(
        `deleteAccount: spaces cleanup for ${spaceId} failed (continuing)`,
        err && err.message
      );
    }
  }
}

module.exports = { cleanupSpacesForUser };
