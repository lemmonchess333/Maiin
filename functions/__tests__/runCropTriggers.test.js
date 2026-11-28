/**
 * A cropped run through the real triggers (the 28 November audit, #3593).
 * Cropping a run on its page rewrites its distance, time, best efforts and
 * trace, and onRunUpdated reconciled only what reads the session's day:
 * the community-goal credit, km and fastest-effort challenges, the
 * lifetime distance, the segment efforts and the post's figures all kept
 * the run uncropped. Now each follows the run as it is (lib/runCorrections,
 * communityGoal.reconcileRunInCommunityGoals).
 *
 * index.js takes its `db` as it loads, so the in-memory Firestore is put
 * in place first, as segmentTriggers.test.js does. The run is dated long
 * before the performance recompute's window, so onRunCreated ends before
 * it, and the challenges are that month's.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
process.env.GCLOUD_PROJECT ||= "tropos-unit-test";
const admin = require("../lib/adminSdk");
const {
  memoryFirestore,
  increment,
  fieldDelete,
} = require("./helpers/memoryFirestore.cjs");
const { savedRun, nearestIndex } = require("./helpers/segmentTraces.cjs");

const { Timestamp, FieldPath } = admin.firestore;
/* The in-memory store applies its own increment and delete, so the
   triggers' FieldValue hands those out; everything else is the real one. */
const RealFieldValue = admin.firestore.FieldValue;
const FieldValue = new Proxy(RealFieldValue, {
  get: (target, key) =>
    key === "increment"
      ? increment
      : key === "delete"
        ? fieldDelete
        : Reflect.get(target, key),
});
const memoryDb = memoryFirestore({});
Object.defineProperty(admin, "firestore", {
  configurable: true,
  get: () =>
    Object.assign(() => memoryDb, { FieldValue, Timestamp, FieldPath }),
});
const fns = require("../index");
const deletion = require("../lib/accountDeletionLocks");
const segments = require("../lib/segments");
const { runTrackMayHaveChanged } = require("../lib/runCorrections");

const MAKER = "crop-maker";
const RUNNER = "crop-runner";
const DAY = "2020-03-10";
const JOINED = "2020-03-01T00:00:00.000Z";
const RUN_PATH = `users/${RUNNER}/runs/long`;
/** East 6 km, then north 6 km: 12 km at 4 m/s, 50 minutes. */
const ROUTE = [
  [0, 0],
  [6000, 0],
  [6000, 6000],
];

const read = (path) => memoryDb.data.get(path);
const seed = (path, data) => memoryDb.data.set(path, structuredClone(data));
const context = (params) => ({ params, timestamp: new Date().toISOString() });
const month = (extra) => ({
  type: "monthly",
  startDate: new Date("2020-03-01T00:00:00Z"),
  endDate: new Date("2020-04-01T00:00:00Z"),
  ...extra,
});

let segmentId;

beforeEach(async () => {
  memoryDb.data.clear();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(deletion, "shouldSystemWriteProceed").mockResolvedValue(true);
  seed(
    "challenges/km-2020-03",
    month({ metric: "total_km", tiers: { bronze: 5, silver: 10, gold: 20 } })
  );
  seed(`challenges/km-2020-03/participants/${RUNNER}`, {
    joinedAt: JOINED,
    currentValue: 0,
  });
  seed(
    "challenges/fast-10k-2020-03",
    month({
      metric: "fastest_effort",
      targetDistance: 10_000,
      tiers: { bronze: 4000, silver: 3300, gold: 2700 },
    })
  );
  seed(`challenges/fast-10k-2020-03/participants/${RUNNER}`, {
    joinedAt: JOINED,
    currentValue: 0,
  });
  seed(
    "challenges/group-goal-2020-03-01",
    month({
      metric: "total_km",
      collectiveTarget: 1000,
      tiers: { bronze: 1000, silver: 1000, gold: 1000 },
    })
  );
  seed("activities/post-long", {
    authorId: RUNNER,
    type: "run",
    visibility: "followers",
    distance: 12_000,
    duration: 3000,
    avgPace: 250,
    moments: [
      { kind: "longestRun", meters: 12_000 },
      { kind: "streak", days: 4 },
    ],
  });
  // A segment on the north leg, which the crop takes away.
  const made = savedRun(
    [
      [6000, 0],
      [6000, 4000],
    ],
    { date: DAY }
  );
  seed(`users/${MAKER}/runs/made-from`, made);
  ({ segmentId } = await segments.createSegment(memoryDb, {
    uid: MAKER,
    runId: "made-from",
    startIndex: nearestIndex(made.points, 6000, 1000),
    endIndex: nearestIndex(made.points, 6000, 3000),
    name: "North leg",
  }));
});

afterEach(() => vi.restoreAllMocks());

/** The 12 km run saved and credited, and the same run cropped to the
 *  first 5.2 km of the east leg. */
async function savedThenCropped() {
  const before = savedRun(ROUTE, {
    date: DAY,
    sharedActivityId: "post-long",
  });
  seed(RUN_PATH, before);
  await fns.onRunCreated.run(
    { data: () => before, ref: memoryDb.doc(RUN_PATH) },
    context({ uid: RUNNER, runId: "long" })
  );
  const end = nearestIndex(before.points, 5200, 0);
  const points = before.points.slice(0, end + 1);
  const after = {
    ...before,
    points,
    distance: 5200,
    duration: Math.round(
      (points[points.length - 1].timestamp - points[0].timestamp) / 1000
    ),
    avgPace: 250,
    bestEfforts: [],
  };
  seed(RUN_PATH, after);
  return { before, after };
}

const update = (before, after) =>
  fns.onRunUpdated.run(
    {
      before: { data: () => before },
      after: { data: () => after, ref: memoryDb.doc(RUN_PATH) },
    },
    context({ uid: RUNNER, runId: "long" })
  );

describe("a cropped run's credits follow it", () => {
  it("credits the uncropped run first, as onRunCreated always has", async () => {
    await savedThenCropped();
    expect(read(`challenges/km-2020-03/participants/${RUNNER}`)).toMatchObject({
      currentValue: 12,
    });
    expect(read("challenges/group-goal-2020-03-01").collectiveMeters).toBe(
      12_000
    );
    expect(read(`users/${RUNNER}/lifetime/totals`).runMeters).toBe(12_000);
    expect(
      read(`challenges/fast-10k-2020-03/participants/${RUNNER}`).currentValue
    ).toBe(3000);
    const efforts = [...memoryDb.data.keys()].filter((k) =>
      k.startsWith(`users/${RUNNER}/segmentEfforts/`)
    );
    expect(efforts).toHaveLength(1);
  });

  it("moves every credit read from the distance to the cropped run", async () => {
    const { before, after } = await savedThenCropped();
    await expect(update(before, after)).resolves.toBeNull();

    // A km challenge: 12 km becomes 5.2, and its tier with it.
    expect(read(`challenges/km-2020-03/participants/${RUNNER}`)).toMatchObject({
      currentValue: 5.2,
      tierAchieved: "bronze",
    });
    // The community goal, the person's tally and the run's credit.
    expect(read("challenges/group-goal-2020-03-01").collectiveMeters).toBe(
      5200
    );
    expect(
      read(`users/${RUNNER}/communityGoal/group-goal-2020-03-01`)
    ).toMatchObject({ runs: 1, meters: 5200 });
    // The lifetime distance.
    expect(read(`users/${RUNNER}/lifetime/totals`).runMeters).toBe(5200);
    // A 10K best the run no longer reaches is rebuilt from the runs left.
    expect(
      read(`challenges/fast-10k-2020-03/participants/${RUNNER}`).currentValue
    ).toBe(0);
    // Its effort on a segment it no longer runs is gone.
    expect(
      [...memoryDb.data.keys()].filter((k) =>
        k.startsWith(`users/${RUNNER}/segmentEfforts/`)
      )
    ).toEqual([]);
    expect(read(`segments/${segmentId}/board/${RUNNER}`)).toBeUndefined();
    // The post's figures, and no moment read from the old track.
    expect(read("activities/post-long")).toMatchObject({
      distance: 5200,
      duration: after.duration,
      moments: [{ kind: "streak", days: 4 }],
    });
  });

  it("corrects once, whatever the deliveries", async () => {
    const { before, after } = await savedThenCropped();
    await update(before, after);
    await update(before, after);
    // A later delivery of the same edit, after another update, reads the
    // run as stored and writes nothing new.
    await update(after, { ...after, name: "Renamed" });
    expect(
      read(`challenges/km-2020-03/participants/${RUNNER}`).currentValue
    ).toBe(5.2);
    expect(read("challenges/group-goal-2020-03-01").collectiveMeters).toBe(
      5200
    );
    expect(read(`users/${RUNNER}/lifetime/totals`).runMeters).toBe(5200);
  });

  it("corrects a fastest effort the cropped run still reaches", async () => {
    const { before } = await savedThenCropped();
    // Cropped to the first 10.4 km: still a 10K, in less time.
    const end = nearestIndex(before.points, 6000, 4400);
    const points = before.points.slice(0, end + 1);
    const after = {
      ...before,
      points,
      distance: 10_400,
      duration: 2600,
    };
    seed(RUN_PATH, after);
    await update(before, after);
    expect(
      read(`challenges/fast-10k-2020-03/participants/${RUNNER}`)
    ).toMatchObject({ currentValue: 2600, tierAchieved: "gold" });
  });
});

describe("runTrackMayHaveChanged", () => {
  it("is true for a crop and false for a rename or a shoe", () => {
    const run = savedRun(ROUTE, { date: DAY });
    expect(runTrackMayHaveChanged(run, { ...run, name: "Renamed" })).toBe(
      false
    );
    expect(runTrackMayHaveChanged(run, { ...run, shoeId: "s1" })).toBe(false);
    expect(runTrackMayHaveChanged(run, { ...run, distance: 5200 })).toBe(true);
    expect(
      runTrackMayHaveChanged(run, { ...run, points: run.points.slice(1) })
    ).toBe(true);
    expect(runTrackMayHaveChanged({}, {})).toBe(false);
  });
});
