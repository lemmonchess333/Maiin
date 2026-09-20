/**
 * CIRCLE-TARGET-LIFECYCLE / CONTINUATION — resolveTarget pins.
 *
 * Same in-memory firestore stub as goalSpaceCheckIn.test.js. Pins:
 * owner-only, the active-Circle precondition, continue's future-date
 * validation (rejects past/today/malformed), that continue rewrites
 * ONLY targetDate (active untouched), and that wrap sets
 * active:false + endedAt without touching targetDate.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { resolveTarget, RESOLVE_ACTIONS } = require("../lib/goalSpaceLifecycle");
const { GoalSpaceError } = require("../lib/goalSpaceMembership");

function makeStore() {
  const docs = new Map();
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

const SPACE = "space-1";
const NOW = Date.parse("2026-07-15T12:00:00Z"); // today (UTC) = 2026-07-15

function seedSpace(docs, overrides = {}) {
  docs.set(`goalSpaces/${SPACE}`, {
    id: SPACE,
    ownerId: "alice",
    active: true,
    targetDate: "2026-07-10", // already passed
    ...overrides,
  });
}

function args(firestore, overrides = {}) {
  return {
    firestore,
    uid: "alice",
    spaceId: SPACE,
    action: "continue",
    newTargetDate: "2026-09-01",
    now: NOW,
    ...overrides,
  };
}

async function expectRejected(fn, code) {
  let thrown;
  try {
    await fn();
  } catch (e) {
    thrown = e;
  }
  expect(thrown).toBeInstanceOf(GoalSpaceError);
  if (code) expect(thrown.code).toBe(code);
  return thrown;
}

describe("resolveTarget — continue", () => {
  it("rewrites ONLY targetDate; active + ownerId untouched", async () => {
    const { firestore, docs } = makeStore();
    seedSpace(docs);
    const res = await resolveTarget(args(firestore));
    expect(res).toEqual({
      ok: true,
      action: "continue",
      targetDate: "2026-09-01",
    });
    const space = docs.get(`goalSpaces/${SPACE}`);
    expect(space.targetDate).toBe("2026-09-01");
    expect(space.active).toBe(true);
    expect(space.ownerId).toBe("alice");
    expect("endedAt" in space).toBe(false);
  });

  it("can set a targetDate on a Circle that never had one", async () => {
    const { firestore, docs } = makeStore();
    seedSpace(docs, { targetDate: null });
    const res = await resolveTarget(args(firestore));
    expect(res.targetDate).toBe("2026-09-01");
    expect(docs.get(`goalSpaces/${SPACE}`).targetDate).toBe("2026-09-01");
  });

  it("rejects a past / today / malformed newTargetDate", async () => {
    const { firestore, docs } = makeStore();
    seedSpace(docs);
    await expectRejected(
      () => resolveTarget(args(firestore, { newTargetDate: "2026-07-01" })),
      "invalid-argument"
    );
    // Today (UTC) is not "in the future".
    await expectRejected(
      () => resolveTarget(args(firestore, { newTargetDate: "2026-07-15" })),
      "invalid-argument"
    );
    await expectRejected(
      () => resolveTarget(args(firestore, { newTargetDate: "07/01/2026" })),
      "invalid-argument"
    );
    await expectRejected(
      () => resolveTarget(args(firestore, { newTargetDate: undefined })),
      "invalid-argument"
    );
    // The bad-date guard runs before any write.
    expect(docs.get(`goalSpaces/${SPACE}`).targetDate).toBe("2026-07-10");
  });

  it("rejects a date that matches YYYY-MM-DD but is not a real day", async () => {
    /* The case the four rejections above cannot reach, and the one that was
       live: each of those fails on SHAPE or on being in the past, so the
       existence of the day was never asserted. `2026-09-31` and `2026-02-30`
       are well-formed, in the future, and do not exist — JS rolls them over
       to 1 October and 2 March rather than refusing, so the old
       `Number.isFinite(Date.parse(...))` check passed them and the literal
       string was stored as the Circle's finish line.

       `2026-13-01` and `2026-00-10` are the out-of-range MONTH cases the old
       check did catch; they are here so a regression that reinstates it
       fails on the day cases alone rather than going quietly green. */
    const { firestore, docs } = makeStore();
    seedSpace(docs);
    for (const bad of [
      "2026-09-31",
      "2026-02-30",
      "2026-13-01",
      "2026-00-10",
    ]) {
      await expectRejected(
        () => resolveTarget(args(firestore, { newTargetDate: bad })),
        "invalid-argument"
      );
    }
    expect(docs.get(`goalSpaces/${SPACE}`).targetDate).toBe("2026-07-10");
  });

  it("still accepts a real leap day", async () => {
    // The other side of the same guard: 29 February EXISTS in 2028, and a
    // rejection rule written as "day > 28 in February" would break it.
    const { firestore, docs } = makeStore();
    seedSpace(docs);
    const res = await resolveTarget(
      args(firestore, { newTargetDate: "2028-02-29" })
    );
    expect(res.targetDate).toBe("2028-02-29");
    expect(docs.get(`goalSpaces/${SPACE}`).targetDate).toBe("2028-02-29");
  });
});

describe("resolveTarget — wrap", () => {
  it("sets active:false + endedAt, leaves targetDate intact", async () => {
    const { firestore, docs } = makeStore();
    seedSpace(docs);
    const res = await resolveTarget(
      args(firestore, { action: "wrap", newTargetDate: undefined })
    );
    expect(res).toEqual({
      ok: true,
      action: "wrap",
      targetDate: "2026-07-10",
    });
    const space = docs.get(`goalSpaces/${SPACE}`);
    expect(space.active).toBe(false);
    expect(space.endedAt).toBe(NOW);
    expect(space.targetDate).toBe("2026-07-10");
  });

  it("does NOT require a newTargetDate", async () => {
    const { firestore, docs } = makeStore();
    seedSpace(docs);
    const res = await resolveTarget({
      firestore,
      uid: "alice",
      spaceId: SPACE,
      action: "wrap",
      now: NOW,
    });
    expect(res.ok).toBe(true);
  });
});

describe("resolveTarget — guards", () => {
  it("rejects a non-owner", async () => {
    const { firestore, docs } = makeStore();
    seedSpace(docs);
    await expectRejected(
      () => resolveTarget(args(firestore, { uid: "bob" })),
      "permission-denied"
    );
    expect(docs.get(`goalSpaces/${SPACE}`).targetDate).toBe("2026-07-10");
  });

  it("rejects an already-ended (inactive) Circle", async () => {
    const { firestore, docs } = makeStore();
    seedSpace(docs, { active: false });
    await expectRejected(
      () => resolveTarget(args(firestore)),
      "failed-precondition"
    );
  });

  it("rejects a missing Circle", async () => {
    const { firestore } = makeStore();
    await expectRejected(() => resolveTarget(args(firestore)), "not-found");
  });

  it("rejects an unknown action / empty spaceId", async () => {
    const { firestore, docs } = makeStore();
    seedSpace(docs);
    await expectRejected(
      () => resolveTarget(args(firestore, { action: "delete" })),
      "invalid-argument"
    );
    await expectRejected(
      () => resolveTarget(args(firestore, { spaceId: "" })),
      "invalid-argument"
    );
  });

  it("exposes the closed action set", () => {
    expect(RESOLVE_ACTIONS).toEqual(["continue", "wrap"]);
  });
});
