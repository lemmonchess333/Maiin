/**
 * Integration: the live pulse (Soc15, lib/pulse.js) through the REAL
 * session create and delete triggers, against the emulator.
 *
 * What only the emulator holds: the credit and the day written in one
 * transaction, the increment on a document no transaction reads, and the
 * deletion freeze read inside it. Every accrual assertion is paired with
 * the reversal or refusal beside it, so a trigger that credited nothing
 * could not pass. Days come from the clock, so the run with the clock 90
 * days ahead reads the same day.
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
const { pulseExpiresAt } = require("../../lib/pulse");

const PEOPLE = ["u-pulse-ana", "u-pulse-ben", "u-pulse-cal"];
/** UTC's today, the day these sessions are saved for. */
const day = () => new Date().toISOString().slice(0, 10);

beforeAll(() => {
  if (!EMULATOR_HOST) return;
  idx = require("../../index");
  db = require("firebase-admin").firestore();
});

async function wipe() {
  for (const uid of PEOPLE) {
    await db.recursiveDelete(db.doc(`users/${uid}`));
    await db.doc(`accountDeletionRequests/${uid}`).delete();
    await db.doc(`globalRestrictedUids/${uid}`).delete();
  }
  await db.doc(`pulse/${day()}`).delete();
}

const sessions = async () => {
  const snap = await db.doc(`pulse/${day()}`).get();
  return snap.exists ? snap.data().sessions : 0;
};

const kindOf = { workouts: "workout", runs: "run" };
const trigger = (kind, verb) =>
  idx[`on${kind === "runs" ? "Run" : "Workout"}${verb}`];
const params = (uid, kind, id) =>
  kind === "runs" ? { uid, runId: id } : { uid, workoutId: id };

async function deliverCreate(uid, kind, id) {
  const snap = await db.doc(`users/${uid}/${kind}/${id}`).get();
  await trigger(kind, "Created").run(snap, { params: params(uid, kind, id) });
}

async function save(uid, kind, id, data) {
  await db.doc(`users/${uid}/${kind}/${id}`).set({ date: day(), ...data });
  await deliverCreate(uid, kind, id);
}

async function remove(uid, kind, id) {
  const ref = db.doc(`users/${uid}/${kind}/${id}`);
  const snap = await ref.get();
  await ref.delete();
  await trigger(kind, "Deleted").run(snap, { params: params(uid, kind, id) });
  return snap;
}

const LIFT = { durationMinutes: 40, exercises: [] };
const RUN = { distance: 5200, duration: 1600 };

suite("the live pulse counts everyone's sessions", () => {
  beforeEach(wipe);

  it("a workout and a run each add one to their day, once, and come off once", async () => {
    await save(PEOPLE[0], "workouts", "w1", LIFT);
    await save(PEOPLE[1], "runs", "r1", RUN);
    expect(await sessions()).toBe(2);

    // Redelivered creates add nothing.
    await deliverCreate(PEOPLE[0], "workouts", "w1");
    await deliverCreate(PEOPLE[1], "runs", "r1");
    expect(await sessions()).toBe(2);

    // Each credit is under its owner, dated and expiring with the day.
    const credit = await db
      .doc(`users/${PEOPLE[0]}/pulseCredits/workout_w1`)
      .get();
    expect(credit.data()).toMatchObject({
      kind: kindOf.workouts,
      sessionId: "w1",
      dateKey: day(),
    });
    const expiresAt = pulseExpiresAt(day()).getTime();
    expect(credit.data().expiresAt.toMillis()).toBe(expiresAt);
    const stored = (await db.doc(`pulse/${day()}`).get()).data();
    expect(stored.expiresAt.toMillis()).toBe(expiresAt);
    expect(stored.updatedAt).toBeDefined();

    const snap = await remove(PEOPLE[0], "workouts", "w1");
    expect(await sessions()).toBe(1);
    // The same delete delivered again takes nothing more off; the run
    // still on the count would show a second subtraction.
    await idx.onWorkoutDeleted.run(snap, {
      params: params(PEOPLE[0], "workouts", "w1"),
    });
    expect(await sessions()).toBe(1);
    await remove(PEOPLE[1], "runs", "r1");
    expect(await sessions()).toBe(0);
    const left = await db.collection(`users/${PEOPLE[1]}/pulseCredits`).get();
    expect(left.empty).toBe(true);
  });

  it("a run the challenges would not credit adds nothing", async () => {
    await save(PEOPLE[0], "runs", "flagged", { ...RUN, isInvalid: true });
    await save(PEOPLE[0], "runs", "fast", { distance: 20000, duration: 480 });
    await save(PEOPLE[0], "runs", "ok", RUN);
    expect(await sessions()).toBe(1);
    await remove(PEOPLE[0], "runs", "flagged");
    expect(await sessions()).toBe(1);
  });

  it("an account being deleted adds nothing, and a live one beside it does", async () => {
    await db
      .doc(`accountDeletionRequests/${PEOPLE[2]}`)
      .set({ status: "running" });
    await save(PEOPLE[2], "workouts", "w1", LIFT);
    await save(PEOPLE[0], "workouts", "w1", LIFT);
    expect(await sessions()).toBe(1);
    const credits = await db
      .collection(`users/${PEOPLE[2]}/pulseCredits`)
      .get();
    expect(credits.empty).toBe(true);
  });

  it("a restricted account adds nothing", async () => {
    await db
      .doc(`globalRestrictedUids/${PEOPLE[1]}`)
      .set({ restrictedAt: new Date() });
    await save(PEOPLE[1], "runs", "r1", RUN);
    await save(PEOPLE[0], "runs", "r1", RUN);
    expect(await sessions()).toBe(1);
  });
});
