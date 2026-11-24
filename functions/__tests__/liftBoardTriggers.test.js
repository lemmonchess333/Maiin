/**
 * Lift boards through the real triggers and callable (Run30 call 3):
 * onWorkoutCreated records a workout's heaviest sets, onWorkoutUpdated
 * follows its post link and its sets, onWorkoutDeleted takes them back,
 * onLiftPostWritten follows the post's visibility, and getLiftBoard shows
 * the board only to a signed-in caller, for a lift that has one.
 *
 * index.js takes its `db` as it loads, so the in-memory Firestore is put in
 * place first, as segmentTriggers.test.js does. Only the account-deletion
 * guard and the rate limiter are stood in. The workout is dated outside
 * the performance recompute's window, so onWorkoutCreated ends before it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
process.env.GCLOUD_PROJECT ||= "tropos-unit-test";
const admin = require("../lib/adminSdk");
const { memoryFirestore } = require("./helpers/memoryFirestore.cjs");

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

const LIFTER = "trigger-lifter";
const VIEWER = "trigger-viewer";
/** Long before the recompute's rolling window, whatever the clock says. */
const OLD_DAY = "2020-03-01";

const read = (path) => memoryDb.data.get(path);
const seed = (path, data) => memoryDb.data.set(path, structuredClone(data));
const entry = () => read(`liftBoards/bench-press/lifters/${LIFTER}`);
const context = (params) => ({
  params,
  timestamp: new Date().toISOString(),
});

function workoutOf(workoutId, weightKg, extra = {}) {
  const data = {
    date: OLD_DAY,
    durationMinutes: 40,
    exercises: [
      {
        exerciseId: "bench-press",
        exerciseName: "Bench Press",
        category: "Chest",
        sets: [{ setNumber: 1, weightKg, reps: 3 }],
      },
    ],
    ...extra,
  };
  seed(`users/${LIFTER}/workouts/${workoutId}`, data);
  return data;
}

const ref = (workoutId) =>
  memoryDb.doc(`users/${LIFTER}/workouts/${workoutId}`);

const create = (workoutId, data) =>
  fns.onWorkoutCreated.run(
    { data: () => data, ref: ref(workoutId) },
    context({ uid: LIFTER, workoutId })
  );

const update = (workoutId, before, after) =>
  fns.onWorkoutUpdated.run(
    {
      before: { data: () => before },
      after: { data: () => after, ref: ref(workoutId) },
    },
    context({ uid: LIFTER, workoutId })
  );

const postWritten = (activityId, before, after) =>
  fns.onLiftPostWritten.run(
    {
      before: { exists: !!before, data: () => before },
      after: { exists: !!after, data: () => after },
    },
    context({ activityId })
  );

beforeEach(() => {
  memoryDb.data.clear();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(deletion, "shouldSystemWriteProceed").mockResolvedValue(true);
  vi.spyOn(rateLimiter, "isRateLimited").mockResolvedValue(false);
});

afterEach(() => vi.restoreAllMocks());

describe("the workout triggers", () => {
  it("records a private workout's effort and writes no board entry", async () => {
    const data = workoutOf("quiet", 100);
    await create("quiet", data);
    expect(read(`users/${LIFTER}/liftEfforts/quiet_bench-press`)).toEqual(
      expect.objectContaining({ weightKg: 100, reps: 3, workoutId: "quiet" })
    );
    expect(entry()).toBeUndefined();
  });

  it("puts it on the board once onWorkoutUpdated sees its post, and takes it off when deleted", async () => {
    const before = workoutOf("shared", 100);
    await create("shared", before);
    seed("activities/post-shared", {
      authorId: LIFTER,
      type: "workout",
      visibility: "followers",
    });
    const after = workoutOf("shared", 100, { sharedActivityId: "post-shared" });
    await update("shared", before, after);
    expect(entry()).toEqual(
      expect.objectContaining({ activityId: "post-shared", weightKg: 100 })
    );

    memoryDb.data.delete(`users/${LIFTER}/workouts/shared`);
    await fns.onWorkoutDeleted.run(
      { data: () => after, ref: ref("shared") },
      context({ uid: LIFTER, workoutId: "shared" })
    );
    expect(entry()).toBeUndefined();
    expect(
      read(`users/${LIFTER}/liftEfforts/shared_bench-press`)
    ).toBeUndefined();
  });

  it("follows the post: made private takes the entry off, public again puts it back", async () => {
    const post = { authorId: LIFTER, type: "workout", visibility: "public" };
    seed("activities/p1", post);
    const data = workoutOf("w1", 110, { sharedActivityId: "p1" });
    await create("w1", data);
    expect(entry()).toEqual(expect.objectContaining({ weightKg: 110 }));

    const narrowed = { ...post, visibility: "private" };
    seed("activities/p1", narrowed);
    await postWritten("p1", post, narrowed);
    expect(entry()).toBeUndefined();

    seed("activities/p1", post);
    await postWritten("p1", narrowed, post);
    expect(entry()).toEqual(expect.objectContaining({ weightKg: 110 }));

    memoryDb.data.delete("activities/p1");
    await postWritten("p1", post, null);
    expect(entry()).toBeUndefined();
  });
});

describe("getLiftBoard", () => {
  const caller = (uid) => ({ auth: { uid, token: {} } });

  beforeEach(async () => {
    seed(`users/${LIFTER}/public/profile`, { displayName: "Lee Lifter" });
    seed("activities/p1", {
      authorId: LIFTER,
      type: "workout",
      visibility: "followers",
    });
    await create("w1", workoutOf("w1", 120, { sharedActivityId: "p1" }));
  });

  it("shows a follower the people they follow, and a stranger nobody", async () => {
    seed(`following/${VIEWER}/users/${LIFTER}`, { followedAt: 1 });
    await expect(
      fns.getLiftBoard.run({ exerciseId: "bench-press" }, caller(VIEWER))
    ).resolves.toEqual({
      entries: [
        expect.objectContaining({ uid: LIFTER, weightKg: 120, reps: 3 }),
      ],
    });
    await expect(
      fns.getLiftBoard.run({ exerciseId: "bench-press" }, caller("stranger"))
    ).resolves.toEqual({ entries: [] });
  });

  it("refuses a caller who is not signed in, and a lift with no board", async () => {
    await expect(
      fns.getLiftBoard.run({ exerciseId: "bench-press" }, {})
    ).rejects.toMatchObject({ code: "unauthenticated" });
    for (const exerciseId of ["dumbbell-press", "", undefined, "constructor"])
      await expect(
        fns.getLiftBoard.run({ exerciseId }, caller(VIEWER))
      ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("refuses a caller past the rate limit", async () => {
    rateLimiter.isRateLimited.mockResolvedValueOnce(true);
    await expect(
      fns.getLiftBoard.run({ exerciseId: "bench-press" }, caller(VIEWER))
    ).rejects.toMatchObject({ code: "resource-exhausted" });
  });
});
