/**
 * Segments through the real triggers (Run26 call 3): onRunCreated times a
 * saved run on the segments it ran, onRunUpdated follows its post link,
 * onRunDeleted takes its efforts back and onPrivacyZoneWritten recomputes
 * the runner's board entries.
 *
 * index.js takes its `db` as it loads, so the in-memory Firestore is put in
 * place first, as challengeParticipationTriggers.test.js does. Only the
 * account-deletion guard is stood in; every other step of onRunCreated runs
 * against the in-memory documents. The run is dated outside the
 * performance recompute's window, so the trigger ends before it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
process.env.GCLOUD_PROJECT ||= "tropos-unit-test";
const admin = require("../lib/adminSdk");
const { memoryFirestore } = require("./helpers/memoryFirestore.cjs");
const { at, savedRun, nearestIndex } = require("./helpers/segmentTraces.cjs");

const { FieldValue, Timestamp, FieldPath } = admin.firestore;
const memoryDb = memoryFirestore({});
Object.defineProperty(admin, "firestore", {
  configurable: true,
  get: () =>
    Object.assign(() => memoryDb, { FieldValue, Timestamp, FieldPath }),
});
const fns = require("../index");
const deletion = require("../lib/accountDeletionLocks");
const rateLimiter = require("../rateLimiter");
const segments = require("../lib/segments");

const MAKER = "trigger-maker";
const RUNNER = "trigger-runner";
const THROUGH = [
  [-200, 0],
  [1200, 0],
];
/** Long before the recompute's rolling window, whatever the clock says. */
const OLD_DAY = "2020-03-01";

let segmentId;

const read = (path) => memoryDb.data.get(path);
const seed = (path, data) => memoryDb.data.set(path, structuredClone(data));
const effortPaths = (uid) =>
  [...memoryDb.data.keys()].filter((k) =>
    k.startsWith(`users/${uid}/segmentEfforts/`)
  );
const context = (params) => ({
  params,
  timestamp: new Date().toISOString(),
});

function runOf(runId, options = {}) {
  const data = savedRun(THROUGH, { date: OLD_DAY, ...options });
  seed(`users/${RUNNER}/runs/${runId}`, data);
  return data;
}

const create = (runId, data) =>
  fns.onRunCreated.run(
    { data: () => data, ref: memoryDb.doc(`users/${RUNNER}/runs/${runId}`) },
    context({ uid: RUNNER, runId })
  );

beforeEach(async () => {
  memoryDb.data.clear();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(deletion, "shouldSystemWriteProceed").mockResolvedValue(true);
  const made = savedRun(THROUGH, { date: OLD_DAY });
  seed(`users/${MAKER}/runs/made-from`, made);
  ({ segmentId } = await segments.createSegment(memoryDb, {
    uid: MAKER,
    runId: "made-from",
    startIndex: nearestIndex(made.points, 0, 0),
    endIndex: nearestIndex(made.points, 1000, 0),
    name: "Common straight",
  }));
});

afterEach(() => vi.restoreAllMocks());

describe("onRunCreated", () => {
  it("records a private run's effort and writes no board entry", async () => {
    const data = runOf("quiet");
    await expect(create("quiet", data)).resolves.toBeNull();
    expect(read(`users/${RUNNER}/segmentEfforts/quiet_${segmentId}_1`)).toEqual(
      expect.objectContaining({
        segmentId,
        runId: "quiet",
        elapsedSeconds: 250,
      })
    );
    expect(read(`segments/${segmentId}/board/${RUNNER}`)).toBeUndefined();
  });

  it("puts a run on the board once onRunUpdated sees its post", async () => {
    const before = runOf("shared");
    await create("shared", before);
    seed("activities/post-shared", {
      authorId: RUNNER,
      visibility: "followers",
    });
    const after = { ...before, sharedActivityId: "post-shared" };
    seed(`users/${RUNNER}/runs/shared`, after);
    await fns.onRunUpdated.run(
      { before: { data: () => before }, after: { data: () => after } },
      context({ uid: RUNNER, runId: "shared" })
    );
    expect(read(`segments/${segmentId}/board/${RUNNER}`)).toEqual(
      expect.objectContaining({
        activityId: "post-shared",
        elapsedSeconds: 250,
      })
    );
  });

  it("writes no board entry for an effort that starts in a privacy zone, until the zone goes", async () => {
    seed(`users/${RUNNER}/privacyZones/home`, {
      ...at(0, 20),
      radiusMeters: 80,
    });
    seed("activities/post-home", { authorId: RUNNER, visibility: "public" });
    const data = runOf("from-home", { sharedActivityId: "post-home" });
    await create("from-home", data);
    expect(effortPaths(RUNNER)).toHaveLength(1);
    expect(read(`segments/${segmentId}/board/${RUNNER}`)).toBeUndefined();

    const zone = read(`users/${RUNNER}/privacyZones/home`);
    memoryDb.data.delete(`users/${RUNNER}/privacyZones/home`);
    await fns.onPrivacyZoneWritten.run(
      { before: { exists: true, data: () => zone }, after: { exists: false } },
      context({ uid: RUNNER, zoneId: "home" })
    );
    expect(read(`segments/${segmentId}/board/${RUNNER}`)).toEqual(
      expect.objectContaining({ activityId: "post-home" })
    );
  });

  it("fails the event when timing the run fails, so it is delivered again", async () => {
    vi.spyOn(segments, "matchRunToSegments").mockRejectedValueOnce(
      new Error("ABORTED")
    );
    const data = runOf("retry");
    await expect(create("retry", data)).rejects.toThrow(/segments failed/);
  });
});

describe("onRunDeleted", () => {
  it("takes the run's effort and its board entry with it", async () => {
    seed("activities/post-gone", { authorId: RUNNER, visibility: "followers" });
    const data = runOf("gone", { sharedActivityId: "post-gone" });
    await create("gone", data);
    expect(read(`segments/${segmentId}/board/${RUNNER}`)).toBeDefined();

    memoryDb.data.delete(`users/${RUNNER}/runs/gone`);
    await expect(
      fns.onRunDeleted.run(
        { data: () => data },
        context({ uid: RUNNER, runId: "gone" })
      )
    ).resolves.toBeNull();
    expect(effortPaths(RUNNER)).toEqual([]);
    expect(read(`segments/${segmentId}/board/${RUNNER}`)).toBeUndefined();
  });
});

describe("the deletion guard", () => {
  it("recomputes nothing for an account being deleted when its zones are swept", async () => {
    deletion.shouldSystemWriteProceed.mockResolvedValue(false);
    const refresh = vi.spyOn(segments, "refreshAllBoardEntries");
    await fns.onPrivacyZoneWritten.run(
      { before: { exists: true, data: () => ({}) }, after: { exists: false } },
      context({ uid: RUNNER, zoneId: "home" })
    );
    expect(deletion.shouldSystemWriteProceed).toHaveBeenCalledWith(
      expect.anything(),
      RUNNER,
      "onPrivacyZoneWritten"
    );
    expect(refresh).not.toHaveBeenCalled();
  });

  it("leaves the board alone for a run update that changes no post link", async () => {
    const data = runOf("renamed");
    const refresh = vi.spyOn(segments, "refreshRunBoardEntries");
    await fns.onRunUpdated.run(
      {
        before: { data: () => data },
        after: { data: () => ({ ...data, name: "Evening run" }) },
      },
      context({ uid: RUNNER, runId: "renamed" })
    );
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe("the segment callables", () => {
  const VERIFIED = (uid) => ({
    auth: { uid, token: { email_verified: true } },
  });
  const stretch = () => {
    const run = savedRun(THROUGH, { date: OLD_DAY });
    seed(`users/${RUNNER}/runs/mine`, run);
    return {
      runId: "mine",
      startIndex: nearestIndex(run.points, 100, 0),
      endIndex: nearestIndex(run.points, 900, 0),
      name: "Middle bit",
    };
  };

  beforeEach(() => {
    vi.spyOn(rateLimiter, "isRateLimited").mockResolvedValue(false);
  });

  it("makes a segment for a verified, unrestricted account", async () => {
    const made = await fns.createSegment.run(stretch(), VERIFIED(RUNNER));
    expect(made).toEqual({ segmentId: expect.any(String), efforts: 1 });
    expect(read(`segmentOwners/${made.segmentId}`).uid).toBe(RUNNER);
  });

  it("refuses a restricted account, and makes nothing", async () => {
    seed(`globalRestrictedUids/${RUNNER}`, { restrictedAt: 1 });
    await expect(
      fns.createSegment.run(stretch(), VERIFIED(RUNNER))
    ).rejects.toMatchObject({
      code: "permission-denied",
      details: { reason: "account-restricted" },
    });
    expect(
      [...memoryDb.data.values()].filter(
        (d) => d && d.uid === RUNNER && d.sourceRunId
      )
    ).toEqual([]);
  });

  it("refuses an unverified email, a stretch too short and a bad id, each in its own words", async () => {
    await expect(
      fns.createSegment.run(stretch(), {
        auth: { uid: RUNNER, token: { email_verified: false } },
      })
    ).rejects.toMatchObject({
      code: "failed-precondition",
      message: "Verify your email to make a segment.",
    });
    const short = { ...stretch(), endIndex: stretch().startIndex + 5 };
    await expect(
      fns.createSegment.run(short, VERIFIED(RUNNER))
    ).rejects.toMatchObject({
      code: "failed-precondition",
      message: "A segment needs to be at least 400 m.",
    });
    await expect(
      fns.createSegment.run({ ...stretch(), runId: "a/b" }, VERIFIED(RUNNER))
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("deletes a segment for its maker only", async () => {
    await expect(
      fns.deleteSegment.run({ segmentId }, VERIFIED(RUNNER))
    ).rejects.toMatchObject({ code: "not-found" });
    await expect(
      fns.deleteSegment.run({ segmentId }, VERIFIED(MAKER))
    ).resolves.toEqual({ deleted: true, efforts: 1 });
    expect(read(`segments/${segmentId}`)).toBeUndefined();
  });

  it("reads a board for a signed-in caller, and says when the segment is gone", async () => {
    await expect(
      fns.getSegmentBoard.run({ segmentId }, VERIFIED(RUNNER))
    ).resolves.toEqual({ entries: [] });
    await expect(
      fns.getSegmentBoard.run({ segmentId: "gone" }, VERIFIED(RUNNER))
    ).rejects.toMatchObject({ code: "not-found" });
    await expect(
      fns.getSegmentBoard.run({ segmentId }, {})
    ).rejects.toMatchObject({ code: "unauthenticated" });
  });
});
