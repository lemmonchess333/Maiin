/**
 * A renamed run's post takes the new name (lib/runRename), carried by
 * onRunUpdated from the current documents. Driven against the in-memory
 * Firestore.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
process.env.GCLOUD_PROJECT ||= "tropos-unit-test";
const { memoryFirestore } = require("./helpers/memoryFirestore.cjs");
const {
  syncSharedRunName,
  runNameMayHaveChanged,
  postableRunName,
} = require("../lib/runRename");

const RUN = "users/ana/runs/r1";
const POST = "activities/p1";

/** A run as the finish screen saves it, linked to its post. */
function seeded({ run = {}, post = {} } = {}) {
  return memoryFirestore({
    [RUN]: {
      name: "Morning run",
      distance: 5000,
      sharedActivityId: "p1",
      ...run,
    },
    [POST]: {
      authorId: "ana",
      type: "run",
      visibility: "followers",
      runName: "Morning run",
      activityTitle: "Morning run",
      kudosCount: 0,
      commentCount: 0,
      ...post,
    },
  });
}

const sync = (db) =>
  syncSharedRunName(db, "ana", "r1", { serverTimestamp: () => "now" });

describe("syncSharedRunName", () => {
  it("gives the post the run's new name", async () => {
    const db = seeded({ run: { name: "Parkrun with Sam" } });
    expect(await sync(db)).toBe("renamed");
    expect(db.data.get(POST)).toMatchObject({
      runName: "Parkrun with Sam",
      activityTitle: "Parkrun with Sam",
      visibility: "followers",
    });
  });

  it("writes nothing when delivered again", async () => {
    const db = seeded({ run: { name: "Parkrun with Sam" } });
    await sync(db);
    expect(await sync(db)).toBe("unchanged");
    expect(db.operations.filter(([, path]) => path === POST)).toHaveLength(1);
  });

  it("leaves a post that is not the runner's own alone", async () => {
    const db = seeded({
      run: { name: "Parkrun with Sam" },
      post: { authorId: "someone-else" },
    });
    expect(await sync(db)).toBe("unchanged");
    expect(db.data.get(POST).runName).toBe("Morning run");
  });

  it("leaves a lift's post alone", async () => {
    const db = seeded({
      run: { name: "Parkrun with Sam" },
      post: { type: "workout" },
    });
    expect(await sync(db)).toBe("unchanged");
    expect(db.data.get(POST).runName).toBe("Morning run");
  });

  it("does nothing for a run that was never shared", async () => {
    const db = seeded({ run: { name: "Parkrun", sharedActivityId: null } });
    expect(await sync(db)).toBe("unchanged");
    expect(db.data.get(POST).runName).toBe("Morning run");
  });

  it("cuts the name as the app does, and never writes an empty one", async () => {
    const long = seeded({ run: { name: `  ${"a".repeat(120)}  ` } });
    await sync(long);
    expect(long.data.get(POST).runName).toBe("a".repeat(80));

    const blank = seeded({ run: { name: "   " } });
    expect(await sync(blank)).toBe("unchanged");
    expect(blank.data.get(POST).runName).toBe("Morning run");
  });

  it("flags a post renamed to a word the filter refuses, and makes it private", async () => {
    const db = seeded({ run: { name: "shit run" } });
    expect(await sync(db)).toBe("flagged");
    expect(db.data.get(POST)).toMatchObject({
      runName: "shit run",
      flagged: true,
      autoFlagged: true,
      flaggedField: "runName",
      flaggedAt: "now",
      visibility: "private",
    });
  });

  it("keeps a flagged post private when it is renamed again", async () => {
    const db = seeded({
      run: { name: "Easy run" },
      post: { flagged: true, visibility: "private" },
    });
    expect(await sync(db)).toBe("renamed");
    expect(db.data.get(POST)).toMatchObject({
      runName: "Easy run",
      flagged: true,
      visibility: "private",
    });
  });
});

describe("runNameMayHaveChanged", () => {
  it("is true for a new name or a newly linked post, and false otherwise", () => {
    expect(runNameMayHaveChanged({ name: "a" }, { name: "b" })).toBe(true);
    expect(
      runNameMayHaveChanged(
        { name: "a" },
        { name: "a", sharedActivityId: "p1" }
      )
    ).toBe(true);
    expect(
      runNameMayHaveChanged(
        { name: "a", sharedActivityId: "p1", distance: 1 },
        { name: "a", sharedActivityId: "p1", distance: 2 }
      )
    ).toBe(false);
  });

  it("reads no name from a value that is not one", () => {
    expect(postableRunName(undefined)).toBeNull();
    expect(postableRunName(42)).toBeNull();
    expect(postableRunName(" Tempo ")).toBe("Tempo");
  });
});

describe("onRunUpdated", () => {
  afterEach(() => vi.restoreAllMocks());

  it("carries a rename to the post, and leaves other updates alone", async () => {
    const deletion = require("../lib/accountDeletionLocks");
    const projection = require("../lib/challengeParticipationProgress");
    const board = require("../lib/friendsBoard");
    const rename = require("../lib/runRename");
    const fns = require("../index");
    vi.spyOn(deletion, "shouldSystemWriteProceed").mockResolvedValue(true);
    vi.spyOn(projection, "reconcileParticipationChallenges").mockResolvedValue(
      undefined
    );
    vi.spyOn(board, "refreshBoardWeek").mockResolvedValue(undefined);
    const carried = vi
      .spyOn(rename, "syncSharedRunName")
      .mockResolvedValue("renamed");
    const context = { params: { uid: "ana", runId: "r1" } };
    const doc = (data) => ({ data: () => data });

    await fns.onRunUpdated.run(
      {
        before: doc({ name: "Run", sharedActivityId: "p1" }),
        after: doc({ name: "Hills", sharedActivityId: "p1" }),
      },
      context
    );
    expect(carried).toHaveBeenCalledWith(
      expect.anything(),
      "ana",
      "r1",
      expect.anything()
    );

    carried.mockClear();
    await fns.onRunUpdated.run(
      {
        before: doc({ name: "Hills", notes: "" }),
        after: doc({ name: "Hills", notes: "Windy" }),
      },
      context
    );
    expect(carried).not.toHaveBeenCalled();
  });
});
