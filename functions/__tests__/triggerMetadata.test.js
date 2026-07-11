/**
 * Trigger metadata snapshot (2026-07-11 repo audit batch 6 — the safety
 * net REQUIRED before any functions/index.js extraction).
 *
 * Pins, for every exported trigger: its kind, its maxInstances cap (the
 * cost-runaway guard CLAUDE.md makes mandatory), its Secret Manager
 * bindings, and its schedule / event source. A domain-extraction PR that
 * accidentally drops a cap, loses a secret binding, renames an export,
 * or shifts a schedule fails HERE, loudly, before deploy.
 *
 * When a change to this table is INTENTIONAL (a new function, a
 * deliberate cap change), update the literal in the same PR — the diff
 * is the review surface. Never regenerate it blindly.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

/* firebase-functions/v1 refuses to construct triggers without a project
   id; unit runs have no emulator env, so mirror the suite convention
   (performanceEngine.test.js) BEFORE ../index is required. */
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || "tropos-unit-test";

const EXPECTED = {
  verifyApplePurchase: {
    kind: "callable",
    maxInstances: 100,
    secrets: ["STRIPE_SECRET_KEY"],
  },
  appleIAPWebhook: {
    kind: "http",
    maxInstances: 100,
    secrets: ["STRIPE_SECRET_KEY"],
  },
  restoreApplePurchases: {
    kind: "callable",
    maxInstances: 100,
    secrets: [
      "APPLE_ISSUER_ID",
      "APPLE_KEY_ID",
      "APPLE_PRIVATE_KEY",
      "BILLING_HMAC_SECRET",
      "BILLING_PREVIOUS_HMAC_SECRET",
      "STRIPE_SECRET_KEY",
    ],
  },
  deleteMyAccount: {
    kind: "callable",
    maxInstances: 100,
    secrets: ["BILLING_HMAC_SECRET", "STRIPE_SECRET_KEY"],
  },
  completeOnboarding: {
    kind: "callable",
    maxInstances: 100,
    secrets: [],
  },
  configurePlan: {
    kind: "callable",
    maxInstances: 100,
    secrets: [],
  },
  analyzeFood: {
    kind: "http",
    maxInstances: 100,
    secrets: [],
  },
  analyzeFoodText: {
    kind: "http",
    maxInstances: 100,
    secrets: [],
  },
  askGeminiText: {
    kind: "callable",
    maxInstances: 100,
    secrets: [],
  },
  createCheckoutSession: {
    kind: "http",
    maxInstances: 100,
    secrets: ["STRIPE_SECRET_KEY"],
  },
  stripeWebhook: {
    kind: "http",
    maxInstances: 100,
    secrets: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"],
  },
  computePerformanceWeek: {
    kind: "callable",
    maxInstances: 100,
    secrets: [],
  },
  weeklyPerformanceRollup: {
    kind: "schedule",
    maxInstances: 1,
    secrets: [],
    schedule: "15 23 * * 0",
  },
  dailyPerformanceRefresh: {
    kind: "schedule",
    maxInstances: 1,
    secrets: [],
    schedule: "10 2 * * *",
  },
  rolloverChallenges: {
    kind: "schedule",
    maxInstances: 1,
    secrets: [],
    schedule: "5 0 * * *",
  },
  hourlyStreakNudge: {
    kind: "schedule",
    maxInstances: 1,
    secrets: [],
    schedule: "0 * * * *",
  },
  sendTestPush: {
    kind: "callable",
    maxInstances: 100,
    secrets: [],
  },
  dailyRaceReconciliationSweep: {
    kind: "schedule",
    maxInstances: 1,
    secrets: [],
    schedule: "0 4 * * *",
  },
  onChallengeParticipantCreated: {
    kind: "event",
    maxInstances: 50,
    secrets: [],
    eventType: "providers/cloud.firestore/eventTypes/document.create",
    resource:
      "projects/{project}/databases/(default)/documents/challenges/{challengeId}/participants/{uid}",
  },
  onChallengeParticipantDeleted: {
    kind: "event",
    maxInstances: 50,
    secrets: [],
    eventType: "providers/cloud.firestore/eventTypes/document.delete",
    resource:
      "projects/{project}/databases/(default)/documents/challenges/{challengeId}/participants/{uid}",
  },
  onWorkoutCreated: {
    kind: "event",
    maxInstances: 50,
    secrets: [],
    eventType: "providers/cloud.firestore/eventTypes/document.create",
    resource:
      "projects/{project}/databases/(default)/documents/users/{uid}/workouts/{workoutId}",
  },
  onRunCreated: {
    kind: "event",
    maxInstances: 50,
    secrets: [],
    eventType: "providers/cloud.firestore/eventTypes/document.create",
    resource:
      "projects/{project}/databases/(default)/documents/users/{uid}/runs/{runId}",
  },
  crewWeeklyLeaderboardRollup: {
    kind: "schedule",
    maxInstances: 1,
    secrets: [],
    schedule: "30 2 * * *",
  },
  refreshMyCrewLeaderboard: {
    kind: "callable",
    maxInstances: 100,
    secrets: [],
  },
  backfillMyActivityCategories: {
    kind: "callable",
    maxInstances: 100,
    secrets: [],
  },
  onActivityCreated: {
    kind: "event",
    maxInstances: 50,
    secrets: [],
    eventType: "providers/cloud.firestore/eventTypes/document.create",
    resource:
      "projects/{project}/databases/(default)/documents/activities/{activityId}",
  },
  onCommentCreated: {
    kind: "event",
    maxInstances: 50,
    secrets: [],
    eventType: "providers/cloud.firestore/eventTypes/document.create",
    resource:
      "projects/{project}/databases/(default)/documents/comments/{activityId}/items/{commentId}",
  },
  listPendingReports: {
    kind: "callable",
    maxInstances: 10,
    secrets: [],
  },
  resolveReport: {
    kind: "callable",
    maxInstances: 10,
    secrets: [],
  },
  toggleKudosCallable: {
    kind: "callable",
    maxInstances: 100,
    secrets: [],
  },
  addCommentCallable: {
    kind: "callable",
    maxInstances: 100,
    secrets: [],
  },
  deleteCommentCallable: {
    kind: "callable",
    maxInstances: 100,
    secrets: [],
  },
  toggleCommentReactionCallable: {
    kind: "callable",
    maxInstances: 100,
    secrets: [],
  },
  sendPasswordResetLinkCallable: {
    kind: "callable",
    maxInstances: 100,
    secrets: ["RESEND_API_KEY"],
  },
  sendVerificationEmailCallable: {
    kind: "callable",
    maxInstances: 100,
    secrets: ["RESEND_API_KEY"],
  },
  setCrewMembershipCallable: {
    kind: "callable",
    maxInstances: 100,
    secrets: [],
  },
  weeklyFellBehindCheck: {
    kind: "schedule",
    maxInstances: 1,
    secrets: [],
    schedule: "0 5 * * 1",
  },
  createGoalSpace: {
    kind: "callable",
    maxInstances: 100,
    secrets: [],
  },
  joinGoalSpace: {
    kind: "callable",
    maxInstances: 100,
    secrets: [],
  },
  leaveGoalSpace: {
    kind: "callable",
    maxInstances: 100,
    secrets: [],
  },
  removeGoalSpaceMember: {
    kind: "callable",
    maxInstances: 100,
    secrets: [],
  },
};

function endpointSummary(fn) {
  const ep = fn && fn.__endpoint;
  if (!ep) return null;
  const kind = ep.callableTrigger
    ? "callable"
    : ep.scheduleTrigger
      ? "schedule"
      : ep.eventTrigger
        ? "event"
        : ep.httpsTrigger
          ? "http"
          : "other";
  return {
    kind,
    maxInstances: ep.maxInstances ?? null,
    secrets: (ep.secretEnvironmentVariables || []).map((s) => s.key).sort(),
    ...(ep.scheduleTrigger ? { schedule: ep.scheduleTrigger.schedule } : {}),
    ...(ep.eventTrigger
      ? {
          eventType: ep.eventTrigger.eventType,
          /* The resource path embeds the ambient GCLOUD_PROJECT (unit
             runs use tropos-unit-test, the emulator lane demo-tropos) —
             normalize it so the pin is project-agnostic and asserts the
             part that matters: the document path. */
          resource:
            (
              (ep.eventTrigger.eventFilters &&
                ep.eventTrigger.eventFilters.resource) ||
              ""
            ).replace(/^projects\/[^/]+\//, "projects/{project}/") || null,
        }
      : {}),
  };
}

describe("functions trigger metadata snapshot", () => {
  const fns = require("../index");
  const actual = {};
  for (const [name, fn] of Object.entries(fns)) {
    const summary = endpointSummary(fn);
    if (summary) actual[name] = summary;
  }

  it("exports exactly the expected trigger set", () => {
    expect(Object.keys(actual).sort()).toEqual(Object.keys(EXPECTED).sort());
  });

  it("every trigger's kind / cap / secrets / schedule matches the pinned table", () => {
    for (const [name, expected] of Object.entries(EXPECTED)) {
      expect({ [name]: actual[name] }).toEqual({ [name]: expected });
    }
  });

  it("no trigger is missing a maxInstances cap (CLAUDE.md cost guard)", () => {
    for (const [name, meta] of Object.entries(actual)) {
      expect({ [name]: meta.maxInstances }).not.toEqual({ [name]: null });
    }
  });
});
