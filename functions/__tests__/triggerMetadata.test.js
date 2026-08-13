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
 *
 * STATUS 2026-07-25 — the extraction this was built for has NOT happened;
 * index.js is still ~6.3k lines / 69 exports. That is a deliberate hold,
 * not an oversight: ADR-0001 settled that file size is not a depth signal
 * here, and the invariant size might threaten — the mandatory cap — is
 * pinned by this very file. Size alone is not a reason to refactor the
 * riskiest deploy surface in the repo.
 *
 * The net itself was verified rather than assumed, by mutating index.js
 * and confirming each failure mode is caught:
 *
 *   dropped maxInstances cap  → "kind / cap / secrets / schedule" fails
 *   lost secret binding       → same assertion fails
 *   renamed export            → "exports exactly the expected trigger set"
 *                               AND the metadata assertion fail
 *   shifted pubsub schedule   → metadata assertion fails
 *
 * So whenever the extraction IS taken up, it is an appetite question, not
 * a risk question — this net demonstrably catches the four ways a move
 * goes wrong. Do it as one domain per PR, and spot-check the deployed
 * source afterwards (CI green does not prove an upload happened — see the
 * dedup/bundle-hash gotcha in CLAUDE.md).
 *
 * STATUS 2026-08-02 — hold RE-EXAMINED and it STANDS. The prompt this time
 * was a knowledge-graph clustering run that flagged index.js as the
 * weakest-cohesion community in the whole codebase (89 nodes, cohesion
 * 0.023) and asked whether it should be split. It should not, and the score
 * is not evidence that it should: an entrypoint that MUST export every
 * deployed function is low-cohesion by construction, and a clustering
 * algorithm cannot tell that apart from tangled logic. The audit that
 * followed found no export earning extraction on testability grounds — the
 * inline race-reconciliation decisions are already test-reachable, and
 * ADR-0008 classifies them as deliberate non-mirrors.
 *
 * Recording it here because this is at least the FOURTH time the question
 * has been asked, and each round re-derives the same answer from scratch.
 * If you are reading this while considering a split: the answer is no
 * unless something other than size or a graph metric has changed.
 *
 * A fifth-time note: `timeoutSeconds` was added to the schedule rows below
 * on the same date. Until then SCHEDULED_CAP's timeout half was unpinned,
 * so "the mandatory cap is pinned by this very file" — the sentence this
 * hold rests on — was only three-quarters true.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

/* firebase-functions/v1 refuses to construct triggers without a project
   id; unit runs have no emulator env, so mirror the suite convention
   (performanceEngine.test.js) BEFORE ../index is required. */
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || "tropos-unit-test";

const EXPECTED = {
  applyProgramCommand: {
    kind: "callable",
    maxInstances: 100,
    secrets: [],
  },
  claimPushDeviceToken: {
    kind: "callable",
    maxInstances: 100,
    secrets: [],
  },
  // Run11 (Mapbox supersession 2026-07-17) — Pro-gated Directions proxy.
  // The token binding is the deploy gate: provision MAPBOX_DIRECTIONS_TOKEN
  // before merging or every functions deploy fails (the #1636 class).
  planRunningRoute: {
    kind: "callable",
    maxInstances: 100,
    secrets: ["MAPBOX_DIRECTIONS_TOKEN"],
  },
  releasePushDeviceToken: {
    kind: "callable",
    maxInstances: 100,
    secrets: [],
  },
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
    timeoutSeconds: 540,
  },
  dailyPerformanceRefresh: {
    kind: "schedule",
    maxInstances: 1,
    secrets: [],
    schedule: "10 2 * * *",
    timeoutSeconds: 540,
  },
  rolloverChallenges: {
    kind: "schedule",
    maxInstances: 1,
    secrets: [],
    schedule: "5 0 * * *",
    timeoutSeconds: 540,
  },
  // SOC-P2a — weekly Coach prompts seeded into every Community Space.
  weeklyCoachPrompts: {
    kind: "schedule",
    maxInstances: 1,
    secrets: [],
    schedule: "0 6 * * 1",
    timeoutSeconds: 540,
  },
  hourlyStreakNudge: {
    kind: "schedule",
    maxInstances: 1,
    secrets: [],
    schedule: "0 * * * *",
    timeoutSeconds: 540,
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
    timeoutSeconds: 540,
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
  // ADR-0012 — the delete halves. Same collections, same cap: they fire
  // once per document during an account deletion sweep, so an uncapped
  // pair would fan out across a user's entire logged history.
  onWorkoutDeleted: {
    kind: "event",
    maxInstances: 50,
    secrets: [],
    eventType: "providers/cloud.firestore/eventTypes/document.delete",
    resource:
      "projects/{project}/databases/(default)/documents/users/{uid}/workouts/{workoutId}",
  },
  onRunDeleted: {
    kind: "event",
    maxInstances: 50,
    secrets: [],
    eventType: "providers/cloud.firestore/eventTypes/document.delete",
    resource:
      "projects/{project}/databases/(default)/documents/users/{uid}/runs/{runId}",
  },
  backfillMyActivityCategories: {
    kind: "callable",
    maxInstances: 100,
    secrets: [],
  },
  // One-shot re-credit for the lift volume that `totalVolume`'s absence
  // from the workout doc never counted. Self-service, no secrets.
  recreditMyLiftVolume: {
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
  createReport: {
    kind: "callable",
    maxInstances: 100,
    secrets: [],
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
  // SOC-P2g — space-post comments (server-owned counter + author-only delete).
  addSpacePostCommentCallable: {
    kind: "callable",
    maxInstances: 100,
    secrets: [],
  },
  deleteSpacePostCommentCallable: {
    kind: "callable",
    maxInstances: 100,
    secrets: [],
  },
  // SOC-P2c — space-post like toggle (server-owned counter).
  toggleSpacePostLikeCallable: {
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
  weeklyFellBehindCheck: {
    kind: "schedule",
    maxInstances: 1,
    secrets: [],
    schedule: "0 5 * * 1",
    timeoutSeconds: 540,
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
  goalSpaceWeeklyCheckIn: {
    kind: "callable",
    maxInstances: 100,
    secrets: [],
  },
  backGoalSpaceCheckIn: {
    kind: "callable",
    maxInstances: 100,
    secrets: [],
  },
  removeGoalSpaceMember: {
    kind: "callable",
    maxInstances: 100,
    secrets: [],
  },
  resolveGoalSpaceTarget: {
    kind: "callable",
    maxInstances: 100,
    secrets: [],
  },
  onGoalSpaceEventCreated: {
    kind: "event",
    maxInstances: 50,
    secrets: [],
    eventType: "providers/cloud.firestore/eventTypes/document.create",
    resource:
      "projects/{project}/databases/(default)/documents/goalSpaces/{spaceId}/events/{eventId}",
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
    /* `timeoutSeconds` is pinned for schedules only: SCHEDULED_CAP is the one
       tier that sets it ({ maxInstances: 1, timeoutSeconds: 540 }), and until
       2026-08-02 the snapshot pinned only the maxInstances half — so dropping
       the timeout from a cron passed this table unchanged, and a long rollup
       would start being killed at the 60s default with nothing failing here. */
    ...(ep.scheduleTrigger
      ? {
          schedule: ep.scheduleTrigger.schedule,
          timeoutSeconds: ep.timeoutSeconds ?? null,
        }
      : {}),
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
