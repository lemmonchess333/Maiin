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

import {
  earlierSessions,
  isFirstOfSport,
  isFirstSession,
} from "../firstSession";

/** Whether the account has any earlier session: the post's first session
 *  is a known false. Null when it can't be known. */
const hasEarlierSession = async (
  ...args: Parameters<typeof earlierSessions>
) => {
  const earlier = await earlierSessions(...args);
  return earlier === null ? null : !isFirstSession(earlier);
};
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

describe("earlierSessions: the account's first session", () => {
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

/* DS4 call 3 (owner, 7 November 2026): a lifter's first run, or a runner's
   first lift, is a first on the finish screen. The post keeps the
   account's first. */
describe("the first of a sport", () => {
  it("counts a lifter's first run as a first run, not a first session", async () => {
    seedFirestore({
      "users/u1/workouts/old": { ...workout, date: "2024-01-03" },
      "users/u1/runs/run-1": savedRun,
    });
    const earlier = await earlierSessions("u1", { runId: "run-1" });
    expect(earlier).toEqual({ workouts: true, runs: false });
    expect(isFirstOfSport(earlier, "run")).toBe(true);
    expect(isFirstOfSport(earlier, "lift")).toBe(false);
    expect(isFirstSession(earlier)).toBe(false);
  });

  it("counts a runner's first lift as a first workout", async () => {
    seedFirestore({ "users/u1/runs/old": savedRun });
    const earlier = await earlierSessions("u1", {
      workoutId: "programme-new",
    });
    expect(isFirstOfSport(earlier, "lift")).toBe(true);
    expect(isFirstSession(earlier)).toBe(false);
  });

  it("is the account's first, and its sport's, with nothing earlier", async () => {
    const earlier = await earlierSessions("u1");
    expect(isFirstSession(earlier)).toBe(true);
    expect(isFirstOfSport(earlier, "lift")).toBe(true);
  });

  it("claims no first it can't know", () => {
    expect(isFirstSession(null)).toBe(false);
    expect(isFirstOfSport(null, "run")).toBe(false);
  });
});
