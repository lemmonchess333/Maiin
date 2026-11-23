/**
 * Lift boards (Run30 call 3, lib/liftBoards.js): a workout's heaviest set of
 * each barbell lift, who sees a board, and what deleting a workout, taking
 * back its post or deleting an account takes.
 *
 * Driven through the in-memory Firestore, which applies transactions,
 * queries and collection-group reads as Firestore does.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { memoryFirestore } = require("./helpers/memoryFirestore.cjs");
const liftBoards = require("../lib/liftBoards");
const { USER_SUBCOLLECTIONS } = require("../accountDeletion");

const LIFTER = "lifter";
const OTHER = "other";
const VIEWER = "viewer";
const STRANGER = "stranger";
const BENCH = "bench-press";
const SQUAT = "squat";

let db;

function seed(path, data) {
  db.data.set(path, structuredClone(data));
}
const read = (path) => db.data.get(path);
const entry = (exerciseId, uid) =>
  read(`liftBoards/${exerciseId}/lifters/${uid}`);
const effortsOf = (uid) =>
  [...db.data.keys()]
    .filter((k) => k.startsWith(`users/${uid}/liftEfforts/`))
    .map((k) => read(k));

const set = (weightKg, reps, extra = {}) => ({
  setNumber: 1,
  weightKg,
  reps,
  ...extra,
});

/** A workout of `uid`'s with `exercises`, saved on `date`, and shared with
 *  `visibility` when one is given. */
function seedWorkout(
  uid,
  workoutId,
  exercises,
  { visibility, date = "2026-11-10" } = {}
) {
  const workout = { date, exercises };
  if (visibility) {
    const activityId = `post-${workoutId}`;
    workout.sharedActivityId = activityId;
    seed(`activities/${activityId}`, {
      authorId: uid,
      type: "workout",
      visibility,
    });
  }
  seed(`users/${uid}/workouts/${workoutId}`, workout);
  return workout;
}

const bench = (...sets) => ({
  exerciseId: BENCH,
  exerciseName: "Bench Press",
  sets,
});

function profile(uid, displayName) {
  seed(`users/${uid}/public/profile`, { displayName, photoURL: null });
}

function follow(follower, followed) {
  seed(`following/${follower}/users/${followed}`, { followedAt: 1 });
  seed(`followers/${followed}/users/${follower}`, { followedAt: 1 });
}

const sync = (uid, workoutId) =>
  liftBoards.syncWorkoutEfforts(db, { uid, workoutId, nowMs: 1 });

beforeEach(() => {
  db = memoryFirestore({});
  profile(LIFTER, "Lee Lifter");
  profile(OTHER, "Ola Other");
});

describe("which sets count", () => {
  it("takes the heaviest set of a rep or more, more reps on a tie, never a warm-up", () => {
    expect(
      liftBoards.heaviestSet([
        set(100, 1),
        set(120, 2, { type: "warmup" }),
        set(100, 3),
        set(90, 8),
      ])
    ).toEqual({ weightKg: 100, reps: 3 });
  });

  it("leaves out a set of no reps, no load, or past any barbell record", () => {
    expect(
      liftBoards.heaviestSet([
        set(140, 0),
        set(0, 10),
        set(liftBoards.MAX_LOAD_KG + 1, 1),
        set(Number.NaN, 5),
      ])
    ).toBeNull();
    expect(liftBoards.heaviestSet([set(liftBoards.MAX_LOAD_KG, 1)])).toEqual({
      weightKg: liftBoards.MAX_LOAD_KG,
      reps: 1,
    });
  });

  it("reads a barbell lift by id, or by name on an older workout, and nothing else", () => {
    const bests = liftBoards.workoutLiftBests({
      exercises: [
        bench(set(60, 5)),
        // An older workout: a name and `weight`, no id.
        { name: "Barbell Squat", sets: [{ reps: 5, weight: 100 }] },
        // A dumbbell press and a timed hold have no board.
        { exerciseId: "dumbbell-press", sets: [set(30, 8)] },
        { exerciseId: BENCH, repUnit: "seconds", sets: [set(200, 30)] },
      ],
    });
    expect([...bests]).toEqual([
      [BENCH, { weightKg: 60, reps: 5 }],
      [SQUAT, { weightKg: 100, reps: 5 }],
    ]);
  });
});

describe("building a board", () => {
  it("records every workout's effort, and puts only a shared one on the board", async () => {
    seedWorkout(LIFTER, "quiet", [bench(set(120, 1))]);
    seedWorkout(LIFTER, "shared", [bench(set(100, 3))], {
      visibility: "followers",
    });
    await sync(LIFTER, "quiet");
    await sync(LIFTER, "shared");
    expect(
      effortsOf(LIFTER)
        .map((e) => e.weightKg)
        .sort()
    ).toEqual([100, 120]);
    expect(entry(BENCH, LIFTER)).toEqual({
      uid: LIFTER,
      exerciseId: BENCH,
      effortId: `shared_${BENCH}`,
      workoutId: "shared",
      activityId: "post-shared",
      weightKg: 100,
      reps: 3,
      day: "2026-11-10",
      updatedAtMs: 1,
    });
  });

  it("puts a public workout on it too, and never a private one", async () => {
    seedWorkout(LIFTER, "mine", [bench(set(100, 3))], {
      visibility: "private",
    });
    await sync(LIFTER, "mine");
    expect(entry(BENCH, LIFTER)).toBeUndefined();
    seedWorkout(OTHER, "theirs", [bench(set(80, 3))], { visibility: "public" });
    await sync(OTHER, "theirs");
    expect(entry(BENCH, OTHER)).toMatchObject({ weightKg: 80 });
  });

  it("writes the same on a retry", async () => {
    seedWorkout(LIFTER, "w1", [bench(set(100, 3))], { visibility: "public" });
    await sync(LIFTER, "w1");
    const first = entry(BENCH, LIFTER);
    await sync(LIFTER, "w1");
    expect(entry(BENCH, LIFTER)).toEqual(first);
    expect(effortsOf(LIFTER)).toHaveLength(1);
  });

  it("writes nothing for an account being deleted", async () => {
    seed(`accountDeletionRequests/${LIFTER}`, { status: "running" });
    seedWorkout(LIFTER, "w1", [bench(set(100, 3))], { visibility: "public" });
    await sync(LIFTER, "w1");
    expect(effortsOf(LIFTER)).toEqual([]);
    expect(entry(BENCH, LIFTER)).toBeUndefined();
  });

  it("follows a corrected workout: a set taken out moves the entry back", async () => {
    seedWorkout(LIFTER, "old", [bench(set(90, 5))], { visibility: "public" });
    seedWorkout(LIFTER, "new", [bench(set(110, 1))], { visibility: "public" });
    await sync(LIFTER, "old");
    await sync(LIFTER, "new");
    expect(entry(BENCH, LIFTER)).toMatchObject({ weightKg: 110 });
    seedWorkout(LIFTER, "new", [bench(set(80, 5))], { visibility: "public" });
    await sync(LIFTER, "new");
    expect(entry(BENCH, LIFTER)).toMatchObject({
      weightKg: 90,
      workoutId: "old",
    });
    // The bench taken out of the workout altogether takes its effort.
    seedWorkout(LIFTER, "new", [], { visibility: "public" });
    await sync(LIFTER, "new");
    expect(effortsOf(LIFTER).map((e) => e.workoutId)).toEqual(["old"]);
  });
});

describe("what takes an entry off", () => {
  beforeEach(async () => {
    seedWorkout(LIFTER, "best", [bench(set(120, 1))], { visibility: "public" });
    seedWorkout(LIFTER, "next", [bench(set(100, 5))], {
      visibility: "followers",
    });
    await sync(LIFTER, "best");
    await sync(LIFTER, "next");
    expect(entry(BENCH, LIFTER)).toMatchObject({ weightKg: 120 });
  });

  it("a deleted workout takes its efforts, and the next best shown takes its place", async () => {
    db.data.delete(`users/${LIFTER}/workouts/best`);
    await liftBoards.removeWorkoutEfforts(db, {
      uid: LIFTER,
      workoutId: "best",
      nowMs: 2,
    });
    expect(effortsOf(LIFTER).map((e) => e.workoutId)).toEqual(["next"]);
    expect(entry(BENCH, LIFTER)).toMatchObject({ weightKg: 100 });
    db.data.delete(`users/${LIFTER}/workouts/next`);
    await liftBoards.removeWorkoutEfforts(db, {
      uid: LIFTER,
      workoutId: "next",
    });
    expect(entry(BENCH, LIFTER)).toBeUndefined();
  });

  it("a post made private, or deleted, takes the entry to the next shown", async () => {
    const before = read("activities/post-best");
    const after = { ...before, visibility: "private" };
    seed("activities/post-best", after);
    await liftBoards.refreshPostEntries(db, {
      activityId: "post-best",
      before,
      after,
    });
    expect(entry(BENCH, LIFTER)).toMatchObject({ weightKg: 100 });
    const next = read("activities/post-next");
    db.data.delete("activities/post-next");
    await liftBoards.refreshPostEntries(db, {
      activityId: "post-next",
      before: next,
      after: null,
    });
    expect(entry(BENCH, LIFTER)).toBeUndefined();
  });

  it("a workout unshared is written again without its post", async () => {
    const workout = read(`users/${LIFTER}/workouts/best`);
    delete workout.sharedActivityId;
    seed(`users/${LIFTER}/workouts/best`, workout);
    await sync(LIFTER, "best");
    expect(entry(BENCH, LIFTER)).toMatchObject({ weightKg: 100 });
  });

  it("an account's deletion takes its entries off every board, and no one else's", async () => {
    seedWorkout(LIFTER, "legs", [{ exerciseId: SQUAT, sets: [set(140, 3)] }], {
      visibility: "public",
    });
    await sync(LIFTER, "legs");
    seedWorkout(OTHER, "theirs", [bench(set(80, 3))], { visibility: "public" });
    await sync(OTHER, "theirs");
    expect(await liftBoards.removeLiftBoardTracesForUser(db, LIFTER)).toEqual({
      entries: 2,
    });
    expect(entry(BENCH, LIFTER)).toBeUndefined();
    expect(entry(SQUAT, LIFTER)).toBeUndefined();
    expect(entry(BENCH, OTHER)).toBeDefined();
    // The efforts go with the account's own tree.
    expect(USER_SUBCOLLECTIONS).toContain(liftBoards.EFFORTS);
  });
});

describe("which writes move a board", () => {
  it("a workout's sets, day or post link, not its notes", () => {
    const w = { date: "2026-11-10", exercises: [bench(set(100, 3))] };
    expect(liftBoards.workoutBoardMayHaveChanged(w, { ...w, notes: "x" })).toBe(
      false
    );
    expect(
      liftBoards.workoutBoardMayHaveChanged(w, { ...w, sharedActivityId: "p" })
    ).toBe(true);
    expect(
      liftBoards.workoutBoardMayHaveChanged(w, { ...w, date: "2026-11-11" })
    ).toBe(true);
    expect(
      liftBoards.workoutBoardMayHaveChanged(w, {
        ...w,
        exercises: [bench(set(105, 3))],
      })
    ).toBe(true);
  });

  it("a lift post made, deleted or seen by others, not a prop or a run's post", () => {
    const post = { type: "workout", authorId: LIFTER, visibility: "public" };
    expect(liftBoards.postMayMoveBoards(null, post)).toBe(true);
    expect(liftBoards.postMayMoveBoards(post, null)).toBe(true);
    expect(
      liftBoards.postMayMoveBoards(post, { ...post, visibility: "private" })
    ).toBe(true);
    expect(liftBoards.postMayMoveBoards(post, { ...post, kudosCount: 3 })).toBe(
      false
    );
    expect(liftBoards.postMayMoveBoards(null, { ...post, type: "run" })).toBe(
      false
    );
  });
});

describe("who sees a board", () => {
  const board = (viewerUid = VIEWER, exerciseId = BENCH) =>
    liftBoards.readLiftBoard(db, { viewerUid, exerciseId });

  beforeEach(async () => {
    seedWorkout(LIFTER, "w1", [bench(set(100, 3))], {
      visibility: "followers",
    });
    seedWorkout(OTHER, "w2", [bench(set(120, 1))], { visibility: "public" });
    await sync(LIFTER, "w1");
    await sync(OTHER, "w2");
    follow(VIEWER, LIFTER);
    follow(VIEWER, OTHER);
  });

  it("shows the viewer each person they follow who has done it, heaviest first", async () => {
    const { entries } = await board();
    expect(entries).toEqual([
      {
        uid: OTHER,
        name: "Ola Other",
        photoURL: null,
        weightKg: 120,
        reps: 1,
        day: "2026-11-10",
        activityId: "post-w2",
      },
      expect.objectContaining({ uid: LIFTER, weightKg: 100, reps: 3 }),
    ]);
  });

  it("shows only the people the viewer follows, not those who follow the viewer", async () => {
    follow(LIFTER, STRANGER);
    profile(STRANGER, "Sam Stranger");
    seedWorkout(STRANGER, "w3", [bench(set(90, 3))], { visibility: "public" });
    await sync(STRANGER, "w3");
    expect((await board()).entries.map((e) => e.uid)).toEqual([OTHER, LIFTER]);
    // The lifter follows the stranger, so sees them; no one follows the
    // stranger back, which changes nothing.
    expect((await board(LIFTER)).entries.map((e) => e.uid)).toEqual([STRANGER]);
  });

  it("reads the same board from either side: a long following list or a long board", async () => {
    for (let i = 0; i < 5; i++) follow(VIEWER, `someone-${i}`);
    const fromBoard = await board();
    for (let i = 0; i < 10; i++)
      seed(`liftBoards/${BENCH}/lifters/stranger-${i}`, {
        uid: `stranger-${i}`,
        weightKg: 500,
        reps: 1,
        activityId: "x",
      });
    const fromFollowing = await board();
    expect(fromFollowing).toEqual(fromBoard);
    expect(fromBoard.entries).toHaveLength(2);
  });

  it("shows a stranger nobody: there is no board of everyone", async () => {
    expect(await board(STRANGER)).toEqual({ entries: [] });
    for (let i = 0; i < 3; i++) follow(STRANGER, `someone-${i}`);
    expect(await board(STRANGER)).toEqual({ entries: [] });
  });

  it("a follow request is not a follow", async () => {
    seed(`followRequests/${LIFTER}/users/${STRANGER}`, { requestedAt: 1 });
    expect(await board(STRANGER)).toEqual({ entries: [] });
  });

  it("drops someone the moment the viewer unfollows them", async () => {
    db.data.delete(`following/${VIEWER}/users/${OTHER}`);
    expect((await board()).entries.map((e) => e.uid)).toEqual([LIFTER]);
  });

  it("leaves out the viewer's own entry, which the app draws from their own workouts", async () => {
    seedWorkout(VIEWER, "mine", [bench(set(200, 1))], { visibility: "public" });
    await sync(VIEWER, "mine");
    follow(VIEWER, VIEWER);
    expect((await board()).entries.map((e) => e.uid)).not.toContain(VIEWER);
  });

  it("shows nothing across a block, either way", async () => {
    seed(`blocks/${OTHER}/users/${VIEWER}`, { blockedAt: 1 });
    expect((await board()).entries.map((e) => e.uid)).toEqual([LIFTER]);
    db.data.delete(`blocks/${OTHER}/users/${VIEWER}`);
    seed(`blocks/${VIEWER}/users/${LIFTER}`, { blockedAt: 1 });
    expect((await board()).entries.map((e) => e.uid)).toEqual([OTHER]);
  });

  it("leaves out a restricted account", async () => {
    seed(`globalRestrictedUids/${OTHER}`, { restrictedAt: 1 });
    expect((await board()).entries.map((e) => e.uid)).toEqual([LIFTER]);
  });

  it("leaves out an account being deleted, or deleted", async () => {
    seed(`accountDeletionRequests/${OTHER}`, { status: "running" });
    expect((await board()).entries.map((e) => e.uid)).toEqual([LIFTER]);
    seed(`deletedAccounts/${LIFTER}`, {
      expiresAt: Date.now() + 86_400_000,
    });
    expect((await board()).entries.map((e) => e.uid)).toEqual([]);
  });

  it("hides an entry as soon as its post is made private, before any recompute", async () => {
    seed("activities/post-w2", {
      authorId: OTHER,
      type: "workout",
      visibility: "private",
    });
    expect((await board()).entries.map((e) => e.uid)).toEqual([LIFTER]);
  });

  it("is null for a lift with no board", async () => {
    expect(await board(VIEWER, "dumbbell-press")).toBeNull();
    expect(await board(VIEWER, "__proto__")).toBeNull();
  });
});

describe("the one-off backfill", () => {
  const backfill = (options) =>
    liftBoards.backfillLiftBoards(db, { pageSize: 2, nowMs: 5, ...options });

  beforeEach(() => {
    for (const uid of [LIFTER, OTHER, VIEWER, STRANGER])
      seed(`users/${uid}`, { displayName: uid });
    // Saved before the triggers: no efforts, no entries.
    seedWorkout(LIFTER, "a", [bench(set(100, 3))], { visibility: "followers" });
    seedWorkout(LIFTER, "b", [bench(set(130, 1))]);
    seedWorkout(LIFTER, "c", [{ exerciseId: SQUAT, sets: [set(150, 2)] }], {
      visibility: "private",
    });
    seedWorkout(OTHER, "d", [bench(set(90, 5))], { visibility: "public" });
    seedWorkout(OTHER, "e", [
      { exerciseId: "dumbbell-press", sets: [set(30, 8)] },
    ]);
  });

  it("writes nothing on a dry run, and says what it read", async () => {
    const before = [...db.data.keys()].sort();
    expect(await backfill()).toEqual({
      dryRun: true,
      accounts: 4,
      workouts: 5,
      liftWorkouts: 4,
      sharedLifters: 2,
      entriesWritten: 0,
    });
    expect([...db.data.keys()].sort()).toEqual(before);
  });

  it("writes what the triggers would have: every effort, and entries only from shared posts", async () => {
    const totals = await backfill({ apply: true });
    expect(totals).toMatchObject({ dryRun: false, entriesWritten: 2 });
    expect(
      effortsOf(LIFTER)
        .map((e) => e.workoutId)
        .sort()
    ).toEqual(["a", "b", "c"]);
    // The heavier bench was never shared, and the squat was shared privately.
    expect(entry(BENCH, LIFTER)).toMatchObject({
      weightKg: 100,
      workoutId: "a",
    });
    expect(entry(SQUAT, LIFTER)).toBeUndefined();
    expect(entry(BENCH, OTHER)).toMatchObject({ weightKg: 90 });
    // The same as a workout saved through the trigger's own step.
    const viaBackfill = entry(BENCH, LIFTER);
    db.data.delete(`liftBoards/${BENCH}/lifters/${LIFTER}`);
    await liftBoards.syncWorkoutEfforts(db, {
      uid: LIFTER,
      workoutId: "a",
      nowMs: 5,
    });
    expect(entry(BENCH, LIFTER)).toEqual(viaBackfill);
  });

  it("writes the same on a second run", async () => {
    await backfill({ apply: true });
    const first = new Map(db.data);
    await backfill({ apply: true });
    expect(new Map(db.data)).toEqual(first);
  });

  it("writes nothing for an account being deleted", async () => {
    seed(`accountDeletionRequests/${LIFTER}`, { status: "running" });
    await backfill({ apply: true });
    expect(effortsOf(LIFTER)).toEqual([]);
    expect(entry(BENCH, LIFTER)).toBeUndefined();
    expect(entry(BENCH, OTHER)).toBeDefined();
  });
});
