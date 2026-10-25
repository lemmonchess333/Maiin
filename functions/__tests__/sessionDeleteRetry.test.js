/**
 * The session delete triggers fail the event when a reversal fails, so
 * failurePolicy delivers it again, and drop an event past the retry window
 * (lib/triggerRetry.js). Each caught and logged its reversal's error and
 * returned null, so a failed reversal was never retried: the source is
 * already gone, and nothing else re-fires.
 *
 * Every collaborator is swapped on its module object, which is what
 * index.js calls through, so nothing here reaches Firestore.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
process.env.GCLOUD_PROJECT ||= "tropos-unit-test";

const accountDeletionLocks = require("../lib/accountDeletionLocks");
const challengeParticipation = require("../lib/challengeParticipationProgress");
const friendsBoard = require("../lib/friendsBoard");
const activityReversal = require("../lib/activityReversal");
const { onWorkoutDeleted, onRunDeleted } = require("../index");

const UID = "deleter";
const NOW = new Date().toISOString();
const DAY_AND_A_HALF_AGO = new Date(Date.now() - 36 * 3_600_000).toISOString();

const snapOf = (data) => ({ data: () => data });

const CASES = [
  [
    "onWorkoutDeleted",
    onWorkoutDeleted,
    { uid: UID, workoutId: "w1" },
    { date: "2026-10-20", totalVolume: 1200 },
  ],
  [
    "onRunDeleted",
    onRunDeleted,
    { uid: UID, runId: "r1" },
    { date: "2026-10-20", distance: 5000 },
  ],
];

let reversed;

beforeEach(() => {
  reversed = [];
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(accountDeletionLocks, "shouldSystemWriteProceed").mockResolvedValue(
    true
  );
  vi.spyOn(
    challengeParticipation,
    "reconcileParticipationChallenges"
  ).mockResolvedValue(undefined);
  vi.spyOn(friendsBoard, "refreshBoardWeek").mockResolvedValue(undefined);
  vi.spyOn(
    activityReversal,
    "reverseChallengeProgressForSource"
  ).mockImplementation(async () => {
    reversed.push("challenges");
  });
  vi.spyOn(activityReversal, "reverseLifetimeStat").mockImplementation(
    async () => {
      reversed.push("lifetime");
    }
  );
});

afterEach(() => vi.restoreAllMocks());

describe.each(CASES)("%s", (_name, trigger, params, data) => {
  const deliver = (timestamp = NOW) =>
    trigger.run(snapOf(data), { params, timestamp });

  it("resolves once both reversals land", async () => {
    await expect(deliver()).resolves.toBeNull();
    expect(reversed).toEqual(["challenges", "lifetime"]);
  });

  it("fails the event when the challenge reversal fails, after still reversing the lifetime total", async () => {
    activityReversal.reverseChallengeProgressForSource.mockRejectedValueOnce(
      new Error("ABORTED")
    );
    await expect(deliver()).rejects.toThrow(/challenges failed/);
    expect(reversed).toEqual(["lifetime"]);
  });

  it("fails the event when the lifetime reversal fails", async () => {
    activityReversal.reverseLifetimeStat.mockRejectedValueOnce(
      new Error("ABORTED")
    );
    await expect(deliver()).rejects.toThrow(/lifetime .* failed/);
    expect(reversed).toEqual(["challenges"]);
  });

  it("drops an event past the retry window without touching anything", async () => {
    await expect(deliver(DAY_AND_A_HALF_AGO)).resolves.toBeNull();
    expect(reversed).toEqual([]);
    expect(
      challengeParticipation.reconcileParticipationChallenges
    ).not.toHaveBeenCalled();
  });
});
