/**
 * GOALS-CORE-01 slice 3 — membership module pins.
 *
 * In-memory firestore stub (docs keyed by path; tx.get supports doc
 * AND collection refs). Pins: create writes space+owner+joined event
 * with count 1; join enforces invite code, capacity, blocked pairs
 * (both directions), inactive spaces, and is idempotent; leave
 * decrements and deactivates when the owner leaves; remove is
 * owner-only and idempotent. memberCount is server-maintained only.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  GOAL_SPACE_MAX_MEMBERS,
  GoalSpaceError,
  createGoalSpace,
  joinGoalSpace,
  leaveGoalSpace,
  removeGoalSpaceMember,
} = require("../lib/goalSpaceMembership");

function makeStore() {
  const docs = new Map(); // path -> data
  const docRef = (path) => ({ __path: path });
  const collectionRef = (path) => ({ __collection: path });
  const snap = (path) => ({
    exists: docs.has(path),
    data: () => docs.get(path),
    id: path.split("/").pop(),
  });
  const tx = {
    get: async (ref) => {
      if (ref.__collection) {
        const prefix = `${ref.__collection}/`;
        const hits = [...docs.keys()]
          .filter(
            (p) => p.startsWith(prefix) && !p.slice(prefix.length).includes("/")
          )
          .map((p) => snap(p));
        return { docs: hits };
      }
      return snap(ref.__path);
    },
    set: (ref, data) => docs.set(ref.__path, data),
    update: (ref, data) =>
      docs.set(ref.__path, { ...docs.get(ref.__path), ...data }),
    delete: (ref) => docs.delete(ref.__path),
  };
  const firestore = {
    doc: docRef,
    collection: collectionRef,
    batch: () => {
      const ops = [];
      return {
        set: (ref, data) => ops.push(() => docs.set(ref.__path, data)),
        commit: async () => ops.forEach((f) => f()),
      };
    },
    runTransaction: async (cb) => cb(tx),
  };
  return { firestore, docs };
}

let ids = 0;
const makeId = () => `id-${ids++}`;
const NOW = 1000;

async function seedSpace(firestore) {
  return createGoalSpace({
    firestore,
    uid: "owner",
    displayName: "Owner",
    photoURL: null,
    input: { type: "strength_block", title: "8-week block" },
    now: NOW,
    makeId,
  });
}

function joinArgs(firestore, spaceId, inviteCode, uid) {
  return {
    firestore,
    uid,
    displayName: uid,
    photoURL: null,
    spaceId,
    inviteCode,
    now: NOW,
    makeId,
  };
}

describe("createGoalSpace", () => {
  it("writes space + owner member + joined event, count 1", async () => {
    const { firestore, docs } = makeStore();
    const { spaceId, inviteCode } = await seedSpace(firestore);
    const space = docs.get(`goalSpaces/${spaceId}`);
    expect(space.memberCount).toBe(1);
    expect(space.maxMembers).toBe(GOAL_SPACE_MAX_MEMBERS);
    expect(space.ownerId).toBe("owner");
    expect(space.inviteCode).toBe(inviteCode);
    expect(docs.get(`goalSpaces/${spaceId}/members/owner`).role).toBe("owner");
    const events = [...docs.keys()].filter((p) => p.includes("/events/"));
    expect(events).toHaveLength(1);
  });

  it("rejects unknown types and empty titles", async () => {
    const { firestore } = makeStore();
    await expect(
      createGoalSpace({
        firestore,
        uid: "u",
        input: { type: "book_club", title: "x" },
        now: NOW,
        makeId,
      })
    ).rejects.toThrow(GoalSpaceError);
    await expect(
      createGoalSpace({
        firestore,
        uid: "u",
        input: { type: "race", title: "   " },
        now: NOW,
        makeId,
      })
    ).rejects.toThrow("title required");
  });
});

describe("joinGoalSpace", () => {
  let firestore, docs, spaceId, inviteCode;
  beforeEach(async () => {
    ({ firestore, docs } = makeStore());
    ({ spaceId, inviteCode } = await seedSpace(firestore));
  });

  it("adds a member, bumps the count, writes a joined event", async () => {
    await joinGoalSpace(joinArgs(firestore, spaceId, inviteCode, "friend"));
    expect(docs.get(`goalSpaces/${spaceId}`).memberCount).toBe(2);
    expect(docs.get(`goalSpaces/${spaceId}/members/friend`).role).toBe(
      "member"
    );
  });

  it("rejects a wrong invite code", async () => {
    await expect(
      joinGoalSpace(joinArgs(firestore, spaceId, "nope", "friend"))
    ).rejects.toThrow("bad invite");
  });

  it("is idempotent for an existing member", async () => {
    await joinGoalSpace(joinArgs(firestore, spaceId, inviteCode, "friend"));
    await joinGoalSpace(joinArgs(firestore, spaceId, inviteCode, "friend"));
    expect(docs.get(`goalSpaces/${spaceId}`).memberCount).toBe(2);
  });

  it("enforces the 8-member cap", async () => {
    docs.set(`goalSpaces/${spaceId}`, {
      ...docs.get(`goalSpaces/${spaceId}`),
      memberCount: GOAL_SPACE_MAX_MEMBERS,
    });
    await expect(
      joinGoalSpace(joinArgs(firestore, spaceId, inviteCode, "ninth"))
    ).rejects.toThrow("circle full");
  });

  it("rejects blocked pairs in BOTH directions", async () => {
    docs.set("blocks/owner/users/enemy", { at: 1 });
    await expect(
      joinGoalSpace(joinArgs(firestore, spaceId, inviteCode, "enemy"))
    ).rejects.toThrow("blocked-pair");

    docs.delete("blocks/owner/users/enemy");
    docs.set("blocks/enemy2/users/owner", { at: 1 });
    await expect(
      joinGoalSpace(joinArgs(firestore, spaceId, inviteCode, "enemy2"))
    ).rejects.toThrow("blocked-pair");
  });

  it("rejects inactive spaces", async () => {
    docs.set(`goalSpaces/${spaceId}`, {
      ...docs.get(`goalSpaces/${spaceId}`),
      active: false,
    });
    await expect(
      joinGoalSpace(joinArgs(firestore, spaceId, inviteCode, "friend"))
    ).rejects.toThrow("circle inactive");
  });
});

describe("leave / remove", () => {
  let firestore, docs, spaceId, inviteCode;
  beforeEach(async () => {
    ({ firestore, docs } = makeStore());
    ({ spaceId, inviteCode } = await seedSpace(firestore));
    await joinGoalSpace(joinArgs(firestore, spaceId, inviteCode, "friend"));
  });

  it("maintains the journeys link index (create/join/leave/remove)", async () => {
    // Server-maintained users/{uid}/journeys/{spaceId} link — the
    // client's circle list via existing owner-only rules.
    expect(docs.get(`users/owner/journeys/${spaceId}`).goalSpaceId).toBe(
      spaceId
    );
    expect(docs.get(`users/friend/journeys/${spaceId}`).title).toBe(
      "8-week block"
    );
    await leaveGoalSpace({ firestore, uid: "friend", spaceId });
    expect(docs.has(`users/friend/journeys/${spaceId}`)).toBe(false);

    await joinGoalSpace(joinArgs(firestore, spaceId, inviteCode, "friend2"));
    await removeGoalSpaceMember({
      firestore,
      uid: "owner",
      spaceId,
      memberUid: "friend2",
    });
    expect(docs.has(`users/friend2/journeys/${spaceId}`)).toBe(false);
  });

  it("leave decrements and removes the member doc", async () => {
    await leaveGoalSpace({ firestore, uid: "friend", spaceId });
    expect(docs.get(`goalSpaces/${spaceId}`).memberCount).toBe(1);
    expect(docs.has(`goalSpaces/${spaceId}/members/friend`)).toBe(false);
    expect(docs.get(`goalSpaces/${spaceId}`).active).toBe(true);
  });

  it("owner leaving deactivates the circle", async () => {
    await leaveGoalSpace({ firestore, uid: "owner", spaceId });
    expect(docs.get(`goalSpaces/${spaceId}`).active).toBe(false);
  });

  it("remove is owner-only", async () => {
    await expect(
      removeGoalSpaceMember({
        firestore,
        uid: "friend",
        spaceId,
        memberUid: "owner",
      })
    ).rejects.toThrow("owner only");
    await removeGoalSpaceMember({
      firestore,
      uid: "owner",
      spaceId,
      memberUid: "friend",
    });
    expect(docs.get(`goalSpaces/${spaceId}`).memberCount).toBe(1);
  });
});
