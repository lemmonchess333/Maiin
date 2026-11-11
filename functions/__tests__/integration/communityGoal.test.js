/**
 * Integration: the community goal counts everyone's runs, through the
 * REAL run triggers against the emulator (lib/communityGoal.js).
 *
 * Nobody here joins the goal. That is the point: the per-person path
 * credits members only, Together offers no Join for this goal, and a
 * total built from members sat at 0. Every accrual assertion is paired
 * with the reversal or refusal beside it, so a trigger that credited
 * nothing could not pass.
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
let onRunCreated;
let onRunDeleted;

const GOAL = "cg-goal-2026-08";
const RUNNERS = ["u-cg-ana", "u-cg-ben"];

const ts = (iso) => admin.firestore.Timestamp.fromDate(new Date(iso));

beforeAll(() => {
  if (!EMULATOR_HOST) return;
  const idx = require("../../index");
  onRunCreated = idx.onRunCreated;
  onRunDeleted = idx.onRunDeleted;
  admin = require("firebase-admin");
  db = admin.firestore();
}, 30_000);

async function wipe() {
  for (const uid of RUNNERS) {
    for (const sub of ["runs", "communityGoal", "lifetime"]) {
      const docs = await db
        .collection("users")
        .doc(uid)
        .collection(sub)
        .listDocuments();
      for (const d of docs) await d.delete();
    }
    await db.collection("globalRestrictedUids").doc(uid).delete();
  }
  await db.collection("challenges").doc(GOAL).delete();
}

async function seedGoal() {
  await db
    .collection("challenges")
    .doc(GOAL)
    .set({
      name: "Together: 1,000 km",
      type: "monthly",
      metric: "total_km",
      collectiveTarget: 1000,
      tiers: { bronze: 1000, silver: 1000, gold: 1000 },
      startDate: ts("2026-08-01T00:00:00Z"),
      endDate: ts("2026-09-01T00:00:00Z"),
      participantCount: 0,
    });
}

const runRef = (uid, id) =>
  db.collection("users").doc(uid).collection("runs").doc(id);

async function deliverCreate(uid, id) {
  const snap = await runRef(uid, id).get();
  await onRunCreated.run(snap, { params: { uid, runId: id } });
}

async function logRun(
  uid,
  id,
  { date = "2026-08-05", distance = 6000, duration = 1700, ...rest } = {}
) {
  await runRef(uid, id).set({
    date,
    distance,
    duration,
    completedAt: ts(`${date}T09:00:00Z`),
    ...rest,
  });
  await deliverCreate(uid, id);
}

async function deleteRun(uid, id) {
  const ref = runRef(uid, id);
  const snap = await ref.get();
  await ref.delete();
  await onRunDeleted.run(snap, { params: { uid, runId: id } });
  return snap;
}

async function goal() {
  const data = (await db.collection("challenges").doc(GOAL).get()).data();
  return {
    meters: data.collectiveMeters ?? 0,
    runners: data.collectiveRunners ?? 0,
  };
}

suite("the community goal counts everyone's runs", () => {
  beforeEach(async () => {
    await wipe();
    await seedGoal();
  });

  it("adds a run from someone who never joined", async () => {
    await logRun(RUNNERS[0], "r1", { distance: 6000 });
    expect(await goal()).toEqual({ meters: 6000, runners: 1 });
    const members = await db
      .collection("challenges")
      .doc(GOAL)
      .collection("participants")
      .get();
    expect(members.empty).toBe(true);
  });

  it("counts each person once and every run they save", async () => {
    await logRun(RUNNERS[0], "r1", { distance: 6000 });
    await logRun(RUNNERS[0], "r2", { distance: 4000, duration: 1300 });
    await logRun(RUNNERS[1], "r1", { distance: 5000, duration: 1500 });
    expect(await goal()).toEqual({ meters: 15000, runners: 2 });
  });

  it("adds nothing when the create is delivered again", async () => {
    await logRun(RUNNERS[0], "r1", { distance: 6000 });
    await deliverCreate(RUNNERS[0], "r1");
    await deliverCreate(RUNNERS[0], "r1");
    expect(await goal()).toEqual({ meters: 6000, runners: 1 });
  });

  it("adds nothing for a run dated outside the goal's month", async () => {
    await logRun(RUNNERS[0], "r-july", { date: "2026-07-31" });
    await logRun(RUNNERS[0], "r-sept", { date: "2026-09-01" });
    await logRun(RUNNERS[0], "r-aug", { date: "2026-08-31", distance: 3000 });
    expect(await goal()).toEqual({ meters: 3000, runners: 1 });
  });

  it("adds nothing for a run too far, too fast or flagged", async () => {
    await logRun(RUNNERS[0], "r-far", { distance: 600000, duration: 300000 });
    await logRun(RUNNERS[0], "r-fast", { distance: 20000, duration: 480 });
    await logRun(RUNNERS[0], "r-flag", { isInvalid: true });
    await logRun(RUNNERS[0], "r-ok", { distance: 2000, duration: 700 });
    expect(await goal()).toEqual({ meters: 2000, runners: 1 });
  });

  it("adds nothing from a restricted account", async () => {
    await db
      .collection("globalRestrictedUids")
      .doc(RUNNERS[1])
      .set({ restrictedAt: ts("2026-08-01T00:00:00Z") });
    await logRun(RUNNERS[1], "r1");
    await logRun(RUNNERS[0], "r1", { distance: 2500, duration: 800 });
    expect(await goal()).toEqual({ meters: 2500, runners: 1 });
  });

  it("takes a deleted run back off, and its runner with their last run", async () => {
    await logRun(RUNNERS[0], "r1", { distance: 6000 });
    await logRun(RUNNERS[0], "r2", { distance: 4000, duration: 1300 });
    await logRun(RUNNERS[1], "r1", { distance: 5000, duration: 1500 });
    expect(await goal()).toEqual({ meters: 15000, runners: 2 });

    await deleteRun(RUNNERS[0], "r1");
    expect(await goal()).toEqual({ meters: 9000, runners: 2 });

    const snap = await deleteRun(RUNNERS[0], "r2");
    expect(await goal()).toEqual({ meters: 5000, runners: 1 });

    // The same delete delivered again takes nothing more off. Another
    // runner's 5 km stays on the total, so a second subtraction would show.
    await onRunDeleted.run(snap, { params: { uid: RUNNERS[0], runId: "r2" } });
    expect(await goal()).toEqual({ meters: 5000, runners: 1 });
    const left = await db
      .collection("users")
      .doc(RUNNERS[0])
      .collection("communityGoal")
      .get();
    expect(left.empty).toBe(true);
  });
});
