/**
 * GOALS-CORE-01 (slice 3) — server-owned Goal Space membership.
 *
 * The rules lock goalSpaces/{id} and members/{uid} to `write: if
 * false`: THIS module (Admin SDK, bypasses rules) is the only writer,
 * so a client can never forge membership, counts, or another member's
 * status. House pattern: injected-firestore lib (unit-testable with
 * stubs) + thin index.js callable wiring with maxInstances caps.
 *
 * Locked constraints (GsPb1): invite-only, 2–8 members, no public
 * discovery; blocked pairs cannot share a Circle; free at launch (no
 * entitlement gate). Every read-modify-write runs in a transaction
 * (at-least-once / concurrent callable invocations), and memberCount
 * is maintained server-side only.
 *
 * Invite model: the space doc carries a server-generated inviteCode.
 * Space docs are member-only readable, so the code never leaks via
 * reads — the owner shares it out-of-band (link/message). Joining
 * requires the current code, made in the last INVITE_CODE_TTL_DAYS
 * days. The owner makes a new one at any time
 * (renewGoalSpaceInviteCode), and the one it replaces stops working at
 * once. Expiry gates joining only: nobody already in a Circle is
 * affected by it.
 *
 * A code made before codes carried an expiry was made with its Circle
 * (nothing could replace one then), so its age is the Circle's: it
 * expires INVITE_CODE_TTL_DAYS after the Circle's createdAt. No
 * migration, and an old code cannot stay valid for good.
 */

const { isCalendarDate } = require("./dateUtils");
const { displayNameRefusal } = require("./objectionableText");

const GOAL_SPACE_MAX_MEMBERS = 8;
const GOAL_SPACE_TEXT_MAX = 200;
/** How long an invite code works after it is made. Mirrored by
 *  src/features/goalSpace/inviteCode.ts (inviteCode.cross.test.ts). */
const INVITE_CODE_TTL_DAYS = 7;
const INVITE_CODE_TTL_MS = INVITE_CODE_TTL_DAYS * 86_400_000;
/** How many fresh codes to try before giving up on a collision. */
const CODE_ATTEMPTS = 6;
const GOAL_SPACE_TYPES = Object.freeze([
  "race",
  "strength_block",
  "body_composition",
  "nutrition_consistency",
  "hybrid",
]);

/** Typed error the callable wrappers map to HttpsError codes. */
class GoalSpaceError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code; // "invalid-argument" | "not-found" | "permission-denied" | "failed-precondition"
  }
}

function sanitizeDisplay(value, fallback) {
  if (typeof value !== "string" || value.trim().length === 0) return fallback;
  return value.trim().slice(0, GOAL_SPACE_TEXT_MAX);
}

/**
 * When a Circle's current invite code stops working, in ms. A code
 * stamped with its expiry uses it; an older one is as old as its Circle.
 * A Circle with neither reads as expired, so a code of unknown age lets
 * nobody in; its owner can make a new one.
 */
function inviteCodeExpiresAt(space) {
  const stamped = space && space.inviteCodeExpiresAt;
  if (typeof stamped === "number" && Number.isFinite(stamped)) return stamped;
  const made = space && space.createdAt;
  if (typeof made === "number" && Number.isFinite(made)) {
    return made + INVITE_CODE_TTL_MS;
  }
  return 0;
}

// Short human-shareable invite codes. A pasted/typed code is normalised
// by upper-casing and dropping every non-alphanumeric char, so the
// display form (`K7P4-9M2H`), a bare form (`K7P49M2H`), and stray spaces
// all resolve to the same stored key.
function normalizeInviteCode(value) {
  if (typeof value !== "string") return "";
  return value.toUpperCase().replace(/[^0-9A-Z]/g, "");
}

// Reserve a unique short code by racing a create-if-absent on the
// server-only goalSpaceInvites/{code} lookup doc, retrying on the (rare)
// collision. Reading-then-writing the same path inside a transaction is
// contention-guarded, so two concurrent creates can't both win the code.
async function reserveInviteCode({
  firestore,
  spaceId,
  now,
  expiresAt,
  makeCode,
  attempts = CODE_ATTEMPTS,
}) {
  for (let i = 0; i < attempts; i++) {
    const code = normalizeInviteCode(makeCode());
    if (!code) continue;
    const ref = firestore.doc(`goalSpaceInvites/${code}`);
    const claimed = await firestore.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (snap.exists) return false;
      tx.set(ref, { spaceId, createdAt: now, expiresAt });
      return true;
    });
    if (claimed) return code;
  }
  throw new GoalSpaceError("internal", "could not allocate invite code");
}

function memberDoc({ uid, displayName, photoURL, role, now }) {
  return {
    uid,
    displayName: sanitizeDisplay(displayName, "Member"),
    photoURL: typeof photoURL === "string" ? photoURL : null,
    role,
    joinedAt: now,
  };
}

/**
 * Both-direction block check between `uid` and every existing member.
 * ≤8 members → ≤16 point reads; runs inside the join transaction so
 * membership can't change underneath it.
 */
async function assertNoBlockedPair({ tx, firestore, uid, memberUids }) {
  for (const other of memberUids) {
    if (other === uid) continue;
    const [a, b] = await Promise.all([
      tx.get(firestore.doc(`blocks/${uid}/users/${other}`)),
      tx.get(firestore.doc(`blocks/${other}/users/${uid}`)),
    ]);
    if (a.exists || b.exists) {
      throw new GoalSpaceError(
        "permission-denied",
        "blocked-pair: cannot share a Circle"
      );
    }
  }
}

/**
 * Create a Circle: space doc + owner membership + 'joined' event, one
 * batch. `makeId` injected for testability.
 */
async function createGoalSpace({
  firestore,
  uid,
  displayName,
  photoURL,
  input,
  now,
  makeId,
  makeCode,
}) {
  if (!GOAL_SPACE_TYPES.includes(input?.type)) {
    throw new GoalSpaceError("invalid-argument", "unknown goal space type");
  }
  const title = sanitizeDisplay(input.title, null);
  if (!title) {
    throw new GoalSpaceError("invalid-argument", "title required");
  }
  // A Circle's name is shown to everyone invited to it, so it is held to
  // the word filter a display name is, with the same sentence.
  const refusal = displayNameRefusal(title);
  if (refusal) throw new GoalSpaceError("invalid-argument", refusal);
  // Same validator as the `continue` path in goalSpaceLifecycle: the two
  // write paths for this one field disagreed, and create was the weaker —
  // regex only, so a 30 February was stored verbatim. Create's contract is
  // unchanged (targetDate is optional; anything unusable becomes null), it
  // just no longer counts an impossible day as usable.
  const targetDate = isCalendarDate(input.targetDate)
    ? input.targetDate
    : null;

  const spaceId = makeId();
  const inviteCodeExpiresAt = now + INVITE_CODE_TTL_MS;
  // Short, human-shareable invite code (e.g. "K7P4-9M2H") — reserved via a
  // server-only goalSpaceInvites/{code} lookup so the shared string is just
  // the code, not spaceId.token. Falls back to makeId() if no makeCode is
  // injected (keeps older callers/tests working — legacy UUID codes still
  // join via the explicit spaceId+inviteCode path).
  const inviteCode = makeCode
    ? await reserveInviteCode({
        firestore,
        spaceId,
        now,
        expiresAt: inviteCodeExpiresAt,
        makeCode,
      })
    : makeId();
  const batch = firestore.batch();
  batch.set(firestore.doc(`goalSpaces/${spaceId}`), {
    id: spaceId,
    type: input.type,
    title,
    visibility: "invite_only",
    ownerId: uid,
    memberCount: 1,
    maxMembers: GOAL_SPACE_MAX_MEMBERS,
    targetDate,
    active: true,
    inviteCode,
    inviteCodeExpiresAt,
    createdAt: now,
  });
  batch.set(
    firestore.doc(`goalSpaces/${spaceId}/members/${uid}`),
    memberDoc({ uid, displayName, photoURL, role: "owner", now })
  );
  batch.set(firestore.doc(`goalSpaces/${spaceId}/events/${makeId()}`), {
    uid,
    kind: "joined",
    text: null,
    weekKey: null,
    createdAt: now,
  });
  // Journey link (users/{uid}/journeys/{spaceId}) — the member's
  // owner-only index of their Circles. Server-maintained here so the
  // client can list its circles via the existing journeys rules with
  // no collection-group read surface.
  batch.set(firestore.doc(`users/${uid}/journeys/${spaceId}`), {
    id: spaceId,
    type: input.type,
    title,
    goalSpaceId: spaceId,
    targetDate,
    createdAt: now,
  });
  await batch.commit();
  return { spaceId, inviteCode, inviteCodeExpiresAt };
}

/** Join via invite code — expiry + capacity + blocked-pair + idempotency. */
async function joinGoalSpace({
  firestore,
  uid,
  displayName,
  photoURL,
  spaceId,
  inviteCode,
  code,
  now,
  makeId,
}) {
  await firestore.runTransaction(async (tx) => {
    // Resolve the (spaceId, inviteCode) pair from any of the accepted
    // forms: explicit legacy fields, a legacy combined "spaceId.token"
    // string, or a short code that maps to a space via the lookup.
    let sid = spaceId;
    let ic = inviteCode;
    // A short code found in the lookup was made for that Circle, so when
    // it is no longer the Circle's code it was replaced, not mistyped.
    let viaLookup = false;
    if (
      (typeof sid !== "string" || typeof ic !== "string") &&
      typeof code === "string"
    ) {
      const raw = code.trim();
      const dot = raw.indexOf(".");
      if (dot > 0) {
        sid = raw.slice(0, dot).trim();
        ic = raw.slice(dot + 1).trim();
      } else {
        const norm = normalizeInviteCode(raw);
        if (norm) {
          const look = await tx.get(firestore.doc(`goalSpaceInvites/${norm}`));
          if (look.exists && typeof look.data().spaceId === "string") {
            sid = look.data().spaceId;
            ic = norm;
            viaLookup = true;
          }
        }
      }
    }
    if (typeof sid !== "string" || typeof ic !== "string") {
      throw new GoalSpaceError("invalid-argument", "invite code required");
    }

    const spaceRef = firestore.doc(`goalSpaces/${sid}`);
    const spaceSnap = await tx.get(spaceRef);
    if (!spaceSnap.exists) {
      throw new GoalSpaceError("not-found", "no such circle");
    }
    const space = spaceSnap.data();
    if (space.active !== true) {
      throw new GoalSpaceError("failed-precondition", "circle inactive");
    }
    const current = space.inviteCode === ic;
    if (!current && !viaLookup) {
      throw new GoalSpaceError("permission-denied", "bad invite");
    }
    const selfSnap = await tx.get(
      firestore.doc(`goalSpaces/${sid}/members/${uid}`)
    );
    // Idempotent re-join: no-op. Before the expiry check, so a member is
    // never told their own Circle's code has run out.
    if (selfSnap.exists) return;
    if (!current || now >= inviteCodeExpiresAt(space)) {
      throw new GoalSpaceError("failed-precondition", "invite expired");
    }
    if (space.memberCount >= (space.maxMembers ?? GOAL_SPACE_MAX_MEMBERS)) {
      throw new GoalSpaceError("failed-precondition", "circle full");
    }
    const membersSnap = await tx.get(
      firestore.collection(`goalSpaces/${sid}/members`)
    );
    const memberUids = membersSnap.docs.map((d) => d.id);
    await assertNoBlockedPair({ tx, firestore, uid, memberUids });

    tx.set(
      firestore.doc(`goalSpaces/${sid}/members/${uid}`),
      memberDoc({ uid, displayName, photoURL, role: "member", now })
    );
    tx.update(spaceRef, { memberCount: space.memberCount + 1 });
    tx.set(firestore.doc(`goalSpaces/${sid}/events/${makeId()}`), {
      uid,
      kind: "joined",
      text: null,
      weekKey: null,
      createdAt: now,
    });
    tx.set(firestore.doc(`users/${uid}/journeys/${sid}`), {
      id: sid,
      type: space.type,
      title: space.title,
      goalSpaceId: sid,
      targetDate: space.targetDate ?? null,
      createdAt: now,
    });
  });
}

/**
 * A new invite code for a Circle, from its owner, at any time: the code
 * it replaces stops working at once, and the new one works for
 * INVITE_CODE_TTL_DAYS. One transaction reads the Circle, finds a free
 * code and writes both, so a refusal leaves nothing behind.
 *
 * The replaced code's lookup is kept. It still names the Circle, which
 * is how a join with it is told the code has expired rather than that
 * it was mistyped; it lets nobody in, because joining needs the
 * Circle's current code.
 */
async function renewGoalSpaceInviteCode({
  firestore,
  uid,
  spaceId,
  now,
  makeCode,
}) {
  if (typeof spaceId !== "string" || !spaceId) {
    throw new GoalSpaceError("invalid-argument", "spaceId required");
  }
  return firestore.runTransaction(async (tx) => {
    const spaceRef = firestore.doc(`goalSpaces/${spaceId}`);
    const spaceSnap = await tx.get(spaceRef);
    if (!spaceSnap.exists) {
      throw new GoalSpaceError("not-found", "no such circle");
    }
    const space = spaceSnap.data();
    if (space.ownerId !== uid) {
      throw new GoalSpaceError("permission-denied", "owner only");
    }
    if (space.active !== true) {
      throw new GoalSpaceError("failed-precondition", "circle inactive");
    }
    let code = null;
    for (let i = 0; i < CODE_ATTEMPTS && code === null; i++) {
      const candidate = normalizeInviteCode(makeCode());
      if (!candidate || candidate === space.inviteCode) continue;
      const taken = await tx.get(
        firestore.doc(`goalSpaceInvites/${candidate}`)
      );
      if (!taken.exists) code = candidate;
    }
    if (code === null) {
      throw new GoalSpaceError("internal", "could not allocate invite code");
    }
    const inviteCodeExpiresAt = now + INVITE_CODE_TTL_MS;
    tx.set(firestore.doc(`goalSpaceInvites/${code}`), {
      spaceId,
      createdAt: now,
      expiresAt: inviteCodeExpiresAt,
    });
    tx.update(spaceRef, { inviteCode: code, inviteCodeExpiresAt });
    return { inviteCode: code, inviteCodeExpiresAt };
  });
}

/**
 * Leave a Circle. Owner leaving deactivates the space (v1 policy —
 * explicit and simple; ownership transfer is a later feature).
 */
async function leaveGoalSpace({ firestore, uid, spaceId }) {
  await firestore.runTransaction(async (tx) => {
    const spaceRef = firestore.doc(`goalSpaces/${spaceId}`);
    const spaceSnap = await tx.get(spaceRef);
    if (!spaceSnap.exists) {
      throw new GoalSpaceError("not-found", "no such circle");
    }
    const memberRef = firestore.doc(`goalSpaces/${spaceId}/members/${uid}`);
    const memberSnap = await tx.get(memberRef);
    if (!memberSnap.exists) return; // idempotent
    const space = spaceSnap.data();
    tx.delete(memberRef);
    tx.delete(firestore.doc(`users/${uid}/journeys/${spaceId}`));
    const update = { memberCount: Math.max(0, space.memberCount - 1) };
    if (space.ownerId === uid) update.active = false;
    tx.update(spaceRef, update);
  });
}

/** Owner-only member removal. */
async function removeGoalSpaceMember({ firestore, uid, spaceId, memberUid }) {
  if (typeof memberUid !== "string" || memberUid === uid) {
    throw new GoalSpaceError("invalid-argument", "memberUid required");
  }
  await firestore.runTransaction(async (tx) => {
    const spaceRef = firestore.doc(`goalSpaces/${spaceId}`);
    const spaceSnap = await tx.get(spaceRef);
    if (!spaceSnap.exists) {
      throw new GoalSpaceError("not-found", "no such circle");
    }
    const space = spaceSnap.data();
    if (space.ownerId !== uid) {
      throw new GoalSpaceError("permission-denied", "owner only");
    }
    const memberRef = firestore.doc(
      `goalSpaces/${spaceId}/members/${memberUid}`
    );
    const memberSnap = await tx.get(memberRef);
    if (!memberSnap.exists) return; // idempotent
    tx.delete(memberRef);
    tx.delete(firestore.doc(`users/${memberUid}/journeys/${spaceId}`));
    tx.update(spaceRef, { memberCount: Math.max(0, space.memberCount - 1) });
  });
}

module.exports = {
  GOAL_SPACE_MAX_MEMBERS,
  // Exported so the client<->server parity test can reach it. It was
  // module-private, which is why mutating it left the whole suite green:
  // nothing pinned it AND nothing outside this file could see it.
  GOAL_SPACE_TEXT_MAX,
  GOAL_SPACE_TYPES,
  INVITE_CODE_TTL_DAYS,
  INVITE_CODE_TTL_MS,
  GoalSpaceError,
  assertNoBlockedPair,
  inviteCodeExpiresAt,
  createGoalSpace,
  joinGoalSpace,
  renewGoalSpaceInviteCode,
  leaveGoalSpace,
  removeGoalSpaceMember,
};
