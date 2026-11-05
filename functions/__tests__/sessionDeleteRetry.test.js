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
const leagues = require("../lib/leagues");
const activityReversal = require("../lib/activityReversal");
const healthWorkoutLedger = require("../lib/healthWorkoutLedger");
const communityGoal = require("../lib/communityGoal");
const pulse = require("../lib/pulse");
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
  vi.spyOn(leagues, "refreshLeagueStanding").mockResolvedValue({
    written: false,
  });
  vi.spyOn(healthWorkoutLedger, "markDeletedRun").mockResolvedValue(false);
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
  vi.spyOn(communityGoal, "reverseRunFromCommunityGoals").mockImplementation(
    async () => {
      reversed.push("community goal");
    }
  );
  vi.spyOn(pulse, "reverseSessionFromPulse").mockImplementation(async () => {
    reversed.push("pulse");
  });
});

/* A run also comes off the community goal; a workout never went on it.
   Both come off the live pulse (Soc15). */
const all = (name) =>
  name === "onRunDeleted"
    ? ["challenges", "community goal", "lifetime", "pulse"]
    : ["challenges", "lifetime", "pulse"];
const without = (name, step) => all(name).filter((s) => s !== step);

afterEach(() => vi.restoreAllMocks());

describe.each(CASES)("%s", (_name, trigger, params, data) => {
  const deliver = (timestamp = NOW) =>
    trigger.run(snapOf(data), { params, timestamp });

  it("resolves once every reversal lands", async () => {
    await expect(deliver()).resolves.toBeNull();
    expect(reversed).toEqual(all(_name));
    expect(healthWorkoutLedger.markDeletedRun).toHaveBeenCalledTimes(
      _name === "onRunDeleted" ? 1 : 0
    );
  });

  it("fails the event when the challenge reversal fails, after still reversing the lifetime total", async () => {
    activityReversal.reverseChallengeProgressForSource.mockRejectedValueOnce(
      new Error("ABORTED")
    );
    await expect(deliver()).rejects.toThrow(/challenges failed/);
    expect(reversed).toEqual(without(_name, "challenges"));
  });

  it("fails the event when the lifetime reversal fails", async () => {
    activityReversal.reverseLifetimeStat.mockRejectedValueOnce(
      new Error("ABORTED")
    );
    await expect(deliver()).rejects.toThrow(/lifetime .* failed/);
    expect(reversed).toEqual(without(_name, "lifetime"));
  });

  it.runIf(_name === "onRunDeleted")(
    "fails the event when the community goal reversal fails, after the others land",
    async () => {
      communityGoal.reverseRunFromCommunityGoals.mockRejectedValueOnce(
        new Error("ABORTED")
      );
      await expect(deliver()).rejects.toThrow(/community goal failed/);
      expect(reversed).toEqual(["challenges", "lifetime", "pulse"]);
    }
  );

  it("fails the event when the pulse reversal fails, after the others land", async () => {
    pulse.reverseSessionFromPulse.mockRejectedValueOnce(new Error("ABORTED"));
    await expect(deliver()).rejects.toThrow(/pulse failed/);
    expect(reversed).toEqual(without(_name, "pulse"));
    expect(pulse.reverseSessionFromPulse).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        uid: UID,
        kind: _name === "onRunDeleted" ? "run" : "workout",
        sessionId: _name === "onRunDeleted" ? "r1" : "w1",
        // The event's own time, the same on every redelivery.
        nowMs: Date.parse(NOW),
      })
    );
  });

  it("drops an event past the retry window without touching anything", async () => {
    await expect(deliver(DAY_AND_A_HALF_AGO)).resolves.toBeNull();
    expect(reversed).toEqual([]);
    expect(
      challengeParticipation.reconcileParticipationChallenges
    ).not.toHaveBeenCalled();
  });
});
