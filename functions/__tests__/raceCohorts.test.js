/**
 * Plan groups (Soc15): `raceCohorts/{spaceId}` is how many people are
 * training for a race, recounted from the race goals bound to its space,
 * never incremented (lib/raceCohorts.js).
 *
 * Driven through the in-memory Firestore, which applies the count's two
 * filters and the transaction as Firestore does. The emulator suite
 * (integration/raceCohorts.test.js) drives the real write path: the plan
 * callable, the trigger on the user document, and account deletion.
 *
 * Every date is derived from the clock, so the suite means the same thing
 * on any day and under the +90-day run.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { memoryFirestore } = require("./helpers/memoryFirestore.cjs");
const {
  cohortOf,
  spacesToRecount,
  cutoffKey,
  millisOf,
  shouldStoreCount,
  recountRaceCohort,
  upcomingRaceSpaceIds,
  sweepRaceCohorts,
} = require("../lib/raceCohorts");

const DAY = 24 * 60 * 60 * 1000;
const MANCHESTER = "manchester-marathon";
const LONDON = "london-marathon";
const BERLIN = "berlin-marathon";

/** A UTC date key `days` from now (negative is past). */
const dayKey = (days) =>
  new Date(Date.now() + days * DAY).toISOString().slice(0, 10);

const goal = (spaceId, days = 70, extra = {}) => ({
  distance: "marathon",
  targetDate: dayKey(days),
  eventSpaceId: spaceId,
  ...extra,
});

const quiet = { warn() {}, error() {}, info() {} };

let db;

beforeEach(() => {
  db = memoryFirestore();
});

afterEach(() => {
  delete process.env.DISCOVERY_HIDDEN_UIDS;
});

const stored = (spaceId) => db.data.get(`raceCohorts/${spaceId}`);
const setUser = (uid, data) => db.data.set(`users/${uid}`, data);

/** A write to users/{uid} and the recount the trigger makes for it. */
async function writeUser(uid, next) {
  const before = db.data.get(`users/${uid}`) ?? null;
  if (next === null) db.data.delete(`users/${uid}`);
  else db.data.set(`users/${uid}`, next);
  const spaceIds = spacesToRecount(before, next);
  for (const spaceId of spaceIds) await recountRaceCohort(db, spaceId);
  return spaceIds;
}

describe("cohortOf", () => {
  it("places a goal bound to a known space on its race day", () => {
    const g = goal(MANCHESTER);
    expect(cohortOf({ raceGoal: g })).toEqual({
      spaceId: MANCHESTER,
      targetDate: g.targetDate,
    });
  });

  it("places nobody without a bound goal", () => {
    expect(cohortOf(null)).toBeNull();
    expect(cohortOf({})).toBeNull();
    expect(cohortOf({ raceGoal: null })).toBeNull();
    // A goal entered by hand, or run on your own, names no race space.
    expect(
      cohortOf({ raceGoal: { distance: "10k", targetDate: dayKey(30) } })
    ).toBeNull();
    // An id the app does not know is never a document id here.
    expect(cohortOf({ raceGoal: goal("not-a-space") })).toBeNull();
    expect(cohortOf({ raceGoal: goal("a/b") })).toBeNull();
  });
});

describe("spacesToRecount — the trigger's question", () => {
  const user = (raceGoal) => ({ displayName: "Sam", raceGoal });

  it("set: the new space", () => {
    expect(spacesToRecount(user(null), user(goal(MANCHESTER)))).toEqual([
      MANCHESTER,
    ]);
    // A user document created with the goal (setup).
    expect(spacesToRecount(null, user(goal(MANCHESTER)))).toEqual([MANCHESTER]);
  });

  it("change: the old space and the new one", () => {
    expect(spacesToRecount(user(goal(MANCHESTER)), user(goal(LONDON)))).toEqual(
      [MANCHESTER, LONDON]
    );
  });

  it("clear, and the document deleted with its account: the old space", () => {
    expect(spacesToRecount(user(goal(MANCHESTER)), user(null))).toEqual([
      MANCHESTER,
    ]);
    expect(spacesToRecount(user(goal(MANCHESTER)), null)).toEqual([MANCHESTER]);
  });

  it("the same race picked again for its next edition: that space once", () => {
    expect(
      spacesToRecount(user(goal(MANCHESTER, -300)), user(goal(MANCHESTER, 60)))
    ).toEqual([MANCHESTER]);
  });

  it("any other write to the document: nothing", () => {
    const g = goal(MANCHESTER);
    expect(
      spacesToRecount(
        { ...user(g), lastActiveAt: 1 },
        { ...user({ ...g, targetTimeS: 14400 }), lastActiveAt: 2 }
      )
    ).toEqual([]);
    expect(spacesToRecount(user(null), user(null))).toEqual([]);
    expect(spacesToRecount(null, null)).toEqual([]);
  });
});

describe("recountRaceCohort", () => {
  it("counts every goal bound to the space whose race is ahead, and nobody else", async () => {
    setUser("a", { raceGoal: goal(MANCHESTER) });
    setUser("b", { raceGoal: goal(MANCHESTER) });
    // A restricted account and one on the discovery-hidden list are counted
    // as anyone is: the count names no one.
    setUser("restricted", { raceGoal: goal(MANCHESTER) });
    db.data.set("globalRestrictedUids/restricted", { restrictedAt: 1 });
    setUser("demo", { raceGoal: goal(MANCHESTER) });
    process.env.DISCOVERY_HIDDEN_UIDS = "demo";
    // Last edition's goal, still bound through its recovery weeks.
    setUser("last-year", { raceGoal: goal(MANCHESTER, -20) });
    setUser("london", { raceGoal: goal(LONDON) });
    setUser("unbound", {
      raceGoal: { distance: "marathon", targetDate: dayKey(70) },
    });
    setUser("none", { displayName: "No goal" });

    const result = await recountRaceCohort(db, MANCHESTER);

    expect(result).toEqual({ spaceId: MANCHESTER, count: 4, written: true });
    expect(stored(MANCHESTER)).toEqual({
      count: 4,
      updatedAt: expect.any(Date),
    });
    expect(Object.keys(stored(MANCHESTER)).sort()).toEqual([
      "count",
      "updatedAt",
    ]);
  });

  it("counts a race on its own day, and drops it the day after in UTC", async () => {
    setUser("today", { raceGoal: goal(MANCHESTER, 0) });
    setUser("yesterday", { raceGoal: goal(MANCHESTER, -1) });
    setUser("before", { raceGoal: goal(MANCHESTER, -2) });
    // Yesterday in UTC is still race day somewhere west of it.
    expect((await recountRaceCohort(db, MANCHESTER)).count).toBe(2);
  });

  it("stores zero for a race nobody is training for", async () => {
    await recountRaceCohort(db, BERLIN);
    expect(stored(BERLIN).count).toBe(0);
  });

  it("writes nothing for a space the app does not know", async () => {
    expect(await recountRaceCohort(db, "not-a-space")).toEqual({
      spaceId: "not-a-space",
      count: 0,
      written: false,
    });
    expect(db.operations).toEqual([]);
  });

  it("is idempotent: counting again stores the same number", async () => {
    setUser("a", { raceGoal: goal(MANCHESTER) });
    setUser("b", { raceGoal: goal(MANCHESTER) });
    await recountRaceCohort(db, MANCHESTER);
    await recountRaceCohort(db, MANCHESTER);
    await recountRaceCohort(db, MANCHESTER);
    expect(stored(MANCHESTER).count).toBe(2);
  });

  it("never lets an older count replace a newer one", async () => {
    setUser("a", { raceGoal: goal(MANCHESTER) });
    // A count read a minute from now is already stored: this one, read
    // earlier, finished last.
    const later = new Date(Date.now() + 60_000);
    db.data.set(`raceCohorts/${MANCHESTER}`, { count: 7, updatedAt: later });
    const result = await recountRaceCohort(db, MANCHESTER);
    expect(result.written).toBe(false);
    expect(stored(MANCHESTER)).toEqual({ count: 7, updatedAt: later });

    // One stored from an earlier read is replaced.
    db.data.set(`raceCohorts/${MANCHESTER}`, {
      count: 7,
      updatedAt: new Date(Date.now() - 60_000),
    });
    expect((await recountRaceCohort(db, MANCHESTER)).written).toBe(true);
    expect(stored(MANCHESTER).count).toBe(1);
  });
});

describe("the recount on each kind of goal write", () => {
  beforeEach(() => {
    setUser("b", { raceGoal: goal(MANCHESTER) });
    setUser("c", { raceGoal: goal(MANCHESTER) });
    setUser("d", { raceGoal: goal(LONDON) });
  });

  it("set: the new space counts the person", async () => {
    setUser("a", { displayName: "Sam" });
    expect(await writeUser("a", { raceGoal: goal(MANCHESTER) })).toEqual([
      MANCHESTER,
    ]);
    expect(stored(MANCHESTER).count).toBe(3);
  });

  it("change: the old space and the new one are both recounted", async () => {
    setUser("a", { raceGoal: goal(MANCHESTER) });
    await recountRaceCohort(db, MANCHESTER);
    await recountRaceCohort(db, LONDON);
    expect([stored(MANCHESTER).count, stored(LONDON).count]).toEqual([3, 1]);

    await writeUser("a", { raceGoal: goal(LONDON) });
    expect([stored(MANCHESTER).count, stored(LONDON).count]).toEqual([2, 2]);
  });

  it("clear: the old space no longer counts the person", async () => {
    setUser("a", { raceGoal: goal(MANCHESTER) });
    await recountRaceCohort(db, MANCHESTER);
    await writeUser("a", { raceGoal: null, runMode: "freeform" });
    expect(stored(MANCHESTER).count).toBe(2);
  });

  it("a deleted account stops counting, and its space is recounted at once", async () => {
    setUser("a", { raceGoal: goal(MANCHESTER) });
    await recountRaceCohort(db, MANCHESTER);
    expect(stored(MANCHESTER).count).toBe(3);
    expect(await writeUser("a", null)).toEqual([MANCHESTER]);
    expect(stored(MANCHESTER).count).toBe(2);
  });

  it("a write delivered twice stores the same counts", async () => {
    setUser("a", { raceGoal: goal(MANCHESTER) });
    const before = db.data.get("users/a");
    const after = { raceGoal: goal(LONDON) };
    await writeUser("a", after);
    // The same event again: the same before and after.
    for (const spaceId of spacesToRecount(before, after))
      await recountRaceCohort(db, spaceId);
    expect([stored(MANCHESTER).count, stored(LONDON).count]).toEqual([2, 2]);
  });

  it("a write that leaves the goal alone recounts nothing", async () => {
    const g = goal(MANCHESTER);
    setUser("a", { raceGoal: g, lastActiveAt: 1 });
    expect(await writeUser("a", { raceGoal: g, lastActiveAt: 2 })).toEqual([]);
    expect(db.operations).toEqual([]);
    expect(stored(MANCHESTER)).toBeUndefined();
  });
});

describe("the nightly recount", () => {
  const event = (days) => ({ dateKey: dayKey(days), city: "x" });

  beforeEach(() => {
    setUser("a", { raceGoal: goal(MANCHESTER) });
    setUser("b", { raceGoal: goal(LONDON, 1) });
    setUser("c", { raceGoal: goal(BERLIN, -10) });
  });

  it("recounts every race still ahead and skips the races already past", async () => {
    db.data.set("config/raceEvents", {
      events: {
        [MANCHESTER]: event(70),
        [LONDON]: event(1),
        // Raced ten days ago: nobody is shown its group, so it is left.
        [BERLIN]: event(-10),
        // Not a space the app knows, and a date that is not one.
        "not-a-space": event(30),
        "chicago-marathon": { dateKey: "soon" },
      },
    });

    const summary = await sweepRaceCohorts(db, { log: quiet });

    expect(summary).toEqual({ races: 2, recounted: 2, catalogue: true });
    expect(stored(MANCHESTER).count).toBe(1);
    expect(stored(LONDON).count).toBe(1);
    expect(stored(BERLIN)).toBeUndefined();
    expect(stored("not-a-space")).toBeUndefined();
    expect(stored("chicago-marathon")).toBeUndefined();
  });

  it("puts a count right that a lost trigger left wrong, and is idempotent", async () => {
    db.data.set("config/raceEvents", { events: { [MANCHESTER]: event(70) } });
    db.data.set(`raceCohorts/${MANCHESTER}`, {
      count: 40,
      updatedAt: new Date(Date.now() - DAY),
    });
    await sweepRaceCohorts(db, { log: quiet });
    await sweepRaceCohorts(db, { log: quiet });
    expect(stored(MANCHESTER).count).toBe(1);
  });

  it("still counts a race on the day after it in UTC, not two days after", () => {
    expect(
      upcomingRaceSpaceIds(
        { [MANCHESTER]: event(-1), [LONDON]: event(-2), [BERLIN]: event(0) },
        Date.now()
      )
    ).toEqual([BERLIN, MANCHESTER]);
  });

  it("recounts nothing without the race catalogue", async () => {
    expect(await sweepRaceCohorts(db, { log: quiet })).toEqual({
      races: 0,
      recounted: 0,
      catalogue: false,
    });
    expect(db.operations).toEqual([]);
  });

  it("tries every race, then fails the run when one failed", async () => {
    db.data.set("config/raceEvents", {
      events: { [LONDON]: event(1), [MANCHESTER]: event(70) },
    });
    db.failures.set(`set:raceCohorts/${LONDON}`, new Error("contended"));
    await expect(sweepRaceCohorts(db, { log: quiet })).rejects.toThrow(
      `1 of 2 races failed (${LONDON})`
    );
    expect(stored(MANCHESTER).count).toBe(1);
  });

  it("ignores a catalogue that is not a map of races", () => {
    expect(upcomingRaceSpaceIds(null, Date.now())).toEqual([]);
    expect(upcomingRaceSpaceIds([event(3)], Date.now())).toEqual([]);
    expect(upcomingRaceSpaceIds({ [MANCHESTER]: null }, Date.now())).toEqual(
      []
    );
  });
});

describe("the ordering rule and its times", () => {
  it("writes a newer or equal read, and drops an older one", () => {
    const t = Date.now();
    expect(shouldStoreCount(t, 0)).toBe(true);
    expect(shouldStoreCount(t + 1, t)).toBe(true);
    expect(shouldStoreCount(t, t)).toBe(true);
    expect(shouldStoreCount(t, t + 1)).toBe(false);
    expect(shouldStoreCount(0, t)).toBe(true);
  });

  it("reads a Timestamp, a Date and a number alike", () => {
    const t = Date.now();
    expect(millisOf({ toMillis: () => t })).toBe(t);
    expect(millisOf(new Date(t))).toBe(t);
    expect(millisOf(t)).toBe(t);
    expect(millisOf(undefined)).toBe(0);
    expect(millisOf("soon")).toBe(0);
    expect(millisOf(NaN)).toBe(0);
  });

  it("dates the cutoff to yesterday in UTC", () => {
    const now = Date.now();
    expect(cutoffKey(now)).toBe(new Date(now - DAY).toISOString().slice(0, 10));
  });
});

describe("the count's index", () => {
  it("is declared, since the emulator serves the query without it and production refuses it", () => {
    const { indexes } = require("../../firestore.indexes.json");
    expect(indexes).toContainEqual({
      collectionGroup: "users",
      queryScope: "COLLECTION",
      fields: [
        { fieldPath: "raceGoal.eventSpaceId", order: "ASCENDING" },
        { fieldPath: "raceGoal.targetDate", order: "ASCENDING" },
      ],
    });
  });
});
