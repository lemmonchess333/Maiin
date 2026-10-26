/**
 * Integration: the PI's window is the person's own seven days, and a run
 * and a lift on the same day sit in it together.
 *
 * The window was keyed by the SERVER's date, and its two halves were read
 * in different frames: workouts by their `date` (the person's local day),
 * runs by the UTC instant they finished. At Wednesday 20:00 in New York the
 * server is already on Thursday, so the doc was keyed Thursday and the
 * window began on Friday, dropping last Thursday's lift, while a run that
 * finished last Thursday evening (Friday in UTC) stayed in.
 *
 * Now the window ends on the person's today (their profile `timezone`), and
 * a run belongs to the day it started (`date`, Lift3), as everywhere else in
 * the app. Without a timezone the server's day stands, as it did.
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
let engine;

const UID = "u-pi-local-week";
/** Wednesday 20 May 2026, 20:00 in New York (EDT, UTC-4). */
const NOW = new Date("2026-05-21T00:00:00Z");
const NY_TODAY = "2026-05-20";
const UTC_TODAY = "2026-05-21";

beforeAll(() => {
  if (!EMULATOR_HOST) return;
  // index.js owns initializeApp; the engine only consumes the default app.
  require("../../index");
  engine = require("../../performanceEngine");
  admin = require("firebase-admin");
  db = admin.firestore();
});

async function wipe() {
  for (const sub of ["workouts", "runs", "meals", "performance", "_engine"]) {
    const docs = await db
      .collection("users")
      .doc(UID)
      .collection(sub)
      .listDocuments();
    for (const d of docs) await d.delete().catch(() => {});
  }
  await db
    .collection("users")
    .doc(UID)
    .delete()
    .catch(() => {});
}

const at = (iso) => admin.firestore.Timestamp.fromDate(new Date(iso));

async function seedWeek() {
  const user = db.collection("users").doc(UID);
  // Last Thursday, the first day of the window ending Wednesday.
  await user
    .collection("workouts")
    .doc("w-thu")
    .set({
      date: "2026-05-14",
      totalVolume: 1000,
      exercises: [
        { exerciseName: "Bench", sets: [{ weightKg: 100, reps: 10 }] },
      ],
    });
  // The same Thursday's evening run, 21:00 to 21:40 in New York: Friday in
  // UTC.
  await user
    .collection("runs")
    .doc("r-thu")
    .set({
      date: "2026-05-14",
      completedAt: at("2026-05-15T01:40:00Z"),
      distance: 5000,
      duration: 2400,
    });
  // Wednesday the 13th's evening run, the day before the window: Thursday
  // in UTC, so a window read by the instant would take it in.
  await user
    .collection("runs")
    .doc("r-wed-before")
    .set({
      date: "2026-05-13",
      completedAt: at("2026-05-14T01:40:00Z"),
      distance: 5000,
      duration: 2400,
    });
}

async function perfDoc(key) {
  const snap = await db
    .collection("users")
    .doc(UID)
    .collection("performance")
    .doc(key)
    .get();
  return snap.exists ? snap.data() : null;
}

suite("the PI window is the person's own week", () => {
  beforeEach(async () => {
    await wipe();
    await seedWeek();
  });

  it("ends on their today and holds the lift and the run of its first day", async () => {
    await db
      .collection("users")
      .doc(UID)
      .set({ timezone: "America/New_York", weeklyWorkoutsTarget: 2 });

    await engine.computeAndWritePerformanceForUser(UID, null, { now: NOW });

    expect(await perfDoc(UTC_TODAY)).toBeNull();
    const doc = await perfDoc(NY_TODAY);
    expect(doc).not.toBeNull();
    // Before: keyed Thursday the 21st, with no lift (Thursday the 14th was
    // outside it) and the 14th's run (Friday in UTC) inside.
    expect(doc.aggregates.liftSessions).toBe(1);
    expect(doc.aggregates.runSessions).toBe(1);
    // The lift and the run are the same day, so the same week.
    expect(doc.aggregates.activeWeeks).toBe(1);
  });

  it("keeps the server's day for an account with no timezone", async () => {
    // The anchor: nothing changes for a profile the app has not stamped.
    await db.collection("users").doc(UID).set({ weeklyWorkoutsTarget: 2 });

    await engine.computeAndWritePerformanceForUser(UID, null, { now: NOW });

    expect(await perfDoc(NY_TODAY)).toBeNull();
    const doc = await perfDoc(UTC_TODAY);
    expect(doc).not.toBeNull();
    // The window is the 15th to the 21st: neither the 14th's lift nor its
    // run, which now belongs to the day it started.
    expect(doc.aggregates.liftSessions).toBe(0);
    expect(doc.aggregates.runSessions).toBe(0);
  });
});
