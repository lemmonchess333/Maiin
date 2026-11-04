"use strict";

/**
 * Invites that carry who sent them (Soc15 calls 4 and 5).
 *
 * Each person has one invite code, made the first time they ask for it
 * (getInviteCode) and kept at `inviteCodes/{code}` = { uid, createdAt },
 * with the code copied onto their own user document as `inviteCode`. Both
 * are written here and only here: firestore.rules refuses every client
 * read and write of `inviteCodes`, and `inviteCode` is not a field a client
 * may write.
 *
 * A new account that uses someone's code (redeemInvite) follows them and is
 * followed back at once, whatever `approveFollowers` says: using the link
 * or the code counts as both people accepting. Strava, Duolingo and Hevy
 * credit the person who invited you and connect you straight away. Nothing
 * else about approval changes.
 *
 * What the redemption checks, all in one transaction:
 * - the code exists and is not the caller's own;
 * - the caller has never used an invite (`invitedAt` absent on their user
 *   document). The account is also new, which the callable reads from
 *   Auth and passes in: an invite is for joining, not for following
 *   someone you could ask;
 * - neither account is restricted or being deleted, and neither has
 *   blocked the other;
 * - the inviter's code has been used fewer than INVITER_DAILY_REDEMPTIONS
 *   times in the last day, so a link posted publicly cannot be farmed.
 * A blocked pair, a restricted or deleting inviter, and an unknown code
 * are one refusal, `code-not-found`, so the reply never says whether a
 * person who blocked you exists.
 *
 * It writes the four follow edges the app reads (both directions, both
 * lists), each `{ followedAt, fromInvite: true }`; readers check only that
 * an edge exists, and onFollowerCreated reads `fromInvite` to send no
 * "started following you" for it. It deletes any follow request between
 * the two, and stamps `invitedAt` on the caller. The inviter's
 * notification is the callable's, after the commit.
 *
 * The alphabet, the length and the 14-day window are mirrored in
 * src/lib/inviteCode.ts; inviteCode.cross.test.ts pins the two.
 */

const crypto = require("crypto");
const { transactionAccountsLive } = require("./deletionTransactionGuard");
const { isDocumentId } = require("./documentId");

/** No 0, O, 1, I, L or U: a code reads the same spoken, typed or texted. */
const INVITE_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";

/** 30^8 ≈ 6.6e11 codes: a guess finds someone about once in tens of
 *  millions of tries, and each account gets a few tries a day. */
const INVITE_CODE_LENGTH = 8;

/** How long after signing up an account may use an invite. */
const INVITE_WINDOW_DAYS = 14;

/** How many people may join from one person's code in a rolling day. */
const INVITER_DAILY_REDEMPTIONS = 20;

const DAY_MS = 86_400_000;

/** Signed-out lookups answered across the project in a rolling day. A
 *  lookup past it answers with no name, and the welcome screen says "A
 *  friend invited you" instead: the cap bounds how many guesses a day can
 *  make whatever addresses they come from. */
const LOOKUPS_PER_DAY = 2000;

/** How many fresh codes one request tries before giving up on a collision. */
const CODE_ATTEMPTS = 3;

/** Every refusal's reason, which the app words (src/lib/invites.ts;
 *  inviteRefusals.test.ts pins each to a sentence). */
const INVITE_REFUSALS = Object.freeze([
  "code-not-found",
  "own-code",
  "already-invited",
  "account-not-new",
  "invite-limit",
  "setup-unfinished",
  "account-unavailable",
]);

/** A refusal: `code` is the HttpsError code, `reason` one of
 *  INVITE_REFUSALS. */
class InviteError extends Error {
  constructor(code, reason) {
    super(reason);
    this.code = code;
    this.reason = reason;
  }
}

/** The code as stored (upper case, no spaces or dashes), or null when what
 *  was typed cannot be one. */
function normaliseInviteCode(input) {
  if (typeof input !== "string" || input.length > 32) return null;
  const code = input.replace(/[\s-]/g, "").toUpperCase();
  if (code.length !== INVITE_CODE_LENGTH) return null;
  for (const ch of code) {
    if (!INVITE_CODE_ALPHABET.includes(ch)) return null;
  }
  return code;
}

/** A new random code from `randomInt(max)` (crypto.randomInt). */
function makeInviteCode(randomInt = crypto.randomInt) {
  let out = "";
  for (let i = 0; i < INVITE_CODE_LENGTH; i++) {
    out += INVITE_CODE_ALPHABET[randomInt(INVITE_CODE_ALPHABET.length)];
  }
  return out;
}

/** Whether an account made at `createdAtMs` may still use an invite. */
function isWithinInviteWindow(createdAtMs, nowMs) {
  return (
    Number.isFinite(createdAtMs) &&
    Number.isFinite(nowMs) &&
    nowMs - createdAtMs <= INVITE_WINDOW_DAYS * DAY_MS
  );
}

/** A uid that can name a document: a short string with no path in it. */
function isUid(value) {
  return isDocumentId(value) && value.length <= 128;
}

/** The first word of a public name, for the signed-out welcome line. */
function firstNameOf(displayName) {
  if (typeof displayName !== "string") return null;
  const first = displayName.trim().split(/\s+/)[0] || "";
  return first ? first.slice(0, 30) : null;
}

/** A person's public name, or null when they have none to show. */
async function publicName(firestore, uid) {
  if (!isUid(uid)) return null;
  const snap = await userRef(firestore, uid)
    .collection("public")
    .doc("profile")
    .get();
  const name = snap.exists ? (snap.data() || {}).displayName : null;
  return typeof name === "string" && name.trim()
    ? name.trim().slice(0, 50)
    : null;
}

/** The unauthenticated lookup's rate-limit key: a hash of the caller's
 *  address, never the address. */
function lookupKey(ip) {
  const hash = crypto
    .createHash("sha256")
    .update(String(ip || "unknown"))
    .digest("hex");
  return `invitelookup_${hash.slice(0, 32)}`;
}

const codeRef = (firestore, code) =>
  firestore.collection("inviteCodes").doc(code);
const followingEdge = (firestore, from, to) =>
  firestore.collection("following").doc(from).collection("users").doc(to);
const followerEdge = (firestore, of, follower) =>
  firestore.collection("followers").doc(of).collection("users").doc(follower);
const blockDoc = (firestore, blocker, blocked) =>
  firestore.collection("blocks").doc(blocker).collection("users").doc(blocked);
const restrictedDoc = (firestore, uid) =>
  firestore.collection("globalRestrictedUids").doc(uid);
const requestDoc = (firestore, of, asker) =>
  firestore.collection("followRequests").doc(of).collection("users").doc(asker);
// Last of these, with a comment after it: accountDeletionSubcollections
// reads `collection("users")` followed closely by another `.collection()`
// as a subcollection of the user, and the edges above are not.
const userRef = (firestore, uid) => firestore.collection("users").doc(uid);


/**
 * The caller's invite code: the one they have, or a new one. Returns
 * `{ code, created }`. The callable refuses a restricted account, and one
 * being deleted, before this runs; the deletion state is read again here,
 * in the transaction that writes.
 */
async function getOrCreateInviteCode({
  firestore,
  uid,
  createdAt,
  makeCode = makeInviteCode,
}) {
  if (!isUid(uid)) throw new InviteError("invalid-argument", "setup-unfinished");
  const candidates = Array.from({ length: CODE_ATTEMPTS }, () => makeCode());
  return firestore.runTransaction(async (tx) => {
    const [user, live] = await Promise.all([
      tx.get(userRef(firestore, uid)),
      transactionAccountsLive({ firestore, tx, uids: [uid] }),
    ]);
    if (!user.exists) {
      throw new InviteError("failed-precondition", "setup-unfinished");
    }
    if (!live) {
      throw new InviteError("failed-precondition", "account-unavailable");
    }
    const existing = normaliseInviteCode((user.data() || {}).inviteCode);
    if (existing) {
      const held = await tx.get(codeRef(firestore, existing));
      if (held.exists && (held.data() || {}).uid === uid) {
        return { code: existing, created: false };
      }
    }
    const taken = await Promise.all(
      candidates.map((c) => tx.get(codeRef(firestore, c)))
    );
    const code = candidates.find(
      (c, i) => normaliseInviteCode(c) === c && !taken[i].exists
    );
    if (!code) throw new InviteError("aborted", "account-unavailable");
    tx.create(codeRef(firestore, code), { uid, createdAt });
    tx.update(userRef(firestore, uid), { inviteCode: code });
    return { code, created: true };
  });
}

/**
 * Use `code` for the caller `uid`, whose Auth account was made at
 * `accountCreatedAtMs`. Returns `{ inviterUid, alreadyJoined }`; a second
 * call for the same invite (a reply lost on the way back) answers as the
 * first did, with `alreadyJoined: true`, and writes nothing. Throws an
 * InviteError for a refusal, or an error with `code: "account-restricted"`
 * when the caller is restricted.
 */
async function redeemInvite({
  firestore,
  uid,
  code,
  nowMs,
  accountCreatedAtMs,
  serverTimestamp,
}) {
  const normalised = normaliseInviteCode(code);
  if (!normalised) throw new InviteError("not-found", "code-not-found");
  if (!isUid(uid)) throw new InviteError("invalid-argument", "setup-unfinished");

  return firestore.runTransaction(async (tx) => {
    const codeSnap = await tx.get(codeRef(firestore, normalised));
    const inviterUid = codeSnap.exists ? (codeSnap.data() || {}).uid : null;
    if (!isUid(inviterUid)) {
      throw new InviteError("not-found", "code-not-found");
    }
    if (inviterUid === uid) {
      throw new InviteError("failed-precondition", "own-code");
    }

    const [
      user,
      iFollow,
      myFollowerCopy,
      theyFollow,
      theirFollowerCopy,
      iBlocked,
      theyBlocked,
      iAmRestricted,
      theyAreRestricted,
      meLive,
      themLive,
    ] = await Promise.all([
      tx.get(userRef(firestore, uid)),
      tx.get(followingEdge(firestore, uid, inviterUid)),
      tx.get(followerEdge(firestore, inviterUid, uid)),
      tx.get(followingEdge(firestore, inviterUid, uid)),
      tx.get(followerEdge(firestore, uid, inviterUid)),
      tx.get(blockDoc(firestore, uid, inviterUid)),
      tx.get(blockDoc(firestore, inviterUid, uid)),
      tx.get(restrictedDoc(firestore, uid)),
      tx.get(restrictedDoc(firestore, inviterUid)),
      transactionAccountsLive({ firestore, tx, uids: [uid] }),
      transactionAccountsLive({ firestore, tx, uids: [inviterUid] }),
    ]);

    if (!user.exists) {
      throw new InviteError("failed-precondition", "setup-unfinished");
    }
    if ((user.data() || {}).invitedAt != null) {
      // The same invite again: the follow it made is still there.
      if (iFollow.exists && (iFollow.data() || {}).fromInvite === true) {
        return { inviterUid, alreadyJoined: true };
      }
      throw new InviteError("failed-precondition", "already-invited");
    }
    if (!isWithinInviteWindow(accountCreatedAtMs, nowMs)) {
      throw new InviteError("failed-precondition", "account-not-new");
    }
    if (iAmRestricted.exists) {
      const err = new Error("account-restricted");
      err.code = "account-restricted";
      throw err;
    }
    if (!meLive) {
      throw new InviteError("failed-precondition", "account-unavailable");
    }
    // One answer for all of these, so the reply never says whether the
    // person behind the code has blocked the caller.
    if (
      iBlocked.exists ||
      theyBlocked.exists ||
      theyAreRestricted.exists ||
      !themLive
    ) {
      throw new InviteError("not-found", "code-not-found");
    }
    const recent = ((codeSnap.data() || {}).redemptions || []).filter(
      (t) => Number.isFinite(t) && t <= nowMs && nowMs - t < DAY_MS
    );
    if (recent.length >= INVITER_DAILY_REDEMPTIONS) {
      throw new InviteError("resource-exhausted", "invite-limit");
    }

    const edge = { followedAt: serverTimestamp, fromInvite: true };
    if (!iFollow.exists) tx.set(followingEdge(firestore, uid, inviterUid), edge);
    if (!myFollowerCopy.exists)
      tx.set(followerEdge(firestore, inviterUid, uid), edge);
    if (!theyFollow.exists)
      tx.set(followingEdge(firestore, inviterUid, uid), edge);
    if (!theirFollowerCopy.exists)
      tx.set(followerEdge(firestore, uid, inviterUid), edge);
    tx.delete(requestDoc(firestore, inviterUid, uid));
    tx.delete(requestDoc(firestore, uid, inviterUid));
    tx.update(userRef(firestore, uid), { invitedAt: serverTimestamp });
    tx.update(codeRef(firestore, normalised), {
      redemptions: [...recent, nowMs],
    });
    return { inviterUid, alreadyJoined: false };
  });
}

/**
 * Who a code belongs to, for the signed-out welcome screen: the first word
 * of their public name, or null. Null as well for an inviter who is
 * restricted (who reaches no one) or being deleted, so the screen falls
 * back to its general line and says nothing about why.
 */
async function lookupInviter({ firestore, code }) {
  const normalised = normaliseInviteCode(code);
  if (!normalised) return null;
  const snap = await codeRef(firestore, normalised).get();
  const inviterUid = snap.exists ? (snap.data() || {}).uid : null;
  if (!isUid(inviterUid)) return null;
  const direct = { get: (ref) => ref.get() };
  const [restricted, live, profile] = await Promise.all([
    restrictedDoc(firestore, inviterUid).get(),
    transactionAccountsLive({ firestore, tx: direct, uids: [inviterUid] }),
    userRef(firestore, inviterUid).collection("public").doc("profile").get(),
  ]);
  if (restricted.exists || !live || !profile.exists) return null;
  const firstName = firstNameOf((profile.data() || {}).displayName);
  return firstName ? { firstName } : null;
}

module.exports = {
  INVITE_CODE_ALPHABET,
  INVITE_CODE_LENGTH,
  INVITE_WINDOW_DAYS,
  INVITER_DAILY_REDEMPTIONS,
  LOOKUPS_PER_DAY,
  INVITE_REFUSALS,
  InviteError,
  normaliseInviteCode,
  makeInviteCode,
  isWithinInviteWindow,
  firstNameOf,
  publicName,
  lookupKey,
  getOrCreateInviteCode,
  redeemInvite,
  lookupInviter,
};
