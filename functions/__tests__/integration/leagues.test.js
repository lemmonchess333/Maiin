/**
 * Integration: weekly leagues (Soc15 call 3) through the real callable,
 * the real scheduled turn and the real session triggers, against the
 * emulator.
 *
 * What only the emulator shows: the date-range queries read inside each
 * transaction, the count aggregation behind the figure, the turn's
 * batches, and the Monday notification written through createNotification
 * under its switch. The weeks come from the clock: the turn reads the
 * UTC week it runs in, so last week's group is seeded a week before it.
 *
 * Gated on FIRESTORE_EMULATOR_HOST — skips in an ordinary unit run.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST;
const suite = EMULATOR_HOST ? describe : describe.skip;

let db;
let idx;
let admin;
const leagues = require("../../lib/leagues");
const { currentWeek } = require("../../lib/friendsBoard");

const DAY = 86400000;
const PREFIX = "league-it-";
const uidOf = (i) => `${PREFIX}${String(i).padStart(2, "0")}`;
const auth = (uid) => ({ auth: { uid, token: { email_verified: true } } });

/** The week the turn runs in (UTC), and the one before it. */
const THIS_WEEK = () => leagues.turnWeekKey(Date.now());
const LAST_WEEK = () =>
  new Date(Date.parse(`${THIS_WEEK()}T00:00:00Z`) - 7 * DAY)
    .toISOString()
    .slice(0, 10);
const dayOf = (key, i) =>
  new Date(Date.parse(`${key}T00:00:00Z`) + i * DAY).toISOString().slice(0, 10);

const THREE_LIFTS = Array.from({ length: 7 }, (_, d) => ({
  day: d,
  type: [1, 3, 5].includes(d) ? "lift" : "rest",
}));

const lift = (date) => ({
  date,
  exercises: [{ name: "Squat", sets: [{ reps: 5, weightKg: 100 }] }],
  totalVolume: 500,
});

beforeAll(() => {
  if (!EMULATOR_HOST) return;
  idx = require("../../index");
  admin = require("../../lib/adminSdk");
  db = admin.firestore();
});

/** Everything this file writes, gone. */
async function wipe() {
  const users = await db
    .collection("users")
    .where("leagueOptIn", "in", [true, false])
    .get();
  for (const d of users.docs) await db.recursiveDelete(d.ref);
  for (let i = 0; i < 16; i++) {
    const uid = uidOf(i);
    await db.recursiveDelete(db.doc(`users/${uid}`));
    await db.recursiveDelete(db.doc(`notifications/${uid}`));
    await db.doc(`leagueMembers/${uid}`).delete();
    await db.doc(`globalRestrictedUids/${uid}`).delete();
  }
  const groups = await db.collection("leagueGroups").get();
  for (const g of groups.docs) await db.recursiveDelete(g.ref);
  const weeks = await db.collection("leagueWeeks").get();
  for (const w of weeks.docs) await w.ref.delete();
  await db.doc("leagueStatus/current").delete();
}

/** `n` people who joined and trained this fortnight, through the callable. */
async function joinedPeople(n) {
  for (let i = 0; i < n; i++) {
    const uid = uidOf(i);
    await db.doc(`users/${uid}`).set({
      weekSchedule: THREE_LIFTS,
      lastActiveAt: admin.firestore.Timestamp.fromMillis(Date.now() - DAY),
    });
    await db.doc(`users/${uid}/public/profile`).set({
      displayName: `Person${i} Surname`,
    });
    await idx.setLeagueSharing.run({ join: true }, auth(uid));
  }
}

suite("weekly leagues", () => {
  beforeEach(async () => {
    await wipe();
  });

  it("joining stores the answer and a Bronze membership, and the figure counts it", async () => {
    await joinedPeople(3);
    expect((await db.doc(`users/${uidOf(0)}`).get()).data().leagueOptIn).toBe(
      true
    );
    expect(
      (await db.doc(`leagueMembers/${uidOf(0)}`).get()).data()
    ).toMatchObject({
      tier: "bronze",
      groupId: null,
    });
    expect((await db.doc("leagueStatus/current").get()).data()).toMatchObject({
      joined: 3,
      needed: 10,
    });
  });

  it("a restricted account cannot join, and can always leave", async () => {
    const uid = uidOf(0);
    await db.doc(`users/${uid}`).set({ lastActiveAt: new Date() });
    await db
      .doc(`globalRestrictedUids/${uid}`)
      .set({ restrictedAt: new Date() });
    await expect(
      idx.setLeagueSharing.run({ join: true }, auth(uid))
    ).rejects.toMatchObject({ code: "permission-denied" });
    expect((await db.doc(`leagueMembers/${uid}`).get()).exists).toBe(false);
    await idx.setLeagueSharing.run({ join: false }, auth(uid));
    expect((await db.doc(`users/${uid}`).get()).data().leagueOptIn).toBe(false);
  });

  it("the answer must be yes or no, and signed in", async () => {
    await expect(
      idx.setLeagueSharing.run({ join: "yes" }, auth(uidOf(0)))
    ).rejects.toMatchObject({ code: "invalid-argument" });
    await expect(
      idx.setLeagueSharing.run({ join: true }, {})
    ).rejects.toMatchObject({ code: "unauthenticated" });
  });

  it("the turn settles last week, forms this week, notifies once, and a second run does nothing twice", async () => {
    await joinedPeople(12);
    const last = LAST_WEEK();
    // Last week's group of the first ten: person 0 did all three lifts,
    // person 9 nothing.
    const memberUids = Array.from({ length: 10 }, (_, i) => uidOf(i));
    await db.doc("leagueGroups/last-week-001").set({
      weekKey: last,
      tier: "bronze",
      memberUids,
      size: 10,
    });
    for (let i = 0; i < 10; i++) {
      const uid = uidOf(i);
      const done = i === 0 ? 3 : i === 9 ? 0 : 1;
      for (let s = 0; s < done; s++)
        await db.doc(`users/${uid}/workouts/w${s}`).set(lift(dayOf(last, s)));
      await db
        .doc(`leagueMembers/${uid}`)
        .set(
          { tier: "bronze", groupId: "last-week-001", weekKey: last },
          { merge: true }
        );
      await db.doc(`leagueGroups/last-week-001/standings/${uid}`).set({
        uid,
        name: `Person${i}`,
        tier: "bronze",
        done: 0,
        planned: 3,
        points: 0,
        reachedAt: new Date(Date.now() - DAY + i),
      });
    }

    await idx.weeklyLeagueTurn.run({});

    // Settled from the sessions, not the stale standings.
    expect(
      (await db.doc(`users/${uidOf(0)}/leagueResults/${last}`).get()).data()
    ).toMatchObject({
      tier: "bronze",
      newTier: "silver",
      rank: 1,
      of: 10,
      points: 100,
      outcome: "up",
    });
    expect(
      (await db.doc(`users/${uidOf(9)}/leagueResults/${last}`).get()).data()
    ).toMatchObject({ points: 0, outcome: "stay", newTier: "bronze" });
    expect((await db.doc("leagueGroups/last-week-001").get()).exists).toBe(
      false
    );
    const note = await db
      .doc(`notifications/${uidOf(0)}/items/league-${last}`)
      .get();
    expect(note.data()).toMatchObject({
      type: "league_result",
      message: "You moved up to Silver",
    });
    expect(note.data().fromUserId).toBeUndefined();

    // This week: twelve people, the promoted one in Silver.
    const groups = await db
      .collection("leagueGroups")
      .where("weekKey", "==", THIS_WEEK())
      .get();
    expect(groups.docs.map((g) => g.data().size).sort()).toEqual([12]);
    const member = (await db.doc(`leagueMembers/${uidOf(0)}`).get()).data();
    expect(member).toMatchObject({ tier: "silver", weekKey: THIS_WEEK() });
    const standing = (
      await db.doc(`leagueGroups/${member.groupId}/standings/${uidOf(0)}`).get()
    ).data();
    expect(standing).toMatchObject({
      uid: uidOf(0),
      name: "Person0",
      tier: "silver",
      planned: 3,
    });
    expect((await db.doc("leagueStatus/current").get()).data()).toMatchObject({
      joined: 12,
      open: true,
      weekKey: THIS_WEEK(),
    });

    // Again: nothing twice.
    await idx.weeklyLeagueTurn.run({});
    const again = await db
      .collection("leagueGroups")
      .where("weekKey", "==", THIS_WEEK())
      .get();
    expect(again.docs.map((g) => g.id)).toEqual(groups.docs.map((g) => g.id));
    expect((await db.doc(`leagueMembers/${uidOf(0)}`).get()).data().tier).toBe(
      "silver"
    );
    const notes = await db.collection(`notifications/${uidOf(0)}/items`).get();
    expect(notes.docs.map((d) => d.id)).toEqual([`league-${last}`]);
  });

  it("the Leagues switch off writes no notification", async () => {
    await joinedPeople(10);
    const last = LAST_WEEK();
    const memberUids = Array.from({ length: 10 }, (_, i) => uidOf(i));
    await db.doc("leagueGroups/last-week-001").set({
      weekKey: last,
      tier: "bronze",
      memberUids,
      size: 10,
    });
    for (const uid of memberUids) {
      await db
        .doc(`leagueMembers/${uid}`)
        .set(
          { tier: "bronze", groupId: "last-week-001", weekKey: last },
          { merge: true }
        );
      await db.doc(`leagueGroups/last-week-001/standings/${uid}`).set({
        uid,
        tier: "bronze",
        done: 0,
        planned: 3,
        points: 0,
      });
    }
    await db
      .doc(`users/${uidOf(0)}`)
      .set({ notificationPreferences: { leagues: false } }, { merge: true });
    await idx.weeklyLeagueTurn.run({});
    expect(
      (await db.doc(`users/${uidOf(0)}/leagueResults/${last}`).get()).exists
    ).toBe(true);
    expect(
      (await db.doc(`notifications/${uidOf(0)}/items/league-${last}`).get())
        .exists
    ).toBe(false);
    expect(
      (await db.doc(`notifications/${uidOf(1)}/items/league-${last}`).get())
        .exists
    ).toBe(true);
  });

  it("the session triggers keep a standing current, both ways", async () => {
    await joinedPeople(10);
    await idx.weeklyLeagueTurn.run({});
    const uid = uidOf(3);
    const { groupId, weekKey } = (
      await db.doc(`leagueMembers/${uid}`).get()
    ).data();
    expect(weekKey).toBe(THIS_WEEK());
    const standing = () =>
      db.doc(`leagueGroups/${groupId}/standings/${uid}`).get();
    expect((await standing()).data()).toMatchObject({ done: 0, points: 0 });

    // A lift today, in the member's own week (no timezone: UTC).
    const today = new Date().toISOString().slice(0, 10);
    expect(currentWeek(null).weekKey).toBe(weekKey);
    const ref = db.doc(`users/${uid}/workouts/today`);
    await ref.set(lift(today));
    const snap = await ref.get();
    const context = { params: { uid, workoutId: "today" } };
    await idx.onWorkoutCreated.run(snap, context);
    expect((await standing()).data()).toMatchObject({
      done: 1,
      planned: 3,
      points: 33,
    });

    await ref.delete();
    await idx.onWorkoutDeleted.run(snap, context);
    expect((await standing()).data()).toMatchObject({ done: 0, points: 0 });
  });

  it("leaving takes the standing and the place at once", async () => {
    await joinedPeople(10);
    await idx.weeklyLeagueTurn.run({});
    const uid = uidOf(5);
    const { groupId } = (await db.doc(`leagueMembers/${uid}`).get()).data();
    await idx.setLeagueSharing.run({ join: false }, auth(uid));
    expect(
      (await db.doc(`leagueGroups/${groupId}/standings/${uid}`).get()).exists
    ).toBe(false);
    const group = (await db.doc(`leagueGroups/${groupId}`).get()).data();
    expect(group.memberUids).not.toContain(uid);
    expect(group.size).toBe(9);
    expect((await db.doc(`leagueMembers/${uid}`).get()).exists).toBe(false);
  });

  it("fewer than ten forms nothing, and the figure says how many", async () => {
    await joinedPeople(4);
    await idx.weeklyLeagueTurn.run({});
    expect((await db.doc("leagueStatus/current").get()).data()).toMatchObject({
      joined: 4,
      open: false,
      weekKey: null,
    });
    expect(
      (
        await db
          .collection("leagueGroups")
          .where("weekKey", "==", THIS_WEEK())
          .get()
      ).empty
    ).toBe(true);
  });
});
