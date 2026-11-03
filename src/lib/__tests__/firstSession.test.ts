// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  failNextFirestore,
  resetFirestore,
  seedFirestore,
  unfiredFailures,
} from "@/test/firestoreHarness";

/**
 * Whether a session is the account's first, for the post's "First session
 * on Tropos" (Soc15). Read through the one Firestore fake (ADR-0009), with
 * documents shaped as the app saves them: a workout's `date`, a run's
 * `completedAt`, which the readers order by.
 */
vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({
  db: {},
  auth: { currentUser: { uid: "u1" } },
}));

import { hasEarlierSession } from "../firstSession";
import { localDateString } from "../dateHelpers";

const today = localDateString(new Date());
const workout = { date: today, exercises: [], createdAt: new Date() };
const savedRun = { date: today, distance: 5000, completedAt: new Date() };

let online: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  resetFirestore();
  localStorage.clear();
  online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
});
afterEach(() => online.mockRestore());

describe("hasEarlierSession", () => {
  it("is false for an account with no saved session: its first", async () => {
    expect(await hasEarlierSession("u1")).toBe(false);
  });

  it("does not count the session itself, saved before its post", async () => {
    seedFirestore({ "users/u1/workouts/programme-c1": workout });
    expect(await hasEarlierSession("u1", { workoutId: "programme-c1" })).toBe(
      false
    );
    seedFirestore({ "users/u1/runs/run-1": savedRun });
    expect(await hasEarlierSession("u1", { runId: "run-1" })).toBe(true);
  });

  it("is true with any earlier workout or run, however long ago", async () => {
    seedFirestore({
      "users/u1/workouts/old": { ...workout, date: "2024-01-03" },
    });
    expect(await hasEarlierSession("u1", { runId: "run-new" })).toBe(true);
    resetFirestore();
    seedFirestore({ "users/u1/runs/old": savedRun });
    expect(await hasEarlierSession("u1", { workoutId: "programme-new" })).toBe(
      true
    );
  });

  it("does not know offline, where the phone's copy could miss one", async () => {
    online.mockReturnValue(false);
    expect(await hasEarlierSession("u1")).toBeNull();
  });

  it("does not know when the read fails", async () => {
    failNextFirestore("getDocs");
    expect(await hasEarlierSession("u1")).toBeNull();
    expect(unfiredFailures()).toEqual([]);
  });
});
