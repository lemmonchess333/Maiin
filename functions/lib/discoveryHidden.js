"use strict";
/**
 * Accounts kept out of discovery (Soc15, from the 3 November list).
 *
 * App Review's demo account posts like anyone else, and its public posts
 * reached every real person's Explore (and, as a recent public poster,
 * their suggested people). The accounts listed in DISCOVERY_HIDDEN_UIDS
 * share with their followers only: a public post from one of them is made
 * followers-only before it fans out (`onActivityCreated`), and the daily
 * `discoveryHiddenSweep` does the same to any public post one of them
 * already has, so adding a uid to the list also clears its past posts.
 *
 * Followers still see the posts, as with any followers-only post, so the
 * account works as normal for whoever is using it. `discoveryHidden: true`
 * on the post records why its visibility changed.
 *
 * Provisioned like ADMIN_UIDS and REVENUECAT_SANDBOX_UIDS: a plain
 * environment variable (a GitHub repository variable that
 * scripts/write-functions-env.mjs writes into functions/.env),
 * comma-separated, whitespace tolerant, read on every call. Unset or empty
 * hides no one.
 */

/** Public posts changed per account per sweep: one batch. */
const SWEEP_PAGE = 200;

function discoveryHiddenUids() {
  const raw = process.env.DISCOVERY_HIDDEN_UIDS || "";
  return new Set(
    String(raw)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );
}

function isDiscoveryHidden(uid) {
  if (typeof uid !== "string" || !uid) return false;
  return discoveryHiddenUids().has(uid);
}

/** The update that keeps a post out of discovery. */
const HIDE_UPDATE = Object.freeze({
  visibility: "followers",
  discoveryHidden: true,
});

/**
 * Makes `uid`'s public posts followers-only, up to SWEEP_PAGE of them.
 * Returns `{ hidden }`, the posts changed.
 */
async function hidePublicPosts({ firestore, uid }) {
  const snap = await firestore
    .collection("activities")
    .where("authorId", "==", uid)
    .where("visibility", "==", "public")
    .limit(SWEEP_PAGE)
    .get();
  if (snap.empty) return { hidden: 0 };
  const batch = firestore.batch();
  snap.docs.forEach((doc) => batch.update(doc.ref, HIDE_UPDATE));
  await batch.commit();
  return { hidden: snap.docs.length };
}

/** Every listed account's public posts made followers-only. */
async function sweepDiscoveryHidden({ firestore }) {
  let hidden = 0;
  for (const uid of discoveryHiddenUids()) {
    const result = await hidePublicPosts({ firestore, uid });
    hidden += result.hidden;
  }
  return { hidden };
}

module.exports = {
  HIDE_UPDATE,
  SWEEP_PAGE,
  discoveryHiddenUids,
  isDiscoveryHidden,
  hidePublicPosts,
  sweepDiscoveryHidden,
};
