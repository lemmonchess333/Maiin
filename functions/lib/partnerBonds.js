"use strict";

/**
 * Starting a partner streak: the one way a partner bond is made.
 *
 * A bond is a 1:1 shared streak between two people who follow each other
 * (src/features/partnerStreak/partnerStreakApi.ts; the engine is
 * partnerStreakEngine.js). Each person holds at most MAX_PARTNERS, the
 * same number the app holds (streakEngine.ts, pinned by
 * partnerLimit.cross.test.ts). Rules cannot count documents, so
 * firestore.rules refuses every client create of a bond and this module,
 * behind the startPartnerStreak callable, makes it in a transaction that
 * counts both people's bonds.
 *
 * What the transaction reads before it writes:
 * - the bond itself: a pair already bonded gets its bond back
 *   (created: false) before any limit is checked, since it already counts;
 * - the two follow edges: consent is the mutual follow;
 * - a block either way;
 * - both accounts' deletion state;
 * - each person's bonds (members array-contains), counted against
 *   MAX_PARTNERS. The limit holds for both: a bond takes one of the
 *   partner's places as well as the starter's.
 * The counts are queries inside the transaction that creates the bond,
 * and Firestore runs transactions with serializable isolation, so two
 * starts that share a person cannot both count below the limit and both
 * create past it.
 *
 * The bond is written cold, the whole initial state the engine reads
 * (initialBond), so nothing a client sends can give it a head start.
 *
 * The callable refuses a restricted account, and one being deleted,
 * before this runs.
 */

const { transactionAccountsLive } = require("./deletionTransactionGuard");

/** The most partner streaks one person holds. */
const MAX_PARTNERS = 5;

/** A refusal: `code` is the HttpsError code, `message` the reason the
 *  app maps to its own words (startRejection.ts). */
class PartnerBondError extends Error {
  constructor(code, reason) {
    super(reason);
    this.code = code;
    this.reason = reason;
  }
}

/** The pair's one bond id: the two uids, sorted, joined. */
function bondIdFor(a, b) {
  return [a, b].sort().join("__");
}

/** A bond as it starts: the engine's empty state and the sorted pair. */
function initialBond(a, b, createdAt) {
  return {
    members: [a, b].sort(),
    streak: 0,
    lastSharedDay: null,
    lastActive: {},
    freezeWeek: {},
    createdAt,
  };
}

/** A uid that can name a document: a short string with no path in it. */
function isUid(value) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 128 &&
    !value.includes("/")
  );
}

/**
 * Start a partner streak between `uid` and `partnerUid`, or return the
 * one they already share. Returns `{ bondId, created }`; throws a
 * PartnerBondError for a refusal.
 */
async function startPartnerBond({ firestore, uid, partnerUid, createdAt }) {
  if (!isUid(partnerUid)) {
    throw new PartnerBondError("invalid-argument", "partner-required");
  }
  if (partnerUid === uid) {
    throw new PartnerBondError("invalid-argument", "cannot-partner-self");
  }
  const bondId = bondIdFor(uid, partnerUid);
  const bondRef = firestore.collection("partnerBonds").doc(bondId);
  const bondsOf = (member) =>
    firestore
      .collection("partnerBonds")
      .where("members", "array-contains", member);
  const edge = (from, to) =>
    firestore.collection("following").doc(from).collection("users").doc(to);
  const block = (from, to) =>
    firestore.collection("blocks").doc(from).collection("users").doc(to);

  return firestore.runTransaction(async (tx) => {
    const existing = await tx.get(bondRef);
    if (existing.exists) return { bondId, created: false };

    const [iFollow, theyFollow, iBlocked, theyBlocked, live, mine, theirs] =
      await Promise.all([
        tx.get(edge(uid, partnerUid)),
        tx.get(edge(partnerUid, uid)),
        tx.get(block(uid, partnerUid)),
        tx.get(block(partnerUid, uid)),
        transactionAccountsLive({ firestore, tx, uids: [uid, partnerUid] }),
        tx.get(bondsOf(uid)),
        tx.get(bondsOf(partnerUid)),
      ]);
    // A block is checked before the follows: a block ends both follows,
    // and the refusal for it says less than "follow each other" would.
    if (iBlocked.exists || theyBlocked.exists) {
      throw new PartnerBondError("permission-denied", "blocked-pair");
    }
    if (!iFollow.exists || !theyFollow.exists) {
      throw new PartnerBondError(
        "failed-precondition",
        "mutual-follow-required"
      );
    }
    if (!live) {
      throw new PartnerBondError("failed-precondition", "account-unavailable");
    }
    if (mine.size >= MAX_PARTNERS) {
      throw new PartnerBondError("failed-precondition", "partner-limit-yours");
    }
    if (theirs.size >= MAX_PARTNERS) {
      throw new PartnerBondError(
        "failed-precondition",
        "partner-limit-theirs"
      );
    }
    tx.create(bondRef, initialBond(uid, partnerUid, createdAt));
    return { bondId, created: true };
  });
}

module.exports = {
  MAX_PARTNERS,
  PartnerBondError,
  bondIdFor,
  initialBond,
  startPartnerBond,
};
