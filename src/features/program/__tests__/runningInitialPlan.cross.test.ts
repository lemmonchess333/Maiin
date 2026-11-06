import { createRequire } from "node:module";
import { expect, it } from "vitest";
import { RUN_TEMPLATES } from "@/lib/workoutTemplates";
const require = createRequire(import.meta.url);
const { memoryFirestore } = require("../../../../functions/__tests__/helpers/memoryFirestore.cjs");
const { adoptInitialRunningPlanTransaction } = require("../../../../functions/lib/runningInitialPlanTransaction");
it("actual adopted sessions match the first run-walk catalogue preview", async () => {
  const first = RUN_TEMPLATES.find(t => t.id === "run_walk_1")!;
  expect(first.config.runWalk).toBeDefined();
  expect(first.estimatedDuration).toBe(29);
  const firestore = memoryFirestore({
    "users/runner": {},
    "system/runningAuthority": { protocolVersion: 1, initialPlanEnabled: true },
    "users/runner/runningState/current": {
      schemaVersion: 1, accountId: "runner", revision: 3, timeZone: "UTC",
      plan: { raceGoalId: null, sessions: [] }, holds: [],
      migration: { version: 1, status: "complete" },
      constraints: {
        symptoms: "none", capacity: { confirmed: true, afterEffectsReviewed: true, daysPerWeek: 1, longestMinutes: 29 },
        restrictions: { status: "none" },
        reviewConfirmation: { version: 1, confirmed: true, authorityRevision: 3, raceGoalId: null },
      },
    },
  });
  const result = await adoptInitialRunningPlanTransaction({
    firestore, context: { auth: { uid: "runner" } }, clock: () => Date.parse("2026-11-06T12:00:00Z"),
    data: { expectedUid: "runner", expectedRevision: 3, requestId: "first", raceGoalId: null,
      confirmed: true, confirmationVersion: "initial-run-walk-v1", dates: ["2026-11-07"] },
  });
  expect(result.receipt.sessions).toEqual([{ id: "initial_20261107", date: "2026-11-07", templateId: first.id, minutes: first.estimatedDuration, kind: "run_walk" }]);
});
