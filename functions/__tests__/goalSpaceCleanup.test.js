/**
 * GOALS-CORE-01 — account-deletion goal-space cleanup pins.
 *
 * cleanupGoalSpacesForUser must, for every circle the user is in:
 * delete their authored events (nobody else's), run the real
 * leaveGoalSpace semantics (member + journey gone, memberCount
 * decremented, space deactivated when the owner deletes), tolerate a
 * vanished space (stale journey dropped), and never let one bad space
 * block the rest of the deletion.
 *
 * The stub supports BOTH access styles the code under test mixes:
 * chained (collection().doc().collection()) used by the cleanup, and
 * path-string (firestore.doc("a/b"), firestore.collection("a/b/c"))
 * used inside goalSpaceMembership's transactions.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { cleanupGoalSpacesForUser } = require("../lib/goalSpaceCleanup");

/* ── In-memory Firestore stub (docs keyed by full path) ─────────────── */

function applyData(existing, data) {
  return { ...(existing || {}), ...data };
}

function makeFirestore(initialDocs = {}) {
  const docs = new Map(Object.entries(initialDocs));

  function docRef(path) {
    return {
      __isDoc: true,
      path,
      id: path.split("/").pop(),
      collection: (sub) => collectionRef(`${path}/${sub}`),
      get: async () => snapshotOf(path),
      set: async (data) => docs.set(path, { ...data }),
      update: async (data) => docs.set(path, applyData(docs.get(path), data)),
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

  function collectionRef(path, constraints = {}) {
    return {
      __isCollection: true,
      path,
      doc: (id) => docRef(`${path}/${id}`),
      where: (field, op, value) =>
        collectionRef(path, { ...constraints, where: [field, op, value] }),
      get: async () => {
        const depth = path.split("/").length;
        const rows = [...docs.keys()]
          .filter(
            (p) => p.startsWith(`${path}/`) && p.split("/").length === depth + 1
          )
          .map((p) => snapshotOf(p))
          .filter((s) => {
            if (!constraints.where) return true;
            const [field, op, value] = constraints.where;
            if (op !== "==") throw new Error(`stub: unsupported op ${op}`);
            const data = s.data();
            return data && data[field] === value;
          });
        return { empty: rows.length === 0, size: rows.length, docs: rows };
      },
    };
  }

  const firestore = {
    __docs: docs,
    // Path-string style (goalSpaceMembership) AND chained style (cleanup).
    doc: (path) => docRef(path),
    collection: (path) => collectionRef(path),
    batch: () => {
      const ops = [];
      return {
        set: (ref, data) => ops.push(() => docs.set(ref.path, { ...data })),
        commit: async () => ops.forEach((f) => f()),
      };
    },
    runTransaction: async (fn) => {
      const writes = [];
      const tx = {
        get: async (refOrQuery) =>
          refOrQuery.__isDoc ? snapshotOf(refOrQuery.path) : refOrQuery.get(),
        set: (ref, data) => writes.push(() => docs.set(ref.path, { ...data })),
        update: (ref, data) =>
          writes.push(() =>
            docs.set(ref.path, applyData(docs.get(ref.path), data))
          ),
        delete: (ref) => writes.push(() => docs.delete(ref.path)),
      };
      await fn(tx);
      writes.forEach((w) => w());
    },
  };
  return firestore;
}

/* ── Fixtures matching goalSpaceMembership's doc shapes ─────────────── */

function seededCircle({
  ownerId = "owner",
  members = ["owner"],
  active = true,
} = {}) {
  const seed = {
    "goalSpaces/s1": {
      id: "s1",
      type: "strength_block",
      title: "8-week block",
      visibility: "invite_only",
      ownerId,
      memberCount: members.length,
      maxMembers: 8,
      targetDate: null,
      active,
      inviteCode: "code-1",
      createdAt: 1000,
    },
  };
  for (const uid of members) {
    seed[`goalSpaces/s1/members/${uid}`] = {
      uid,
      displayName: uid,
      photoURL: null,
      role: uid === ownerId ? "owner" : "member",
      joinedAt: 1000,
    };
    seed[`users/${uid}/journeys/s1`] = {
      id: "s1",
      type: "strength_block",
      title: "8-week block",
      goalSpaceId: "s1",
      targetDate: null,
      createdAt: 1000,
    };
  }
  return seed;
}

const silent = { warn: () => {} };

describe("cleanupGoalSpacesForUser", () => {
  it("member deletion: authored events gone, others kept, count decremented", async () => {
    const db = makeFirestore({
      ...seededCircle({ members: ["owner", "u2"] }),
      "goalSpaces/s1/events/e1": {
        uid: "u2",
        kind: "weekly_check_in",
        createdAt: 1,
      },
      "goalSpaces/s1/events/e2": {
        uid: "owner",
        kind: "milestone",
        createdAt: 2,
      },
    });
    await cleanupGoalSpacesForUser({
      firestore: db,
      uid: "u2",
      logger: silent,
    });

    expect(db.__docs.has("goalSpaces/s1/events/e1")).toBe(false); // theirs
    expect(db.__docs.has("goalSpaces/s1/events/e2")).toBe(true); // owner's kept
    expect(db.__docs.has("goalSpaces/s1/members/u2")).toBe(false);
    expect(db.__docs.has("users/u2/journeys/s1")).toBe(false);
    const space = db.__docs.get("goalSpaces/s1");
    expect(space.memberCount).toBe(1);
    expect(space.active).toBe(true); // non-owner leaving keeps it live
  });

  it("owner deletion deactivates the space (v1 policy — no transfer)", async () => {
    const db = makeFirestore(seededCircle({ members: ["owner", "u2"] }));
    await cleanupGoalSpacesForUser({
      firestore: db,
      uid: "owner",
      logger: silent,
    });

    expect(db.__docs.has("goalSpaces/s1/members/owner")).toBe(false);
    expect(db.__docs.has("users/owner/journeys/s1")).toBe(false);
    const space = db.__docs.get("goalSpaces/s1");
    expect(space.active).toBe(false);
    expect(space.memberCount).toBe(1);
    // The surviving member's docs are untouched.
    expect(db.__docs.has("goalSpaces/s1/members/u2")).toBe(true);
    expect(db.__docs.has("users/u2/journeys/s1")).toBe(true);
  });

  it("a vanished space just drops the stale journey pointer", async () => {
    const db = makeFirestore({
      "users/u9/journeys/ghost": { id: "ghost", goalSpaceId: "ghost" },
    });
    await cleanupGoalSpacesForUser({
      firestore: db,
      uid: "u9",
      logger: silent,
    });
    expect(db.__docs.has("users/u9/journeys/ghost")).toBe(false);
  });

  it("one bad space is logged and skipped — the rest still clean up", async () => {
    const db = makeFirestore({
      ...seededCircle({ members: ["owner", "u2"] }),
      // Second membership whose space doc is corrupt enough to throw
      // inside leaveGoalSpace (memberCount missing → update still works
      // in the stub, so instead break the events query path by making
      // the journey point at a space with a poisoned events read).
      "users/u2/journeys/s2": { id: "s2", goalSpaceId: "s2" },
    });
    // Poison s2's events query.
    const realCollection = db.collection;
    db.collection = (path) => {
      const ref = realCollection(path);
      if (path === "goalSpaces") {
        const realDoc = ref.doc;
        ref.doc = (id) => {
          const d = realDoc(id);
          if (id === "s2") {
            d.collection = () => ({
              where: () => ({
                get: async () => {
                  throw new Error("boom");
                },
              }),
            });
          }
          return d;
        };
      }
      return ref;
    };
    const warnings = [];
    await cleanupGoalSpacesForUser({
      firestore: db,
      uid: "u2",
      logger: { warn: (...a) => warnings.push(a.join(" ")) },
    });
    // s1 (healthy) fully cleaned despite s2 failing.
    expect(db.__docs.has("goalSpaces/s1/members/u2")).toBe(false);
    expect(db.__docs.has("users/u2/journeys/s1")).toBe(false);
    expect(warnings.some((w) => w.includes("s2"))).toBe(true);
  });

  it("no memberships is a clean no-op", async () => {
    const db = makeFirestore();
    await expect(
      cleanupGoalSpacesForUser({ firestore: db, uid: "nobody", logger: silent })
    ).resolves.toBeUndefined();
  });
});
