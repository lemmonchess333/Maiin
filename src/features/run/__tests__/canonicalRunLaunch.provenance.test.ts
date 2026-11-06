// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({
  db: {},
  auth: { currentUser: { uid: "runner" } },
}));
import { canonicalRunConfig } from "../canonicalRunLaunch";
import { withoutRunningPrescription } from "../runningPrescriptionLaunch";
import { runDocument, type FinishedRun } from "@/lib/runCompletion";
import {
  readStoredRun,
  writeStoredRun,
  RUN_RESUME_SCHEMA_VERSION,
} from "@/lib/runResumeStorage";
import { createRunSessionIdentity } from "@/lib/runSessionIdentity";
import { parseSavedRun } from "@/lib/savedRuns";
import { claimableRuns, claimMapFor } from "@/lib/runClaims";
import { isVolumeEligible } from "@/lib/runStatsEligibility";
import { runSessionReducer } from "../runSessionReducer";
const NOW = Date.now();
const config = canonicalRunConfig(
  {
    schemaVersion: 1,
    accountId: "runner",
    revision: 4,
    raceGoalId: null,
    timeZone: "UTC",
    session: {
      id: "canonical_session",
      date: new Date(NOW).toISOString().slice(0, 10),
      templateId: "run_walk_1",
      minutes: 29,
      kind: "run_walk",
    },
  },
  { audioCues: true }
);
afterEach(() => localStorage.clear());
it("keeps provenance in the interrupted snapshot but cannot resume it as permission or bind a legacy slot", () => {
  const identity = createRunSessionIdentity("runner", "run_1", config, NOW);
  expect(identity.scheduledRunId).toBeNull();
  expect(
    writeStoredRun("runner", {
      v: RUN_RESUME_SCHEMA_VERSION,
      config,
      identity,
      startedAt: NOW,
      accumulatedSeconds: 90,
      isRunning: false,
      lastWriteAt: NOW,
      phase: "paused",
      points: [],
    })
  ).toBe(true);
  const saved = readStoredRun("runner")!;
  expect(saved.config.canonicalLaunch).toEqual(config.canonicalLaunch);
  // Current resume policy is explicit unprescribed continuation, not reusing
  // old launch permission. Its activity survives; its prescription claim does not.
  const resumed = withoutRunningPrescription(saved.config);
  expect(resumed.canonicalLaunch).toBeUndefined();
  expect(resumed.planMetadata.scheduledRunId).toBeNull();
  expect(resumed.segments).toBeUndefined();
});
it("persists canonical provenance in the ordinary saved run without issuing any plan completion credit", () => {
  const run: FinishedRun = {
    points: [],
    distance: 1000,
    elapsed: 1800,
    avgPaceSeconds: 1800,
    calories: 100,
    elevationGain: 0,
    splits: [],
    runConfig: config,
    notes: "",
    relativeEffort: null,
    paceVerdictTone: null,
    isInvalid: false,
    invalidReason: null,
    routeQuality: null,
    bestEfforts: [],
    shoeId: null,
  };
  const doc = runDocument(run);
  expect(doc.runConfig?.canonicalLaunch).toEqual(config.canonicalLaunch);
  const parsed = parseSavedRun("run_1", doc)!;
  expect(parsed.legacyPlanClaimExcluded).toBe(true);
  expect(isVolumeEligible(parsed)).toBe(true); // History/food/volume are intact.
  expect(claimableRuns([parsed])).toHaveLength(1); // Still visible as logged activity.
  const day = {
    id: "legacy_slot",
    date: parsed.day,
    weekKey: parsed.day,
    dayIndex: 1,
    type: "easy" as const,
    templateId: "easy_30",
  };
  const claims = claimMapFor([day], claimableRuns([parsed]), {}, parsed.day);
  expect(claims.get(day.id)?.claimedSavedRunId).toBeUndefined();
  // Contrast the actual legacy matcher, which otherwise soft-links by date.
  const legacy = { ...parsed, legacyPlanClaimExcluded: false };
  expect(
    claimMapFor([day], claimableRuns([legacy]), {}, parsed.day).get(day.id)
      ?.claimedSavedRunId
  ).toBe("run_1");
  expect(doc).toMatchObject({
    planMode: "freeform",
    planSource: "manual",
    scheduledRunId: null,
    plannedRunDayIndex: null,
    plannedTemplateId: null,
    actualTemplateId: null,
    matchedPlanExact: null,
  });
});
it("cancels rejected canonical preparation without altering an already active or finished run", () => {
  expect(
    runSessionReducer("countdown", { type: "CANONICAL_START_REJECTED" })
  ).toBe("waiting");
  expect(
    runSessionReducer("acquiring", { type: "CANONICAL_START_REJECTED" })
  ).toBe("waiting");
  expect(
    runSessionReducer("active", { type: "CANONICAL_START_REJECTED" })
  ).toBe("active");
  expect(
    runSessionReducer("finished", { type: "CANONICAL_START_REJECTED" })
  ).toBe("finished");
});

it.each([null, {}, "malformed"])(
  "excludes any own canonical provenance field from legacy claims, including %j",
  (canonicalLaunch) => {
    const parsed = parseSavedRun("run_1", {
      date: new Date().toISOString().slice(0, 10),
      distance: 1000,
      duration: 300,
      runConfig: { canonicalLaunch },
      completedAt: new Date(),
    })!;
    expect(parsed.legacyPlanClaimExcluded).toBe(true);
    expect(claimableRuns([parsed])).toHaveLength(1);
  }
);
