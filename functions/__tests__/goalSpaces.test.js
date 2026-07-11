/**
 * Goal Spaces server lib (GOALS-CORE-01).
 *
 * Covers the contract the browser can't be trusted with: validation,
 * capacity + invite expiry, the reciprocal-block join refusal, owner
 * transfer/archive on leave, owner-only removal, the idempotent
 * weekly check-in event id, and the account-deletion cleanup sweep.
 *
 * Uses a small in-memory Firestore stub (same convention as the other
 * functions tests — injected handle, no emulator).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const goalSpaces = require("../lib/goalSpaces.js");

/* ── Minimal in-memory Firestore stub ───────────────────────────────── */

const INCREMENT = (n) => ({ __increment: n });

function applyData(existing, data) {
  const next = { ...(existing || {}) };
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof v === "object" && "__increment" in v) {
      next[k] = (next[k] || 0) + v.__increment;
    } else {
      next[k] = v;
    }
  }
  return next;
}

function makeFirestore(initialDocs = {}) {
  // docs: path -> plain object
  const docs = new Map(Object.entries(initialDocs));

  function docRef(path) {
    return {
      __isDoc: true,
      path,
      id: path.split("/").pop(),
      collection: (sub) => collectionRef(`${path}/${sub}`),
      get: async () => snapshotOf(path),
      set: async (data) => {
        docs.set(path, { ...data });
      },
      update: async (data) => {
        if (!docs.has(path)) throw new Error(`update on missing doc ${path}`);
        docs.set(path, applyData(docs.get(path), data));
      },
      delete: async () => {
        docs.delete(path);
      },
    };
  }

  function snapshotOf(path) {
    return {
      exists: docs.has(path),
      id: path.split("/").pop(),
      ref: docRef(path),
      data: () => docs.get(path),
    };
  }

  function matchesWhere(data, where) {
    if (!where) return true;
    const [field, op, value] = where;
    if (op === "==") return data && data[field] === value;
    throw new Error(`stub: unsupported op ${op}`);
  }

  function collectionRef(path, constraints = {}) {
    const ref = {
      __isCollection: true,
      path,
      doc: (id) =>
        docRef(
          `${path}/${id ?? `auto_${Math.random().toString(36).slice(2, 10)}`}`
        ),
      where: (field, op, value) =>
        collectionRef(path, { ...constraints, where: [field, op, value] }),
      orderBy: (field, dir = "asc") =>
        collectionRef(path, { ...constraints, orderBy: [field, dir] }),
      limit: (n) => collectionRef(path, { ...constraints, limit: n }),
      get: async () => {
        const depth = path.split("/").length;
        let rows = [...docs.entries()]
          .filter(
            ([p]) =>
              p.startsWith(`${path}/`) && p.split("/").length === depth + 1
          )
          .map(([p]) => snapshotOf(p))
          .filter((s) => matchesWhere(s.data(), constraints.where));
        if (constraints.orderBy) {
          const [field, dir] = constraints.orderBy;
          rows.sort((a, b) => {
            const av = a.data()?.[field] ?? "";
            const bv = b.data()?.[field] ?? "";
            const cmp = av < bv ? -1 : av > bv ? 1 : 0;
            return dir === "desc" ? -cmp : cmp;
          });
        }
        if (constraints.limit) rows = rows.slice(0, constraints.limit);
        return { empty: rows.length === 0, size: rows.length, docs: rows };
      },
    };
    return ref;
  }

  const firestore = {
    __docs: docs,
    collection: (name) => collectionRef(name),
    doc: (path) => docRef(path),
    getAll: async (...refs) => refs.map((r) => snapshotOf(r.path)),
    batch: () => {
      const ops = [];
      return {
        set: (ref, data) => ops.push(() => docs.set(ref.path, { ...data })),
        update: (ref, data) =>
          ops.push(() =>
            docs.set(ref.path, applyData(docs.get(ref.path), data))
          ),
        delete: (ref) => ops.push(() => docs.delete(ref.path)),
        commit: async () => ops.forEach((op) => op()),
      };
    },
    runTransaction: async (fn) => {
      const writes = [];
      const txn = {
        get: async (refOrQuery) => {
          if (refOrQuery.__isDoc) return snapshotOf(refOrQuery.path);
          return refOrQuery.get();
        },
        set: (ref, data) => writes.push(() => docs.set(ref.path, { ...data })),
        update: (ref, data) =>
          writes.push(() =>
            docs.set(ref.path, applyData(docs.get(ref.path), data))
          ),
        delete: (ref) => writes.push(() => docs.delete(ref.path)),
      };
      await fn(txn);
      writes.forEach((w) => w());
    },
  };
  return firestore;
}

/* ── Fixtures ───────────────────────────────────────────────────────── */

const NOW_MS = 1_800_000_000_000;
const NOW_ISO = "2027-01-15T10:00:00.000Z";

function seededSpace(overrides = {}) {
  return {
    "goalSpaces/s1": {
      type: "strength_block",
      title: "8-week strength block",
      visibility: "invite_only",
      ownerId: "owner1",
      memberCount: 1,
      maxMembers: 8,
      createdAt: NOW_ISO,
      active: true,
      ...overrides,
    },
    "goalSpaces/s1/members/owner1": {
      role: "owner",
      displayName: "Owner",
      photoURL: null,
      joinedAt: "2027-01-01T00:00:00.000Z",
    },
    "users/owner1/journeys/s1": {
      spaceId: "s1",
      type: "strength_block",
      why: "",
      role: "owner",
      joinedAt: "2027-01-01T00:00:00.000Z",
    },
    "goalSpaceInvites/GOODCODE22": {
      spaceId: "s1",
      createdBy: "owner1",
      createdAtMs: NOW_MS - 1000,
      expiresAtMs: NOW_MS + 1000,
    },
  };
}

/* ── createGoalSpace ────────────────────────────────────────────────── */

describe("createGoalSpace", () => {
  it("creates space + owner member + journey in one commit", async () => {
    const db = makeFirestore();
    const { spaceId } = await goalSpaces.createGoalSpace({
      firestore: db,
      uid: "u1",
      type: "race",
      title: "  London   Marathon crew  ",
      why: "  because  ",
      displayName: "Myles",
      photoURL: "https://example.com/p.jpg",
      nowIso: NOW_ISO,
    });
    const space = db.__docs.get(`goalSpaces/${spaceId}`);
    expect(space).toMatchObject({
      type: "race",
      title: "London Marathon crew",
      ownerId: "u1",
      memberCount: 1,
      maxMembers: 8,
      active: true,
    });
    expect(db.__docs.get(`goalSpaces/${spaceId}/members/u1`)).toMatchObject({
      role: "owner",
      displayName: "Myles",
    });
    expect(db.__docs.get(`users/u1/journeys/${spaceId}`)).toMatchObject({
      spaceId,
      type: "race",
      why: "because",
      role: "owner",
    });
  });

  it("rejects unknown types and empty titles", async () => {
    const db = makeFirestore();
    await expect(
      goalSpaces.createGoalSpace({
        firestore: db,
        uid: "u1",
        type: "weight_loss_contest",
        title: "x",
        nowIso: NOW_ISO,
      })
    ).rejects.toMatchObject({ code: "invalid-type" });
    await expect(
      goalSpaces.createGoalSpace({
        firestore: db,
        uid: "u1",
        type: "race",
        title: "   ",
        nowIso: NOW_ISO,
      })
    ).rejects.toMatchObject({ code: "invalid-title" });
  });

  it("enforces the per-user membership cap", async () => {
    const seed = {};
    for (let i = 0; i < goalSpaces.MAX_MEMBERSHIPS_PER_USER; i++) {
      seed[`users/u1/journeys/space${i}`] = { spaceId: `space${i}` };
    }
    const db = makeFirestore(seed);
    await expect(
      goalSpaces.createGoalSpace({
        firestore: db,
        uid: "u1",
        type: "race",
        title: "One more",
        nowIso: NOW_ISO,
      })
    ).rejects.toMatchObject({ code: "membership-cap" });
  });
});

/* ── invites + join ─────────────────────────────────────────────────── */

describe("createInvite / joinSpace", () => {
  let db;
  beforeEach(() => {
    db = makeFirestore(seededSpace());
  });

  it("members can mint invites; non-members cannot", async () => {
    const { code, expiresAtMs } = await goalSpaces.createInvite({
      firestore: db,
      uid: "owner1",
      spaceId: "s1",
      nowMs: NOW_MS,
    });
    expect(code).toHaveLength(10);
    expect(expiresAtMs).toBe(NOW_MS + goalSpaces.INVITE_TTL_MS);
    expect(db.__docs.get(`goalSpaceInvites/${code}`)).toMatchObject({
      spaceId: "s1",
      createdBy: "owner1",
    });

    await expect(
      goalSpaces.createInvite({
        firestore: db,
        uid: "stranger",
        spaceId: "s1",
        nowMs: NOW_MS,
      })
    ).rejects.toMatchObject({ code: "not-a-member" });
  });

  it("joins via a valid code: member + journey + joined event + count", async () => {
    const res = await goalSpaces.joinSpace({
      firestore: db,
      uid: "u2",
      code: "GOODCODE22",
      displayName: "Jo",
      photoURL: null,
      increment: INCREMENT,
      nowMs: NOW_MS,
      nowIso: NOW_ISO,
    });
    expect(res).toMatchObject({ spaceId: "s1", alreadyMember: false });
    expect(db.__docs.get("goalSpaces/s1").memberCount).toBe(2);
    expect(db.__docs.get("goalSpaces/s1/members/u2")).toMatchObject({
      role: "member",
      displayName: "Jo",
    });
    expect(db.__docs.get("users/u2/journeys/s1")).toMatchObject({
      spaceId: "s1",
      role: "member",
    });
    const events = [...db.__docs.entries()].filter(([p]) =>
      p.startsWith("goalSpaces/s1/events/")
    );
    expect(events).toHaveLength(1);
    expect(events[0][1]).toMatchObject({ kind: "joined", authorUid: "u2" });
  });

  it("lowercased invite codes still resolve (codes are uppercase)", async () => {
    const res = await goalSpaces.joinSpace({
      firestore: db,
      uid: "u2",
      code: "goodcode22",
      increment: INCREMENT,
      nowMs: NOW_MS,
      nowIso: NOW_ISO,
    });
    expect(res.spaceId).toBe("s1");
  });

  it("rejects expired invites", async () => {
    await expect(
      goalSpaces.joinSpace({
        firestore: db,
        uid: "u2",
        code: "GOODCODE22",
        increment: INCREMENT,
        nowMs: NOW_MS + goalSpaces.INVITE_TTL_MS * 2,
        nowIso: NOW_ISO,
      })
    ).rejects.toMatchObject({ code: "invite-invalid" });
  });

  it("rejects when the circle is full — counter unchanged", async () => {
    db = makeFirestore(seededSpace({ memberCount: 8 }));
    await expect(
      goalSpaces.joinSpace({
        firestore: db,
        uid: "u2",
        code: "GOODCODE22",
        increment: INCREMENT,
        nowMs: NOW_MS,
        nowIso: NOW_ISO,
      })
    ).rejects.toMatchObject({ code: "space-full" });
    expect(db.__docs.get("goalSpaces/s1").memberCount).toBe(8);
    expect(db.__docs.has("goalSpaces/s1/members/u2")).toBe(false);
  });

  it("re-joining is idempotent — no duplicate event, count unchanged", async () => {
    await goalSpaces.joinSpace({
      firestore: db,
      uid: "u2",
      code: "GOODCODE22",
      increment: INCREMENT,
      nowMs: NOW_MS,
      nowIso: NOW_ISO,
    });
    const res = await goalSpaces.joinSpace({
      firestore: db,
      uid: "u2",
      code: "GOODCODE22",
      increment: INCREMENT,
      nowMs: NOW_MS,
      nowIso: NOW_ISO,
    });
    expect(res.alreadyMember).toBe(true);
    expect(db.__docs.get("goalSpaces/s1").memberCount).toBe(2);
    const events = [...db.__docs.keys()].filter((p) =>
      p.startsWith("goalSpaces/s1/events/")
    );
    expect(events).toHaveLength(1);
  });

  it("refuses the join when EITHER direction of a block exists", async () => {
    // Joiner blocked a member.
    db.__docs.set("blocks/u2/users/owner1", { blockedAt: 1 });
    await expect(
      goalSpaces.joinSpace({
        firestore: db,
        uid: "u2",
        code: "GOODCODE22",
        increment: INCREMENT,
        nowMs: NOW_MS,
        nowIso: NOW_ISO,
      })
    ).rejects.toMatchObject({ code: "blocked" });

    // Member blocked the joiner.
    db.__docs.delete("blocks/u2/users/owner1");
    db.__docs.set("blocks/owner1/users/u2", { blockedAt: 1 });
    await expect(
      goalSpaces.joinSpace({
        firestore: db,
        uid: "u2",
        code: "GOODCODE22",
        increment: INCREMENT,
        nowMs: NOW_MS,
        nowIso: NOW_ISO,
      })
    ).rejects.toMatchObject({ code: "blocked" });
  });
});

/* ── leave / remove ─────────────────────────────────────────────────── */

describe("leaveSpace", () => {
  function twoMemberDb() {
    const seed = seededSpace({ memberCount: 2 });
    seed["goalSpaces/s1/members/u2"] = {
      role: "member",
      displayName: "Jo",
      photoURL: null,
      joinedAt: "2027-01-02T00:00:00.000Z",
    };
    seed["users/u2/journeys/s1"] = {
      spaceId: "s1",
      type: "strength_block",
      why: "",
      role: "member",
      joinedAt: "2027-01-02T00:00:00.000Z",
    };
    return makeFirestore(seed);
  }

  it("a member leaving decrements the count and clears their journey", async () => {
    const db = twoMemberDb();
    await goalSpaces.leaveSpace({
      firestore: db,
      uid: "u2",
      spaceId: "s1",
      increment: INCREMENT,
    });
    expect(db.__docs.has("goalSpaces/s1/members/u2")).toBe(false);
    expect(db.__docs.has("users/u2/journeys/s1")).toBe(false);
    expect(db.__docs.get("goalSpaces/s1").memberCount).toBe(1);
    expect(db.__docs.get("goalSpaces/s1").ownerId).toBe("owner1");
  });

  it("the owner leaving transfers ownership to the longest-standing member", async () => {
    const db = twoMemberDb();
    await goalSpaces.leaveSpace({
      firestore: db,
      uid: "owner1",
      spaceId: "s1",
      increment: INCREMENT,
    });
    const space = db.__docs.get("goalSpaces/s1");
    expect(space.ownerId).toBe("u2");
    expect(space.active).not.toBe(false);
    expect(space.memberCount).toBe(1);
    expect(db.__docs.get("goalSpaces/s1/members/u2").role).toBe("owner");
    expect(db.__docs.get("users/u2/journeys/s1").role).toBe("owner");
  });

  it("the last member leaving archives the space", async () => {
    const db = makeFirestore(seededSpace());
    await goalSpaces.leaveSpace({
      firestore: db,
      uid: "owner1",
      spaceId: "s1",
      increment: INCREMENT,
    });
    const space = db.__docs.get("goalSpaces/s1");
    expect(space.active).toBe(false);
    expect(space.memberCount).toBe(0);
  });

  it("leaving a space you're not in is idempotent and still clears the journey", async () => {
    const db = makeFirestore({
      ...seededSpace(),
      "users/u9/journeys/s1": { spaceId: "s1" },
    });
    await goalSpaces.leaveSpace({
      firestore: db,
      uid: "u9",
      spaceId: "s1",
      increment: INCREMENT,
    });
    expect(db.__docs.has("users/u9/journeys/s1")).toBe(false);
    expect(db.__docs.get("goalSpaces/s1").memberCount).toBe(1);
  });
});

describe("removeMember", () => {
  it("only the owner can remove, never themselves; count decrements", async () => {
    const seed = seededSpace({ memberCount: 2 });
    seed["goalSpaces/s1/members/u2"] = {
      role: "member",
      displayName: "Jo",
      joinedAt: "2027-01-02T00:00:00.000Z",
    };
    seed["users/u2/journeys/s1"] = { spaceId: "s1", role: "member" };
    const db = makeFirestore(seed);

    await expect(
      goalSpaces.removeMember({
        firestore: db,
        actorUid: "u2",
        spaceId: "s1",
        memberUid: "owner1",
        increment: INCREMENT,
      })
    ).rejects.toMatchObject({ code: "not-owner" });

    await expect(
      goalSpaces.removeMember({
        firestore: db,
        actorUid: "owner1",
        spaceId: "s1",
        memberUid: "owner1",
        increment: INCREMENT,
      })
    ).rejects.toMatchObject({ code: "remove-self" });

    await goalSpaces.removeMember({
      firestore: db,
      actorUid: "owner1",
      spaceId: "s1",
      memberUid: "u2",
      increment: INCREMENT,
    });
    expect(db.__docs.has("goalSpaces/s1/members/u2")).toBe(false);
    expect(db.__docs.has("users/u2/journeys/s1")).toBe(false);
    expect(db.__docs.get("goalSpaces/s1").memberCount).toBe(1);
  });
});

/* ── events ─────────────────────────────────────────────────────────── */

describe("publishEvent", () => {
  it("rejects kinds outside the allowlist and non-members", async () => {
    const db = makeFirestore(seededSpace());
    await expect(
      goalSpaces.publishEvent({
        firestore: db,
        uid: "owner1",
        spaceId: "s1",
        kind: "calorie_update",
        nowIso: NOW_ISO,
      })
    ).rejects.toMatchObject({ code: "invalid-kind" });
    await expect(
      goalSpaces.publishEvent({
        firestore: db,
        uid: "stranger",
        spaceId: "s1",
        kind: "milestone",
        nowIso: NOW_ISO,
      })
    ).rejects.toMatchObject({ code: "not-a-member" });
  });

  it("weekly check-ins are idempotent per Monday week (deterministic id)", async () => {
    const db = makeFirestore(seededSpace());
    const friday = new Date(2026, 6, 10);
    await goalSpaces.publishEvent({
      firestore: db,
      uid: "owner1",
      spaceId: "s1",
      kind: "weekly_check_in",
      note: "good week",
      displayName: "Owner",
      nowIso: NOW_ISO,
      now: friday,
    });
    // Same week (Sunday) — overwrites, no second doc.
    await goalSpaces.publishEvent({
      firestore: db,
      uid: "owner1",
      spaceId: "s1",
      kind: "weekly_check_in",
      note: "revised",
      displayName: "Owner",
      nowIso: NOW_ISO,
      now: new Date(2026, 6, 12),
    });
    const events = [...db.__docs.entries()].filter(([p]) =>
      p.startsWith("goalSpaces/s1/events/")
    );
    expect(events).toHaveLength(1);
    expect(events[0][0]).toBe("goalSpaces/s1/events/2026-07-06_owner1");
    expect(events[0][1].note).toBe("revised");
  });

  it("bounds the note and refuses posting to archived spaces", async () => {
    const db = makeFirestore(seededSpace());
    await goalSpaces.publishEvent({
      firestore: db,
      uid: "owner1",
      spaceId: "s1",
      kind: "milestone",
      note: "x".repeat(500),
      nowIso: NOW_ISO,
    });
    const [, event] = [...db.__docs.entries()].find(([p]) =>
      p.startsWith("goalSpaces/s1/events/")
    );
    expect(event.note).toHaveLength(goalSpaces.MAX_EVENT_NOTE_LENGTH);

    const archived = makeFirestore(seededSpace({ active: false }));
    await expect(
      goalSpaces.publishEvent({
        firestore: archived,
        uid: "owner1",
        spaceId: "s1",
        kind: "milestone",
        nowIso: NOW_ISO,
      })
    ).rejects.toMatchObject({ code: "space-inactive" });
  });
});

/* ── account-deletion cleanup ───────────────────────────────────────── */

describe("cleanupGoalSpacesForUser", () => {
  it("removes events, membership, journeys and invites; transfers ownership", async () => {
    const seed = seededSpace({ memberCount: 2 });
    seed["goalSpaces/s1/members/u2"] = {
      role: "member",
      displayName: "Jo",
      joinedAt: "2027-01-02T00:00:00.000Z",
    };
    seed["users/u2/journeys/s1"] = { spaceId: "s1", role: "member" };
    seed["goalSpaces/s1/events/e1"] = {
      kind: "milestone",
      authorUid: "owner1",
      createdAt: NOW_ISO,
    };
    seed["goalSpaces/s1/events/e2"] = {
      kind: "weekly_check_in",
      authorUid: "u2",
      createdAt: NOW_ISO,
    };
    // An orphan journey (space vanished) + an invite the user minted.
    seed["users/owner1/journeys/ghost"] = { spaceId: "ghost" };
    const db = makeFirestore(seed);

    await goalSpaces.cleanupGoalSpacesForUser({
      firestore: db,
      uid: "owner1",
      increment: INCREMENT,
      logger: { warn: () => {} },
    });

    // Their events gone, the other member's kept.
    expect(db.__docs.has("goalSpaces/s1/events/e1")).toBe(false);
    expect(db.__docs.has("goalSpaces/s1/events/e2")).toBe(true);
    // Membership removed; ownership transferred to u2; count decremented.
    expect(db.__docs.has("goalSpaces/s1/members/owner1")).toBe(false);
    expect(db.__docs.get("goalSpaces/s1").ownerId).toBe("u2");
    expect(db.__docs.get("goalSpaces/s1").memberCount).toBe(1);
    // All journeys swept (membership + orphan).
    expect(db.__docs.has("users/owner1/journeys/s1")).toBe(false);
    expect(db.__docs.has("users/owner1/journeys/ghost")).toBe(false);
    // Their invites deleted.
    expect(db.__docs.has("goalSpaceInvites/GOODCODE22")).toBe(false);
  });
});
