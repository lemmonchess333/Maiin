import { afterEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
process.env.GCLOUD_PROJECT ||= "tropos-unit-test";
const projection = require("../lib/challengeParticipationProgress");
const deletion = require("../lib/accountDeletionLocks");
const fns = require("../index");
const source = { date: "2027-01-10", durationMinutes: 30 };
const snap = { data: () => source };
const context = {
  params: { uid: "participation-unit", workoutId: "lift", runId: "run" },
};

afterEach(() => vi.restoreAllMocks());

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
