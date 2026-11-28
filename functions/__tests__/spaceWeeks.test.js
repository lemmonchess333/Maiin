/**
 * A Space's week in totals (Run27 call 11): `spaces/{id}/weeks/{weekKey}`
 * is counted from each member's credit, and each credit from that member's
 * saved sessions, every time, never incremented (lib/spaceWeeks.js).
 *
 * Driven through the in-memory Firestore, which applies the queries, the
 * aggregation and the transactions as Firestore does. Every date is derived
 * from the clock, so the suite means the same thing on any day and under
 * the +90-day run.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const { memoryFirestore } = require("./helpers/memoryFirestore.cjs");
const weeks = require("../lib/spaceWeeks");
const { weekKeyOf } = require("../lib/weekTally");
const ledger = require("../lib/accountDeletionLedger");

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.now();
/** Today, in UTC: the week the members below have no timezone for. */
const TODAY = new Date(NOW).toISOString().slice(0, 10);
const WEEK = weekKeyOf(TODAY);
const LAST_WEEK = weekKeyOf(new Date(NOW - 7 * DAY).toISOString().slice(0, 10));
const RUNNERS = "runners";
const LIFTERS = "lifters";
const MIN = weeks.SPACE_WEEK_MIN_MEMBERS;

const run = (date, distance = 5000) => ({ date, distance, duration: 1500 });
const lift = (date) => ({
  date,
  exercises: [{ name: "Squat", sets: [{ reps: 5, weightKg: 100 }] }],
  totalVolume: 500,
});
const uids = (n) => Array.from({ length: n }, (_, i) => `m${i}`);

/** `n` members of Runners, each with one 5 km run today. */
function runners(n, extra = {}) {
  const seed = {};
  for (const uid of uids(n)) {
    seed[`spaces/${RUNNERS}/members/${uid}`] = { uid };
    seed[`users/${uid}/runs/r1`] = run(TODAY);
  }
  return memoryFirestore({ ...seed, ...extra });
}

async function creditAll(db, list, now = NOW) {
  for (const uid of list)
    await weeks.refreshMemberWeeks(db, uid, [TODAY], { now });
}

const stored = (db, spaceId = RUNNERS, weekKey = WEEK) =>
  db.data.get(`spaces/${spaceId}/weeks/${weekKey}`);

describe("a member's credit", () => {
  it("is their week counted as the league counts it, in each Space they are in", async () => {
    const db = memoryFirestore({
      [`spaces/${RUNNERS}/members/ana`]: { uid: "ana" },
      [`spaces/${LIFTERS}/members/ana`]: { uid: "ana" },
      [`goalSpaces/circle/members/ana`]: { uid: "ana" },
      "users/ana/runs/r1": run(TODAY, 8000),
      "users/ana/runs/r2": run(TODAY, 30), // under the floor: not counted
      "users/ana/workouts/w1": lift(TODAY),
    });
    await weeks.refreshMemberWeeks(db, "ana", [TODAY], { now: NOW });
    for (const spaceId of [RUNNERS, LIFTERS]) {
      const credit = db.data.get(`users/ana/spaceWeeks/${spaceId}_${WEEK}`);
      expect(credit).toMatchObject({
        uid: "ana",
        spaceId,
        weekKey: WEEK,
        spaceWeek: `${spaceId}_${WEEK}`,
        sessions: 2,
        meters: 8000,
      });
    }
    // A Circle is not a Space.
    expect(
      [...db.data.keys()].filter((p) => p.includes("/spaceWeeks/")).length
    ).toBe(2);
  });

  it("is none for someone restricted, someone being deleted, or someone with no session that week", async () => {
    const db = memoryFirestore({
      [`spaces/${RUNNERS}/members/res`]: { uid: "res" },
      [`spaces/${RUNNERS}/members/del`]: { uid: "del" },
      [`spaces/${RUNNERS}/members/idle`]: { uid: "idle" },
      "users/res/runs/r1": run(TODAY),
      "users/del/runs/r1": run(TODAY),
      "globalRestrictedUids/res": { uid: "res" },
      "accountDeletionRequests/del": { status: ledger.STATUS.RUNNING },
    });
    for (const uid of ["res", "del", "idle"])
      await weeks.refreshMemberWeeks(db, uid, [TODAY], { now: NOW });
    expect(
      [...db.data.keys()].filter((p) => p.includes("/spaceWeeks/"))
    ).toEqual([]);
  });
});

describe("a Space's week", () => {
  it(`stores no figure while fewer than ${MIN} members trained`, async () => {
    const db = runners(MIN - 1);
    await creditAll(db, uids(MIN - 1));
    const week = stored(db);
    expect(week.quiet).toBe(true);
    // Nothing a client could read the small group's training from.
    expect(week).not.toHaveProperty("members");
    expect(week).not.toHaveProperty("meters");
    expect(week).not.toHaveProperty("sessions");
  });

  it(`stores the members, sessions and metres once ${MIN} trained`, async () => {
    const db = runners(MIN);
    await creditAll(db, uids(MIN));
    expect(stored(db)).toMatchObject({
      weekKey: WEEK,
      members: MIN,
      sessions: MIN,
      meters: MIN * 5000,
    });
    expect(stored(db).quiet).toBeUndefined();
  });

  it("is counted again from scratch: a figure written wrong is replaced, and a deleted run comes off", async () => {
    const db = runners(MIN + 1);
    await creditAll(db, uids(MIN + 1));
    // Whatever was stored, the next count reads the credits again.
    db.data.set(`spaces/${RUNNERS}/weeks/${WEEK}`, {
      weekKey: WEEK,
      members: 999,
      sessions: 999,
      meters: 1,
      updatedAt: new Date(NOW - DAY),
    });
    // m0 deletes their run; the session trigger reads their week again.
    db.data.delete("users/m0/runs/r1");
    await weeks.refreshMemberWeeks(db, "m0", [TODAY], { now: NOW });
    expect(stored(db)).toMatchObject({
      members: MIN,
      sessions: MIN,
      meters: MIN * 5000,
    });
    expect(db.data.has(`users/m0/spaceWeeks/${RUNNERS}_${WEEK}`)).toBe(false);
  });

  it("a second delivery stores the same figures without recounting unchanged credits", async () => {
    const db = runners(MIN);
    await creditAll(db, uids(MIN));
    const first = { ...stored(db) };
    const result = await weeks.refreshMemberWeeks(db, "m1", [TODAY], {
      now: NOW + 60_000,
    });
    expect(result).toEqual({ recounted: 0 });
    expect(stored(db)).toEqual(first);
  });

  it("an older count never replaces a newer one", async () => {
    const db = runners(MIN);
    await creditAll(db, uids(MIN));
    const later = new Date(Date.now() + 60 * DAY);
    db.data.set(`spaces/${RUNNERS}/weeks/${WEEK}`, {
      weekKey: WEEK,
      quiet: true,
      updatedAt: later,
    });
    const result = await weeks.recountSpaceWeek(db, RUNNERS, WEEK, {
      now: NOW,
    });
    expect(result.written).toBe(false);
    expect(stored(db).updatedAt).toEqual(later);
  });

  it("a session from last week moves last week, not this one", async () => {
    const lastWeekDay = LAST_WEEK; // its Monday
    const db = runners(MIN);
    for (const uid of uids(MIN))
      db.data.set(`users/${uid}/runs/old`, run(lastWeekDay, 3000));
    for (const uid of uids(MIN))
      await weeks.refreshMemberWeeks(db, uid, [lastWeekDay], { now: NOW });
    expect(stored(db, RUNNERS, LAST_WEEK)).toMatchObject({
      members: MIN,
      meters: MIN * 3000,
    });
    expect(stored(db)).toBeUndefined();
  });
});

describe("joining, leaving and restrictions", () => {
  it("leaving takes the member's credit out and the week is counted again", async () => {
    const db = runners(MIN);
    await creditAll(db, uids(MIN));
    db.data.delete(`spaces/${RUNNERS}/members/m0`);
    await weeks.syncMemberWeeks(db, RUNNERS, "m0", { now: NOW });
    expect(db.data.has(`users/m0/spaceWeeks/${RUNNERS}_${WEEK}`)).toBe(false);
    expect(stored(db).quiet).toBe(true);
  });

  it("joining counts the member's week at once", async () => {
    const db = runners(MIN - 1, {
      "users/new/runs/r1": run(TODAY, 10000),
    });
    await creditAll(db, uids(MIN - 1));
    expect(stored(db).quiet).toBe(true);
    db.data.set(`spaces/${RUNNERS}/members/new`, { uid: "new" });
    await weeks.syncMemberWeeks(db, RUNNERS, "new", { now: NOW });
    expect(stored(db)).toMatchObject({
      members: MIN,
      meters: (MIN - 1) * 5000 + 10000,
    });
  });

  it("a restriction takes the account out of every Space's week, and lifting it puts this week back", async () => {
    const db = runners(MIN);
    await creditAll(db, uids(MIN));
    db.data.set("globalRestrictedUids/m0", { uid: "m0" });
    await weeks.syncAuthorWeeks(db, "m0", { now: NOW });
    expect(db.data.has(`users/m0/spaceWeeks/${RUNNERS}_${WEEK}`)).toBe(false);
    expect(stored(db).quiet).toBe(true);

    db.data.delete("globalRestrictedUids/m0");
    await weeks.syncAuthorWeeks(db, "m0", { now: NOW });
    expect(stored(db)).toMatchObject({ members: MIN });
  });
});

describe("indexes", () => {
  const indexes = JSON.parse(
    readFileSync(
      new URL("../../firestore.indexes.json", import.meta.url),
      "utf8"
    )
  );

  it("the count's field and each summed field are indexed for the collection group", () => {
    // Production refuses the aggregation without them, and sums a field
    // only from an index that holds it; the emulator needs neither.
    const override = indexes.fieldOverrides.find(
      (o) => o.collectionGroup === weeks.CREDITS && o.fieldPath === "spaceWeek"
    );
    expect(
      override?.indexes.some(
        (i) => i.queryScope === "COLLECTION_GROUP" && i.order === "ASCENDING"
      )
    ).toBe(true);
    for (const summed of ["sessions", "meters"]) {
      expect(
        indexes.indexes.some(
          (i) =>
            i.collectionGroup === weeks.CREDITS &&
            i.queryScope === "COLLECTION_GROUP" &&
            i.fields.map((f) => f.fieldPath).join(",") === `spaceWeek,${summed}`
        ),
        summed
      ).toBe(true);
    }
  });
});
