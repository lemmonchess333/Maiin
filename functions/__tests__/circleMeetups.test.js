/**
 * Run26 call 4 — meet-ups in a Circle (lib/circleMeetups).
 *
 * Pins what the callable promises: only a member of a live Circle plans
 * one, the plan is the typed words and the instant and nothing else, the
 * word filter and the bounds refuse before anything is stored, a Circle
 * holds at most MEETUPS_AHEAD_MAX ahead, past ones are pruned when the
 * next is planned, saying you're in is refused across a block and after
 * the meet-up is over, only the organiser or the owner calls one off and
 * only those who said they were in hear of it, and a member who leaves
 * takes their part with them.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  MEETUPS_AHEAD_MAX,
  MEETUP_SHOWN_AFTER_START_MS,
  MEETUP_MAX_AHEAD_MS,
  PRUNE_AFTER_MS,
  normaliseMeetupInput,
  planMeetup,
  setMeetupGoing,
  cancelMeetup,
  afterMemberLeft,
} = require("../lib/circleMeetups");
const { GoalSpaceError } = require("../lib/goalSpaceMembership");

const NOW = Date.UTC(2026, 10, 18, 12, 0);
const HOUR = 3_600_000;

function makeFirestore(initial = {}) {
  const docs = new Map(Object.entries(initial));
  const snapshotOf = (path) => ({
    exists: docs.has(path),
    id: path.split("/").pop(),
    ref: docRef(path),
    data: () => docs.get(path),
  });
  function docRef(path) {
    return {
      __isDoc: true,
      path,
      id: path.split("/").pop(),
      collection: (sub) => collectionRef(`${path}/${sub}`),
      get: async () => snapshotOf(path),
      set: async (data) => docs.set(path, { ...data }),
      update: async (data) => docs.set(path, { ...docs.get(path), ...data }),
      delete: async () => docs.delete(path),
    };
  }
  function collectionRef(path, wheres = [], cap = Infinity) {
    const depth = path.split("/").length;
    return {
      doc: (id) => docRef(`${path}/${id}`),
      where: (f, op, v) => collectionRef(path, [...wheres, [f, op, v]], cap),
      limit: (n) => collectionRef(path, wheres, n),
      get: async () => {
        const rows = [...docs.keys()]
          .filter(
            (p) => p.startsWith(`${path}/`) && p.split("/").length === depth + 1
          )
          .map(snapshotOf)
          .filter((s) =>
            wheres.every(([f, op, v]) => {
              const x = s.data()[f];
              if (op === "==") return x === v;
              if (op === ">=") return x >= v;
              if (op === "<") return x < v;
              if (op === "array-contains")
                return Array.isArray(x) && x.includes(v);
              throw new Error(`stub: ${op}`);
            })
          )
          .slice(0, cap);
        return { size: rows.length, empty: rows.length === 0, docs: rows };
      },
    };
  }
  return {
    __docs: docs,
    doc: docRef,
    collection: (path) => collectionRef(path),
    runTransaction: async (fn) => {
      const writes = [];
      const tx = {
        get: async (ref) => snapshotOf(ref.path),
        update: (ref, data) =>
          writes.push(() =>
            docs.set(ref.path, { ...docs.get(ref.path), ...data })
          ),
        delete: (ref) => writes.push(() => docs.delete(ref.path)),
      };
      const out = await fn(tx);
      writes.forEach((w) => w());
      return out;
    },
  };
}

function circle({ members = ["owner", "maya", "sam"], active = true } = {}) {
  const seed = {
    "goalSpaces/c1": { ownerId: "owner", active, memberCount: members.length },
  };
  for (const uid of members) {
    seed[`goalSpaces/c1/members/${uid}`] = { uid, displayName: uid };
  }
  return seed;
}

const PLAN = {
  sport: "run",
  title: "Saturday long run",
  place: "Tooting Lido gate",
  note: "Easy pace, coffee after",
  startsAt: NOW + 46 * HOUR,
  timeZone: "Europe/London",
};

let ids = 0;
const makeId = () => `m${++ids}`;

async function rejects(promise, code) {
  await expect(promise).rejects.toBeInstanceOf(GoalSpaceError);
  await expect(promise).rejects.toMatchObject({ code });
}

describe("normaliseMeetupInput", () => {
  it("keeps the typed words on one line and drops an empty note", () => {
    const out = normaliseMeetupInput(
      { ...PLAN, title: "  Saturday \n long run ", note: "   " },
      NOW
    );
    expect(out).toEqual({
      ...PLAN,
      title: "Saturday long run",
      note: null,
      paceGroups: null,
      repeat: null,
    });
  });

  it("refuses an unknown sport, missing words, a past or far start and a made-up zone", () => {
    const bad = [
      { sport: "swim" },
      { title: " " },
      { place: "" },
      { title: "x".repeat(61) },
      { place: "x".repeat(81) },
      { note: "x".repeat(201) },
      { startsAt: NOW - 10 * 60_000 },
      { startsAt: NOW + MEETUP_MAX_AHEAD_MS + 1 },
      { startsAt: 1.5 },
      { timeZone: "Mars/Olympus" },
      { timeZone: undefined },
    ];
    for (const patch of bad) {
      expect(() => normaliseMeetupInput({ ...PLAN, ...patch }, NOW)).toThrow(
        GoalSpaceError
      );
    }
  });

  it("refuses words the filter refuses, in any of the three fields", () => {
    const filter = (text) => text.includes("rude");
    for (const field of ["title", "place", "note"]) {
      expect(() =>
        normaliseMeetupInput({ ...PLAN, [field]: "a rude word" }, NOW, filter)
      ).toThrow("objectionable");
    }
  });
});

describe("planMeetup", () => {
  it("stores the plan with the organiser going, and names the others to tell", async () => {
    const db = makeFirestore(circle());
    const res = await planMeetup({
      firestore: db,
      uid: "maya",
      spaceId: "c1",
      input: PLAN,
      now: NOW,
      makeId: () => "m-new",
    });
    expect(res.meetupId).toBe("m-new");
    expect(res.recipients.sort()).toEqual(["owner", "sam"]);
    expect(db.__docs.get("goalSpaces/c1/meetups/m-new")).toEqual({
      organiserUid: "maya",
      ...PLAN,
      paceGroups: null,
      repeat: null,
      going: ["maya"],
      createdAt: NOW,
      // Run27 call 10: 46 hours ahead, so its reminder is due 24 hours
      // before the start; it does not repeat, so it carries no repeatAt.
      remindAt: PLAN.startsAt - 24 * HOUR,
    });
  });

  it("refuses someone outside the Circle, and an ended Circle", async () => {
    const db = makeFirestore(circle());
    await rejects(
      planMeetup({
        firestore: db,
        uid: "stranger",
        spaceId: "c1",
        input: PLAN,
        now: NOW,
        makeId,
      }),
      "permission-denied"
    );
    const ended = makeFirestore(circle({ active: false }));
    await rejects(
      planMeetup({
        firestore: ended,
        uid: "maya",
        spaceId: "c1",
        input: PLAN,
        now: NOW,
        makeId,
      }),
      "failed-precondition"
    );
  });

  it(`holds at most ${MEETUPS_AHEAD_MAX} ahead, and prunes past ones as it plans`, async () => {
    const seed = circle();
    for (let i = 0; i < MEETUPS_AHEAD_MAX; i++) {
      seed[`goalSpaces/c1/meetups/a${i}`] = {
        organiserUid: "sam",
        startsAt: NOW + (i + 1) * HOUR,
        going: ["sam"],
      };
    }
    const full = makeFirestore(seed);
    await rejects(
      planMeetup({
        firestore: full,
        uid: "maya",
        spaceId: "c1",
        input: PLAN,
        now: NOW,
        makeId,
      }),
      "failed-precondition"
    );

    const db = makeFirestore({
      ...circle(),
      "goalSpaces/c1/meetups/old": {
        organiserUid: "sam",
        startsAt: NOW - PRUNE_AFTER_MS - HOUR,
        going: [],
      },
      "goalSpaces/c1/meetups/recent": {
        organiserUid: "sam",
        startsAt: NOW - 5 * HOUR,
        going: [],
      },
    });
    await planMeetup({
      firestore: db,
      uid: "maya",
      spaceId: "c1",
      input: PLAN,
      now: NOW,
      makeId,
    });
    expect(db.__docs.has("goalSpaces/c1/meetups/old")).toBe(false);
    expect(db.__docs.has("goalSpaces/c1/meetups/recent")).toBe(true);
  });
});

describe("setMeetupGoing", () => {
  const seeded = (extra = {}) =>
    makeFirestore({
      ...circle(),
      "goalSpaces/c1/meetups/m1": {
        organiserUid: "maya",
        startsAt: NOW + 2 * HOUR,
        going: ["maya"],
      },
      ...extra,
    });

  it("adds and takes off the caller, once each", async () => {
    const db = seeded();
    const args = {
      firestore: db,
      uid: "sam",
      spaceId: "c1",
      meetupId: "m1",
      now: NOW,
    };
    expect((await setMeetupGoing({ ...args, going: true })).going).toEqual([
      "maya",
      "sam",
    ]);
    expect((await setMeetupGoing({ ...args, going: true })).going).toEqual([
      "maya",
      "sam",
    ]);
    expect((await setMeetupGoing({ ...args, going: false })).going).toEqual([
      "maya",
    ]);
    expect(db.__docs.get("goalSpaces/c1/meetups/m1").going).toEqual(["maya"]);
  });

  it("refuses the organiser, a stranger, a block either way, and a meet-up that is over", async () => {
    await rejects(
      setMeetupGoing({
        firestore: seeded(),
        uid: "maya",
        spaceId: "c1",
        meetupId: "m1",
        going: false,
        now: NOW,
      }),
      "invalid-argument"
    );
    await rejects(
      setMeetupGoing({
        firestore: seeded(),
        uid: "stranger",
        spaceId: "c1",
        meetupId: "m1",
        going: true,
        now: NOW,
      }),
      "permission-denied"
    );
    for (const block of ["blocks/sam/users/maya", "blocks/maya/users/sam"]) {
      await rejects(
        setMeetupGoing({
          firestore: seeded({ [block]: {} }),
          uid: "sam",
          spaceId: "c1",
          meetupId: "m1",
          going: true,
          now: NOW,
        }),
        "permission-denied"
      );
    }
    const later = NOW + 2 * HOUR + MEETUP_SHOWN_AFTER_START_MS + 1;
    await rejects(
      setMeetupGoing({
        firestore: seeded(),
        uid: "sam",
        spaceId: "c1",
        meetupId: "m1",
        going: true,
        now: later,
      }),
      "failed-precondition"
    );
  });

  it("still lets someone say they can't make it across a block", async () => {
    const db = seeded({ "blocks/maya/users/sam": {} });
    db.__docs.set("goalSpaces/c1/meetups/m1", {
      organiserUid: "maya",
      startsAt: NOW + 2 * HOUR,
      going: ["maya", "sam"],
    });
    const res = await setMeetupGoing({
      firestore: db,
      uid: "sam",
      spaceId: "c1",
      meetupId: "m1",
      going: false,
      now: NOW,
    });
    expect(res.going).toEqual(["maya"]);
  });
});

describe("cancelMeetup", () => {
  const seeded = (startsAt = NOW + 2 * HOUR) =>
    makeFirestore({
      ...circle(),
      "goalSpaces/c1/meetups/m1": {
        organiserUid: "maya",
        sport: "lift",
        startsAt,
        going: ["maya", "sam", "owner"],
      },
    });

  it("lets the organiser call it off, and tells those who were in", async () => {
    const db = seeded();
    const res = await cancelMeetup({
      firestore: db,
      uid: "maya",
      spaceId: "c1",
      meetupId: "m1",
      now: NOW,
    });
    expect(res).toEqual({ notify: ["sam", "owner"], sport: "lift" });
    expect(db.__docs.has("goalSpaces/c1/meetups/m1")).toBe(false);
  });

  it("lets the owner call it off, and refuses any other member", async () => {
    await rejects(
      cancelMeetup({
        firestore: seeded(),
        uid: "sam",
        spaceId: "c1",
        meetupId: "m1",
        now: NOW,
      }),
      "permission-denied"
    );
    const db = seeded();
    const res = await cancelMeetup({
      firestore: db,
      uid: "owner",
      spaceId: "c1",
      meetupId: "m1",
      now: NOW,
    });
    expect(res.notify).toEqual(["maya", "sam"]);
  });

  it("tells nobody once it has started", async () => {
    const res = await cancelMeetup({
      firestore: seeded(NOW - HOUR),
      uid: "maya",
      spaceId: "c1",
      meetupId: "m1",
      now: NOW,
    });
    expect(res.notify).toEqual([]);
  });
});

describe("afterMemberLeft", () => {
  it("takes a leaver's meet-ups and their place on others' lists", async () => {
    const db = makeFirestore({
      ...circle(),
      "goalSpaces/c1/meetups/mine": {
        organiserUid: "sam",
        startsAt: NOW + HOUR,
        going: ["sam", "maya"],
      },
      "goalSpaces/c1/meetups/theirs": {
        organiserUid: "maya",
        startsAt: NOW + HOUR,
        going: ["maya", "sam"],
      },
    });
    await afterMemberLeft({ firestore: db, spaceId: "c1", uid: "sam" });
    expect(db.__docs.has("goalSpaces/c1/meetups/mine")).toBe(false);
    expect(db.__docs.get("goalSpaces/c1/meetups/theirs").going).toEqual([
      "maya",
    ]);
  });

  it("takes every meet-up once the Circle has ended", async () => {
    const db = makeFirestore({
      ...circle({ active: false }),
      "goalSpaces/c1/meetups/theirs": {
        organiserUid: "maya",
        startsAt: NOW + HOUR,
        going: ["maya"],
      },
    });
    await afterMemberLeft({ firestore: db, spaceId: "c1", uid: "owner" });
    expect(db.__docs.has("goalSpaces/c1/meetups/theirs")).toBe(false);
  });
});
