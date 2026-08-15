/**
 * Integration: the workout trigger recomputes the PI for an east-of-UTC
 * same-day session instead of skipping it.
 *
 * A workout's `date` is the USER'S local day; the trigger's "today" is the
 * server's UTC date. East of UTC every morning session carries a label the
 * server has not reached, and the old gate — `isInRollingWindow(date,
 * today)` alone — read that as out-of-window and skipped the recompute, so
 * the PI sat stale until the next day's cron: fresh data at exactly the
 * moment the user looks (right after finishing), invisible.
 *
 * The gate DECISION is unit-tested (triggerComputeKey). This file pins the
 * HANDOFF — that onWorkoutCreated actually passes the returned key into
 * computeAndWritePerformanceForUser — because a wiring that still passed
 * `null` would survive every unit test while re-skipping the exact case
 * the fix exists for (the compute would run against today's window, whose
 * exclusive end IS the doc's midnight). Perf docs are keyed by compute
 * date, so the written doc's ID is direct evidence of which key travelled.
 *
 * Driven against the emulator like the other trigger suites. Distinct
 * uids per case: the trigger's 10-minute cooldown lock is per-user, and a
 * second case reusing a uid would silently skip its compute.
 *
 * Gated on FIRESTORE_EMULATOR_HOST — skips in an ordinary unit run.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST;
const suite = EMULATOR_HOST ? describe : describe.skip;

let admin;
let db;
let onWorkoutCreated;
let getComputeKey;
let dateKeyMinusN;

beforeAll(() => {
  if (!EMULATOR_HOST) return;
  const idx = require("../../index");
  onWorkoutCreated = idx.onWorkoutCreated;
  admin = require("firebase-admin");
  db = admin.firestore();
  const engine = require("../../performanceEngine");
  getComputeKey = engine.getComputeKey;
  dateKeyMinusN = engine._internal.dateKeyMinusN;
});

const TEST_UIDS = ["u-perfkey-east", "u-perfkey-same", "u-perfkey-clock"];

/**
 * The emulator keeps state across runs, and this suite's first draft had
 * no cleanup — which produced a textbook false pass: with the handoff
 * MUTATED back to `null`, all three tests still passed, because the
 * previous (unmutated) run's perf doc satisfied the exists-assertion and
 * its 10-minute cooldown lock made the mutated run skip computing
 * anything at all. Every case must start from nothing it can inherit:
 * no perf docs, no cooldown lock, no workout docs.
 */
async function wipe(uid) {
  const perf = await db.collection(`users/${uid}/performance`).get();
  const workouts = await db.collection(`users/${uid}/workouts`).get();
  const batch = db.batch();
  for (const d of [...perf.docs, ...workouts.docs]) batch.delete(d.ref);
  batch.delete(db.doc(`users/${uid}/_engine/performanceLock`));
  await batch.commit();
}

async function fireWorkout(uid, dateStr) {
  const ref = db.doc(`users/${uid}/workouts/w-${dateStr}`);
  const data = {
    date: dateStr,
    totalVolume: 1000,
    exercises: [
      { exerciseName: "Bench", sets: [{ weightKg: 100, reps: 10 }] },
    ],
  };
  await ref.set(data);
  const snap = { data: () => data, ref, id: ref.id };
  const context = { params: { uid, workoutId: ref.id } };
  await onWorkoutCreated.run(snap, context);
}

async function perfDocExists(uid, key) {
  const snap = await db.doc(`users/${uid}/performance/${key}`).get();
  return snap.exists;
}

suite("onWorkoutCreated — compute key handoff", () => {
  beforeEach(async () => {
    for (const uid of TEST_UIDS) await wipe(uid);
  });

  it("a workout labelled one day ahead writes a perf doc keyed by ITS day", async () => {
    const uid = "u-perfkey-east";
    const today = getComputeKey(new Date());
    const tomorrow = dateKeyMinusN(today, -1);

    await fireWorkout(uid, tomorrow);

    // The doc id is the proof the override travelled: keyed by the
    // workout's own day, whose window contains it...
    expect(await perfDocExists(uid, tomorrow)).toBe(true);
    // ...and NOT by the server's today — which is what a handoff still
    // passing `null` would produce (a window that excludes the workout).
    expect(await perfDocExists(uid, today)).toBe(false);
  });

  it("a same-day workout still writes the today-keyed doc", async () => {
    // The unchanged normal path, anchored so the case above cannot pass
    // by the trigger never computing at all.
    const uid = "u-perfkey-same";
    const today = getComputeKey(new Date());

    await fireWorkout(uid, today);

    expect(await perfDocExists(uid, today)).toBe(true);
  });

  it("a label two days ahead still skips — no perf doc at all", async () => {
    // The gate's protective half: a broken client clock must not mint
    // future-keyed perf docs.
    const uid = "u-perfkey-clock";
    const today = getComputeKey(new Date());
    const twoAhead = dateKeyMinusN(today, -2);

    await fireWorkout(uid, twoAhead);

    expect(await perfDocExists(uid, twoAhead)).toBe(false);
    expect(await perfDocExists(uid, today)).toBe(false);
  });
});
