/**
 * GOALS-CORE-01 slice 3 — membership module pins.
 *
 * In-memory firestore stub (docs keyed by path; tx.get supports doc
 * AND collection refs). Pins: create writes space+owner+joined event
 * with count 1; join enforces invite code, capacity, blocked pairs
 * (both directions), inactive spaces, and is idempotent; leave
 * decrements and deactivates when the owner leaves; remove is
 * owner-only and idempotent. memberCount is server-maintained only.
 * An invite code works for seven days, an old one is as old as its
 * Circle, and the owner's new code replaces the old one at once.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  GOAL_SPACE_MAX_MEMBERS,
  INVITE_CODE_TTL_MS,
  GoalSpaceError,
  createGoalSpace,
  joinGoalSpace,
  leaveGoalSpace,
  removeGoalSpaceMember,
  renewGoalSpaceInviteCode,
  inviteCodeExpiresAt,
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

describe("createGoalSpace — targetDate", () => {
  /* The same field the `continue` path validates in goalSpaceLifecycle, on
     its OTHER write path, which had no test at all and the weaker rule: a
     bare regex, so `2026-02-30` was stored verbatim as a Circle's finish
     line. Both paths now share `dateUtils.isCalendarDate`.

     Create's contract is unchanged and is deliberately not the lifecycle
     one: targetDate is optional here, so anything unusable becomes null
     rather than throwing. What changed is only that an impossible day now
     counts as unusable. */
  async function createWith(firestore, targetDate) {
    return createGoalSpace({
      firestore,
      uid: "owner",
      displayName: "Owner",
      photoURL: null,
      input: { type: "strength_block", title: "8-week block", targetDate },
      now: NOW,
      makeId,
    });
  }

  it("keeps a real calendar day, including a leap day", async () => {
    for (const good of ["2026-12-31", "2028-02-29"]) {
      const { firestore, docs } = makeStore();
      const { spaceId } = await createWith(firestore, good);
      expect(docs.get(`goalSpaces/${spaceId}`).targetDate).toBe(good);
    }
  });

  it("nulls a well-formed date that is not a real day", async () => {
    // Well-formed and impossible. Pre-fix each of these was stored as-is.
    for (const bad of [
      "2026-09-31",
      "2026-02-30",
      "2026-13-01",
      "2026-00-10",
    ]) {
      const { firestore, docs } = makeStore();
      const { spaceId } = await createWith(firestore, bad);
      expect(docs.get(`goalSpaces/${spaceId}`).targetDate).toBeNull();
    }
  });

  it("nulls a malformed or absent targetDate, as before", async () => {
    for (const bad of ["31/12/2026", "", undefined, 20261231]) {
      const { firestore, docs } = makeStore();
      const { spaceId } = await createWith(firestore, bad);
      expect(docs.get(`goalSpaces/${spaceId}`).targetDate).toBeNull();
    }
  });
});

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

  it("refuses a name the word filter refuses, with a display name's sentence", async () => {
    const { REFUSALS } = require("../lib/objectionableText");
    for (const title of ["Hitler", "Team H1tler", "nazi gym", "sucks"]) {
      const { firestore, docs } = makeStore();
      await expect(
        createGoalSpace({
          firestore,
          uid: "u",
          input: { type: "strength_block", title },
          now: NOW,
          makeId,
        })
      ).rejects.toThrow(REFUSALS.displayName);
      expect(docs.size).toBe(0);
    }
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

  /* `removeGoalSpaceMember` opens with
       if (typeof memberUid !== "string" || memberUid === uid) throw
     and nothing above reaches EITHER branch: "remove is owner-only" is
     refused by the later `space.ownerId !== uid` check, and every accepting
     call passes some other member's uid. Deleting the whole line left this
     file green.

     The `memberUid === uid` half is not a type check — it is what keeps the
     owner out of their own removal path. Leaving is `leaveGoalSpace`, and
     that sets `active = false` when the owner goes (the test two above pins
     it). Removal does not. So an owner who removed THEMSELVES would drop
     their member doc and journey link and decrement the count while the
     circle stayed active with `ownerId` pointing at someone who is no longer
     in it — and since removal is owner-only, nobody could ever remove anyone
     again. The circle would be unreachable rather than closed. */
  it("an owner cannot remove THEMSELVES through the removal path", async () => {
    const before = docs.get(`goalSpaces/${spaceId}`).memberCount;
    await expect(
      removeGoalSpaceMember({
        firestore,
        uid: "owner",
        spaceId,
        memberUid: "owner",
      })
    ).rejects.toThrow("memberUid required");
    // the circle is untouched — not merely "no error surfaced"
    expect(docs.has(`goalSpaces/${spaceId}/members/owner`)).toBe(true);
    expect(docs.has(`users/owner/journeys/${spaceId}`)).toBe(true);
    expect(docs.get(`goalSpaces/${spaceId}`).memberCount).toBe(before);
    expect(docs.get(`goalSpaces/${spaceId}`).active).toBe(true);
  });

  it("leaving IS the owner's route out, and it closes the circle", async () => {
    // The contrast that makes the refusal above the right behaviour rather
    // than a dead end: the owner does have a way out, and it deactivates.
    await leaveGoalSpace({ firestore, uid: "owner", spaceId });
    expect(docs.has(`goalSpaces/${spaceId}/members/owner`)).toBe(false);
    expect(docs.get(`goalSpaces/${spaceId}`).active).toBe(false);
  });

  it("rejects a non-string memberUid without touching the circle", async () => {
    const before = docs.get(`goalSpaces/${spaceId}`).memberCount;
    await expect(
      removeGoalSpaceMember({
        firestore,
        uid: "owner",
        spaceId,
        memberUid: undefined,
      })
    ).rejects.toThrow("memberUid required");
    expect(docs.get(`goalSpaces/${spaceId}`).memberCount).toBe(before);
    expect(docs.get(`goalSpaces/${spaceId}`).active).toBe(true);
  });
});

describe("short invite codes", () => {
  function createWithCode(firestore, makeCode) {
    return createGoalSpace({
      firestore,
      uid: "owner",
      displayName: "Owner",
      photoURL: null,
      input: { type: "hybrid", title: "Hybrid" },
      now: NOW,
      makeId,
      makeCode,
    });
  }

  it("reserves a short code + writes the goalSpaceInvites lookup", async () => {
    const { firestore, docs } = makeStore();
    const { spaceId, inviteCode } = await createWithCode(
      firestore,
      () => "K7P49M2H"
    );
    expect(inviteCode).toBe("K7P49M2H");
    expect(docs.get(`goalSpaces/${spaceId}`).inviteCode).toBe("K7P49M2H");
    expect(docs.get("goalSpaceInvites/K7P49M2H")).toEqual({
      spaceId,
      createdAt: NOW,
      expiresAt: NOW + INVITE_CODE_TTL_MS,
    });
  });

  it("retries when a generated code collides", async () => {
    const { firestore, docs } = makeStore();
    docs.set("goalSpaceInvites/TAKEN234", { spaceId: "other" });
    const codes = ["TAKEN234", "FRESH567"];
    let i = 0;
    const { inviteCode } = await createWithCode(firestore, () => codes[i++]);
    expect(inviteCode).toBe("FRESH567");
    // The pre-existing reservation is untouched.
    expect(docs.get("goalSpaceInvites/TAKEN234")).toEqual({ spaceId: "other" });
  });

  it("joins via a short code — dash + case tolerant", async () => {
    const { firestore, docs } = makeStore();
    const { spaceId } = await createWithCode(firestore, () => "K7P49M2H");
    await joinGoalSpace({
      firestore,
      uid: "friend",
      displayName: "Friend",
      photoURL: null,
      code: "k7p4-9m2h",
      now: NOW,
      makeId,
    });
    expect(docs.get(`goalSpaces/${spaceId}/members/friend`)).toBeTruthy();
    expect(docs.get(`goalSpaces/${spaceId}`).memberCount).toBe(2);
  });

  it("still joins via the legacy spaceId.token combined code", async () => {
    const { firestore, docs } = makeStore();
    const { spaceId, inviteCode } = await seedSpace(firestore); // UUID code, no lookup
    await joinGoalSpace({
      firestore,
      uid: "friend",
      displayName: "Friend",
      photoURL: null,
      code: `${spaceId}.${inviteCode}`,
      now: NOW,
      makeId,
    });
    expect(docs.get(`goalSpaces/${spaceId}/members/friend`)).toBeTruthy();
  });

  it("rejects an unknown short code", async () => {
    const { firestore } = makeStore();
    await expect(
      joinGoalSpace({
        firestore,
        uid: "x",
        displayName: "x",
        photoURL: null,
        code: "ZZZZ9999",
        now: NOW,
        makeId,
      })
    ).rejects.toThrow("invite code required");
  });
});

describe("invite codes expire", () => {
  const DAY = 86_400_000;
  /** A Circle with a short code made at NOW, and a friend to invite. */
  async function circleWithCode(code = "K7P49M2H") {
    const store = makeStore();
    const created = await createGoalSpace({
      firestore: store.firestore,
      uid: "owner",
      displayName: "Owner",
      photoURL: null,
      input: { type: "hybrid", title: "Hybrid" },
      now: NOW,
      makeId,
      makeCode: () => code,
    });
    return { ...store, ...created };
  }
  const join = (firestore, code, uid, now) =>
    joinGoalSpace({
      firestore,
      uid,
      displayName: uid,
      photoURL: null,
      code,
      now,
      makeId,
    });

  it("a new code says when it stops working, seven days on", async () => {
    const { docs, spaceId, inviteCodeExpiresAt: at } = await circleWithCode();
    expect(INVITE_CODE_TTL_MS).toBe(7 * DAY);
    expect(at).toBe(NOW + 7 * DAY);
    expect(docs.get(`goalSpaces/${spaceId}`).inviteCodeExpiresAt).toBe(at);
  });

  it("works until the moment it expires, and not from then on", async () => {
    const { firestore, docs, spaceId } = await circleWithCode();
    await join(firestore, "K7P4-9M2H", "early", NOW + 7 * DAY - 1);
    expect(docs.has(`goalSpaces/${spaceId}/members/early`)).toBe(true);
    await expect(
      join(firestore, "K7P4-9M2H", "late", NOW + 7 * DAY)
    ).rejects.toThrow("invite expired");
    // Refused, not half-joined: no member, no count, no link.
    expect(docs.has(`goalSpaces/${spaceId}/members/late`)).toBe(false);
    expect(docs.has(`users/late/journeys/${spaceId}`)).toBe(false);
    expect(docs.get(`goalSpaces/${spaceId}`).memberCount).toBe(2);
  });

  it("is refused as a failed precondition the app can name", async () => {
    const { firestore } = await circleWithCode();
    const err = await join(firestore, "K7P49M2H", "late", NOW + 8 * DAY).catch(
      (e) => e
    );
    expect(err).toBeInstanceOf(GoalSpaceError);
    expect(err.code).toBe("failed-precondition");
  });

  it("leaves a member who is already in alone", async () => {
    const { firestore, docs, spaceId } = await circleWithCode();
    await join(firestore, "K7P49M2H", "friend", NOW + DAY);
    // A month on, the friend's own Circle still opens: re-joining with the
    // old code is the same no-op it always was.
    await expect(
      join(firestore, "K7P49M2H", "friend", NOW + 30 * DAY)
    ).resolves.toBeUndefined();
    expect(docs.has(`goalSpaces/${spaceId}/members/friend`)).toBe(true);
    expect(docs.get(`goalSpaces/${spaceId}`).memberCount).toBe(2);
  });

  it("a code from before expiry existed is as old as its Circle", async () => {
    const { firestore, docs, spaceId } = await circleWithCode();
    const space = { ...docs.get(`goalSpaces/${spaceId}`) };
    delete space.inviteCodeExpiresAt;
    docs.set(`goalSpaces/${spaceId}`, space);
    expect(inviteCodeExpiresAt(space)).toBe(NOW + 7 * DAY);
    await join(firestore, "K7P49M2H", "early", NOW + 6 * DAY);
    await expect(
      join(firestore, "K7P49M2H", "late", NOW + 7 * DAY)
    ).rejects.toThrow("invite expired");
  });

  it("the legacy spaceId.token form expires the same way", async () => {
    const { firestore } = makeStore();
    const { spaceId, inviteCode } = await seedSpace(firestore);
    await expect(
      joinGoalSpace({
        firestore,
        uid: "late",
        displayName: "late",
        photoURL: null,
        code: `${spaceId}.${inviteCode}`,
        now: NOW + 7 * DAY,
        makeId,
      })
    ).rejects.toThrow("invite expired");
  });

  it("a code of unknown age lets nobody in", () => {
    expect(inviteCodeExpiresAt({})).toBe(0);
    expect(inviteCodeExpiresAt({ createdAt: "yesterday" })).toBe(0);
    expect(inviteCodeExpiresAt({ inviteCodeExpiresAt: NaN })).toBe(0);
  });
});

describe("renewGoalSpaceInviteCode", () => {
  const DAY = 86_400_000;
  async function circle() {
    const store = makeStore();
    const created = await createGoalSpace({
      firestore: store.firestore,
      uid: "owner",
      displayName: "Owner",
      photoURL: null,
      input: { type: "hybrid", title: "Hybrid" },
      now: NOW,
      makeId,
      makeCode: () => "OLDC0DE2",
    });
    return { ...store, ...created };
  }
  const renew = (firestore, spaceId, { uid = "owner", now, codes }) => {
    let i = 0;
    return renewGoalSpaceInviteCode({
      firestore,
      uid,
      spaceId,
      now,
      makeCode: () => codes[i++],
    });
  };
  const join = (firestore, code, uid, now) =>
    joinGoalSpace({
      firestore,
      uid,
      displayName: uid,
      photoURL: null,
      code,
      now,
      makeId,
    });

  it("gives the Circle a new code that works for seven days from now", async () => {
    const { firestore, docs, spaceId } = await circle();
    const later = NOW + 10 * DAY;
    const result = await renew(firestore, spaceId, {
      now: later,
      codes: ["NEWC0DE3"],
    });
    expect(result).toEqual({
      inviteCode: "NEWC0DE3",
      inviteCodeExpiresAt: later + 7 * DAY,
    });
    expect(docs.get(`goalSpaces/${spaceId}`)).toMatchObject({
      inviteCode: "NEWC0DE3",
      inviteCodeExpiresAt: later + 7 * DAY,
    });
    expect(docs.get("goalSpaceInvites/NEWC0DE3")).toEqual({
      spaceId,
      createdAt: later,
      expiresAt: later + 7 * DAY,
    });
    await join(firestore, "NEWC-0DE3", "friend", later + DAY);
    expect(docs.has(`goalSpaces/${spaceId}/members/friend`)).toBe(true);
  });

  it("the code it replaces stops working at once, and says it expired", async () => {
    const { firestore, spaceId } = await circle();
    // Anchor: the old code works right up to the renewal.
    await join(firestore, "OLDC0DE2", "early", NOW + DAY);
    await renew(firestore, spaceId, { now: NOW + DAY, codes: ["NEWC0DE3"] });
    await expect(
      join(firestore, "OLDC0DE2", "late", NOW + DAY)
    ).rejects.toThrow("invite expired");
  });

  it("skips a code that is taken, or is the one being replaced", async () => {
    const { firestore, docs, spaceId } = await circle();
    docs.set("goalSpaceInvites/TAKEN234", { spaceId: "other" });
    const { inviteCode } = await renew(firestore, spaceId, {
      now: NOW,
      codes: ["OLDC0DE2", "TAKEN234", "FRESH567"],
    });
    expect(inviteCode).toBe("FRESH567");
    expect(docs.get("goalSpaceInvites/TAKEN234")).toEqual({ spaceId: "other" });
  });

  it("is the owner's alone, and only for a Circle still running", async () => {
    const { firestore, docs, spaceId } = await circle();
    await join(firestore, "OLDC0DE2", "friend", NOW);
    await expect(
      renew(firestore, spaceId, {
        uid: "friend",
        now: NOW,
        codes: ["X2345678"],
      })
    ).rejects.toThrow("owner only");
    docs.set(`goalSpaces/${spaceId}`, {
      ...docs.get(`goalSpaces/${spaceId}`),
      active: false,
    });
    await expect(
      renew(firestore, spaceId, { now: NOW, codes: ["X2345678"] })
    ).rejects.toThrow("circle inactive");
    await expect(
      renew(firestore, "missing", { now: NOW, codes: ["X2345678"] })
    ).rejects.toThrow("no such circle");
    // Nothing was reserved by any refusal.
    expect(docs.has("goalSpaceInvites/X2345678")).toBe(false);
    expect(docs.get(`goalSpaces/${spaceId}`).inviteCode).toBe("OLDC0DE2");
  });

  it("refuses a missing spaceId before reading anything", async () => {
    const { firestore } = makeStore();
    await expect(
      renew(firestore, "", { now: NOW, codes: ["X2345678"] })
    ).rejects.toThrow("spaceId required");
  });
});
