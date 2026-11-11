/**
 * Integration: a race's plan-group count follows the real write path.
 *
 * A person's race goal is written by the plan callable (`configurePlan`),
 * and the user document's trigger (`onRaceGoalWritten`) recounts the race
 * it left and the race it joined (lib/raceCohorts.js). Account deletion
 * removes the document, and the same trigger recounts its race. Driven
 * against the emulator, because the count is a real count aggregation with
 * two filters, and its read time orders the writes.
 *
 * This job runs no Functions emulator, so each trigger is delivered here
 * with the document as it was before the write and as it is after. It runs
 * no Storage emulator either: deletion's Storage calls are stubbed, as in
 * activityFeedRemoval.test.js.
 *
 * Every date is derived from the clock. Gated on FIRESTORE_EMULATOR_HOST.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST;
const suite = EMULATOR_HOST ? describe : describe.skip;

const DAY = 24 * 60 * 60 * 1000;
const RUNNER = "cohort-sam";
const OTHERS = ["cohort-ana", "cohort-ben"];
const LAST_YEAR = "cohort-old";
const MANCHESTER = "manchester-marathon";
const LONDON = "london-marathon";

/** A UTC date key `days` from now (negative is past). */
const dayKey = (days) =>
  new Date(Date.now() + days * DAY).toISOString().slice(0, 10);

const raceGoal = (spaceId, days = 70) => ({
  distance: "marathon",
  targetDate: dayKey(days),
  eventName: spaceId === MANCHESTER ? "Manchester Marathon" : "London Marathon",
  eventSpaceId: spaceId,
});

let db;
let configurePlan;
let onRaceGoalWritten;
let deleteAccount;

beforeAll(() => {
  if (!EMULATOR_HOST) return;
  const idx = require("../../index");
  configurePlan = idx.configurePlan;
  onRaceGoalWritten = idx.onRaceGoalWritten;
  ({ deleteAccount } = require("../../accountDeletion"));
  db = require("firebase-admin").firestore();
}, 30_000);

const weekSchedule = () => [
  { day: 0, type: "rest" },
  { day: 1, type: "lift" },
  { day: 2, type: "run" },
  { day: 3, type: "lift" },
  { day: 4, type: "run" },
  { day: 5, type: "rest" },
  { day: 6, type: "run" },
];

const profile = (extra = {}) => ({
  weekSchedule: weekSchedule(),
  weekScheduleVersion: 1,
  weeklyWorkoutsTarget: 2,
  weeklyRunDaysTarget: 3,
  weeklyRunsTarget: 3,
  runMode: "freeform",
  primaryGoal: "general",
  ...extra,
});

const programState = (runPlan) => ({
  programSchemaVersion: 2,
  goal: "general",
  currentPhase: "Base",
  weekNumber: 1,
  splitType: "full_body",
  workouts: [],
  fatigueScore: 0,
  updatedAt: Date.now(),
  settings: { autoProgression: true, smallPlates: true },
  weekHistory: [],
  runDays: [],
  runPlan,
});

/** The plan save a person makes in the run-plan editor, then the trigger. */
async function savePlan(goal) {
  const userRef = db.doc(`users/${RUNNER}`);
  await db.doc(`rateLimits/${RUNNER}_configurePlan`).delete();
  const before = await userRef.get();
  await configurePlan.run(
    goal
      ? {
          profileUpdates: profile({ runMode: "race_prep", raceGoal: goal }),
          programState: programState({ mode: "race_prep", raceGoal: goal }),
          weekSchedule: weekSchedule(),
        }
      : {
          profileUpdates: profile({ raceGoal: null }),
          programState: programState({ mode: "freeform" }),
          weekSchedule: weekSchedule(),
        },
    { auth: { uid: RUNNER } }
  );
  const after = await userRef.get();
  await deliver(before, after);
  return { before, after };
}

/** The user document's trigger, as Functions delivers it. */
async function deliver(before, after) {
  await onRaceGoalWritten.run(
    { before, after },
    { params: { uid: RUNNER }, timestamp: new Date().toISOString() }
  );
}

async function count(spaceId) {
  const snap = await db.doc(`raceCohorts/${spaceId}`).get();
  return snap.exists ? snap.data().count : undefined;
}

suite("a race's plan-group count, through the real write path", () => {
  beforeEach(async () => {
    for (const uid of [RUNNER, ...OTHERS, LAST_YEAR]) {
      await db.recursiveDelete(db.doc(`users/${uid}`));
      for (const path of [
        `rateLimits/${uid}_configurePlan`,
        `accountDeletionRequests/${uid}`,
        `accountDeletionWork/${uid}`,
        `deletedAccounts/${uid}`,
      ])
        await db.doc(path).delete();
    }
    for (const spaceId of [MANCHESTER, LONDON])
      await db.doc(`raceCohorts/${spaceId}`).delete();
    // Two other people training for Manchester, and one whose goal is last
    // year's edition, still bound through its recovery weeks.
    for (const uid of OTHERS)
      await db.doc(`users/${uid}`).set({ raceGoal: raceGoal(MANCHESTER) });
    await db
      .doc(`users/${LAST_YEAR}`)
      .set({ raceGoal: raceGoal(MANCHESTER, -30) });
    await db.doc(`users/${RUNNER}`).set(profile({ displayName: "Sam" }));
  });

  it("counts the person in on set, moves them on change, and lets them go on clear", async () => {
    await savePlan(raceGoal(MANCHESTER));
    expect(
      (await db.doc(`users/${RUNNER}`).get()).data().raceGoal.eventSpaceId
    ).toBe(MANCHESTER);
    expect(await count(MANCHESTER)).toBe(3);
    expect(await count(LONDON)).toBeUndefined();

    // Moved to London: the race left and the race joined are both counted.
    await savePlan(raceGoal(LONDON, 150));
    expect(await count(MANCHESTER)).toBe(2);
    expect(await count(LONDON)).toBe(1);

    // Cleared: free running.
    await savePlan(null);
    expect((await db.doc(`users/${RUNNER}`).get()).data().raceGoal).toBeNull();
    expect(await count(LONDON)).toBe(0);
    expect(await count(MANCHESTER)).toBe(2);
  });

  it("stores the count with the time it was read; a delivery again, or another write, changes nothing", async () => {
    const event = await savePlan(raceGoal(MANCHESTER));
    const cohortRef = db.doc(`raceCohorts/${MANCHESTER}`);
    const first = (await cohortRef.get()).data();
    expect(Object.keys(first).sort()).toEqual(["count", "updatedAt"]);
    expect(first).toMatchObject({ count: 3 });

    // The same event delivered again counts the same people, read later.
    await deliver(event.before, event.after);
    const again = (await cohortRef.get()).data();
    expect(again.count).toBe(3);
    expect(again.updatedAt.toMillis()).toBeGreaterThanOrEqual(
      first.updatedAt.toMillis()
    );

    // A write that leaves the goal alone recounts nothing: the stored read
    // time stays exactly where it was.
    const userRef = db.doc(`users/${RUNNER}`);
    await userRef.set({ lastActiveAt: new Date() }, { merge: true });
    await deliver(event.after, await userRef.get());
    const untouched = (await cohortRef.get()).data();
    expect(untouched.count).toBe(3);
    expect(untouched.updatedAt.toMillis()).toBe(again.updatedAt.toMillis());
  });

  it("a deleted account stops counting, and its race is recounted at once", async () => {
    await savePlan(raceGoal(MANCHESTER));
    expect(await count(MANCHESTER)).toBe(3);

    const before = await db.doc(`users/${RUNNER}`).get();
    const auth = { deleteUser: vi.fn(async () => {}) };
    await deleteAccount({
      firestore: db,
      uid: RUNNER,
      now: Date.now(),
      auth,
      storageBucket: { deleteFiles: vi.fn().mockResolvedValue(undefined) },
      logger: { info() {}, warn() {}, error() {} },
    });
    expect(auth.deleteUser).toHaveBeenCalledOnce();
    const after = await db.doc(`users/${RUNNER}`).get();
    expect(after.exists).toBe(false);

    await deliver(before, after);
    expect(await count(MANCHESTER)).toBe(2);
  }, 120_000);
});
