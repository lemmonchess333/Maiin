/**
 * SOCIAL-FOCUS-01 — server-owned weekly check-in + focus backing pins.
 *
 * Same in-memory firestore stub as goalSpaceMembership.test.js. Pins:
 * the deterministic ${uid}_${weekKey} event ID (one check-in per
 * member per week), the create/duplicate/update return contract, the
 * closed weeklyFocus enum, weekKey shape+window validation, and the
 * backing guards (self, non-member caller, departed author, blocked
 * pair, idempotency, the supporter bound) — plus that a focus change
 * preserves createdAt and supporterIds (no second event).
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  WEEKLY_FOCUS_VALUES,
  MAX_FOCUS_SUPPORTERS,
  weeklyCheckIn,
  backWeeklyCheckIn,
} = require("../lib/goalSpaceCheckIn");
const { GoalSpaceError } = require("../lib/goalSpaceMembership");

function makeStore() {
  const docs = new Map(); // path -> data
  const docRef = (path) => ({ __path: path });
  const snap = (path) => ({
    exists: docs.has(path),
    data: () => docs.get(path),
    id: path.split("/").pop(),
  });
  const tx = {
    get: async (ref) => snap(ref.__path),
    set: (ref, data) => docs.set(ref.__path, data),
    update: (ref, data) =>
      docs.set(ref.__path, { ...docs.get(ref.__path), ...data }),
  };
  const firestore = {
    doc: docRef,
    runTransaction: async (cb) => cb(tx),
  };
  return { firestore, docs };
}

// A NOW inside the same week as WEEK (Sunday 2026-07-12 .. Sat 18th).
const WEEK = "2026-07-12";
const NOW = Date.parse("2026-07-15T12:00:00Z");
const SPACE = "space-1";

function seedMember(docs, uid) {
  docs.set(`goalSpaces/${SPACE}/members/${uid}`, { uid, role: "member" });
}

function checkInArgs(firestore, overrides = {}) {
  return {
    firestore,
    uid: "alice",
    spaceId: SPACE,
    weekKey: WEEK,
    weeklyFocus: null,
    now: NOW,
    ...overrides,
  };
}

describe("weeklyCheckIn", () => {
  it("creates the deterministic ${uid}_${weekKey} event with the full server shape", async () => {
    const { firestore, docs } = makeStore();
    seedMember(docs, "alice");
    const res = await weeklyCheckIn(
      checkInArgs(firestore, { weeklyFocus: "running" })
    );
    expect(res).toEqual({
      ok: true,
      eventId: `alice_${WEEK}`,
      duplicate: false,
      updated: false,
    });
    expect(docs.get(`goalSpaces/${SPACE}/events/alice_${WEEK}`)).toEqual({
      uid: "alice",
      kind: "weekly_check_in",
      text: null,
      weekKey: WEEK,
      weeklyFocus: "running",
      supporterIds: [],
      createdAt: NOW,
    });
  });

  it("re-submitting the same focus is a duplicate no-op (no write)", async () => {
    const { firestore, docs } = makeStore();
    seedMember(docs, "alice");
    await weeklyCheckIn(checkInArgs(firestore, { weeklyFocus: "strength" }));
    const before = docs.get(`goalSpaces/${SPACE}/events/alice_${WEEK}`);
    const res = await weeklyCheckIn(
      checkInArgs(firestore, { weeklyFocus: "strength" })
    );
    expect(res.duplicate).toBe(true);
    expect(res.updated).toBe(false);
    expect(docs.get(`goalSpaces/${SPACE}/events/alice_${WEEK}`)).toBe(before);
  });

  it("changing the focus updates weeklyFocus + updatedAt on the SAME event — createdAt and supporterIds preserved", async () => {
    const { firestore, docs } = makeStore();
    seedMember(docs, "alice");
    await weeklyCheckIn(checkInArgs(firestore, { weeklyFocus: "running" }));
    // A back landed between the set and the change.
    const path = `goalSpaces/${SPACE}/events/alice_${WEEK}`;
    docs.set(path, { ...docs.get(path), supporterIds: ["bob"] });

    const LATER = NOW + 60_000;
    const res = await weeklyCheckIn(
      checkInArgs(firestore, { weeklyFocus: "recovery", now: LATER })
    );
    expect(res).toEqual({
      ok: true,
      eventId: `alice_${WEEK}`,
      duplicate: false,
      updated: true,
    });
    const event = docs.get(path);
    expect(event.weeklyFocus).toBe("recovery");
    expect(event.updatedAt).toBe(LATER);
    expect(event.createdAt).toBe(NOW);
    expect(event.supporterIds).toEqual(["bob"]);
    // Still exactly ONE event — the change never appended a second.
    const events = [...docs.keys()].filter((p) => p.includes("/events/"));
    expect(events).toHaveLength(1);
  });

  it("a plain check-in (no focus) then a focus set is an update, not a duplicate", async () => {
    const store = makeStore();
    seedMember(store.docs, "alice");
    await weeklyCheckIn(checkInArgs(store.firestore, { weeklyFocus: null }));
    const res = await weeklyCheckIn(
      checkInArgs(store.firestore, { weeklyFocus: "nutrition" })
    );
    expect(res.updated).toBe(true);
  });

  it("rejects non-members", async () => {
    const { firestore } = makeStore();
    await expect(weeklyCheckIn(checkInArgs(firestore))).rejects.toMatchObject({
      code: "permission-denied",
    });
  });

  it("rejects malformed, unreal and out-of-window weekKeys", async () => {
    const { firestore, docs } = makeStore();
    seedMember(docs, "alice");
    for (const weekKey of [
      undefined,
      "not-a-date",
      "2026/07/12",
      "2026-13-40",
      "2020-01-05", // years out of window
    ]) {
      await expect(
        weeklyCheckIn(checkInArgs(firestore, { weekKey }))
      ).rejects.toMatchObject({ code: "invalid-argument" });
    }
  });

  it("rejects non-Sunday weekKeys — the deterministic ID is one per WEEK, not one per date", async () => {
    const { firestore, docs } = makeStore();
    seedMember(docs, "alice");
    // Every date in the window would otherwise mint its own
    // ${uid}_${weekKey} doc — ~20 "weekly" check-ins per real week
    // for a scripted client. localWeekKey always emits a Sunday.
    for (const weekKey of ["2026-07-13", "2026-07-14", "2026-07-18"]) {
      await expect(
        weeklyCheckIn(checkInArgs(firestore, { weekKey }))
      ).rejects.toMatchObject({ code: "invalid-argument" });
    }
    await expect(
      weeklyCheckIn(checkInArgs(firestore, { weekKey: "2026-07-12" }))
    ).resolves.toMatchObject({ ok: true });
  });

  it("rejects a focus outside the closed enum", async () => {
    const { firestore, docs } = makeStore();
    seedMember(docs, "alice");
    await expect(
      weeklyCheckIn(checkInArgs(firestore, { weeklyFocus: "calories" }))
    ).rejects.toMatchObject({ code: "invalid-argument" });
    expect(WEEKLY_FOCUS_VALUES).toEqual([
      "strength",
      "running",
      "nutrition",
      "progress",
      "recovery",
      "balanced",
    ]);
  });
});

describe("backWeeklyCheckIn", () => {
  async function seedCheckIn(store, authorUid = "alice") {
    seedMember(store.docs, authorUid);
    await weeklyCheckIn(
      checkInArgs(store.firestore, { uid: authorUid, weeklyFocus: "running" })
    );
    return `${authorUid}_${WEEK}`;
  }

  function backArgs(firestore, overrides = {}) {
    return {
      firestore,
      uid: "bob",
      spaceId: SPACE,
      eventId: `alice_${WEEK}`,
      ...overrides,
    };
  }

  it("appends the caller once and reports the author for the notification", async () => {
    const store = makeStore();
    const eventId = await seedCheckIn(store);
    seedMember(store.docs, "bob");
    const res = await backWeeklyCheckIn(backArgs(store.firestore));
    expect(res).toEqual({ alreadyBacked: false, authorUid: "alice" });
    expect(
      store.docs.get(`goalSpaces/${SPACE}/events/${eventId}`).supporterIds
    ).toEqual(["bob"]);
  });

  it("is idempotent — a second back is alreadyBacked with no duplicate entry", async () => {
    const store = makeStore();
    const eventId = await seedCheckIn(store);
    seedMember(store.docs, "bob");
    await backWeeklyCheckIn(backArgs(store.firestore));
    const res = await backWeeklyCheckIn(backArgs(store.firestore));
    expect(res.alreadyBacked).toBe(true);
    expect(
      store.docs.get(`goalSpaces/${SPACE}/events/${eventId}`).supporterIds
    ).toEqual(["bob"]);
  });

  it("rejects backing a check-in without a focus (incl. all pre-focus events)", async () => {
    const store = makeStore();
    seedMember(store.docs, "alice");
    seedMember(store.docs, "bob");
    await weeklyCheckIn(
      checkInArgs(store.firestore, { uid: "alice", weeklyFocus: null })
    );
    await expect(
      backWeeklyCheckIn(backArgs(store.firestore))
    ).rejects.toMatchObject({ code: "failed-precondition" });
    // Legacy auto-ID check-in written before the focus era — same rejection.
    store.docs.set(`goalSpaces/${SPACE}/events/legacy1`, {
      uid: "alice",
      kind: "weekly_check_in",
      text: null,
      weekKey: null,
      createdAt: NOW,
    });
    await expect(
      backWeeklyCheckIn(backArgs(store.firestore, { eventId: "legacy1" }))
    ).rejects.toMatchObject({ code: "failed-precondition" });
  });

  it("rejects backing your own focus", async () => {
    const store = makeStore();
    await seedCheckIn(store);
    await expect(
      backWeeklyCheckIn(backArgs(store.firestore, { uid: "alice" }))
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("rejects non-member callers", async () => {
    const store = makeStore();
    await seedCheckIn(store);
    await expect(
      backWeeklyCheckIn(backArgs(store.firestore, { uid: "stranger" }))
    ).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("rejects missing events and non-check-in kinds", async () => {
    const store = makeStore();
    seedMember(store.docs, "bob");
    await expect(
      backWeeklyCheckIn(backArgs(store.firestore, { eventId: "nope" }))
    ).rejects.toMatchObject({ code: "not-found" });
    store.docs.set(`goalSpaces/${SPACE}/events/m1`, {
      uid: "alice",
      kind: "milestone",
      createdAt: NOW,
    });
    await expect(
      backWeeklyCheckIn(backArgs(store.firestore, { eventId: "m1" }))
    ).rejects.toMatchObject({ code: "not-found" });
  });

  it("rejects when the author has left the circle (covers deleted accounts)", async () => {
    const store = makeStore();
    const eventId = await seedCheckIn(store);
    seedMember(store.docs, "bob");
    store.docs.delete(`goalSpaces/${SPACE}/members/alice`);
    await expect(
      backWeeklyCheckIn(backArgs(store.firestore, { eventId }))
    ).rejects.toMatchObject({ code: "failed-precondition" });
  });

  it("rejects blocked pairs in BOTH directions", async () => {
    for (const blockPath of [
      "blocks/bob/users/alice",
      "blocks/alice/users/bob",
    ]) {
      const store = makeStore();
      await seedCheckIn(store);
      seedMember(store.docs, "bob");
      store.docs.set(blockPath, { blocked: true });
      await expect(
        backWeeklyCheckIn(backArgs(store.firestore))
      ).rejects.toMatchObject({ code: "permission-denied" });
    }
  });

  it("enforces the defensive supporter bound", async () => {
    const store = makeStore();
    const eventId = await seedCheckIn(store);
    seedMember(store.docs, "bob");
    const path = `goalSpaces/${SPACE}/events/${eventId}`;
    store.docs.set(path, {
      ...store.docs.get(path),
      supporterIds: Array.from(
        { length: MAX_FOCUS_SUPPORTERS },
        (_, i) => `s${i}`
      ),
    });
    await expect(
      backWeeklyCheckIn(backArgs(store.firestore))
    ).rejects.toMatchObject({ code: "failed-precondition" });
  });

  it("throws the shared GoalSpaceError class so mapGoalSpaceError maps codes", async () => {
    const store = makeStore();
    await seedCheckIn(store);
    await expect(
      backWeeklyCheckIn(backArgs(store.firestore, { uid: "stranger" }))
    ).rejects.toBeInstanceOf(GoalSpaceError);
  });
});
