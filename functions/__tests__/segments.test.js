/**
 * Segments (Run26 call 3, lib/segments.js): making one, timing runs on it,
 * who sees a board, and what deleting a run, a segment or an account takes.
 *
 * Driven through the in-memory Firestore, which applies transactions,
 * queries and collection-group reads as Firestore does. Traces come from
 * helpers/segmentTraces.cjs: a straight kilometre east in south London is
 * the segment, made from its maker's run, and a run along it at 4 m/s takes
 * 250 s.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { memoryFirestore } = require("./helpers/memoryFirestore.cjs");
const {
  at,
  T0,
  savedRun,
  nearestIndex,
} = require("./helpers/segmentTraces.cjs");
const segments = require("../lib/segments");
const { MIN_SEGMENT_METRES } = require("../lib/segmentGeometry");
const { USER_SUBCOLLECTIONS } = require("../accountDeletion");

const MAKER = "maker";
const RUNNER = "runner";
const VIEWER = "viewer";
const STRANGER = "stranger";
const NOW = T0 + 86_400_000;

const THROUGH = [
  [-200, 0],
  [1200, 0],
];
const BACKWARDS = [
  [1200, 0],
  [-200, 0],
];

let db;

function seed(path, data) {
  db.data.set(path, structuredClone(data));
}
const read = (path) => db.data.get(path);
const paths = (prefix) =>
  [...db.data.keys()].filter((k) => k.startsWith(prefix));

/** A run of `uid`'s along `waypoints`, saved, and shared with `visibility`
 *  when one is given. */
function seedRun(uid, runId, waypoints, { visibility, ...options } = {}) {
  const run = savedRun(waypoints, options);
  if (visibility) {
    const activityId = `post-${runId}`;
    run.sharedActivityId = activityId;
    seed(`activities/${activityId}`, {
      authorId: uid,
      type: "run",
      visibility,
    });
  }
  seed(`users/${uid}/runs/${runId}`, run);
  return run;
}

function profile(uid, displayName) {
  seed(`users/${uid}/public/profile`, { displayName, photoURL: null });
}

function follow(follower, followed) {
  seed(`following/${follower}/users/${followed}`, { followedAt: 1 });
  seed(`followers/${followed}/users/${follower}`, { followedAt: 1 });
}

/** The maker's segment: the kilometre from 0 m to 1,000 m east. */
async function makeSegment(name = "Common straight") {
  const run = seedRun(MAKER, "made-from", THROUGH, { visibility: "followers" });
  return segments.createSegment(db, {
    uid: MAKER,
    runId: "made-from",
    startIndex: nearestIndex(run.points, 0, 0),
    endIndex: nearestIndex(run.points, 1000, 0),
    name,
    nowMs: NOW,
  });
}

const match = (uid, runId) =>
  segments.matchRunToSegments(db, {
    uid,
    runId,
    data: read(`users/${uid}/runs/${runId}`),
    nowMs: NOW,
  });

const effortsOf = (uid) =>
  paths(`users/${uid}/segmentEfforts/`).map((p) => read(p));
const entry = (segmentId, uid) => read(`segments/${segmentId}/board/${uid}`);

beforeEach(() => {
  db = memoryFirestore({});
  profile(MAKER, "Maya Maker");
  profile(RUNNER, "Rory Runner");
  profile(VIEWER, "Vic Viewer");
  profile(STRANGER, "Sam Stranger");
});

describe("making a segment", () => {
  it("stores the stretch with no owner on it, and the owner apart", async () => {
    const { segmentId, efforts } = await makeSegment();
    const segment = read(`segments/${segmentId}`);
    expect(segment.name).toBe("Common straight");
    expect(segment.lengthMeters).toBe(1000);
    expect(Object.keys(segment).sort()).toEqual([
      "bbox",
      "createdAtMs",
      "end",
      "lengthMeters",
      "name",
      "points",
      "start",
      "startCell",
    ]);
    expect(read(`segmentOwners/${segmentId}`)).toEqual({
      uid: MAKER,
      sourceRunId: "made-from",
      createdAtMs: NOW,
    });
    // The run it was cut from is its first effort, and shared, on the board.
    expect(efforts).toBe(1);
    expect(effortsOf(MAKER)).toEqual([
      expect.objectContaining({
        uid: MAKER,
        segmentId,
        runId: "made-from",
        lap: 1,
        elapsedSeconds: 250,
        day: "2026-11-10",
      }),
    ]);
    expect(entry(segmentId, MAKER)).toEqual(
      expect.objectContaining({
        elapsedSeconds: 250,
        activityId: "post-made-from",
      })
    );
  });

  it("times the maker's own earlier runs on it too", async () => {
    seedRun(MAKER, "earlier", THROUGH, { speed: 5 });
    seedRun(MAKER, "elsewhere", [
      [5000, 5000],
      [7000, 5000],
    ]);
    const { segmentId, efforts } = await makeSegment();
    expect(efforts).toBe(2);
    expect(
      effortsOf(MAKER)
        .map((e) => [e.runId, e.elapsedSeconds])
        .sort()
    ).toEqual([
      ["earlier", 200],
      ["made-from", 250],
    ]);
    // The faster run was never shared, so the board keeps the shared one.
    expect(entry(segmentId, MAKER).elapsedSeconds).toBe(250);
  });

  const refused = async (args, message) => {
    await expect(
      segments.createSegment(db, { uid: MAKER, nowMs: NOW, ...args })
    ).rejects.toMatchObject({ refusal: true, message });
    expect(paths("segments/")).toEqual([]);
  };

  it(`refuses a stretch under ${MIN_SEGMENT_METRES} m, one across a gap, and an end before its start`, async () => {
    const run = seedRun(MAKER, "r", THROUGH);
    const i = (east) => nearestIndex(run.points, east, 0);
    await refused(
      { runId: "r", startIndex: i(0), endIndex: i(380), name: "Short" },
      "A segment needs to be at least 400 m."
    );
    await refused(
      { runId: "r", startIndex: i(500), endIndex: i(100), name: "Back" },
      "Pick a start before the end."
    );
    seed("users/maker/runs/gap", {
      ...run,
      points: run.points.map((p, k) =>
        k === i(500) ? { ...p, breakBefore: true } : p
      ),
    });
    await refused(
      { runId: "gap", startIndex: i(0), endIndex: i(1000), name: "Gap" },
      "A segment can’t cross a gap in the route."
    );
  });

  it("refuses a stretch through one of the maker's privacy zones", async () => {
    const run = seedRun(MAKER, "r", THROUGH);
    seed("users/maker/privacyZones/home", {
      ...at(500, 120),
      radiusMeters: 150,
    });
    await refused(
      {
        runId: "r",
        startIndex: nearestIndex(run.points, 0, 0),
        endIndex: nearestIndex(run.points, 1000, 0),
        name: "Past home",
      },
      "A segment can’t pass through one of your privacy zones."
    );
  });

  it("refuses an empty name and one the word filter refuses", async () => {
    seedRun(MAKER, "r", THROUGH);
    await refused(
      { runId: "r", startIndex: 10, endIndex: 60, name: "   " },
      "Give the segment a name."
    );
    await refused(
      { runId: "r", startIndex: 10, endIndex: 60, name: "shit hill" },
      "This name contains objectionable language. Choose a different one."
    );
  });

  it("refuses a treadmill run and one saved despite invalid figures", async () => {
    seedRun(MAKER, "tm", THROUGH, { place: "treadmill" });
    seedRun(MAKER, "bad", THROUGH, { isInvalid: true, savedAnyway: true });
    await refused(
      { runId: "tm", startIndex: 10, endIndex: 70, name: "Belt" },
      "A segment is made from an outdoor run with GPS."
    );
    await refused(
      { runId: "bad", startIndex: 10, endIndex: 70, name: "Fast" },
      "A run saved despite invalid figures can’t make a segment."
    );
  });

  it("refuses a restricted account in the transaction that would write", async () => {
    seedRun(MAKER, "r", THROUGH);
    seed("globalRestrictedUids/maker", { at: 1 });
    await refused(
      { runId: "r", startIndex: 10, endIndex: 70, name: "Mine" },
      "Your account is restricted, so you can't do this for now. Contact support if you think it's a mistake."
    );
    expect(paths("segmentOwners/")).toEqual([]);
  });

  it("refuses a segment past the most an account may make", async () => {
    seedRun(MAKER, "r", THROUGH);
    for (let i = 0; i < segments.MAX_SEGMENTS_PER_ACCOUNT; i++)
      seed(`segmentOwners/s${i}`, { uid: MAKER });
    await expect(
      segments.createSegment(db, {
        uid: MAKER,
        runId: "r",
        startIndex: 10,
        endIndex: 70,
        name: "One more",
        nowMs: NOW,
      })
    ).rejects.toMatchObject({ code: "resource-exhausted" });
  });
});

describe("timing a run on it", () => {
  let segmentId;
  beforeEach(async () => {
    ({ segmentId } = await makeSegment());
  });

  it("records a shared run's effort and puts it on the board", async () => {
    seedRun(RUNNER, "r1", THROUGH, { visibility: "followers" });
    expect(await match(RUNNER, "r1")).toEqual({ segmentIds: [segmentId] });
    expect(read(`users/runner/segmentEfforts/r1_${segmentId}_1`)).toEqual(
      expect.objectContaining({
        uid: RUNNER,
        segmentId,
        runId: "r1",
        elapsedSeconds: 250,
      })
    );
    expect(entry(segmentId, RUNNER)).toEqual(
      expect.objectContaining({
        uid: RUNNER,
        runId: "r1",
        activityId: "post-r1",
        elapsedSeconds: 250,
      })
    );
  });

  it("writes no board entry for a run nobody else can see, until its post goes up", async () => {
    seedRun(RUNNER, "quiet", THROUGH);
    await match(RUNNER, "quiet");
    expect(effortsOf(RUNNER)).toHaveLength(1);
    expect(entry(segmentId, RUNNER)).toBeUndefined();

    // Shared privately: still nobody else's to see.
    seed("activities/post-quiet", { authorId: RUNNER, visibility: "private" });
    const run = read("users/runner/runs/quiet");
    const shared = { ...run, sharedActivityId: "post-quiet" };
    seed("users/runner/runs/quiet", shared);
    expect(segments.boardMayHaveChanged(run, shared)).toBe(true);
    await segments.refreshRunBoardEntries(db, { uid: RUNNER, runId: "quiet" });
    expect(entry(segmentId, RUNNER)).toBeUndefined();

    // Shared with followers: on the board.
    seed("activities/post-quiet", {
      authorId: RUNNER,
      visibility: "followers",
    });
    await segments.refreshRunBoardEntries(db, { uid: RUNNER, runId: "quiet" });
    expect(entry(segmentId, RUNNER).activityId).toBe("post-quiet");

    // The share taken back: off again.
    seed("users/runner/runs/quiet", { ...run, sharedActivityId: null });
    await segments.refreshRunBoardEntries(db, { uid: RUNNER, runId: "quiet" });
    expect(entry(segmentId, RUNNER)).toBeUndefined();
  });

  it("writes no board entry for an effort that starts in the runner's privacy zone", async () => {
    seed("users/runner/privacyZones/home", {
      ...at(-30, 0),
      radiusMeters: 100,
    });
    seedRun(RUNNER, "from-home", THROUGH, { visibility: "public" });
    await match(RUNNER, "from-home");
    expect(effortsOf(RUNNER)).toHaveLength(1);
    expect(entry(segmentId, RUNNER)).toBeUndefined();

    // The zone moved away: recomputed, the effort may be shown.
    db.data.delete("users/runner/privacyZones/home");
    await segments.refreshAllBoardEntries(db, RUNNER);
    expect(entry(segmentId, RUNNER).elapsedSeconds).toBe(250);
  });

  it("writes no board entry for an effort that ends in the runner's privacy zone", async () => {
    seed("users/runner/privacyZones/work", {
      ...at(1000, 40),
      radiusMeters: 60,
    });
    seedRun(RUNNER, "to-work", THROUGH, { visibility: "followers" });
    await match(RUNNER, "to-work");
    expect(entry(segmentId, RUNNER)).toBeUndefined();
  });

  it("does not time a run the other way", async () => {
    seedRun(RUNNER, "back", BACKWARDS, { visibility: "followers" });
    expect(await match(RUNNER, "back")).toEqual({ segmentIds: [] });
    expect(effortsOf(RUNNER)).toEqual([]);
  });

  it("does not time a treadmill run or one saved anyway", async () => {
    seedRun(RUNNER, "tm", THROUGH, { place: "treadmill" });
    seedRun(RUNNER, "bad", THROUGH, { isInvalid: true, savedAnyway: true });
    await match(RUNNER, "tm");
    await match(RUNNER, "bad");
    expect(effortsOf(RUNNER)).toEqual([]);
  });

  it("keeps the fastest shown effort on the board, and writes the same on a retry", async () => {
    seedRun(RUNNER, "slow", THROUGH, { visibility: "followers", speed: 3 });
    seedRun(RUNNER, "fast", THROUGH, { visibility: "followers", speed: 5 });
    seedRun(RUNNER, "fastest", THROUGH, { speed: 6 });
    await match(RUNNER, "slow");
    await match(RUNNER, "fast");
    await match(RUNNER, "fastest");
    await match(RUNNER, "fast");
    expect(effortsOf(RUNNER)).toHaveLength(3);
    // The fastest was never shared: the board shows the fastest shared one.
    expect(entry(segmentId, RUNNER)).toEqual(
      expect.objectContaining({ runId: "fast", elapsedSeconds: 200 })
    );
  });

  it("takes a deleted run's efforts with it, and its place on the board", async () => {
    seedRun(RUNNER, "r1", THROUGH, { visibility: "followers", speed: 5 });
    seedRun(RUNNER, "r2", THROUGH, { visibility: "followers", speed: 4 });
    await match(RUNNER, "r1");
    await match(RUNNER, "r2");
    expect(entry(segmentId, RUNNER).runId).toBe("r1");

    db.data.delete("users/runner/runs/r1");
    await segments.removeRunEfforts(db, { uid: RUNNER, runId: "r1" });
    expect(effortsOf(RUNNER).map((e) => e.runId)).toEqual(["r2"]);
    expect(entry(segmentId, RUNNER).runId).toBe("r2");

    db.data.delete("users/runner/runs/r2");
    await segments.removeRunEfforts(db, { uid: RUNNER, runId: "r2" });
    expect(effortsOf(RUNNER)).toEqual([]);
    expect(entry(segmentId, RUNNER)).toBeUndefined();
  });

  it("times nobody else's runs on a restricted maker's segment", async () => {
    seed("globalRestrictedUids/maker", { at: 1 });
    seedRun(RUNNER, "r1", THROUGH, { visibility: "followers" });
    seedRun(MAKER, "own", THROUGH, { visibility: "followers" });
    expect(await match(RUNNER, "r1")).toEqual({ segmentIds: [] });
    expect(await match(MAKER, "own")).toEqual({ segmentIds: [segmentId] });
  });

  it("writes nothing for an account being deleted", async () => {
    seed("accountDeletionRequests/runner", { status: "running" });
    seedRun(RUNNER, "r1", THROUGH, { visibility: "followers" });
    await match(RUNNER, "r1");
    expect(effortsOf(RUNNER)).toEqual([]);
    expect(entry(segmentId, RUNNER)).toBeUndefined();
  });
});

describe("who sees a board", () => {
  let segmentId;
  const board = (viewerUid = VIEWER) =>
    segments.readSegmentBoard(db, { viewerUid, segmentId });

  beforeEach(async () => {
    ({ segmentId } = await makeSegment());
    seedRun(RUNNER, "r1", THROUGH, { visibility: "followers" });
    await match(RUNNER, "r1");
    follow(VIEWER, RUNNER);
    follow(VIEWER, MAKER);
  });

  it("shows the viewer each person they follow who has run it, fastest first", async () => {
    seedRun(RUNNER, "r2", THROUGH, { visibility: "followers", speed: 5 });
    await match(RUNNER, "r2");
    const { entries } = await board();
    expect(entries.map((e) => [e.uid, e.name, e.elapsedSeconds])).toEqual([
      [RUNNER, "Rory Runner", 200],
      [MAKER, "Maya Maker", 250],
    ]);
    expect(entries[0]).toEqual({
      uid: RUNNER,
      name: "Rory Runner",
      photoURL: null,
      elapsedSeconds: 200,
      startedAtMs: expect.any(Number),
      day: "2026-11-10",
      activityId: "post-r2",
    });
  });

  it("reads the same board from either side: a long following list or a long board", async () => {
    // Following 7, a board of 2: the board is read.
    for (let i = 0; i < 5; i++) follow(VIEWER, `someone-${i}`);
    const fromBoard = await board();
    // A board of 12 people the viewer doesn't follow: the list is read.
    for (let i = 0; i < 10; i++)
      seed(`segments/${segmentId}/board/other-${i}`, {
        uid: `other-${i}`,
        elapsedSeconds: 1,
        activityId: "x",
      });
    const fromFollowing = await board();
    expect(fromFollowing).toEqual(fromBoard);
    expect(fromBoard.entries).toHaveLength(2);
  });

  it("shows a stranger nobody: there is no board of everyone", async () => {
    expect(await board(STRANGER)).toEqual({ entries: [] });
    // Following three other people, so the board (two entries) is read
    // and each entry's follow edge checked.
    for (let i = 0; i < 3; i++) follow(STRANGER, `other-${i}`);
    expect(await board(STRANGER)).toEqual({ entries: [] });
  });

  it("leaves out the viewer's own entry, which the app draws from their own efforts", async () => {
    seedRun(VIEWER, "mine", THROUGH, { visibility: "public" });
    await match(VIEWER, "mine");
    follow(VIEWER, VIEWER);
    expect((await board()).entries.map((e) => e.uid)).not.toContain(VIEWER);
  });

  it("shows nothing across a block, either way", async () => {
    seed(`blocks/${RUNNER}/users/${VIEWER}`, { blockedAt: 1 });
    expect((await board()).entries.map((e) => e.uid)).toEqual([MAKER]);
    db.data.delete(`blocks/${RUNNER}/users/${VIEWER}`);
    seed(`blocks/${VIEWER}/users/${MAKER}`, { blockedAt: 1 });
    expect((await board()).entries.map((e) => e.uid)).toEqual([RUNNER]);
  });

  it("leaves out a restricted account", async () => {
    seed(`globalRestrictedUids/${RUNNER}`, { at: 1 });
    expect((await board()).entries.map((e) => e.uid)).toEqual([MAKER]);
  });

  it("hides an entry as soon as its post is made private, before any recompute", async () => {
    seed("activities/post-r1", { authorId: RUNNER, visibility: "private" });
    expect((await board()).entries.map((e) => e.uid)).toEqual([MAKER]);
  });

  it("hides an entry as soon as a zone is drawn over its start, before any recompute", async () => {
    seed("users/runner/privacyZones/new", { ...at(0, 10), radiusMeters: 50 });
    expect((await board()).entries.map((e) => e.uid)).toEqual([MAKER]);
  });

  it("is null for a segment that isn't there", async () => {
    expect(
      await segments.readSegmentBoard(db, {
        viewerUid: VIEWER,
        segmentId: "gone",
      })
    ).toBeNull();
  });
});

describe("deleting", () => {
  let segmentId;
  beforeEach(async () => {
    ({ segmentId } = await makeSegment());
    seedRun(RUNNER, "r1", THROUGH, { visibility: "followers" });
    await match(RUNNER, "r1");
  });

  it("lets only its maker delete a segment", async () => {
    await expect(
      segments.deleteOwnSegment(db, { uid: RUNNER, segmentId })
    ).rejects.toMatchObject({ code: "not-found" });
    expect(read(`segments/${segmentId}`)).toBeDefined();
  });

  it("takes a deleted segment's efforts out of everyone's tree, its board and its owner", async () => {
    const result = await segments.deleteOwnSegment(db, {
      uid: MAKER,
      segmentId,
    });
    expect(result).toEqual({ efforts: 2 });
    expect(read(`segments/${segmentId}`)).toBeUndefined();
    expect(read(`segmentOwners/${segmentId}`)).toBeUndefined();
    expect(paths(`segments/${segmentId}/`)).toEqual([]);
    expect(effortsOf(MAKER)).toEqual([]);
    expect(effortsOf(RUNNER)).toEqual([]);
  });

  it("deletes an account's segments with everyone's efforts on them, and its entries on other segments", async () => {
    // The runner makes a segment of their own, which the maker runs.
    const run = read("users/runner/runs/r1");
    const theirs = await segments.createSegment(db, {
      uid: RUNNER,
      runId: "r1",
      startIndex: nearestIndex(run.points, 100, 0),
      endIndex: nearestIndex(run.points, 900, 0),
      name: "Middle bit",
      nowMs: NOW,
    });
    seedRun(MAKER, "m2", THROUGH, { visibility: "followers" });
    await match(MAKER, "m2");
    expect(entry(theirs.segmentId, MAKER)).toBeDefined();

    const removed = await segments.removeSegmentTracesForUser(db, MAKER);
    expect(removed).toEqual({ segments: 1, entries: 1 });
    // The maker's segment, and the runner's effort on it, are gone.
    expect(read(`segments/${segmentId}`)).toBeUndefined();
    expect(effortsOf(RUNNER).map((e) => e.segmentId)).toEqual([
      theirs.segmentId,
    ]);
    // The maker's entry on the runner's segment is gone; the runner's stays.
    expect(entry(theirs.segmentId, MAKER)).toBeUndefined();
    expect(entry(theirs.segmentId, RUNNER)).toBeDefined();
    // The maker's own efforts go with users/{uid}, in the subcollection sweep.
    expect(USER_SUBCOLLECTIONS).toContain("segmentEfforts");
  });
});
