/**
 * Goal Spaces (GOALS-CORE-01) — server-owned membership + events.
 *
 * A Goal Space ("Circle" in user-facing copy) is a small invite-only
 * social space around one goal. EVERY write to Circle collections goes
 * through these functions (firestore.rules deny all direct client
 * writes), so a browser can never forge a membership, counter, invite
 * or event.
 *
 * Locked decisions (plan-file row GsPb1, 2026-07-10): invite-only,
 * 2–8 members, no public discovery, no DMs, strict summary-only event
 * allowlist, blocked pairs can never share a Circle, owner can remove
 * members, free entitlement.
 *
 * Privacy contract: raw photos / calories / macros / bodyweight / GPS /
 * workout loads never enter these documents. Events carry a kind from
 * the closed allowlist plus ONE bounded plain-text note.
 *
 * Storage:
 *   goalSpaces/{spaceId}                    shared metadata
 *   goalSpaces/{spaceId}/members/{uid}      membership (server-managed)
 *   goalSpaces/{spaceId}/events/{eventId}   summary events
 *   goalSpaceInvites/{code}                 invites (server-only both ways)
 *   users/{uid}/journeys/{spaceId}          private membership pointer
 *
 * Mirror of src/features/goalSpaces/goalSpaceModel.ts — the constants
 * below are pinned equal by goalSpaceModel.parity.cross.test.ts.
 * All functions take an injected `firestore` handle (test convention).
 */

const crypto = require("crypto");

/* ── Shared contract (mirrors the client module — keep in sync) ────── */

const GOAL_SPACE_TYPES = Object.freeze([
  "race",
  "strength_block",
  "body_composition",
  "nutrition_consistency",
  "hybrid",
]);

const GOAL_SPACE_EVENT_KINDS = Object.freeze([
  "joined",
  "weekly_check_in",
  "session_completed",
  "milestone",
  "needs_support",
  "routine_shared",
]);

const GOAL_SPACE_MAX_MEMBERS = 8;
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_TITLE_LENGTH = 60;
const MAX_EVENT_NOTE_LENGTH = 140;
const MAX_WHY_LENGTH = 120;
/** One person's ceiling of concurrent circles — anti-abuse, not product. */
const MAX_MEMBERSHIPS_PER_USER = 10;

function cleanBoundedText(v, maxLength) {
  if (typeof v !== "string") return "";
  return v
    .replace(/[\x00-\x1f\x7f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function isGoalSpaceType(v) {
  return GOAL_SPACE_TYPES.includes(v);
}

function isGoalSpaceEventKind(v) {
  return GOAL_SPACE_EVENT_KINDS.includes(v);
}

function canAcceptMember(space) {
  return (
    space.active !== false &&
    (space.memberCount || 0) <
      Math.min(space.maxMembers || GOAL_SPACE_MAX_MEMBERS, GOAL_SPACE_MAX_MEMBERS)
  );
}

function isInviteUsable(invite, nowMs) {
  return !invite.revoked && nowMs < invite.expiresAtMs;
}

/** Local Monday-anchored week key (mirrors client checkinWeekKey). */
function checkinWeekKey(d) {
  const day = d.getDay();
  const diffToMonday = day === 0 ? 6 : day - 1;
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  monday.setDate(monday.getDate() - diffToMonday);
  const y = monday.getFullYear();
  const m = String(monday.getMonth() + 1).padStart(2, "0");
  const dd = String(monday.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

/** Display projection: only an https URL of sane length survives. */
function cleanPhotoURL(v) {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  if (!/^https:\/\//.test(trimmed) || trimmed.length > 500) return null;
  return trimmed;
}

function cleanDisplayName(v) {
  const cleaned = cleanBoundedText(v, 50);
  return cleaned.length > 0 ? cleaned : "Athlete";
}

/** Unambiguous invite code (no 0/O/1/I/L). */
function generateInviteCode() {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = crypto.randomBytes(10);
  let code = "";
  for (let i = 0; i < 10; i++) {
    code += alphabet[bytes[i] % alphabet.length];
  }
  return code;
}

/* ── Membership count guard ─────────────────────────────────────────── */

async function assertMembershipCapacity(firestore, uid) {
  const journeysSnap = await firestore
    .collection("users")
    .doc(uid)
    .collection("journeys")
    .get();
  if (journeysSnap.size >= MAX_MEMBERSHIPS_PER_USER) {
    const err = new Error(
      `You're already in ${MAX_MEMBERSHIPS_PER_USER} circles — leave one first.`
    );
    err.code = "membership-cap";
    throw err;
  }
}

/* ── Create ─────────────────────────────────────────────────────────── */

/**
 * Creates a space + owner membership + the owner's private journey in
 * one batch. Returns { spaceId }.
 */
async function createGoalSpace({
  firestore,
  uid,
  type,
  title,
  why,
  displayName,
  photoURL,
  nowIso,
}) {
  if (!firestore || !uid) {
    throw new Error("createGoalSpace: firestore + uid required");
  }
  if (!isGoalSpaceType(type)) {
    const err = new Error("Unknown goal type.");
    err.code = "invalid-type";
    throw err;
  }
  const cleanTitle = cleanBoundedText(title, MAX_TITLE_LENGTH);
  if (!cleanTitle) {
    const err = new Error("A circle needs a title.");
    err.code = "invalid-title";
    throw err;
  }
  await assertMembershipCapacity(firestore, uid);

  const spaceRef = firestore.collection("goalSpaces").doc();
  const memberRef = spaceRef.collection("members").doc(uid);
  const journeyRef = firestore
    .collection("users")
    .doc(uid)
    .collection("journeys")
    .doc(spaceRef.id);

  const batch = firestore.batch();
  batch.set(spaceRef, {
    type,
    title: cleanTitle,
    visibility: "invite_only",
    ownerId: uid,
    memberCount: 1,
    maxMembers: GOAL_SPACE_MAX_MEMBERS,
    createdAt: nowIso,
    active: true,
  });
  batch.set(memberRef, {
    role: "owner",
    displayName: cleanDisplayName(displayName),
    photoURL: cleanPhotoURL(photoURL),
    joinedAt: nowIso,
  });
  batch.set(journeyRef, {
    spaceId: spaceRef.id,
    type,
    why: cleanBoundedText(why, MAX_WHY_LENGTH),
    role: "owner",
    joinedAt: nowIso,
  });
  await batch.commit();
  return { spaceId: spaceRef.id };
}

/* ── Invites ────────────────────────────────────────────────────────── */

/**
 * Mints an expiring invite code. Any current member may invite (the
 * join path re-checks capacity + blocks). Returns { code, expiresAtMs }.
 */
async function createInvite({ firestore, uid, spaceId, nowMs }) {
  if (!firestore || !uid || typeof spaceId !== "string" || !spaceId.trim()) {
    throw new Error("createInvite: firestore, uid, spaceId required");
  }
  const spaceRef = firestore.collection("goalSpaces").doc(spaceId);
  const [spaceSnap, memberSnap] = await Promise.all([
    spaceRef.get(),
    spaceRef.collection("members").doc(uid).get(),
  ]);
  if (!spaceSnap.exists || spaceSnap.data().active === false) {
    const err = new Error("This circle is no longer active.");
    err.code = "space-inactive";
    throw err;
  }
  if (!memberSnap.exists) {
    const err = new Error("Only members can invite.");
    err.code = "not-a-member";
    throw err;
  }
  const code = generateInviteCode();
  const expiresAtMs = nowMs + INVITE_TTL_MS;
  await firestore.collection("goalSpaceInvites").doc(code).set({
    spaceId,
    createdBy: uid,
    createdAtMs: nowMs,
    expiresAtMs,
  });
  return { code, expiresAtMs };
}

/* ── Join ───────────────────────────────────────────────────────────── */

/**
 * Joins via invite code. Validates invite expiry, space capacity
 * (transactionally), the joiner's membership cap, and the reciprocal
 * block contract: if ANY existing member has blocked the joiner, or the
 * joiner has blocked any member, the join is refused — an invite must
 * never silently put two blocked people in one circle.
 *
 * Idempotent: joining a circle you're already in returns success.
 * Returns { spaceId, alreadyMember }.
 */
async function joinSpace({
  firestore,
  uid,
  code,
  displayName,
  photoURL,
  increment,
  nowMs,
  nowIso,
}) {
  if (!firestore || !uid || typeof code !== "string" || !code.trim()) {
    throw new Error("joinSpace: firestore, uid, code required");
  }
  const inviteSnap = await firestore
    .collection("goalSpaceInvites")
    .doc(code.trim().toUpperCase())
    .get();
  if (!inviteSnap.exists || !isInviteUsable(inviteSnap.data(), nowMs)) {
    const err = new Error("This invite link has expired or isn't valid.");
    err.code = "invite-invalid";
    throw err;
  }
  const { spaceId } = inviteSnap.data();
  const spaceRef = firestore.collection("goalSpaces").doc(spaceId);

  // Reciprocal block check — read the roster, then both block directions
  // for every member. ≤8 members → bounded reads. Runs before the txn;
  // a block written mid-join is a tolerable race (owner can remove).
  const membersSnap = await spaceRef.collection("members").get();
  const memberUids = membersSnap.docs
    .map((d) => d.id)
    .filter((id) => id !== uid);
  if (memberUids.length > 0) {
    const blockRefs = [];
    for (const memberUid of memberUids) {
      blockRefs.push(
        firestore
          .collection("blocks")
          .doc(uid)
          .collection("users")
          .doc(memberUid)
      );
      blockRefs.push(
        firestore
          .collection("blocks")
          .doc(memberUid)
          .collection("users")
          .doc(uid)
      );
    }
    const blockSnaps = await firestore.getAll(...blockRefs);
    if (blockSnaps.some((s) => s.exists)) {
      const err = new Error("You can't join this circle.");
      err.code = "blocked";
      throw err;
    }
  }

  await assertMembershipCapacity(firestore, uid);

  const memberRef = spaceRef.collection("members").doc(uid);
  const journeyRef = firestore
    .collection("users")
    .doc(uid)
    .collection("journeys")
    .doc(spaceId);
  const eventRef = spaceRef.collection("events").doc();

  let alreadyMember = false;
  await firestore.runTransaction(async (txn) => {
    const [spaceSnap, memberSnap] = await Promise.all([
      txn.get(spaceRef),
      txn.get(memberRef),
    ]);
    if (!spaceSnap.exists) {
      const err = new Error("This circle no longer exists.");
      err.code = "space-missing";
      throw err;
    }
    if (memberSnap.exists) {
      alreadyMember = true;
      return; // idempotent — no writes
    }
    if (!canAcceptMember(spaceSnap.data())) {
      const err = new Error(
        spaceSnap.data().active === false
          ? "This circle is no longer active."
          : "This circle is full."
      );
      err.code =
        spaceSnap.data().active === false ? "space-inactive" : "space-full";
      throw err;
    }
    const space = spaceSnap.data();
    const name = cleanDisplayName(displayName);
    txn.set(memberRef, {
      role: "member",
      displayName: name,
      photoURL: cleanPhotoURL(photoURL),
      joinedAt: nowIso,
    });
    txn.set(journeyRef, {
      spaceId,
      type: space.type,
      why: "",
      role: "member",
      joinedAt: nowIso,
    });
    txn.set(eventRef, {
      kind: "joined",
      authorUid: uid,
      authorName: name,
      note: "",
      createdAt: nowIso,
    });
    txn.update(spaceRef, { memberCount: increment(1) });
  });
  return { spaceId, alreadyMember };
}

/* ── Leave / remove ─────────────────────────────────────────────────── */

/**
 * Leaves a space (idempotent). If the owner leaves and other members
 * remain, ownership transfers to the longest-standing member; if the
 * owner was the last member, the space archives (active: false) —
 * events/history stay readable to nobody (no members) but the doc is
 * kept for future recovery tooling rather than hard-deleted.
 */
async function leaveSpace({ firestore, uid, spaceId, increment }) {
  if (!firestore || !uid || typeof spaceId !== "string" || !spaceId.trim()) {
    throw new Error("leaveSpace: firestore, uid, spaceId required");
  }
  const spaceRef = firestore.collection("goalSpaces").doc(spaceId);
  const memberRef = spaceRef.collection("members").doc(uid);
  const journeyRef = firestore
    .collection("users")
    .doc(uid)
    .collection("journeys")
    .doc(spaceId);

  await firestore.runTransaction(async (txn) => {
    const [spaceSnap, memberSnap] = await Promise.all([
      txn.get(spaceRef),
      txn.get(memberRef),
    ]);
    // Space gone → just clear the journey pointer.
    if (!spaceSnap.exists) {
      txn.delete(journeyRef);
      return;
    }
    // Not a member (retry) → idempotent; still clear the pointer.
    if (!memberSnap.exists) {
      txn.delete(journeyRef);
      return;
    }
    const isOwner = spaceSnap.data().ownerId === uid;
    let successor = null;
    if (isOwner) {
      // Longest-standing OTHER member becomes owner.
      const membersQuery = spaceRef
        .collection("members")
        .orderBy("joinedAt", "asc")
        .limit(2);
      const membersSnap = await txn.get(membersQuery);
      successor = membersSnap.docs.find((d) => d.id !== uid) || null;
    }
    txn.delete(memberRef);
    txn.delete(journeyRef);
    if (isOwner && successor) {
      txn.update(spaceRef, {
        ownerId: successor.id,
        memberCount: increment(-1),
      });
      txn.update(successor.ref, { role: "owner" });
      // Successor's journey mirrors the promotion (best-effort — their
      // journey doc exists for every server-created membership).
      txn.update(
        firestore
          .collection("users")
          .doc(successor.id)
          .collection("journeys")
          .doc(spaceId),
        { role: "owner" }
      );
    } else if (isOwner) {
      txn.update(spaceRef, { active: false, memberCount: 0 });
    } else {
      txn.update(spaceRef, { memberCount: increment(-1) });
    }
  });
}

/** Owner removes a member (never themselves — owners use leaveSpace). */
async function removeMember({
  firestore,
  actorUid,
  spaceId,
  memberUid,
  increment,
}) {
  if (
    !firestore ||
    !actorUid ||
    typeof spaceId !== "string" ||
    !spaceId.trim() ||
    typeof memberUid !== "string" ||
    !memberUid.trim()
  ) {
    throw new Error("removeMember: firestore, actorUid, spaceId, memberUid required");
  }
  if (actorUid === memberUid) {
    const err = new Error("Use leave to exit your own circle.");
    err.code = "remove-self";
    throw err;
  }
  const spaceRef = firestore.collection("goalSpaces").doc(spaceId);
  const memberRef = spaceRef.collection("members").doc(memberUid);
  const journeyRef = firestore
    .collection("users")
    .doc(memberUid)
    .collection("journeys")
    .doc(spaceId);

  await firestore.runTransaction(async (txn) => {
    const [spaceSnap, memberSnap] = await Promise.all([
      txn.get(spaceRef),
      txn.get(memberRef),
    ]);
    if (!spaceSnap.exists) {
      const err = new Error("This circle no longer exists.");
      err.code = "space-missing";
      throw err;
    }
    if (spaceSnap.data().ownerId !== actorUid) {
      const err = new Error("Only the circle owner can remove members.");
      err.code = "not-owner";
      throw err;
    }
    if (!memberSnap.exists) return; // idempotent
    txn.delete(memberRef);
    txn.delete(journeyRef);
    txn.update(spaceRef, { memberCount: increment(-1) });
  });
}

/* ── Events ─────────────────────────────────────────────────────────── */

/**
 * Publishes one allowlisted, summary-only event. weekly_check_in uses a
 * deterministic id (`${weekKey}_${uid}`) so re-checking the same week
 * overwrites — idempotent by construction, one check-in per week.
 */
async function publishEvent({
  firestore,
  uid,
  spaceId,
  kind,
  note,
  displayName,
  nowIso,
  now = new Date(),
}) {
  if (!firestore || !uid || typeof spaceId !== "string" || !spaceId.trim()) {
    throw new Error("publishEvent: firestore, uid, spaceId required");
  }
  if (!isGoalSpaceEventKind(kind)) {
    const err = new Error("Unknown event kind.");
    err.code = "invalid-kind";
    throw err;
  }
  const spaceRef = firestore.collection("goalSpaces").doc(spaceId);
  const [spaceSnap, memberSnap] = await Promise.all([
    spaceRef.get(),
    spaceRef.collection("members").doc(uid).get(),
  ]);
  if (!spaceSnap.exists || spaceSnap.data().active === false) {
    const err = new Error("This circle is no longer active.");
    err.code = "space-inactive";
    throw err;
  }
  if (!memberSnap.exists) {
    const err = new Error("Only members can post to a circle.");
    err.code = "not-a-member";
    throw err;
  }
  const eventRef =
    kind === "weekly_check_in"
      ? spaceRef.collection("events").doc(`${checkinWeekKey(now)}_${uid}`)
      : spaceRef.collection("events").doc();
  await eventRef.set({
    kind,
    authorUid: uid,
    authorName: cleanDisplayName(displayName),
    note: cleanBoundedText(note, MAX_EVENT_NOTE_LENGTH),
    createdAt: nowIso,
  });
}

/* ── Account-deletion cleanup ───────────────────────────────────────── */

/**
 * Removes every Goal Space footprint of a user, called by the deletion
 * executor BEFORE the auth-user delete:
 *   1. per membership (enumerated from their own journeys): delete the
 *      user's authored events in that space, then leaveSpace (handles
 *      counter decrement + owner transfer/archive + journey delete)
 *   2. sweep any orphaned journey docs
 *   3. delete invites the user created
 * Per-space failures are logged and skipped — one bad space must not
 * block the rest of the account deletion.
 */
async function cleanupGoalSpacesForUser({ firestore, uid, increment, logger = console }) {
  const journeysSnap = await firestore
    .collection("users")
    .doc(uid)
    .collection("journeys")
    .get();

  for (const journeyDoc of journeysSnap.docs) {
    const spaceId = journeyDoc.id;
    try {
      const eventsSnap = await firestore
        .collection("goalSpaces")
        .doc(spaceId)
        .collection("events")
        .where("authorUid", "==", uid)
        .get();
      for (const eventDoc of eventsSnap.docs) {
        await eventDoc.ref.delete();
      }
      await leaveSpace({ firestore, uid, spaceId, increment });
    } catch (err) {
      logger.warn(
        `cleanupGoalSpacesForUser: space ${spaceId} cleanup failed`,
        err && err.message
      );
    }
  }

  // Orphan sweep — journeys whose leave already ran (or whose space
  // vanished) may remain if the loop above threw before txn commit.
  const remaining = await firestore
    .collection("users")
    .doc(uid)
    .collection("journeys")
    .get();
  for (const doc of remaining.docs) {
    await doc.ref.delete().catch(() => {});
  }

  const invitesSnap = await firestore
    .collection("goalSpaceInvites")
    .where("createdBy", "==", uid)
    .get();
  for (const inviteDoc of invitesSnap.docs) {
    await inviteDoc.ref.delete().catch(() => {});
  }
}

module.exports = {
  GOAL_SPACE_TYPES,
  GOAL_SPACE_EVENT_KINDS,
  GOAL_SPACE_MAX_MEMBERS,
  INVITE_TTL_MS,
  MAX_TITLE_LENGTH,
  MAX_EVENT_NOTE_LENGTH,
  MAX_WHY_LENGTH,
  MAX_MEMBERSHIPS_PER_USER,
  cleanBoundedText,
  isGoalSpaceType,
  isGoalSpaceEventKind,
  canAcceptMember,
  isInviteUsable,
  checkinWeekKey,
  cleanPhotoURL,
  cleanDisplayName,
  generateInviteCode,
  createGoalSpace,
  createInvite,
  joinSpace,
  leaveSpace,
  removeMember,
  publishEvent,
  cleanupGoalSpacesForUser,
};
