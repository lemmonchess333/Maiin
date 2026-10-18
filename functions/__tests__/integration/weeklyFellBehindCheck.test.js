/**
 * The weekly fell-behind check's per-user worker
 * (`_runWeeklyFellBehindCheckForUser`) against the Firestore emulator.
 *
 * The decision is unit-tested in ../weeklyFellBehindCheck.test.js, on runs
 * handed to it. What only a real database shows is whether the worker's
 * own query, `runs where date >= weekStart and date <= weekEnd`, finds the
 * runs the app saves. Before PR #815 it read a field no saved run has, got
 * nothing, and would have prompted every active race-prep runner every
 * Monday. The runs here carry the fields `runDocument`
 * (src/lib/runCompletion.ts) writes.
 *
 * Gated on FIRESTORE_EMULATOR_HOST, as ./dailyRaceReconciliation.test.js is.
 *
 * To run locally:
 *   firebase emulators:start --only firestore
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
 *     GCLOUD_PROJECT=demo-tropos \
 *     npm test --prefix functions
 */

import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const admin = require("firebase-admin");

const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST;
const suite = EMULATOR_HOST ? describe : describe.skip;

let db;
let _runWeeklyFellBehindCheckForUser;
let _priorWeekUtcRange;
let _utcDateString;

const UID = "u-fell-behind-1";
const DAY_MS = 24 * 60 * 60 * 1000;

beforeAll(() => {
  if (!EMULATOR_HOST) return;
  if (!admin.apps.length) {
    admin.initializeApp({
      projectId: process.env.GCLOUD_PROJECT || "demo-tropos",
    });
  }
  db = admin.firestore();
  ({
    _runWeeklyFellBehindCheckForUser,
    _priorWeekUtcRange,
    _utcDateString,
  } = require("../../index"));
});

function userRef() {
  return db.collection("users").doc(UID);
}
function programRef() {
  return userRef().collection("programState").doc("current");
}

/** The week the Monday sweep grades, from the real clock: the worker has no
 *  clock of its own, the range is handed to it. */
function priorWeek() {
  return _priorWeekUtcRange(Date.now());
}

/** A day of that week, `offset` days from its Monday (-1 is the Sunday
 *  before it, 7 the Monday after). */
function weekDay(range, offset) {
  const monday = Date.parse(`${range.weekStart}T00:00:00Z`);
  return _utcDateString(new Date(monday + offset * DAY_MS));
}

/** A 5 km run saved on `date` as `runDocument` saves one started from
 *  Start Run. */
function appRun(date) {
  const startedAt = new Date(`${date}T07:10:00Z`);
  const { Timestamp } = admin.firestore;
  return {
    distance: 5000,
    duration: 1680,
    avgPace: 336,
    calories: 320,
    elevationGain: 12,
    points: [],
    splits: [],
    bestEfforts: [],
    startedAt: Timestamp.fromDate(startedAt),
    completedAt: Timestamp.fromDate(new Date(startedAt.getTime() + 1680e3)),
    date,
    notes: "",
    relativeEffort: null,
    paceVerdictTone: null,
    visibility: "followers",
    type: "run",
    activityType: "freerun",
    place: null,
    shoeId: null,
    isInvalid: false,
    invalidReason: null,
    savedAnyway: false,
    routeQuality: null,
    workPortion: null,
    planMode: "race_prep",
    planSource: "manual",
    plannedRunDayIndex: null,
    plannedTemplateId: null,
    plannedTemplateType: null,
    actualTemplateId: null,
    matchedPlanExact: null,
    matchedPlanType: null,
    offPlan: false,
    planWeekIndex: null,
    planTotalWeeks: null,
    scheduledRunId: null,
  };
}

/** A race-prep runner on three runs a week, their race still ahead. */
async function seed(runDates) {
  const raceGoal = {
    distance: "half",
    targetDate: _utcDateString(new Date(Date.now() + 60 * DAY_MS)),
  };
  await userRef().set({
    uid: UID,
    runMode: "race_prep",
    raceGoal,
    weeklyRunDaysTarget: 3,
  });
  await programRef().set({
    runDays: [],
    runPlan: { mode: "race_prep", raceGoal },
  });
  await Promise.all(
    runDates.map((date, i) =>
      userRef().collection("runs").doc(`run-${i}`).set(appRun(date))
    )
  );
}

async function readProgramState() {
  return (await programRef().get()).data() || {};
}

async function clearUser() {
  const runs = await userRef().collection("runs").get();
  await Promise.all(runs.docs.map((d) => d.ref.delete()));
  await programRef()
    .delete()
    .catch(() => {});
  await userRef()
    .delete()
    .catch(() => {});
}

suite("_runWeeklyFellBehindCheckForUser — emulator integration", () => {
  beforeEach(async () => {
    await clearUser();
  });

  it("finds the week's three saved runs and sets no prompt", async () => {
    const range = priorWeek();
    await seed([weekDay(range, 0), weekDay(range, 2), weekDay(range, 6)]);

    const decision = await _runWeeklyFellBehindCheckForUser(UID, range);

    expect(decision.action).toBe("noop");
    expect(await readProgramState()).not.toHaveProperty(
      "pendingFellBehindPrompt"
    );
  });

  it("sets the prompt for a week with no runs", async () => {
    const range = priorWeek();
    await seed([]);

    const decision = await _runWeeklyFellBehindCheckForUser(UID, range);

    expect(decision.action).toBe("set");
    expect((await readProgramState()).pendingFellBehindPrompt).toEqual({
      weekKey: range.weekKey,
      completedRatio: 0,
      realRunCount: 0,
      weeklyTarget: 3,
    });
  });

  it("counts only the runs inside the week", async () => {
    // One run on its Monday; the others on the Sunday before it and the
    // Monday after, which the query's bounds leave out.
    const range = priorWeek();
    await seed([weekDay(range, -1), weekDay(range, 0), weekDay(range, 7)]);

    await _runWeeklyFellBehindCheckForUser(UID, range);

    expect((await readProgramState()).pendingFellBehindPrompt).toMatchObject({
      weekKey: range.weekKey,
      realRunCount: 1,
      weeklyTarget: 3,
    });
  });
});
