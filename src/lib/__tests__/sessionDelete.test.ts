/**
 * `deleteLoggedSession` — ADR-0012's client half.
 *
 * Two properties worth holding, both about ORDER and both invisible in a
 * happy-path test:
 *
 *   1. A shared feed post is deleted BEFORE the session. The reverse order
 *      strands the post when the second delete fails, and the post is the
 *      half the user cannot clear by retrying — nothing in the app deletes
 *      an activity on its own, and the session it was reachable from is
 *      already gone.
 *   2. The session is not deleted when the post delete fails. A retry then
 *      repeats the whole thing rather than resuming from a half-state.
 *
 * Driven through the one Firestore fake (ADR-0009) rather than spies on
 * `deleteDoc`, so the assertions are about documents that did or did not
 * survive, not about which functions were called with what.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("firebase/firestore");

import {
  resetFirestore,
  seedFirestore,
  allPaths,
  writeLog,
  failNextFirestore,
  unfiredFailures,
} from "@/test/firestoreHarness";
import { deleteLoggedSession } from "@/lib/sessionDelete";

/** Deletes only, in the order they were applied. */
function deletions(): string[] {
  return writeLog()
    .filter((w) => w.op === "delete")
    .map((w) => w.path);
}

beforeEach(() => {
  resetFirestore();
  seedFirestore({
    "users/u1/workouts/w-1": { date: "2026-08-05", totalVolume: 6000 },
    "users/u1/runs/r-1": { date: "2026-08-05", distance: 6000 },
    "activities/act-1": { authorId: "u1", type: "workout" },
  });
});

describe("deleteLoggedSession", () => {
  it("deletes a workout document", async () => {
    await deleteLoggedSession({ uid: "u1", kind: "workout", id: "w-1" });
    expect(allPaths()).not.toContain("users/u1/workouts/w-1");
    // The run is untouched — the id alone does not pick the collection.
    expect(allPaths()).toContain("users/u1/runs/r-1");
  });

  it("deletes a run from the runs subcollection", async () => {
    // Pinned separately because the collection is chosen by `kind`, and a
    // mapping bug would delete from the wrong subcollection and still
    // resolve: deleting a document that does not exist is not an error in
    // Firestore, so the caller sees success either way.
    await deleteLoggedSession({ uid: "u1", kind: "run", id: "r-1" });
    expect(allPaths()).not.toContain("users/u1/runs/r-1");
    expect(allPaths()).toContain("users/u1/workouts/w-1");
  });

  it("deletes a linked feed post BEFORE the session", async () => {
    await deleteLoggedSession({
      uid: "u1",
      kind: "workout",
      id: "w-1",
      sharedActivityId: "act-1",
    });
    expect(deletions()).toEqual([
      "activities/act-1",
      "users/u1/workouts/w-1",
    ]);
  });

  it("leaves the session in place when the post delete fails", async () => {
    failNextFirestore("deleteDoc", { path: "activities/act-1" });

    await expect(
      deleteLoggedSession({
        uid: "u1",
        kind: "workout",
        id: "w-1",
        sharedActivityId: "act-1",
      })
    ).rejects.toBeTruthy();

    // The failure actually fired — without this the test would pass just
    // as happily against a typo'd path, exercising the happy path and
    // asserting nothing.
    expect(unfiredFailures()).toEqual([]);
    // The session survived, so the user's retry is a plain repeat rather
    // than a resume from a half-deleted state.
    expect(allPaths()).toContain("users/u1/workouts/w-1");
  });

  it("touches no activity when the session was never shared", async () => {
    await deleteLoggedSession({
      uid: "u1",
      kind: "run",
      id: "r-1",
      sharedActivityId: null,
    });
    expect(deletions()).toEqual(["users/u1/runs/r-1"]);
    expect(allPaths()).toContain("activities/act-1");
  });
});
