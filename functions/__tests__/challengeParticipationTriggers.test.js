import { afterEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
process.env.GCLOUD_PROJECT ||= "tropos-unit-test";
const admin = require("../lib/adminSdk");
const { memoryFirestore } = require("./helpers/memoryFirestore.cjs");
const projection = require("../lib/challengeParticipationProgress");
const deletion = require("../lib/accountDeletionLocks");
const leagues = require("../lib/leagues");

// index.js takes its `db` as it loads, so the in-memory one has to be in
// place first. With the real client, every step these tests do not stand
// in (the Health tombstone, the reversals) tried to reach Firestore, failed
// on credentials inside its step, and from firebase-admin 14 the client
// also rejects a promise nobody holds, which fails the run.
const { FieldValue, Timestamp, FieldPath } = admin.firestore;
const memoryDb = memoryFirestore({});
Object.defineProperty(admin, "firestore", {
  configurable: true,
  get: () =>
    Object.assign(() => memoryDb, { FieldValue, Timestamp, FieldPath }),
});
const fns = require("../index");
const source = { date: "2027-01-10", durationMinutes: 30 };
const snap = { data: () => source };
const context = {
  params: { uid: "participation-unit", workoutId: "lift", runId: "run" },
};

afterEach(() => vi.restoreAllMocks());

/** The league standing's refresh reads the membership; these tests run
 *  without Firestore, so it is stood in (and pinned below). */
const standInLeague = () =>
  vi
    .spyOn(leagues, "refreshLeagueStanding")
    .mockResolvedValue({ written: false });

describe("participation projection trigger reliability", () => {
  it.each([
    "onWorkoutCreated",
    "onRunCreated",
    "onWorkoutDeleted",
    "onRunDeleted",
  ])(
    "%s propagates projection failure for retry before legacy work",
    async (name) => {
      vi.spyOn(deletion, "shouldSystemWriteProceed").mockResolvedValue(true);
      vi.spyOn(
        projection,
        "reconcileParticipationChallenges"
      ).mockRejectedValue(new Error("source scan unavailable"));
      await expect(fns[name].run(snap, context)).rejects.toThrow(
        "source scan unavailable"
      );
    }
  );

  it.each(["onWorkoutUpdated", "onRunUpdated"])(
    "%s handles duration/date changes even without a correction revision",
    async (name) => {
      vi.spyOn(deletion, "shouldSystemWriteProceed").mockResolvedValue(true);
      standInLeague();
      const reconcile = vi
        .spyOn(projection, "reconcileParticipationChallenges")
        .mockResolvedValue(undefined);
      await fns[name].run(
        {
          before: snap,
          after: { data: () => ({ date: "2027-02-01", durationMinutes: 10 }) },
        },
        context
      );
      expect(reconcile).toHaveBeenCalledWith(
        expect.anything(),
        context.params.uid,
        ["2027-01-10", "2027-02-01"]
      );
      // Soc15 call 3: the league standing gets the same days, old and new.
      expect(leagues.refreshLeagueStanding).toHaveBeenCalledWith(
        expect.anything(),
        context.params.uid,
        ["2027-01-10", "2027-02-01"]
      );
    }
  );

  it.each([
    "onWorkoutCreated",
    "onRunCreated",
    "onWorkoutDeleted",
    "onRunDeleted",
  ])(
    "%s refreshes the league standing with the session's day",
    async (name) => {
      vi.spyOn(deletion, "shouldSystemWriteProceed").mockResolvedValue(true);
      vi.spyOn(
        projection,
        "reconcileParticipationChallenges"
      ).mockResolvedValue(undefined);
      const league = vi
        .spyOn(leagues, "refreshLeagueStanding")
        .mockRejectedValue(new Error("standing unavailable"));
      // A failure fails the event, so failurePolicy delivers it again.
      await expect(fns[name].run(snap, context)).rejects.toThrow(
        "standing unavailable"
      );
      expect(league).toHaveBeenCalledWith(
        expect.anything(),
        context.params.uid,
        ["2027-01-10"]
      );
    }
  );

  it("run updates honour the account deletion guard", async () => {
    const guard = vi
      .spyOn(deletion, "shouldSystemWriteProceed")
      .mockResolvedValue(false);
    const reconcile = vi
      .spyOn(projection, "reconcileParticipationChallenges")
      .mockResolvedValue(undefined);
    await fns.onRunUpdated.run({ before: snap, after: snap }, context);
    expect(guard).toHaveBeenCalledWith(
      expect.anything(),
      context.params.uid,
      "onRunUpdated"
    );
    expect(reconcile).not.toHaveBeenCalled();
  });

  it("every event that drives the new projections has a cap and a retry policy", () => {
    for (const name of [
      "onChallengeParticipantCreated",
      "onWorkoutCreated",
      "onRunCreated",
      "onWorkoutUpdated",
      "onRunUpdated",
      "onWorkoutDeleted",
      "onRunDeleted",
    ]) {
      expect(fns[name].__endpoint.maxInstances, name).toBe(50);
      expect(fns[name].__endpoint.eventTrigger.retry, name).toBe(true);
    }
  });
});
