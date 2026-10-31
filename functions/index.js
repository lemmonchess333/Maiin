// Bound Secret Manager secrets: `npm run secrets:check` lists every one and
// the files that bind it. Each must be provisioned, and the runtime account
// (appspot.gserviceaccount.com) granted Secret Accessor on it, before the
// first deploy that binds it: the deploy account cannot setIamPolicy. See
// docs/agents/functions-deploy.md.
//
// firebase-functions v6+ repointed the bare `require("firebase-functions")`
// at the 2nd-gen API. Every export in this file is 1st-gen
// (runWith().https.onCall/onRequest, .pubsub.schedule,
// .firestore.document().onCreate, https.HttpsError, logger), which now
// lives under /v1. Importing /v1 keeps the entire trigger surface intact.
const functions = require("firebase-functions/v1");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");

// Idempotent — admin keeps an app registry as module-level state
// that survives Vitest's per-file module-cache reset. Without this
// guard, a second test file that requires `../index` (e.g.
// __tests__/integration/configurePlan.test.js after
// __tests__/planWriteCallables.test.js) re-evaluates this module
// and trips "The default Firebase app already exists". In production
// the module is only loaded once per Cloud Function instance, so
// this no-ops on the warm path.
if (!admin.apps.length) {
  admin.initializeApp();
}

// R1A-Deletion Chunk 2 — lock helpers. The actor lock fires at
// callable entry; the system-writer guard fires immediately before
// each per-uid write commit in webhooks / scheduled / triggered
// functions.
const accountDeletionAuth = require("./lib/accountDeletionAuth");
const accountDeletionLocks = require("./lib/accountDeletionLocks");
const healthWorkoutLedger = require("./lib/healthWorkoutLedger");
const activationBilling = require("./lib/activationBilling");
const { activationSport } = require("./lib/firstWeekActivation");
// Packet 18 — programState command boundary (applyProgramCommand callable).
const programCommands = require("./lib/programCommands");
const { reconcileWorkoutMetrics } = require("./lib/workoutCorrections");
const challengeParticipation = require("./lib/challengeParticipationProgress");
const friendsBoard = require("./lib/friendsBoard");
const restrictedIdentities = require("./lib/restrictedIdentities");
const {
  mergeChangedFields,
  ProgrammeConflictError,
} = require("./lib/stateTransition");
const { wholeRaceGoal, raceIdentityIsStale } = require("./lib/raceGoalWrite");
const {
  runProgramCommandTransaction,
} = require("./lib/programCommandTransaction");
const { utcDateString, parseUtcDate } = require("./lib/dateUtils");
const { isVolumeEligibleRun } = require("./lib/runEligibility");
const blockGuard = require("./lib/blockGuard");
const blockMirror = require("./lib/blockMirror");
const identityResync = require("./lib/identityResync");
// S4e: a restricted account is refused anything that reaches another person.
const restriction = require("./lib/restriction");
const {
  runMilestoneBadges,
  lifetimeMilestoneBadges,
  liftWeightMilestoneBadges,
} = require("./lib/badgeRules");
const {
  applyPartnerActivity,
  resolvePartnerActivityDay,
} = require("./lib/partnerStreakPersist");
const checkoutTrial = require("./lib/checkoutTrial");
const subscriptionReconciliation = require("./lib/subscriptionReconciliation");
const {
  shouldIgnoreSubscriptionDeleted,
} = require("./lib/stripeSubscriptionDeleted");
const aiScanQuota = require("./lib/aiScanQuota");
const socialCounters = require("./lib/socialCounters");
const commentReactions = require("./lib/commentReactions");
const reportTargets = require("./lib/reportTargets");
const photoScreen = require("./lib/photoScreen");
const socialFanout = require("./lib/socialFanout");
// Push (FCM) — epic #961. Pure decision helpers; the cron below is the I/O shell.
const {
  shouldSendStreakNudge,
  shouldSendFirstWeekNudge,
  localDateKeyInTz,
} = require("./lib/streakNudge");
const {
  isLocalSendHour,
  withinQuietHours,
  localHourInTz,
  localWeekdayInTz,
} = require("./lib/pushSchedule");
const { activeDateKeysFromLogs } = require("./lib/activeDates");
const {
  withNativePushAlert,
  tokensToPrune,
  buildStreakNudgeMessage,
  buildFirstWeekNudgeMessage,
  buildBadgeNudgeMessage,
  buildWeeklyRecapMessage,
  buildFellBehindRecapMessage,
} = require("./lib/pushSend");
// Packet 19 — server-owned FCM token ownership (claim/release + send leases).
const pushTokenOwnership = require("./lib/pushTokenOwnership");
const challengeAnnouncements = require("./lib/challengeAnnouncements");
const routePlanning = require("./lib/routePlanning");
const { pushableBadgeIds } = require("./lib/badgeNudge");

const appleIAP = require("./appleIAP");
exports.verifyApplePurchase = appleIAP.verifyApplePurchase;
exports.appleIAPWebhook = appleIAP.appleIAPWebhook;
exports.restoreApplePurchases = appleIAP.restoreApplePurchases;

// RevenueCat (ADR-0006): the entitlement source for in-app purchases.
const revenueCat = require("./revenueCat");
exports.revenueCatWebhook = revenueCat.revenueCatWebhook;
exports.syncRevenueCatEntitlement = revenueCat.syncRevenueCatEntitlement;

// The reminder before a free trial is charged (Sub1, STATUS 2026-10-06).
exports.trialReminderSweep = require("./trialReminders").trialReminderSweep;

// The pre-run weather strip, from MET Norway through this server (currentWeather.js).
exports.getCurrentWeather = require("./currentWeather").getCurrentWeather;

// PR Q (audit P0 #1/#2/#3 follow-up): pure helpers live in
// ./helpers.js so the test runner can import them without booting
// firebase-admin. The underscore-prefixed names below are kept as
// the historical test surface (exports._foo) — they now delegate to
// helpers.js so there's a single source of truth.
const helpers = require("./helpers");
// Rate limiter + quota live in their own module so integration
// tests can drive them against the emulator with a test-controlled
// firestore handle (see functions/__tests__/integration/).
const rateLimiter = require("./rateLimiter");
// Audit-log writes for successful Stripe Checkout creations. Pulled
// out for test isolation — buildCheckoutAuditEntry is unit-testable
// pure shape-builder, recordCheckoutAuditEntry runs against the
// emulator in the integration suite.
const auditLog = require("./auditLog");
// Profile-field allow-list sanitiser for completeOnboarding. Closes
// the stored-data surface where a malicious client could write
// arbitrary extra fields (photoURL pixel trackers, etc.) via the
// {merge: true} write. See functions/profileSanitizer.js for the
// allow-list and per-field validators.
const profileSanitizer = require("./profileSanitizer");
// Challenge tier resolution — shared with the client
// (src/features/challenges/challengeTiers.ts), pinned by challengeTiers.cross.test.ts.
const challengeTiers = require("./lib/challengeTiers");
// Global challenge definitions — SERVER-OWNED. The pure rolling-period
// definition layer consumed by the rolloverChallenges scheduled function;
// the client no longer seeds /challenges (create is denied by rules).
const challengeDefs = require("./lib/challengeDefs");
// Challenge activity-window predicate — a session credits a challenge only
// when the SOURCE ACTIVITY DAY is inside the challenge's [start, end) range,
// never function-execution/delivery time.
const {
  sourceActivityDateKey,
  challengeContainsActivityDate,
  openOnDayBound,
  isValidDateKey,
} = require("./lib/challengeActivityWindow");
// Source-doc → challenge-increment mapping, shared by the live activity
// triggers and the join-time backfill so the crediting VALUES have one
// source of truth (the backfill replays history through the same apply
// path the triggers use).
const challengeBackfill = require("./lib/challengeBackfill");
const challengeMarkers = require("./lib/challengeMarkers");
const lifetimeAccrual = require("./lib/lifetimeAccrual");
const workoutVolume = require("./lib/workoutVolume");
const activityReversal = require("./lib/activityReversal");
const spacePostPhoto = require("./lib/spacePostPhoto");
// Account deletion logic. Extracted so the call-ordering invariant
// (Firestore + Storage before Auth-user delete; pre-W1f had the
// inverse, leaving orphans) is unit-testable with stub handles —
// see functions/__tests__/accountDeletion.test.js.
const accountDeletion = require("./accountDeletion");
// UGC profanity gate. Used by the onActivityCreated /
// onCommentCreated triggers below to auto-flag or auto-delete
// objectionable content (App Store Guideline 1.2 requirement).
const profanityFilter = require("./profanityFilter");
// The same filter's decisions for the callables that write public text
// (comments, display names) and the sentences a refused person reads.
const objectionableText = require("./lib/objectionableText");
const { commentRejection } = require("./lib/commentRejection");
const { engagementRejection } = require("./lib/engagementRejection");
const { isDocumentId } = require("./lib/documentId");
// The same filter over Community Space posts (onSpacePostWritten).
const spacePostModeration = require("./lib/spacePostModeration");
// The email that tells the owner a report has come in (createReport).
const reportAlert = require("./lib/reportAlert");
// Retried triggers: the window an event is retried in, and the side
// effects run as steps that throw together (the session and social
// triggers).
const { pastRetryWindow, triggerSteps } = require("./lib/triggerRetry");
// Each scheduled job's last run, in jobRuns/{name} (lib/jobRuns.js).
const jobRuns = require("./lib/jobRuns");
const { sendViaResend } = require("./email/accountEmails");
// Admin-uid allowlist for moderation callables. Trust boundary for
// the listPendingReports / resolveReport / hideActivity surfaces.
const adminAuth = require("./adminAuth");

// Payment endpoints use a tighter cors config keyed off the same
// origin allowlist as Stripe return URLs. See helpers.getAppCorsOptions
// for the rejection-via-Error short-circuit semantics.
const corsForPayments = require("cors")(helpers.getAppCorsOptions());

// AI / food-analysis endpoints use the client-app allow-list: every
// web deploy plus the Capacitor shells, which the payment list must
// exclude. cors reports a disallowed origin as the handler's first
// argument, so each wrapped handler checks it and answers 403 before
// touching auth — see helpers.getClientAppCorsOptions.
const corsForAiEndpoints = require("cors")(helpers.getClientAppCorsOptions());
const {
  buildFoodTextRequest,
  FOOD_TEXT_MAX_CHARS,
} = require("./lib/foodTextRequest");
const {
  foodModelUrl,
  foodGenerationConfig,
  foodResponseText,
} = require("./lib/foodModel");

// Module-load self-check: in deployed (non-emulator) functions,
// the final resolved Stripe return-URL allowlist MUST include the
// canonical prod origin. If a deploy sets STRIPE_RETURN_URL_ORIGINS
// (override semantics: replaces defaults, doesn't extend) and
// forgets to include https://troposfit.com, every Checkout call
// would 400 silently — this surfaces the misconfiguration at
// boot in Cloud Logging instead. Log, don't throw, so a startup
// failure doesn't take the function down completely.
if (process.env.FUNCTIONS_EMULATOR !== "true") {
  const allowed = helpers.getAllowedStripeReturnUrlOrigins();
  if (!allowed.includes("https://troposfit.com")) {
    functions.logger.error(
      "stripe.allowlist.misconfigured: production origin missing",
      { allowed }
    );
  }
}

// ══════════════════════════════════════════════
// COST-RUNAWAY CAPS — maxInstances on every function
// ══════════════════════════════════════════════
//
// Firebase Cloud Functions v1 has NO default cap on concurrent
// instances — a misbehaving client (or DDoS, or accidental loop)
// can fan out to thousands of containers and burn hundreds of
// pounds in hours. These three tiers cap that blast radius.
//
// Numbers picked for current scale (pre-launch through ~1000
// active users). At 1000 users:
//   - HTTP callables peak ~10-20 concurrent across all functions
//   - Firestore triggers fan out per write (cap protects against
//     a runaway write loop, not normal usage)
//   - Admin endpoints are operator-only, almost never invoked
//
// Re-tune at scale once real cost-per-user data is available.
const DEFAULT_HTTP_CAP = { maxInstances: 100 };
const ADMIN_HTTP_CAP = { maxInstances: 10 };

/* PAGE size for the one-shot lift-volume re-credit's history scan. 500 keeps
   a single invocation inside the callable timeout; a longer history is
   covered by re-calling with the returned `cursor`.

   It was a bare `.limit()` with no ordering and no cursor, above a comment
   claiming "a longer history simply re-runs". That was false, and provably
   so: an unordered Firestore query is document-ID ascending, deterministic,
   and repeatable — so every re-run scanned the IDENTICAL first 500 docs and
   the rest of the history was unreachable no matter how many times it ran.
   Workout ids are `programme-<completionId>` / `routine-<completionId>`, so
   that subset is not even the oldest 500; it is an arbitrary slice. The
   idempotency markers made the re-runs safe, which is exactly what made the
   dead end quiet. */
const RECREDIT_PAGE_SIZE = 500;
const TRIGGER_CAP = { maxInstances: 50 };

// ══════════════════════════════════════════════
// SECRETS — Secret Manager bindings (replaces functions.config)
// ══════════════════════════════════════════════
//
// firebase-functions v7 removed functions.config() (the Cloud Runtime
// Configuration API was shut down 2025-12-31). The canonical
// replacement is firebase-functions/params `defineSecret`: declare the
// secret here, list it in a function's runWith({ secrets: [...] }), and
// Firebase mounts the Secret Manager value into process.env at runtime.
// Read sites stay as `process.env.STRIPE_SECRET_KEY`. Provision with:
//   firebase functions:secrets:set STRIPE_SECRET_KEY
//   firebase functions:secrets:set STRIPE_WEBHOOK_SECRET
const STRIPE_SECRET_KEY = defineSecret("STRIPE_SECRET_KEY");
const STRIPE_WEBHOOK_SECRET = defineSecret("STRIPE_WEBHOOK_SECRET");
// RESEND_API_KEY now lives in email/accountEmails.js with its callables.
// (a deploy referencing an unprovisioned bound secret FAILS — the safety gate).
// createReport binds it too, for the moderation alert. defineSecret registers
// by name, so this is the same secret, already provisioned; and the functions
// share one runtime account, which can already read it, so binding it here
// needs no new accessor grant.
const RESEND_API_KEY = defineSecret("RESEND_API_KEY");
// Money-path audit F8: deleteMyAccount tombstones Apple billing
// identities before sweeping their bindings; the write hash needs the
// same BILLING_HMAC_SECRET restoreApplePurchases reads with. Already
// provisioned (bound on restoreApplePurchases) — no new secret to set.
const BILLING_HMAC_SECRET = defineSecret("BILLING_HMAC_SECRET");
// The key before a rotation. lib/restrictedIdentities looks a restricted
// identity up under the active AND the previous key, so a function that
// reads or forgets them must be able to read both: bound on
// onAuthUserCreated and liftRestriction for that, as restoreApplePurchases
// binds it (appleIAP.js). Already provisioned there, so no new secret and
// no new accessor grant. Without it a restricted person who deleted and
// signed up again during a rotation was not restricted again.
const BILLING_PREVIOUS_HMAC_SECRET = defineSecret(
  "BILLING_PREVIOUS_HMAC_SECRET"
);
// Run11 (Mapbox supersession 2026-07-17): the Directions token lives ONLY
// here — never in a VITE_* var, Actions variable, browser bundle, or
// native app. A key in the client can be extracted and cannot enforce
// the Pro gate.
const MAPBOX_DIRECTIONS_TOKEN = defineSecret("MAPBOX_DIRECTIONS_TOKEN");

// Scheduled (pubsub cron) sweeps iterate EVERY active user via
// sweepActiveUsers. The Cloud Functions v1 default timeout is
// 60s — at ~1000 users a full sweep blows past that and is HARD-KILLED
// mid-run (the function's own try/catch never fires on a timeout kill), so a
// prefix of users gets processed and the rest are silently left stale with a
// green-looking schedule. 540s is the v1 maximum. maxInstances:1 is correct
// for a cron singleton: no parallelism is needed and it prevents a slow run
// from overlapping the next tick. Re-tune (or shard the sweep) if 540s is ever
// approached at higher scale.
const SCHEDULED_CAP = { maxInstances: 1, timeoutSeconds: 540 };

// 2026-05-26 audit PR 4 (finding #10) — Vertex AI response redactor.
// Logs structural metadata only; never the actual user-facing text /
// inputs. See functions/lib/vertexLogRedaction.js for the contract.
const {
  redactVertexResponse,
  vertexUsage,
} = require("./lib/vertexLogRedaction");

// ══════════════════════════════════════════════
// ACCOUNT DELETION — server-side, auth-user last
// ══════════════════════════════════════════════
//
// Redeploy marker: forces firebase-tools to rebuild this function's
// bundle so the R1A kill-switch (#648), Chunk 1 foundation (#652),
// and Chunk 2 runtime (#653) actually ship to production. Run #58
// went green but skipped the function upload because the Chunk 3
// docs PR didn't touch any .js files, so firebase-tools deduped
// against the stale (pre-#648) deployed bundle from Run #51. This
// comment forces the bundle hash to differ from production.
//
// Pre-W1f deletion ran client-side and deleted the Firebase Auth
// user FIRST, then tried to clean up Firestore subcollections. As
// soon as the auth user was gone, subsequent Firestore writes ran
// as an unauthenticated client and either (a) hit permission denied
// if rules required auth, or (b) succeeded partially, leaving the
// account in an inconsistent "ghost user with orphan data" state.
//
// Now a callable Cloud Function runs with Admin SDK (bypasses
// Firestore rules), deletes the data first across every known
// subcollection + author-keyed top-level collection, then deletes
// the Auth user as the final step. Partial failure leaves the user
// logged in and retryable rather than stranded.
exports.deleteMyAccount = functions
  // STRIPE_SECRET_KEY: cancels the user's active Stripe sub before purge.
  // BILLING_HMAC_SECRET: tombstones Apple billing identities during the
  // appleSubscriptions sweep (audit F8) — fail-safe if absent.
  .runWith({
    ...DEFAULT_HTTP_CAP,
    // Match the deletion ledger's nine-minute lease for larger accounts.
    timeoutSeconds: 540,
    secrets: [STRIPE_SECRET_KEY, BILLING_HMAC_SECRET],
  })
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Sign-in required."
      );
    }
    // R1A-Deletion Chunk 2 — server-side recent-auth check. Closes the
    // security gap where Admin SDK Auth deletion bypasses the client
    // requires-recent-login check; getIdToken(true) refreshes the token
    // but does NOT update auth_time. A stale session token must be
    // rejected here before any deletion work begins.
    try {
      accountDeletionAuth.assertRecentAuth(context);
    } catch (err) {
      throw new functions.https.HttpsError("failed-precondition", err.message, {
        errorCode: err.errorCode || "requires-recent-auth",
      });
    }
    // Security audit 2026-05-25 finding #3 follow-up — revocation-aware
    // re-verification. Callable framework verifies the token signature
    // + audience but skips `tokensValidAfterTime`, so a revoked-session
    // user still has a working context.auth until natural expiry. For
    // an irreversible Admin-SDK delete that's an unacceptable gap;
    // we extract the raw token and run verifyIdToken(token, true) to
    // catch the revocation case explicitly.
    try {
      await accountDeletionAuth.assertTokenNotRevoked({
        rawRequest: context.rawRequest,
        verifyIdToken: (token, checkRevoked) =>
          admin.auth().verifyIdToken(token, checkRevoked),
      });
    } catch (err) {
      const httpsCode = err.httpsErrorCode || "failed-precondition";
      throw new functions.https.HttpsError(httpsCode, err.message, {
        errorCode: err.errorCode || "token-revoked",
      });
    }
    const uid = context.auth.uid;

    try {
      await accountDeletion.deleteAccount({
        firestore: admin.firestore(),
        auth: admin.auth(),
        storageBucket: admin.storage().bucket(),
        uid,
        // functions.logger emits structured Cloud Logging payloads so
        // the dotted event names (`deleteAccount.kill_switch_*`)
        // become queryable jsonPayload fields, not opaque textPayload.
        logger: functions.logger,
        // Sub1 R1A pin (b) — cancel active Stripe sub before purge.
        // Apple IAP has no admin-cancellation API (verified
        // 2026-05-24); that path is handled client-side via the
        // warn-and-deep-link modal in AccountSection.tsx.
        // Errors are absorbed inside deleteAccount — this fn must
        // throw to signal failure, the executor logs + proceeds.
        cancelStripeSubscription: async ({
          stripeSubscriptionId,
          logger: log,
        }) => {
          // From Secret Manager via the STRIPE_SECRET_KEY defineSecret
          // binding on this function. (functions.config() fallback
          // removed — it throws under firebase-functions v7.)
          const stripeKey = process.env.STRIPE_SECRET_KEY;
          if (!stripeKey) {
            // Missing key is operator misconfiguration, not user
            // error — let the executor log + proceed; an operator
            // alert via Cloud Logging gets the human attention.
            throw new Error(
              "cancelStripeSubscription: STRIPE_SECRET_KEY not configured"
            );
          }
          const stripe = require("stripe")(stripeKey);
          try {
            await stripe.subscriptions.cancel(stripeSubscriptionId);
            log.info("deleteAccount.subscription_canceled", {
              uid,
              stripeSubscriptionId,
            });
          } catch (err) {
            // Stripe returns 404 (resource_missing) when the sub
            // is already cancelled or never existed — that's our
            // desired end state, not a failure. Surface other
            // errors so the executor's catch can absorb + log.
            if (err && err.code === "resource_missing") {
              log.info("deleteAccount.subscription_already_gone", {
                uid,
                stripeSubscriptionId,
              });
              return;
            }
            throw err;
          }
        },
      });
      return { ok: true, status: "completed" };
    } catch (err) {
      // Kill-switch trip is an intentional operator-controlled abort,
      // not an internal failure. Surface as `failed-precondition` with
      // a structured `details.reason` so the client can branch on a
      // typed code instead of substring-matching the message.
      if (err && err.code === "executor-disabled") {
        functions.logger.warn("deleteMyAccount.kill_switch_trip", { uid });
        throw new functions.https.HttpsError(
          "failed-precondition",
          "Account deletion is temporarily paused. Try again later.",
          { reason: "executor-disabled" }
        );
      }
      // Report pending only after confirming the durable, authorised request.
      const request = await admin
        .firestore()
        .doc(`accountDeletionRequests/${uid}`)
        .get();
      if (
        request.exists &&
        request.data().resumeVersion === 2 &&
        ["running", "failed_cleanup", "pending_cleanup"].includes(
          request.data().status
        )
      ) {
        return {
          ok: false,
          status: "pending",
          supportCode: request.data().supportCode,
        };
      }
      functions.logger.error("deleteMyAccount.error", {
        uid,
        message: err && err.message,
      });
      throw new functions.https.HttpsError(
        "internal",
        "Account cleanup couldn't finish. Try deleting your account again.",
        { reason: "cleanup-incomplete" }
      );
    }
  });

// Durable retries continue an already-authorised request when the phone closes
// or a provider is temporarily unavailable. No historical records are enrolled.
exports.resumeAccountDeletions = functions
  .runWith({
    ...SCHEDULED_CAP,
    // RESEND_API_KEY: the email that tells the owner a deletion is stuck.
    secrets: [STRIPE_SECRET_KEY, BILLING_HMAC_SECRET, RESEND_API_KEY],
  })
  .pubsub.schedule("every 5 minutes")
  .timeZone("UTC")
  .onRun(() =>
    jobRuns.recordJobRun(db, "resumeAccountDeletions", async () => {
      const retry = require("./lib/accountDeletionRetry");
      const firestore = admin.firestore();
      const deadline = Date.now() + 450000;
      try {
        await retry.retryBilling({ firestore, logger: functions.logger });
      } catch (error) {
        functions.logger.error("deleteAccount.billing_retry_failed", {
          code: error.code || "unavailable",
        });
      }
      await retry.resumeDeletions({
        firestore,
        deleteAccount: accountDeletion.deleteAccount,
        auth: admin.auth(),
        storageBucket: admin.storage().bucket(),
        logger: functions.logger,
        sendAlert: (request) =>
          require("./lib/deletionAlert").sendStuckDeletionAlert({
            sendEmail: sendViaResend,
            request,
            logger: functions.logger,
          }),
        deadline,
      });
      return null;
    })
  );

// ══════════════════════════════════════════════
// RATE LIMITER — per-user, Firestore-backed
// ══════════════════════════════════════════════

/** Delegates to helpers.pruneOldTimestamps — see helpers.js for docs. */
const _pruneOldTimestamps = helpers.pruneOldTimestamps;

/**
 * Checks if a user has exceeded the allowed number of calls within a window.
 * Uses a Firestore transaction to make the read-prune-write atomic so two
 * concurrent requests cannot both observe `recent.length === maxCalls - 1`
 * and both succeed (the pre-PR-C race window).
 *
 * Fail-closed: PR C (audit follow-up) changed the catch behaviour. The
 * rate limiter gates cost-sensitive AI invocations (analyzeFood / Text /
 * askGemini); a transient Firestore error must not silently grant
 * unlimited paid calls. Pre-PR-C this returned `false` (fail open) on
 * any error. Now returns `true` (treat as rate-limited) so the caller
 * surfaces a transient-error response instead of consuming Vertex
 * quota that the user has no record of.
 *
 * @param {string} uid - User ID
 * @param {string} action - Action name (e.g., "askGemini", "analyzeFood")
 * @param {number} maxCalls - Maximum calls allowed in the window
 * @param {number} windowMs - Time window in milliseconds
 * @returns {Promise<boolean>} true if rate limited (should block)
 */
/** Delegates to rateLimiter.isRateLimited — see rateLimiter.js for docs. */
async function isRateLimited(uid, action, maxCalls, windowMs) {
  return rateLimiter.isRateLimited(
    admin.firestore(),
    uid,
    action,
    maxCalls,
    windowMs
  );
}

// The MONTHLY SCAN QUOTA block stood here: a `SCAN_LIMITS` table, a
// `checkMonthlyQuota` wrapper, and their test exports. All of it was dead —
// superseded by the daily per-action quota in `lib/aiScanQuota.js` (F1b),
// which is what the AI endpoints actually call. See that module's header:
// it reads the old `{ count, month }` shape as zero precisely because this
// one stopped running.

/** Delegates to helpers.computeEffectiveTier — see helpers.js for docs. */
const _computeEffectiveTier = helpers.computeEffectiveTier;

/** Delegates to helpers.safeOriginForLog — origin-only redaction so
 *  structured logs never capture raw client-supplied URLs. */
const safeOriginForLog = helpers.safeOriginForLog;

/**
 * Checks and increments the user's monthly AI scan counter atomically.
 *
 * PR C (audit follow-up): pre-fix this function did read → calculate →
 * write across two RTTs (race window), AND the catch block returned
 * `{ allowed: true, remaining: 999, limit: 999 }` — a literal fail-open
 * on the cost-control boundary. Two breaks fixed here:
 *
 *   1. Wrapped in `runTransaction` so the read+write happens inside one
 *      Firestore lock. Concurrent requests serialise and cannot both
 *      observe `count === limit - 1` then both increment.
 *   2. Catch now returns `{ allowed: false, remaining: 0, ... }` —
 *      fail-closed. A transient Firestore error surfaces as a 429 to
 *      the client (with a translated "temporary limit" message in the
 *      caller). Better the user retries than we silently grant
 *      unlimited Vertex calls during a Firestore incident.
 *
 * The legacy fail-open behaviour is preserved as a configurable
 * `failOpen` parameter only for the test surface — production callers
 * never set it. Documented at function-level so audit reviewers can
 * see the override is for tests only.
 *
 * @param {string} uid - User ID
 * @returns {Promise<{allowed: boolean, remaining: number, limit: number, error?: string}>}
 */
// Pure helpers exported for unit-testability. Not part of the public
// Cloud Functions API; the underscore prefix marks them as
// implementation detail. When a functions/ test runner is wired
// (audit P0 #1 follow-up), tests should import these via
// `require("./index")` and exercise the predicates without booting
// Firestore.
exports._shouldApplyParticipantCount = _shouldApplyParticipantCount;
exports._pruneOldTimestamps = _pruneOldTimestamps;
exports._computeEffectiveTier = _computeEffectiveTier;

/**
 * Verifies a Firebase ID token from an Authorization header.
 *
 * Pass `{ checkRevoked: true }` for sensitive endpoints (account
 * deletion, payment write paths). Revocation check adds a
 * Firestore read per call (Firebase Admin SDK checks
 * `tokensValidAfterTime` on the user record), so it's gated to
 * the high-value endpoints rather than hot paths like
 * `analyzeFoodText`. Per security audit 2026-05-25 finding #3.
 *
 * @param {string} authHeader
 * @param {{ checkRevoked?: boolean }} [options]
 * @returns {Promise<{uid: string, email: string}>}
 */
async function verifyAuth(authHeader, options = {}) {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new Error("Unauthorized");
  }
  const token = authHeader.split("Bearer ")[1];
  const decoded = await admin
    .auth()
    .verifyIdToken(token, Boolean(options.checkRevoked));
  return { uid: decoded.uid, email: decoded.email || "" };
}

// ══════════════════════════════════════════════
// REMOTE KILL SWITCHES — Firestore-backed feature flags
// ══════════════════════════════════════════════

/**
 * Reads a boolean feature flag from `config/flags`. Flags default to ON —
 * missing doc or missing key returns `true` — so a freshly deployed
 * project without the doc still works. Operators disable a flag by writing
 * `{ [key]: false }` via Admin SDK or the Firebase Console, and the next
 * Cloud Function invocation sees the change without a redeploy.
 *
 * Cached for 60s per process to keep the Firestore read off the hot path
 * while still letting an incident responder flip a switch and see effect
 * within a minute.
 *
 * Per-flag failure policy (security audit 2026-05-25 finding #2):
 * a transient Firestore read failure has to pick between fail-open
 * (keep serving) and fail-closed (block to honour the kill-switch).
 * The right choice depends on the flag's purpose:
 *   - `fail-open` (default) — availability / performance toggles.
 *     A Firestore blip mustn't take down food scan because the
 *     flag itself is just a degrade-gracefully knob.
 *   - `fail-closed` — true kill-switches. An ops "disable feature X"
 *     incident response must NOT silently re-enable on a read blip.
 * `FLAG_POLICIES` declares the policy per known flag; unknown keys
 * default to `fail-open` (matches pre-audit behaviour for legacy
 * callers).
 *
 * @param {string} key
 * @returns {Promise<boolean>}
 */
const flagPolicies = require("./lib/flagPolicies");

const _flagCache = { value: null, at: 0 };
const FLAG_CACHE_MS = 60_000;
async function isFlagEnabled(key) {
  const now = Date.now();
  if (!_flagCache.value || now - _flagCache.at > FLAG_CACHE_MS) {
    try {
      const snap = await admin.firestore().doc("config/flags").get();
      _flagCache.value = snap.exists ? snap.data() : {};
      _flagCache.at = now;
    } catch (err) {
      const policy = flagPolicies.flagPolicyFor(key);
      console.error(
        `isFlagEnabled read failed (key=${key}, policy=${policy}):`,
        err.message
      );
      // Per-flag failure policy — see lib/flagPolicies.js for the
      // policy map and the audit rationale.
      return flagPolicies.fallbackForReadFailure(key);
    }
  }
  const v = _flagCache.value[key];
  return v === undefined ? true : Boolean(v);
}

// ══════════════════════════════════════════════
// ONBOARDING — bypasses security rules via Admin SDK
// ══════════════════════════════════════════════

const { validatePlanPayload } = require("./lib/validatePlanPayload");
const {
  sanitizeProgramState,
  programStateTooLarge,
} = require("./lib/programStateSanitizer");

/* A display name that trips the word filter is refused, as
   failed-precondition so the client can show the sentence
   (lib/objectionableText.js). The client refuses it first
   (src/lib/displayName.ts); this is the boundary a direct call meets. */
function assertDisplayNameAllowed(displayName) {
  const refusal = objectionableText.displayNameRefusal(displayName);
  if (refusal) {
    throw new functions.https.HttpsError("failed-precondition", refusal);
  }
}

exports.completeOnboarding = functions
  .runWith(DEFAULT_HTTP_CAP)
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "Auth required.");
    }
    const uid = context.auth.uid;
    // R1A-Deletion: callable-actor lock — deleting accounts cannot
    // (re-)onboard. The user doc would otherwise be recreated mid-cascade.
    await accountDeletionLocks.assertCallableActorNotDeleting(
      admin.firestore(),
      uid
    );

    // No verified-email check here: email accounts set up their plan first
    // and verify after. What a verified address protects is public content,
    // and that keeps its own checks (firestore.rules isEmailVerified() on
    // activities and space posts, and assertCallerEmailVerified in the
    // comment callables).

    // Rate limit: 5 onboarding attempts per 10 minutes
    const limited = await isRateLimited(uid, "onboarding", 5, 600_000);
    if (limited) {
      throw new functions.https.HttpsError(
        "resource-exhausted",
        "Too many attempts. Try again in a few minutes."
      );
    }

    try {
      // Validate required fields
      const {
        profileData: rawProfileData,
        programState,
        weekSchedule: rawWeekSchedule,
        activationJourneyVersion,
        onboardingPlatform,
      } = data;
      // The cohort is chosen by this callable, never by a profile write.
      // Omitted means an older client and keeps the legacy journey.
      if (
        activationJourneyVersion !== undefined &&
        activationJourneyVersion !== 2
      ) {
        throw new functions.https.HttpsError(
          "invalid-argument",
          "Unsupported activation journey version."
        );
      }
      if (
        onboardingPlatform !== undefined &&
        (activationJourneyVersion !== 2 ||
          !activationBilling.validOnboardingPlatform(onboardingPlatform))
      ) {
        throw new functions.https.HttpsError(
          "invalid-argument",
          "Unsupported onboarding platform."
        );
      }
      if (
        !rawProfileData ||
        typeof rawProfileData !== "object" ||
        Array.isArray(rawProfileData)
      ) {
        throw new functions.https.HttpsError(
          "invalid-argument",
          "profileData is required."
        );
      }
      if (!programState || typeof programState !== "object") {
        throw new functions.https.HttpsError(
          "invalid-argument",
          "programState is required."
        );
      }

      // Allow-list + per-field sanitise. Unknown fields, off-allowlist
      // photoURL schemes, out-of-range numbers etc. are dropped to
      // undefined and never reach the Firestore write — closes the
      // stored-data surface from PR audit. The returned object is a
      // *new* object; we use it instead of mutating rawProfileData so
      // any later reads of `rawProfileData` see the original shape.
      const profileData = profileSanitizer.sanitizeProfileData(rawProfileData);

      // Loud-drop: a field the client sent that is neither allow-listed nor
      // server-managed was SILENTLY dropped — almost always a new profile
      // field someone forgot to add to profileSanitizer's allow-list. Surface
      // it in logs instead of losing the write quietly (ADR-0005).
      const droppedOnboardingFields =
        profileSanitizer.findUnexpectedProfileFields(rawProfileData);
      if (droppedOnboardingFields.length > 0) {
        console.warn("completeOnboarding.unexpected_dropped_fields", {
          uid,
          fields: droppedOnboardingFields,
        });
      }

      // The display name is public (profile, feed, spaces, leaderboards), so
      // the word filter that covers posts and comments covers it too.
      assertDisplayNameAllowed(profileData.displayName);

      // Required-field gate runs AFTER sanitise — a value that failed
      // its validator is now `undefined` here, which surfaces as
      // "Missing required field" rather than a more specific error.
      // That's deliberate: the client's required-field UI already
      // prevented the empty case, so a request that hits this branch
      // is either an out-of-range value (which we want to reject) or
      // a malicious caller (who shouldn't get diagnostic detail).
      const requiredFields = [
        "weightKg",
        "heightCm",
        "age",
        "sex",
        "activityLevel",
      ];
      for (const field of requiredFields) {
        if (
          profileData[field] === undefined ||
          profileData[field] === null ||
          profileData[field] === ""
        ) {
          throw new functions.https.HttpsError(
            "invalid-argument",
            `Missing required field: ${field}`
          );
        }
      }

      // P0-4: v7 plan-payload gate. Activates whenever the request
      // looks like a v7 onboarding submission (weekSchedule present,
      // either as a top-level field or threaded onto profileData). The
      // sanitiser already validates structural shape of weekSchedule;
      // this layer pins the cross-document invariants the sanitiser
      // can't see (schema versions present, runMode/raceGoal
      // consistency, runDay status enum, no UTC ISO leaks).
      //
      // Legacy clients (no weekSchedule + no v7 fields) keep working —
      // the early-return is the migration bridge until every shipped
      // client is on v7.
      const effectiveWeekSchedule = Array.isArray(rawWeekSchedule)
        ? rawWeekSchedule
        : profileData.weekSchedule;
      const isV7Payload =
        Array.isArray(effectiveWeekSchedule) ||
        profileData.weekScheduleVersion !== undefined ||
        programState.programSchemaVersion !== undefined ||
        Array.isArray(programState.runDays);
      if (isV7Payload) {
        const errors = validatePlanPayload({
          profileData,
          programState,
          weekSchedule: effectiveWeekSchedule,
        });
        if (errors.length > 0) {
          throw new functions.https.HttpsError(
            "invalid-argument",
            `Invalid plan payload: ${errors.join("; ")}`
          );
        }
      }

      // Force correct ownership + subscription tier. These overwrite
      // any sanitiser-passing values from the input — they're
      // server-managed regardless of what the client sent. The tier is
      // "free" for an account that has none yet; one billing has already
      // set is left alone below, as configurePlan leaves it, so setup run
      // again cannot downgrade a Pro account until the next store sync.
      profileData.uid = uid;
      profileData.subscriptionTier = "free";
      profileData.onboardingComplete = true;

      const db = admin.firestore();

      // Check if profile already exists (preserve createdAt on update).
      //
      // No trial is granted here. Sub1a pin 3, as written and as the owner
      // confirmed: the 7-day trial starts ONLY when the user taps Start
      // Pro trial on the offer page — the App Store introductory offer or
      // Stripe `trial_period_days`, with a payment method captured up
      // front — and it converts unless they cancel. New accounts start on
      // the free tier. A client-sent `trialExpiresAt` is stripped either way
      // (firestore.rules pins it null on create). Profiles that still
      // carry an expiry from the earlier onboarding grant keep their Pro
      // until it lapses (`computeEffectiveTier`) and are refused a second
      // trial at checkout (`checkoutTrial.js`).
      const userRef = db.collection("users").doc(uid);
      delete profileData.trialExpiresAt;

      // P0-4: atomic write so profile + programState land
      // together. Pre-P0-4 wrote them sequentially; if the second
      // write failed, the user was left with a hydrated profile but no
      // programState — onboarding completed flag set, but Programme
      // tab crashed on its first render. A transaction commits both or
      // neither and protects the first-commit cohort marker from retries.
      const programRef = userRef.collection("programState").doc("current");
      // The public profile carries the name every other person sees. The
      // app writes it too (Onboarding.tsx), best-effort, and a copy that
      // failed left "Athlete" in every feed, space and board; written here,
      // it lands with the profile. Merged, so sign-up's photo and the
      // streak mirror stay, and the name only when one was sent.
      const publicRef = userRef.collection("public").doc("profile");
      const publicName =
        typeof profileData.displayName === "string" && profileData.displayName
          ? profileData.displayName
          : null;
      // Allow-list the programState doc before persisting. validatePlanPayload
      // gates SHAPE (and only for v7 payloads); this strips arbitrary
      // top-level fields a client could inject into its own programState doc.
      const onbProgram = sanitizeProgramState(programState);
      if (onbProgram.dropped.length > 0) {
        functions.logger.warn(
          "completeOnboarding.programState_dropped_fields",
          {
            uid,
            dropped: onbProgram.dropped,
          }
        );
      }
      if (programStateTooLarge(onbProgram.value)) {
        throw new functions.https.HttpsError(
          "invalid-argument",
          "programState is too large."
        );
      }
      const acceptedVersion = await db.runTransaction(async (transaction) => {
        const existing = await transaction.get(userRef);
        const publicSnap = await transaction.get(publicRef);
        const existingData = existing.exists ? existing.data() : {};
        const nextProfileData = { ...profileData };

        // The timestamp and cohort describe the first successful setup
        // commit. A retry, even from a newer client, must not move the
        // activation window or enroll an existing account.
        const alreadyCompleted = existingData.onboardingComplete === true;
        if (!alreadyCompleted) {
          nextProfileData.onboardingCompletedAt =
            admin.firestore.FieldValue.serverTimestamp();
          nextProfileData.onboardingSport = activationSport(
            nextProfileData.athleteType
          );
          if (activationJourneyVersion === 2) {
            nextProfileData.activationJourneyVersion = 2;
            if (onboardingPlatform) {
              nextProfileData.onboardingPlatform = onboardingPlatform;
            }
          }
        }
        if (existing.exists) {
          delete nextProfileData.createdAt;
          if (existingData.subscriptionTier !== undefined) {
            delete nextProfileData.subscriptionTier;
          }
        } else {
          nextProfileData.createdAt =
            admin.firestore.FieldValue.serverTimestamp();
        }

        const storedRaceGoal = existingData.raceGoal;
        const raceGoalAfter =
          nextProfileData.raceGoal !== undefined
            ? nextProfileData.raceGoal
            : storedRaceGoal;
        if (existing.exists) {
          transaction.set(
            userRef,
            nextProfileData.raceGoal !== undefined
              ? {
                  ...nextProfileData,
                  raceGoal: wholeRaceGoal(
                    nextProfileData.raceGoal,
                    storedRaceGoal,
                    admin.firestore.FieldValue.delete()
                  ),
                }
              : nextProfileData,
            { merge: true }
          );
        } else {
          transaction.set(userRef, nextProfileData);
        }
        transaction.set(
          publicRef,
          {
            uid,
            ...(publicSnap.exists &&
              raceIdentityIsStale(
                publicSnap.data().trainingForSpaceId,
                raceGoalAfter
              ) && { trainingForSpaceId: null }),
            ...(publicName && {
              displayName: publicName,
              // searchUsers matches on this; the app's onboarding copy left
              // it out, so a new account was not found by name.
              displayNameLower: publicName.toLowerCase(),
            }),
            ...(typeof nextProfileData.athleteType === "string" && {
              athleteType: nextProfileData.athleteType,
            }),
            ...(!publicSnap.exists && {
              currentStreak: 0,
              longestStreak: 0,
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
            }),
          },
          { merge: true }
        );
        transaction.set(programRef, onbProgram.value);

        return alreadyCompleted
          ? existingData.activationJourneyVersion === 2
            ? 2
            : null
          : activationJourneyVersion === 2
            ? 2
            : null;
      });

      return { success: true, activationJourneyVersion: acceptedVersion };
    } catch (err) {
      // Re-throw HttpsError as-is (validation errors, etc.)
      if (err instanceof functions.https.HttpsError) {
        throw err;
      }
      console.error("completeOnboarding error:", {
        uid,
        message: err.message,
        stack: err.stack,
      });
      throw new functions.https.HttpsError(
        "internal",
        "Failed to complete onboarding."
      );
    }
  });

// ══════════════════════════════════════════════
// CONFIGURE PLAN — atomic plan rebuild for existing users (P0-4)
// ══════════════════════════════════════════════
//
// Backend half of the Configure Plan wizard (P0-9). The client runs
// `planBuilder(draft)` locally on Confirm, then sends the result
// here; this CF validates it via the same `validatePlanPayload`
// gate used by completeOnboarding and atomically writes both
// documents.
//
// Why a Cloud Function instead of a client batch write:
//   - Same Firestore-rules-bypass rationale as completeOnboarding —
//     `weekSchedule`, `programSchemaVersion`, and `runDays` may all
//     end up rule-restricted to server writes.
//   - The validator MUST run on the trusted side. Client preflight
//     gives fast UX errors; the CF is the authoritative gate.
//   - Atomic batch commit matches onboarding's contract — a partial
//     write would leave the user with mismatched profile + program
//     state, which is exactly the corruption the v7 spec exists to
//     prevent.
//
// Payload shape: `{ profileUpdates, programState, weekSchedule }`.
// `profileUpdates` is a PARTIAL profile patch (the output of
// `planBuilder().profileUpdates`), not a full profile — Configure
// Plan is an edit operation, not a create. Existing fields on
// `users/{uid}` outside the patch are preserved via `merge: true`.
exports.configurePlan = functions
  .runWith(DEFAULT_HTTP_CAP)
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "Auth required.");
    }
    const uid = context.auth.uid;

    // R1A-Deletion: callable-actor lock. A completed deletion can leave an
    // already-issued ID token valid for up to ~1h, and the Admin batch
    // below bypasses Firestore rules — so without this a deleting or
    // tombstoned account could recreate users/{uid} + programState/current.
    // Reject BEFORE the rate-limit write and before any Admin write, and
    // OUTSIDE the try so the structured deletion error (account-deleting /
    // account-deleted) reaches the client unchanged instead of being
    // remapped to "internal" (matches completeOnboarding).
    await accountDeletionLocks.assertCallableActorNotDeleting(
      admin.firestore(),
      uid
    );

    // Every Lift plan and Run plan save comes through here, not only the
    // setup wizard it was first written for, so the onboarding envelope
    // (5 in 10 minutes) refused a person's sixth settings change in a
    // row. 30 in 10 minutes is more than a person makes and still bounds
    // a scripted client.
    const limited = await isRateLimited(uid, "configurePlan", 30, 600_000);
    if (limited) {
      throw new functions.https.HttpsError(
        "resource-exhausted",
        "Too many attempts. Try again in a few minutes."
      );
    }

    try {
      const {
        profileUpdates: rawProfileUpdates,
        programState,
        weekSchedule: rawWeekSchedule,
      } = data;

      if (
        !rawProfileUpdates ||
        typeof rawProfileUpdates !== "object" ||
        Array.isArray(rawProfileUpdates)
      ) {
        throw new functions.https.HttpsError(
          "invalid-argument",
          "profileUpdates is required."
        );
      }
      if (!programState || typeof programState !== "object") {
        throw new functions.https.HttpsError(
          "invalid-argument",
          "programState is required."
        );
      }

      // Reuse the onboarding sanitiser — the field set is a subset of
      // what onboarding accepts, so anything that's safe to write on
      // first-time onboarding is safe to write on a plan rebuild.
      // Unknown fields drop to undefined; the resulting object is the
      // patch that lands on Firestore via merge: true.
      const profileUpdates =
        profileSanitizer.sanitizeProfileData(rawProfileUpdates);

      // Loud-drop: same forgotten-field guard as onboarding (ADR-0005).
      const droppedPlanFields =
        profileSanitizer.findUnexpectedProfileFields(rawProfileUpdates);
      if (droppedPlanFields.length > 0) {
        console.warn("configurePlan.unexpected_dropped_fields", {
          uid,
          fields: droppedPlanFields,
        });
      }

      // The sanitiser lets displayName through here as on onboarding, so a
      // patch carrying one meets the same word filter.
      assertDisplayNameAllowed(profileUpdates.displayName);

      // Configure Plan is always a v7 path — no legacy bypass. The
      // client must send a valid plan; nothing else makes sense for
      // this endpoint. weekSchedule may arrive top-level or inside
      // profileUpdates, same as onboarding.
      const effectiveWeekSchedule = Array.isArray(rawWeekSchedule)
        ? rawWeekSchedule
        : profileUpdates.weekSchedule;
      const errors = validatePlanPayload({
        profileData: profileUpdates,
        programState,
        weekSchedule: effectiveWeekSchedule,
      });
      if (errors.length > 0) {
        throw new functions.https.HttpsError(
          "invalid-argument",
          `Invalid plan payload: ${errors.join("; ")}`
        );
      }

      // Server-managed fields — Configure Plan must never let the
      // client rewrite ownership, subscription, or onboarding state.
      delete profileUpdates.uid;
      delete profileUpdates.subscriptionTier;
      delete profileUpdates.onboardingComplete;
      delete profileUpdates.trialExpiresAt;
      delete profileUpdates.createdAt;

      const db = admin.firestore();
      const userRef = db.collection("users").doc(uid);
      const programRef = userRef.collection("programState").doc("current");
      const publicRef = userRef.collection("public").doc("profile");
      // The race goal is sent whole, and the chip naming it goes with it
      // (raceGoalWrite.js).
      const withRaceGoal = (patch, storedProfile, publicSnap, write) => {
        const stored = storedProfile.raceGoal;
        const after = "raceGoal" in patch ? patch.raceGoal : stored;
        write(
          userRef,
          "raceGoal" in patch
            ? {
                ...patch,
                raceGoal: wholeRaceGoal(
                  patch.raceGoal,
                  stored,
                  admin.firestore.FieldValue.delete()
                ),
              }
            : patch
        );
        if (
          publicSnap.exists &&
          raceIdentityIsStale(publicSnap.data().trainingForSpaceId, after)
        ) {
          write(publicRef, { trainingForSpaceId: null });
        }
      };

      // Allow-list the programState doc before persisting (same rationale as
      // completeOnboarding) — validatePlanPayload above gates shape but never
      // strips unknown top-level keys.
      const cfgProgram = sanitizeProgramState(programState);
      if (cfgProgram.dropped.length > 0) {
        functions.logger.warn("configurePlan.programState_dropped_fields", {
          uid,
          dropped: cfgProgram.dropped,
        });
      }
      if (programStateTooLarge(cfgProgram.value)) {
        throw new functions.https.HttpsError(
          "invalid-argument",
          "programState is too large."
        );
      }

      // Atomic — same rationale as completeOnboarding above. The
      // profile patch and programState rebuild commit together or
      // not at all.
      if (Object.prototype.hasOwnProperty.call(data, "baseProgramState")) {
        const base = data.baseProgramState;
        if (
          (base !== null &&
            (!base ||
              typeof base !== "object" ||
              Array.isArray(base) ||
              programStateTooLarge(base))) ||
          !data.baseProfile ||
          typeof data.baseProfile !== "object" ||
          Array.isArray(data.baseProfile)
        ) {
          throw new functions.https.HttpsError(
            "invalid-argument",
            "A valid plan baseline is required."
          );
        }
        try {
          await db.runTransaction(async (transaction) => {
            const [currentPlan, currentProfile, currentPublic] =
              await Promise.all([
                transaction.get(programRef),
                transaction.get(userRef),
                transaction.get(publicRef),
              ]);
            if (!!base !== currentPlan.exists)
              throw new ProgrammeConflictError();
            const next = base
              ? mergeChangedFields(base, cfgProgram.value, currentPlan.data())
              : cfgProgram.value;
            const before = Object.fromEntries(
              Object.keys(profileUpdates).map((key) => [
                key,
                data.baseProfile[key],
              ])
            );
            const merged = mergeChangedFields(
              before,
              profileUpdates,
              currentProfile.data() || {}
            );
            const patch = Object.fromEntries(
              Object.keys(profileUpdates).map((key) => [key, merged[key]])
            );
            withRaceGoal(
              patch,
              currentProfile.data() || {},
              currentPublic,
              (ref, value) => transaction.set(ref, value, { merge: true })
            );
            transaction.set(programRef, { ...next, updatedAt: Date.now() });
          });
        } catch (error) {
          if (error instanceof ProgrammeConflictError)
            throw new functions.https.HttpsError(
              "failed-precondition",
              error.message
            );
          throw error;
        }
      } else {
        // Compatibility for installed clients preceding the baseline contract.
        const [storedProfile, storedPublic] = await Promise.all([
          userRef.get(),
          publicRef.get(),
        ]);
        const batch = db.batch();
        withRaceGoal(
          profileUpdates,
          storedProfile.data() || {},
          storedPublic,
          (ref, value) => batch.set(ref, value, { merge: true })
        );
        batch.set(programRef, cfgProgram.value);
        await batch.commit();
      }

      return { success: true };
    } catch (err) {
      if (err instanceof functions.https.HttpsError) {
        throw err;
      }
      console.error("configurePlan error:", {
        uid,
        message: err.message,
        stack: err.stack,
      });
      throw new functions.https.HttpsError(
        "internal",
        "Failed to configure plan."
      );
    }
  });

// ══════════════════════════════════════════════
// PROGRAMME COMMAND BOUNDARY (packet 18)
// One server transaction is the authority for every mutation of
// users/{uid}/programState/current. The client sends a small, validated intent
// (a command) — never a whole ProgramState or a generic patch. The transaction
// reads receipt + ProgramState + profile + deletion ledger + tombstone BEFORE
// any write, so two concurrent commands (each retried against the latest
// committed state) both survive, and a deletion that begins mid-flight leaves
// no partial write. commandId is the idempotency key: a durable receipt makes a
// retried offline / timed-out command a no-op.
// ══════════════════════════════════════════════

exports.applyProgramCommand = functions
  .runWith(DEFAULT_HTTP_CAP)
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "Auth required.");
    }
    const uid = context.auth.uid;
    const firestore = admin.firestore();

    // R1A-Deletion: callable-actor lock OUTSIDE the try so its structured
    // account-deleting / account-deleted HttpsError reaches the client intact.
    await accountDeletionLocks.assertCallableActorNotDeleting(firestore, uid);

    // After the deletion lock — the limiter WRITES rateLimits/{uid}_…, and a
    // deleting account must receive no new server writes. Before the
    // transaction, so a flood never opens one. The ceiling is an abuse
    // bound, not a pacing rule: one command every five seconds for ten
    // minutes, against a client whose offline outbox replays at most 50.
    if (await isRateLimited(uid, "applyProgramCommand", 120, 600_000)) {
      throw new functions.https.HttpsError(
        "resource-exhausted",
        "Too many programme changes at once. Wait a moment and try again."
      );
    }

    try {
      // The callable payload IS the command — every shipped client sends it
      // bare (`programCommandClient.ts`: `call(command)`), matching the
      // sibling callables (configurePlan destructures straight off `data`).
      //
      // This read was `data && data.command` from the day the boundary landed
      // (314f9c61), so `data.command` was ALWAYS undefined and every programme
      // command failed `invalid-argument` — 100% of them, for every user. It
      // stayed invisible because the only original caller swallowed the
      // failure; #127ac38 then routed ~30 writers through here with real
      // toasts, which is what surfaced it as "Couldn't save that set."
      //
      // The `.command` wrapper is still tolerated so an in-flight request or a
      // localStorage-queued outbox entry of either shape lands. Disambiguation
      // is safe: `assertKeys` rejects unknown keys, so a legitimate bare
      // command can never itself carry a `command` property.
      const payload =
        data && typeof data === "object" && data.command ? data.command : data;
      const command = programCommands.assertClientProgramCommand(payload);

      // Computed once (not inside the transaction) so a contention retry
      // re-applies the SAME timestamp — the receipt, updatedAt, and any
      // date-derived workout field are identical across retries.
      const now = Date.now();
      const { duplicate, committedUpdatedAt } =
        await runProgramCommandTransaction({ firestore, uid, command, now });

      return {
        commandId: command.commandId,
        duplicate,
        updatedAt: committedUpdatedAt,
      };
    } catch (error) {
      // Preserve structured HttpsError (unauthenticated / failed-precondition /
      // invalid-argument / account-deleting|deleted); map the pure reducer's
      // ProgramCommandError via its own httpsCode; only then fall back to
      // internal. Never flatten a known HttpsError.
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      if (programCommands.isProgramCommandError(error)) {
        throw new functions.https.HttpsError(error.httpsCode, error.message);
      }
      functions.logger.error("applyProgramCommand error", {
        uid,
        message: error && error.message,
      });
      throw new functions.https.HttpsError(
        "internal",
        "Failed to apply programme command."
      );
    }
  });

// ══════════════════════════════════════════════
// EXISTING — analyzeFood
// ══════════════════════════════════════════════

// Permission before food goes to AI — shared by analyzeFood and
// analyzeFoodText. See lib/aiConsent.js.
const aiConsent = require("./lib/aiConsent");
// The optional detail typed on a photo's result (Mob2, call 3).
const foodPhotoDetail = require("./lib/foodPhotoDetail");

exports.analyzeFood = functions
  .runWith(DEFAULT_HTTP_CAP)
  .https.onRequest((req, res) => {
    corsForAiEndpoints(req, res, async (corsError) => {
      if (corsError) {
        res.status(403).json({ error: "Origin not allowed" });
        return;
      }
      // The scan this request was counted as, once it has been: a failure
      // on the service's side after that gives it back (aiScanQuota).
      let charge = null;
      const failScan = async (modelStatus) => {
        if (charge && aiScanQuota.isServiceFailure(modelStatus))
          await aiScanQuota.refundDailyAiQuota(admin.firestore(), charge);
        const failed = aiScanQuota.failedScanResponse(modelStatus);
        res.status(failed.status).json(failed.body);
      };
      try {
        if (req.method !== "POST") {
          res.status(405).json({ error: "Method not allowed" });
          return;
        }

        let authUser;
        try {
          authUser = await verifyAuth(req.headers.authorization);
        } catch (_) {
          res.status(401).json({ error: "Unauthorized" });
          return;
        }

        // R1A-Deletion: actor lock. analyzeFood writes scanUsage/{uid}
        // and rateLimits/{uid}_analyzeFood (server-only, system-writer
        // class), so a deleting account must be rejected before any
        // write. HTTPS response uses 409 Conflict to distinguish from
        // auth/quota errors.
        try {
          await accountDeletionLocks.assertCallableActorNotDeleting(
            admin.firestore(),
            authUser.uid
          );
        } catch (err) {
          if (err.details && err.details.errorCode) {
            res
              .status(409)
              .json({ error: err.message, errorCode: err.details.errorCode });
          } else {
            throw err;
          }
          return;
        }

        // Permission before food goes to AI: an account that has turned
        // AI analysis off is refused here (failed-precondition, reason
        // "ai-analysis-disabled"), ahead of the kill switch, the rate
        // limit and the quota, so a refusal costs it nothing.
        if (
          await aiConsent.refuseUnlessAiAllowed(
            admin.firestore(),
            authUser.uid,
            res
          )
        ) {
          return;
        }

        // Remote kill switch — operators flip `geminiEnabled=false` in
        // config/flags to cut off scans instantly if costs spike or
        // Vertex AI is returning bad data. Checked before rate limit so
        // disabled-state requests don't eat a user's quota window.
        if (!(await isFlagEnabled("geminiEnabled"))) {
          res.status(503).json({
            error:
              "AI food scan is temporarily unavailable. Use manual entry instead.",
          });
          return;
        }

        // Rate limit: 10 image analyses per 10 minutes
        const limited = await isRateLimited(
          authUser.uid,
          "analyzeFood",
          10,
          600_000
        );
        if (limited) {
          res.status(429).json({
            error:
              "Rate limit reached. Wait a few minutes before analysing more food.",
          });
          return;
        }

        // The request is checked BEFORE the quota, because the quota check
        // spends a scan (checkDailyAiQuota increments as it checks), and a
        // malformed request would otherwise cost one of the day's scans and
        // then be refused.
        const { imageBase64 } = req.body || {};
        if (!imageBase64) {
          res.status(400).json({ error: "No image provided" });
          return;
        }
        // Cap input size to prevent token-cost inflation. A normal
        // compressed food photo is well under this ceiling; the limit
        // blocks padding the payload toward the 10MB request size purely
        // to inflate Vertex token cost within an otherwise-legitimate
        // quota.
        if (typeof imageBase64 !== "string" || imageBase64.length > 5000000) {
          res.status(400).json({ error: "Image too large" });
          return;
        }
        // An optional few words typed on the photo's result, sent with
        // the same photo: checked here, before the quota, like the image.
        // See lib/foodPhotoDetail.js for how it reaches the model.
        const photoDetail = foodPhotoDetail.readFoodDetail(
          (req.body || {}).detail
        );
        if ("error" in photoDetail) {
          res.status(400).json({ error: photoDetail.error });
          return;
        }

        // F1b — daily AI scan quota with per-action counters.
        // Image-AI is Pro-only (free=0/day, pro=100/day).
        // Fail-closed via `error: "quota-check-failed"`; the client
        // retries on transient errors rather than treating them as a
        // hard limit.
        const quota = await aiScanQuota.checkDailyAiQuota(admin.firestore(), {
          uid: authUser.uid,
          action: aiScanQuota.ACTION_IMAGE_AI,
        });
        if (!quota.allowed) {
          if (quota.error === "quota-check-failed") {
            res.status(503).json({
              error: "Couldn't verify your scan quota. Try again in a moment.",
              transient: true,
            });
            return;
          }
          // Free user hitting image_ai (limit=0) — same 429 surface
          // as the daily cap exhaustion path. Client message stays
          // tier-neutral; the Settings usage pill is the dedicated
          // upsell surface (lock pin #6).
          res.status(429).json({
            error: "Daily image-AI limit reached. Upgrade to Pro for more.",
            remaining: 0,
            limit: quota.limit,
          });
          return;
        }

        charge = {
          uid: authUser.uid,
          action: aiScanQuota.ACTION_IMAGE_AI,
          dayKey: quota.dayKey,
        };

        const projectId = process.env.GCLOUD_PROJECT;
        const accessToken = await admin.credential
          .applicationDefault()
          .getAccessToken();

        // The no-food sentence is a CONTRACT with the client: the exact
        // foodName "No food detected" is in the client's GENERIC_AI_NAMES
        // filter (src/lib/aiFoodIdentification.ts), and empty items make
        // isEmptyAiFoodResult true — either signal routes the scan into
        // the modal's "No food detected" failure beat. Without this
        // sentence the model improvises on non-food photos ("Two people",
        // "A desk") with hallucinated macros that sail through the name
        // filter and render as a real result. Pinned by
        // aiFoodIdentification.test.ts (promptContract) — reword BOTH
        // ends together or the pin fails.
        const prompt =
          'Analyze this food image and provide nutritional estimates. Return ONLY a valid JSON object with this exact format, no other text: {"foodName": "name of the food/meal", "items": [{"name": "item name", "portionSize": "estimated portion", "calories": 0, "protein": 0, "carbs": 0, "fat": 0}], "totalCalories": 0, "totalProtein": 0, "totalCarbs": 0, "totalFat": 0, "confidence": "high/medium/low"}' +
          ' If the image shows food packaging or a nutrition label, estimate from the label instead. If the image does not contain any food, drink, or food packaging, return exactly: {"foodName": "No food detected", "items": [], "totalCalories": 0, "totalProtein": 0, "totalCarbs": 0, "totalFat": 0, "confidence": "high"}';

        const url = foodModelUrl(projectId);

        const response = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: "Bearer " + accessToken.access_token,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(
            foodPhotoDetail.withFoodDetail(
              {
                contents: [
                  {
                    role: "user",
                    parts: [
                      { text: prompt },
                      {
                        inlineData: {
                          mimeType: "image/jpeg",
                          data: imageBase64,
                        },
                      },
                    ],
                  },
                ],
                // The model and its settings: lib/foodModel.js. A busy
                // multi-item plate costs ~60 output tokens per item, and
                // the model's thinking counts against the same cap, so the
                // cap has headroom: a response cut off mid-JSON fails the
                // parse below and charges the user's rate-limit slot for a
                // 500.
                generationConfig: foodGenerationConfig(),
              },
              photoDetail.detail
            )
          ),
        });

        const data = await response.json();
        // 2026-05-26 audit PR 4 (finding #10) — success-path full-body
        // log dropped; structural-metadata log on the error path only.
        if (!response.ok) {
          console.error(
            "Vertex AI error:",
            redactVertexResponse(data, { httpStatus: response.status })
          );
          await failScan(response.status);
          return;
        }
        functions.logger.info("analyzeFood.usage", vertexUsage(data));

        // The answer's text parts, the model's thinking left out.
        const responseText = foodResponseText(data);
        if (responseText === null) {
          console.error(
            "Unexpected response format:",
            redactVertexResponse(data, { httpStatus: response.status })
          );
          await failScan();
          return;
        }

        const cleaned = responseText
          .replace(/```json\n?/g, "")
          .replace(/```\n?/g, "")
          .trim();
        // The fence-strip handles ```json wrappers but not leading
        // prose ("Here is the analysis: {…}"). Fall back to the
        // outermost {...} span before giving up — a real truncation
        // (no closing brace) still fails, as it should.
        let nutrition;
        try {
          nutrition = JSON.parse(cleaned);
        } catch (parseErr) {
          const braced = cleaned.match(/\{[\s\S]*\}/);
          if (!braced) throw parseErr;
          nutrition = JSON.parse(braced[0]);
        }

        res.status(200).json(nutrition);
      } catch (error) {
        console.error("Error analyzing food:", error);
        // An answer that would not parse is the service's failure too.
        if (charge) await failScan();
        else res.status(500).json({ error: "Failed to analyze food image" });
      }
    });
  });

// ══════════════════════════════════════════════
// AI TEXT FOOD PARSING (Pro feature)
// ══════════════════════════════════════════════

exports.analyzeFoodText = functions
  .runWith(DEFAULT_HTTP_CAP)
  .https.onRequest((req, res) => {
    corsForAiEndpoints(req, res, async (corsError) => {
      if (corsError) {
        res.status(403).json({ error: "Origin not allowed" });
        return;
      }
      // As in analyzeFood: a service failure after the scan was counted
      // gives it back.
      let charge = null;
      const failScan = async (modelStatus) => {
        if (charge && aiScanQuota.isServiceFailure(modelStatus))
          await aiScanQuota.refundDailyAiQuota(admin.firestore(), charge);
        const failed = aiScanQuota.failedScanResponse(modelStatus);
        res.status(failed.status).json(failed.body);
      };
      try {
        if (req.method !== "POST") {
          res.status(405).json({ error: "Method not allowed" });
          return;
        }

        let authUser;
        try {
          authUser = await verifyAuth(req.headers.authorization);
        } catch (_) {
          res.status(401).json({ error: "Unauthorized" });
          return;
        }

        // R1A-Deletion: actor lock. analyzeFoodText writes the same
        // per-uid quota/rate-limit docs as analyzeFood.
        try {
          await accountDeletionLocks.assertCallableActorNotDeleting(
            admin.firestore(),
            authUser.uid
          );
        } catch (err) {
          if (err.details && err.details.errorCode) {
            res
              .status(409)
              .json({ error: err.message, errorCode: err.details.errorCode });
          } else {
            throw err;
          }
          return;
        }

        // Permission before food goes to AI, as in analyzeFood: refused
        // for an account that has turned AI analysis off, before anything
        // is counted against it.
        if (
          await aiConsent.refuseUnlessAiAllowed(
            admin.firestore(),
            authUser.uid,
            res
          )
        ) {
          return;
        }

        // Remote kill switch — shared flag with analyzeFood. One toggle
        // disables both modalities so scan pricing stays predictable.
        if (!(await isFlagEnabled("geminiEnabled"))) {
          res.status(503).json({
            error:
              "AI food scan is temporarily unavailable. Use manual entry instead.",
          });
          return;
        }

        // Rate limit: 15 text analyses per 10 minutes
        const limited = await isRateLimited(
          authUser.uid,
          "analyzeFoodText",
          15,
          600_000
        );
        if (limited) {
          res.status(429).json({
            error:
              "Rate limit reached. Wait a few minutes before analysing more food.",
          });
          return;
        }

        // Checked before the quota, which spends a scan; see analyzeFood.
        // The type check comes first: `text.trim()` on a number throws,
        // which would answer 500 instead of 400.
        const { text } = req.body || {};
        if (typeof text !== "string" || !text.trim()) {
          res.status(400).json({ error: "No text provided" });
          return;
        }
        // Input cap — the reasoning lives with the constant in
        // lib/foodTextRequest.js.
        if (text.length > FOOD_TEXT_MAX_CHARS) {
          res.status(400).json({
            error: `Text too long (max ${FOOD_TEXT_MAX_CHARS} characters)`,
          });
          return;
        }

        // F1b — daily text-AI scan quota. Independent of image_ai
        // (lock pin #7). Free=0 (no AI on the free plan),
        // Pro=100/day server-side cap.
        const quota = await aiScanQuota.checkDailyAiQuota(admin.firestore(), {
          uid: authUser.uid,
          action: aiScanQuota.ACTION_TEXT_AI,
        });
        if (!quota.allowed) {
          if (quota.error === "quota-check-failed") {
            res.status(503).json({
              error: "Couldn't verify your scan quota. Try again in a moment.",
              transient: true,
            });
            return;
          }
          res.status(429).json({
            error: "Daily text-AI limit reached. Upgrade to Pro for more.",
            remaining: 0,
            limit: quota.limit,
          });
          return;
        }

        charge = {
          uid: authUser.uid,
          action: aiScanQuota.ACTION_TEXT_AI,
          dayKey: quota.dayKey,
        };

        const projectId = process.env.GCLOUD_PROJECT;
        const accessToken = await admin.credential
          .applicationDefault()
          .getAccessToken();

        const url = foodModelUrl(projectId);

        // Instructions ride in systemInstruction; the description is the
        // sole user part, verbatim — the user text can never reach the
        // instruction segment. See lib/foodTextRequest.js.
        const response = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: "Bearer " + accessToken.access_token,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(buildFoodTextRequest(text)),
        });

        const data = await response.json();

        if (!response.ok) {
          console.error(
            "Vertex AI error:",
            redactVertexResponse(data, { httpStatus: response.status })
          );
          await failScan(response.status);
          return;
        }
        functions.logger.info("analyzeFoodText.usage", vertexUsage(data));

        const responseText = foodResponseText(data);
        if (responseText === null) {
          console.error(
            "Unexpected response format:",
            redactVertexResponse(data, { httpStatus: response.status })
          );
          await failScan();
          return;
        }

        const cleaned = responseText
          .replace(/```json\n?/g, "")
          .replace(/```\n?/g, "")
          .trim();
        // The fence-strip handles ```json wrappers but not leading
        // prose ("Here is the analysis: {…}"). Fall back to the
        // outermost {...} span before giving up — a real truncation
        // (no closing brace) still fails, as it should.
        let nutrition;
        try {
          nutrition = JSON.parse(cleaned);
        } catch (parseErr) {
          const braced = cleaned.match(/\{[\s\S]*\}/);
          if (!braced) throw parseErr;
          nutrition = JSON.parse(braced[0]);
        }

        res.status(200).json(nutrition);
      } catch (error) {
        console.error("Error analyzing food text:", error);
        if (charge) await failScan();
        else
          res.status(500).json({ error: "Failed to analyze food description" });
      }
    });
  });

// ══════════════════════════════════════════════
// STRIPE CHECKOUT SESSION
// ══════════════════════════════════════════════

// PR D (audit follow-up): server-side Stripe price allowlist. Pre-PR-D
// the client passed `priceId` in the request body and the function
// forwarded it straight to Stripe — meaning any active price in the
// connected Stripe account could be attached. Now we accept only the
// price IDs we explicitly know about, deterministically derive the
// checkout `mode`, and reject unknowns with a 400.
//
// The actual price IDs live in env vars so deploys can point at
// staging vs production prices without code edits. If the env var is
// missing we fail closed (price not in allowlist).
/** Delegates to helpers.getStripePriceAllowlist — see helpers.js for docs. */
const _getStripePriceAllowlist = helpers.getStripePriceAllowlist;
/** Delegates to helpers.isAllowedStripeReturnUrl — see helpers.js for docs. */
const _isAllowedStripeReturnUrl = helpers.isAllowedStripeReturnUrl;
/** Delegates to helpers.buildStripeReturnUrl — see helpers.js for docs. */
const _buildStripeReturnUrl = helpers.buildStripeReturnUrl;

exports.createCheckoutSession = functions
  // STRIPE_SECRET_KEY: creates the Stripe Checkout session.
  .runWith({ ...DEFAULT_HTTP_CAP, secrets: [STRIPE_SECRET_KEY] })
  .https.onRequest((req, res) => {
    corsForPayments(req, res, async () => {
      try {
        if (req.method !== "POST") {
          res.status(405).json({ error: "Method not allowed" });
          return;
        }

        // Auth runs BEFORE any body validation. An unauthenticated
        // POST with bad checkout fields must surface as 401, not 400 —
        // otherwise the response shape leaks which validation layer
        // ran and how the handler is ordered. See the auth-ordering
        // test in __tests__/createCheckoutSession.test.js.
        // Security audit 2026-05-25 finding #3: checkout is a
        // sensitive write path (creates Stripe customers, mutates
        // billing state) — opt into revocation-aware verification so
        // a token from a session-revoked credential can't initiate
        // a payment. Cost: one extra Firebase Admin SDK read per
        // call; payment flow is not a hot path so the latency hit
        // is acceptable.
        let authUser;
        try {
          authUser = await verifyAuth(req.headers.authorization, {
            checkRevoked: true,
          });
        } catch (_) {
          res.status(401).json({ error: "Unauthorized" });
          return;
        }

        // Shape guard — req.body can be null / string / array on
        // malformed requests; destructuring those would throw and
        // surface as a 500.
        if (
          !req.body ||
          typeof req.body !== "object" ||
          Array.isArray(req.body)
        ) {
          res.status(400).json({ error: "Invalid request body." });
          return;
        }

        const { uid, email, priceId, successPath, cancelPath, withTrial } =
          req.body;

        // Ownership check before field-presence so a client passing a
        // mismatched uid gets 403 (not a generic 400). authUser.uid is
        // the source of truth for everything downstream.
        if (uid && authUser.uid !== uid) {
          res.status(403).json({ error: "Forbidden" });
          return;
        }

        if (!priceId || !successPath || !cancelPath) {
          res.status(400).json({
            error: "Missing required fields: priceId, successPath, cancelPath",
          });
          return;
        }

        // Server-synthesized return URLs from a closed set of path
        // tokens. The client only chooses *which app page* to land
        // on; the function builds the full URL itself from a
        // deploy-resolved base origin. Closes the client-controlled
        // URL surface entirely.
        const successUrl = _buildStripeReturnUrl(successPath, "success");
        const cancelUrl = _buildStripeReturnUrl(cancelPath, "cancelled");

        if (!successUrl || !cancelUrl) {
          functions.logger.warn("createCheckoutSession.rejected_return_path", {
            uid: authUser.uid,
            invalidField: !successUrl ? "successPath" : "cancelPath",
          });
          res.status(400).json({
            error: "Invalid checkout return path.",
            code: "INVALID_RETURN_PATH",
            field: !successUrl ? "successPath" : "cancelPath",
          });
          return;
        }

        // Defence-in-depth: even though the URL was built server-side,
        // run it through the existing allowlist. A misconfigured
        // PUBLIC_APP_BASE_URL env var (e.g. accidentally pointing at a
        // non-allowlisted origin) would produce a URL that fails this
        // check — better to refuse to create the session than to send
        // the user to an unlisted destination. The module-load
        // self-check above this handler logs that misconfig at boot
        // time too, so an operator sees it in Cloud Logging.
        const successAllowed = _isAllowedStripeReturnUrl(successUrl);
        const cancelAllowed = _isAllowedStripeReturnUrl(cancelUrl);

        if (!successAllowed || !cancelAllowed) {
          functions.logger.error(
            "createCheckoutSession.built_url_off_allowlist",
            {
              uid: authUser.uid,
              successOrigin: safeOriginForLog(successUrl),
              cancelOrigin: safeOriginForLog(cancelUrl),
              invalidField: !successAllowed ? "successUrl" : "cancelUrl",
            }
          );
          res.status(500).json({
            error: "Payment service misconfigured.",
            code: "RETURN_URL_MISCONFIGURED",
          });
          return;
        }

        // PR D: price allowlist. Mode is derived from the allowlist entry,
        // not from substring-matching the client-supplied price ID.
        const allowlist = _getStripePriceAllowlist();
        const priceConfig = allowlist[priceId];
        if (!priceConfig) {
          functions.logger.warn("createCheckoutSession.rejected_price", {
            uid: authUser.uid,
          });
          res.status(400).json({ error: "Unknown plan." });
          return;
        }
        // R1A-Deletion: actor lock. createCheckoutSession writes
        // users/{uid}.stripeCustomerId — deleting accounts cannot start
        // a new checkout that would recreate the user doc. Key on
        // authUser.uid, not the client-supplied body `uid`: the latter
        // is optional (the ownership check above only fires when it's
        // present), so passing it here let a deleting account bypass the
        // lock entirely by omitting `uid` — isAccountDeleting(db,
        // undefined) reads users/undefined, never exists, returns false.
        try {
          await accountDeletionLocks.assertCallableActorNotDeleting(
            admin.firestore(),
            authUser.uid
          );
        } catch (err) {
          if (err.details && err.details.errorCode) {
            res
              .status(409)
              .json({ error: err.message, errorCode: err.details.errorCode });
            return;
          }
          throw err;
        }

        // Rate limit: 5 checkout attempts per 10 minutes
        const limited = await isRateLimited(
          authUser.uid,
          "checkout",
          5,
          600_000
        );
        if (limited) {
          res.status(429).json({
            error: "Too many checkout attempts. Try again in a few minutes.",
          });
          return;
        }

        // Stripe secret key from Secret Manager (STRIPE_SECRET_KEY
        // defineSecret binding on this function). functions.config()
        // fallback removed — it throws under firebase-functions v7.
        const stripeKey = process.env.STRIPE_SECRET_KEY;

        if (!stripeKey) {
          functions.logger.error("createCheckoutSession.stripe_key_missing");
          res.status(500).json({ error: "Payment service not configured" });
          return;
        }

        const stripe = require("stripe")(stripeKey);

        // Look up or create Stripe customer
        const userDoc = await admin
          .firestore()
          .collection("users")
          .doc(authUser.uid)
          .get();
        const userData = userDoc.exists ? userDoc.data() : {};
        let customerId = userData.stripeCustomerId;

        if (!customerId) {
          const customer = await stripe.customers.create({
            email: authUser.email || email,
            metadata: { firebaseUid: authUser.uid },
          });
          customerId = customer.id;
          await admin
            .firestore()
            .collection("users")
            .doc(authUser.uid)
            .set({ stripeCustomerId: customerId }, { merge: true });
        }

        // Sub1a P1: trial decision + `hasUsedTrial` atomic write live
        // in lib/checkoutTrial.js so they're testable against stub
        // Stripe / Firestore handles. The helper enforces:
        //   - withTrial=true + hasUsedTrial=false → trial_period_days=7
        //   - withTrial=true + hasUsedTrial=true  → no trial (no second use)
        //   - withTrial=false (or undefined)      → no trial
        // The hasUsedTrial write is in the same Firestore transaction
        // as the read so two parallel checkout attempts can't both
        // consume the trial slot. Subscription checkouts only —
        // one-off `payment` mode plans don't support trials.
        const { session } =
          priceConfig.mode === "subscription"
            ? await checkoutTrial.createTrialCheckoutSession({
                stripe,
                firestore: admin.firestore(),
                uid: authUser.uid,
                priceId,
                mode: priceConfig.mode,
                withTrial: Boolean(withTrial),
                successUrl,
                cancelUrl,
                customerId,
                metadata: {
                  firebaseUid: authUser.uid,
                  planKind: priceConfig.kind,
                },
              })
            : {
                session: await stripe.checkout.sessions.create({
                  customer: customerId,
                  payment_method_types: ["card"],
                  line_items: [{ price: priceId, quantity: 1 }],
                  mode: priceConfig.mode,
                  success_url: successUrl,
                  cancel_url: cancelUrl,
                  metadata: {
                    firebaseUid: authUser.uid,
                    planKind: priceConfig.kind,
                  },
                }),
              };

        // Audit-log the successful session creation. Fire-and-forget
        // semantics: an audit-write failure must NOT block the user's
        // checkout — the Stripe session already exists, and the user
        // has been served the redirect URL by the time this log lands.
        // A logger.error here is enough signal for an operator to spot
        // a persistent audit-pipeline outage in Cloud Logging without
        // taking the payment flow down.
        try {
          await auditLog.recordCheckoutAuditEntry(admin.firestore(), {
            uid: authUser.uid,
            stripeSessionId: session.id,
            priceId,
            planKind: priceConfig.kind,
            mode: priceConfig.mode,
            successOrigin: safeOriginForLog(successUrl),
            cancelOrigin: safeOriginForLog(cancelUrl),
          });
        } catch (auditErr) {
          functions.logger.error("createCheckoutSession.audit_failed", {
            uid: authUser.uid,
            stripeSessionId: session.id,
            message: auditErr.message,
          });
        }

        res.status(200).json({ url: session.url });
      } catch (error) {
        functions.logger.error("createCheckoutSession.error", {
          message: error.message,
        });
        res.status(500).json({ error: "Failed to create checkout session" });
      }
    });
  });

exports._getStripePriceAllowlist = _getStripePriceAllowlist;
exports._isAllowedStripeReturnUrl = _isAllowedStripeReturnUrl;

// ══════════════════════════════════════════════
// STRIPE WEBHOOK — subscription lifecycle events
// ══════════════════════════════════════════════

async function recordActivationBillingFirst(db, uid, observation) {
  if (!observation) return;
  const userRef = db.collection("users").doc(uid);
  await db.runTransaction(async (txn) => {
    const snap = await txn.get(userRef);
    if (!snap.exists) return;
    const firsts = activationBilling.nextBillingFirsts(
      snap.data().activationBillingFirsts,
      observation
    );
    if (firsts) txn.update(userRef, { activationBillingFirsts: firsts });
  });
}

exports.stripeWebhook = functions
  // ⛔ NEVER add `enforceAppCheck: true` here. This is an EXTERNAL webhook —
  // Stripe's servers call it and cannot send a Firebase App Check token, so
  // enforcement would 403 every webhook and silently break all subscription
  // billing/reconciliation. Auth is the Stripe signature (STRIPE_WEBHOOK_SECRET)
  // below, not App Check. See docs/app-check-rollout.md → "Never enforce".
  // Both secrets from Secret Manager via defineSecret bindings:
  // STRIPE_SECRET_KEY (Stripe client) + STRIPE_WEBHOOK_SECRET
  // (signature verification).
  .runWith({
    ...DEFAULT_HTTP_CAP,
    secrets: [STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET],
  })
  .https.onRequest(async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    // functions.config() fallbacks removed — throws under
    // firebase-functions v7. Values arrive via process.env from the
    // bound Secret Manager secrets above.
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!stripeKey || !webhookSecret) {
      console.error("stripeWebhook: Stripe keys not configured");
      res.status(500).json({ error: "Webhook not configured" });
      return;
    }

    const stripe = require("stripe")(stripeKey);

    let event;
    try {
      const sig = req.headers["stripe-signature"];
      event = stripe.webhooks.constructEvent(req.rawBody, sig, webhookSecret);
    } catch (err) {
      console.error(
        "stripeWebhook: signature verification failed:",
        err.message
      );
      res.status(400).json({ error: "Invalid signature" });
      return;
    }

    const dbRef = admin.firestore();

    // PR D (audit P0 #2): idempotency via stripeEvents/{event.id}.
    // Stripe retries every webhook on 5xx; without a dedup record a
    // duplicate delivery re-runs the same write.
    //
    // Atomic claim via Firestore transaction: read + claim happen
    // in one logical unit so two parallel retries can't both pass
    // the "doesn't exist" check (the previous get-then-set shape
    // left a multi-second race window between the read at the top
    // and the finalise write after the switch — both invocations
    // would see exists=false, both would process, both would
    // commit the same idempotent write twice).
    const eventRef = dbRef.collection("stripeEvents").doc(event.id);
    let isDuplicate = false;
    try {
      await dbRef.runTransaction(async (txn) => {
        const snap = await txn.get(eventRef);
        if (snap.exists) {
          isDuplicate = true;
          return;
        }
        txn.set(eventRef, {
          type: event.type,
          created: event.created || null,
          claimedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      });
    } catch (err) {
      // Failure to claim shouldn't be papered over — Stripe should
      // retry. 500 triggers a retry; the next attempt will either
      // see our partial write (treated as duplicate, safe) or
      // succeed the claim cleanly.
      console.error(
        `stripeWebhook: idempotency claim failed for ${event.id}:`,
        err.message
      );
      res
        .status(500)
        .json({ error: "Idempotency claim failed; retrying recommended" });
      return;
    }

    if (isDuplicate) {
      console.log(
        `stripeWebhook: duplicate delivery for ${event.id}, skipping`
      );
      res.status(200).json({ received: true, duplicate: true });
      return;
    }

    try {
      switch (event.type) {
        case "checkout.session.completed": {
          const session = event.data.object;
          const firebaseUid = session.metadata?.firebaseUid;
          if (!firebaseUid) {
            console.warn(
              "stripeWebhook: checkout.session.completed missing firebaseUid metadata"
            );
            break;
          }

          // R1A-Deletion: system-writer guard. If the uid is mid-deletion
          // or tombstoned, do NOT recreate users/{uid} — log a minimised
          // event to paymentEventsPostDeletion for operator review.
          if (
            !(await accountDeletionLocks.shouldSystemWriteProceed(
              dbRef,
              firebaseUid,
              "stripeWebhook:checkout.session.completed"
            ))
          ) {
            await accountDeletionLocks.recordPaymentEventPostDeletion(dbRef, {
              provider: "stripe",
              externalTxnId: session.id,
              providerEventId: event.id, // Stripe-native idempotency key
              eventType: "checkout.session.completed",
              uid: firebaseUid,
            });
            break;
          }

          // Sub1 P2 — read current state for cross-platform overlap
          // detection. Same lookup the customer.subscription.* cases
          // already perform; activation here mirrors the contract.
          const existingDoc = await dbRef
            .collection("users")
            .doc(firebaseUid)
            .get();
          const existingData = existingDoc.exists ? existingDoc.data() : {};
          const completedDecision =
            subscriptionReconciliation.resolveSubscriptionUpdate({
              currentTier: existingData.subscriptionTier,
              currentSource: existingData.subscriptionSource,
              incomingTier: "pro",
              incomingSource: subscriptionReconciliation.SOURCE_STRIPE,
            });
          if (completedDecision.conflict) {
            functions.logger.warn(
              "stripeWebhook.checkout.session.completed.cross_platform_conflict",
              {
                uid: firebaseUid,
                conflictReason: completedDecision.conflictReason,
                newSource: completedDecision.writeSource,
              }
            );
          }

          const update = {
            subscriptionTier: completedDecision.writeTier,
            subscriptionSource: completedDecision.writeSource,
            stripeCustomerId: session.customer,
            subscriptionUpdatedAt:
              event.created || Math.floor(Date.now() / 1000),
          };

          // For subscription mode, store the subscription ID
          if (session.subscription) {
            update.stripeSubscriptionId = session.subscription;
          }

          // Lifetime kind comes from server-side allowlist via
          // metadata.planKind — recorded so subsequent subscription
          // events can't downgrade a lifetime entitlement.
          if (session.metadata?.planKind === "lifetime") {
            update.planKind = "lifetime";
          }

          await dbRef
            .collection("users")
            .doc(firebaseUid)
            .set(update, { merge: true });
          if (!completedDecision.conflict) {
            if (
              event.livemode === true &&
              session.mode === "subscription" &&
              session.subscription &&
              session.payment_status === "no_payment_required" &&
              session.metadata?.activationTrial === "true"
            ) {
              await recordActivationBillingFirst(dbRef, firebaseUid, {
                kind: "trial",
                source: "stripe",
                atMs: event.created * 1000,
              });
            }
            await recordActivationBillingFirst(
              dbRef,
              firebaseUid,
              activationBilling.stripePaidObservation(event)
            );
          }
          console.log(`stripeWebhook: activated pro for ${firebaseUid}`);
          break;
        }

        case "customer.subscription.updated": {
          const subscription = event.data.object;
          const customerId = subscription.customer;

          // Look up user by stripeCustomerId
          const usersSnap = await dbRef
            .collection("users")
            .where("stripeCustomerId", "==", customerId)
            .limit(1)
            .get();

          if (usersSnap.empty) {
            console.warn(
              `stripeWebhook: no user found for customer ${customerId}`
            );
            break;
          }

          const userDoc = usersSnap.docs[0];

          // R1A-Deletion: per-write tombstone guard runs FIRST. If the
          // resolved uid is mid-deletion or tombstoned, log the event
          // to paymentEventsPostDeletion and stop — no further checks
          // are meaningful for an account that no longer exists.
          if (
            !(await accountDeletionLocks.shouldSystemWriteProceed(
              dbRef,
              userDoc.id,
              "stripeWebhook:subscription.updated"
            ))
          ) {
            await accountDeletionLocks.recordPaymentEventPostDeletion(dbRef, {
              provider: "stripe",
              externalTxnId: subscription.id,
              providerEventId: event.id,
              eventType: "customer.subscription.updated",
              uid: userDoc.id,
            });
            break;
          }

          const userData = userDoc.data();

          // PR D: out-of-order guard. If a newer event has already
          // updated this user, ignore the stale one. Compare against
          // subscriptionUpdatedAt (Unix seconds, written by previous
          // webhooks).
          const lastUpdate = Number(userData.subscriptionUpdatedAt) || 0;
          if (event.created && event.created <= lastUpdate) {
            console.log(
              `stripeWebhook: ignoring stale subscription.updated for ${userDoc.id} (event=${event.created}, last=${lastUpdate})`
            );
            break;
          }

          // PR D: lifetime entitlement protection. A subscription
          // event must NEVER downgrade a lifetime purchase.
          if (userData.planKind === "lifetime") {
            console.log(
              `stripeWebhook: skipping subscription.updated for ${userDoc.id} — lifetime entitlement`
            );
            break;
          }

          const status = subscription.status;

          // Sub1a P1: status→tier mapping lives in lib/checkoutTrial.js
          // so the `trialing → active` transition contract is pinned by
          // a unit test (checkoutTrial.test.js cycle 4). Both `active`
          // and `trialing` resolve to "pro" — trial conversion is
          // invisible to the user.
          const tier = checkoutTrial.mapSubscriptionStatusToTier(status);

          // Sub1 P2 — write both tier + source atomically. Helper
          // detects cross-platform overlap (Pro/stripe overwriting
          // Pro/ios_iap) and surfaces a forensic alert.
          const updateDecision =
            subscriptionReconciliation.resolveSubscriptionUpdate({
              currentTier: userData.subscriptionTier,
              currentSource: userData.subscriptionSource,
              incomingTier: tier,
              incomingSource: subscriptionReconciliation.SOURCE_STRIPE,
            });
          if (updateDecision.conflict) {
            functions.logger.warn(
              "stripeWebhook.customer.subscription.updated.cross_platform_conflict",
              {
                uid: userDoc.id,
                conflictReason: updateDecision.conflictReason,
                newSource: updateDecision.writeSource,
              }
            );
          }

          await userDoc.ref.set(
            {
              subscriptionTier: updateDecision.writeTier,
              subscriptionSource: updateDecision.writeSource,
              stripeSubscriptionId: subscription.id,
              subscriptionUpdatedAt:
                event.created || Math.floor(Date.now() / 1000),
            },
            { merge: true }
          );
          if (
            event.livemode === true &&
            !updateDecision.conflict &&
            tier === "pro"
          ) {
            await recordActivationBillingFirst(
              dbRef,
              userDoc.id,
              activationBilling.stripeTrialObservation(subscription)
            );
          }

          console.log(
            `stripeWebhook: updated ${userDoc.id} to ${tier} (status: ${status})`
          );
          break;
        }

        case "invoice.paid": {
          const invoice = event.data.object;
          const paid = activationBilling.stripePaidObservation(event);
          if (!paid || !invoice.customer) break;
          const usersSnap = await dbRef
            .collection("users")
            .where("stripeCustomerId", "==", invoice.customer)
            .limit(1)
            .get();
          if (usersSnap.empty) break;
          const userDoc = usersSnap.docs[0];
          if (
            !(await accountDeletionLocks.shouldSystemWriteProceed(
              dbRef,
              userDoc.id,
              "stripeWebhook:invoice.paid"
            ))
          ) {
            await accountDeletionLocks.recordPaymentEventPostDeletion(dbRef, {
              provider: "stripe",
              externalTxnId: invoice.id || null,
              providerEventId: event.id,
              eventType: "invoice.paid",
              uid: userDoc.id,
            });
            break;
          }
          const invoiceSubscription =
            invoice.subscription ||
            invoice.parent?.subscription_details?.subscription;
          if (
            userDoc.data().subscriptionSource !== "stripe" ||
            !invoiceSubscription ||
            invoiceSubscription !== userDoc.data().stripeSubscriptionId
          )
            break;
          await recordActivationBillingFirst(dbRef, userDoc.id, paid);
          break;
        }

        case "customer.subscription.deleted": {
          const subscription = event.data.object;
          const customerId = subscription.customer;

          const usersSnap = await dbRef
            .collection("users")
            .where("stripeCustomerId", "==", customerId)
            .limit(1)
            .get();

          if (usersSnap.empty) {
            console.warn(
              `stripeWebhook: no user found for customer ${customerId}`
            );
            break;
          }

          const userDoc = usersSnap.docs[0];

          // R1A-Deletion: per-write tombstone guard runs FIRST.
          if (
            !(await accountDeletionLocks.shouldSystemWriteProceed(
              dbRef,
              userDoc.id,
              "stripeWebhook:subscription.deleted"
            ))
          ) {
            await accountDeletionLocks.recordPaymentEventPostDeletion(dbRef, {
              provider: "stripe",
              externalTxnId: subscription.id,
              providerEventId: event.id,
              eventType: "customer.subscription.deleted",
              uid: userDoc.id,
            });
            break;
          }

          const userData = userDoc.data();

          // Reasons to IGNORE a `deleted` event (no downgrade):
          //   (a) lifetime entitlement — never downgraded by sub events.
          //   (b) source-ownership (audit F3) — the live entitlement is owned
          //       by a NON-Stripe source, i.e. the user migrated to Apple and
          //       this is the displaced Stripe sub being auto-cancelled;
          //       downgrading would strip the freshly-purchased Apple Pro.
          //   (c) the stored subscription ID doesn't match — a different
          //       subscription was deleted, ours is still active.
          //   (d) staleness — a newer update already happened.
          // Extracted to lib/stripeSubscriptionDeleted.js so the guard set is
          // unit-testable and the F3 fix is pinned.
          const del = shouldIgnoreSubscriptionDeleted({
            userData,
            subscriptionId: subscription.id,
            eventCreated: event.created,
          });
          if (del.ignore) {
            console.log(
              `stripeWebhook: ignoring subscription.deleted for ${userDoc.id} — ${del.reason}`
            );
            break;
          }

          // Sub1 P2 — downgrade nulls the source field per the
          // reconciliation contract. Helper returns conflict=false
          // unconditionally for free writes.
          await userDoc.ref.set(
            {
              subscriptionTier: "free",
              subscriptionSource: null,
              stripeSubscriptionId: admin.firestore.FieldValue.delete(),
              subscriptionUpdatedAt:
                event.created || Math.floor(Date.now() / 1000),
            },
            { merge: true }
          );

          console.log(`stripeWebhook: deactivated pro for ${userDoc.id}`);
          break;
        }

        default:
          console.log(`stripeWebhook: unhandled event type ${event.type}`);
      }

      // PR D: finalise idempotency record AFTER successful processing.
      // Merge over the claim doc so `claimedAt` is preserved (useful
      // for ops post-mortem on duplicate-retry windows).
      try {
        await eventRef.set(
          {
            processedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      } catch (err) {
        // The claim doc still exists with claimedAt set, so Stripe
        // retries will be treated as duplicate and skipped. The
        // handlers above are idempotent on retry, so worst-case
        // a retry re-runs the same write before being skipped.
        console.error(
          `stripeWebhook: failed to record processed event ${event.id}:`,
          err.message
        );
      }

      res.status(200).json({ received: true });
    } catch (err) {
      console.error("stripeWebhook: processing error:", err.message);
      // Release the claim so Stripe's retry can re-attempt this
      // event. Without this, the claim doc would persist and the
      // retry would be silently skipped as a duplicate, stranding
      // the unprocessed event. Best-effort — if the delete fails,
      // the handler stays idempotent as a fallback.
      try {
        await eventRef.delete();
      } catch (deleteErr) {
        console.error(
          `stripeWebhook: failed to release claim for ${event.id} after error:`,
          deleteErr.message
        );
      }
      res.status(500).json({ error: "Webhook processing failed" });
    }
  });

// ══════════════════════════════════════════════
// PERFORMANCE ENGINE
// ══════════════════════════════════════════════

const {
  computeAndWritePerformanceForUser,
  acquireCooldownLock,
  releaseLock,
  getWeekKey,
  inTriggerReach,
  runDayKey,
} = require("./performanceEngine");

const db = admin.firestore();

// ── 1) Callable: manual / on-demand compute ──

exports.computePerformanceWeek = functions
  .runWith(DEFAULT_HTTP_CAP)
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "Auth required.");
    }
    const uid = context.auth.uid;
    // R1A-Deletion: actor lock. Writes users/{uid}/performance.
    await accountDeletionLocks.assertCallableActorNotDeleting(
      admin.firestore(),
      uid
    );

    // Rate limit: 10 manual computes per 10 minutes
    const limited = await isRateLimited(uid, "computePerformance", 10, 600_000);
    if (limited) {
      throw new functions.https.HttpsError(
        "resource-exhausted",
        "Too many requests. Try again in a few minutes."
      );
    }

    // `weekKey` becomes the id of the performance document this writes, so
    // it has to be a real day (and `data` may be absent altogether).
    const weekKey = (data && data.weekKey) || null;
    if (weekKey !== null && !isValidDateKey(weekKey)) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "weekKey must be a YYYY-MM-DD date."
      );
    }

    try {
      const result = await computeAndWritePerformanceForUser(uid, weekKey);
      return result;
    } catch (err) {
      console.error("computePerformanceWeek error:", err);
      // A fixed sentence: the error's own text names internals.
      throw new functions.https.HttpsError(
        "internal",
        "Couldn't work out this week. Try again later."
      );
    }
  });

// ══════════════════════════════════════════════
// SHARED ACTIVE-USERS SWEEP SCAFFOLD
// ══════════════════════════════════════════════
//
// Five scheduled functions iterate active users in lockstep:
// weeklyPerformanceRollup, dailyPerformanceRefresh, hourlyStreakNudge,
// dailyRaceReconciliationSweep, weeklyFellBehindCheck. All share
// the same shape:
//
//   1. Query `users` filtered by `lastActiveAt >= cutoff` (fail
//      loud — never fall back to a full scan, runaway-cost risk),
//      most recently active first, a page at a time.
//   2. Chunk each page into batches of 10 and run each batch
//      with `Promise.all` for bounded concurrency, stopping before
//      the time limit.
//   3. Per-uid try/catch so one bad user doesn't break the sweep.
//   4. Outer try/catch on the function body so an unexpected
//      throw can't crash the pubsub container without a log.
//
// `sweepActiveUsers` centralises that scaffold. The R1A
// `shouldSystemWriteProceed` guard placement varies per caller (some
// place it in their per-user worker, some at the top of the callback)
// so it stays caller-owned rather than baked into this helper.

/**
 * Shared read scaffold for per-user worker functions that need both
 * the user's profile doc and their current programState. Three
 * workers use it (PR-L L1+L3 sweep, L2 recovery-entry on
 * onRunCreated, L4 weekly fell-behind check) — all read in parallel
 * and early-return when either doc is missing. Returns null in that
 * case so callers can `if (!ctx) return ...` cleanly.
 */
async function readUserProgramContext(uid) {
  const userRef = db.collection("users").doc(uid);
  const programRef = userRef.collection("programState").doc("current");
  const [userSnap, programSnap] = await Promise.all([
    userRef.get(),
    programRef.get(),
  ]);
  if (!userSnap.exists || !programSnap.exists) {
    return null;
  }
  return {
    userRef,
    programRef,
    profile: userSnap.data() || {},
    programState: programSnap.data() || {},
    // CF3: read-time version of the programState doc so a whole-array write
    // built from this snapshot can be compare-and-swap guarded against a
    // concurrent edit between the read and the write.
    programUpdateTime: programSnap.updateTime,
  };
}

/** Users read per page of a sweep, and worked on at once. */
const SWEEP_PAGE_SIZE = 500;
const SWEEP_CONCURRENCY = 10;
/** When a sweep stops starting new users: a minute short of
 *  SCHEDULED_CAP's 540 s, so the run finishes and is recorded. */
const SWEEP_TIME_LIMIT_MS = 480_000;

/**
 * Every user active within `cutoffDays`, most recently active first, a page
 * at a time. `perUser(uid, userData)` gets the user's own document from the
 * page, so a worker that needs only its fields reads nothing more. A sweep
 * that reaches its time limit stops starting new users and says so in its
 * run record; newest first, the people it leaves out are the ones who have
 * been away longest, not the ones it matters most for.
 */
async function sweepActiveUsers({
  name,
  cutoffDays,
  perUser,
  timeLimitMs = SWEEP_TIME_LIMIT_MS,
}) {
  const started = Date.now();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - cutoffDays);
  const cutoffTs = admin.firestore.Timestamp.fromDate(cutoff);
  const query = db
    .collection("users")
    .where("lastActiveAt", ">=", cutoffTs)
    .orderBy("lastActiveAt", "desc")
    .limit(SWEEP_PAGE_SIZE);

  let users = 0;
  let failed = 0;
  let stoppedAtTimeLimit = false;
  let cursor = null;
  for (;;) {
    let page;
    try {
      page = await (cursor ? query.startAfter(cursor) : query).get();
    } catch (err) {
      // A run that could not find its users failed, and is recorded so;
      // returning here once made it a success that did nothing.
      console.error(`${name}: lastActiveAt query failed:`, err.message);
      throw err;
    }
    for (let i = 0; i < page.docs.length; i += SWEEP_CONCURRENCY) {
      if (Date.now() - started > timeLimitMs) {
        stoppedAtTimeLimit = true;
        break;
      }
      const batch = page.docs.slice(i, i + SWEEP_CONCURRENCY);
      users += batch.length;
      await Promise.all(
        batch.map(async (userDoc) => {
          try {
            await perUser(userDoc.id, userDoc.data() || {});
          } catch (err) {
            failed += 1;
            console.error(`${name}: failed for ${userDoc.id}:`, err.message);
          }
        })
      );
    }
    if (stoppedAtTimeLimit || page.docs.length < SWEEP_PAGE_SIZE) break;
    cursor = page.docs[page.docs.length - 1];
  }
  console.log(`${name}: processed ${users} users`);
  if (stoppedAtTimeLimit) {
    console.warn(`${name}: stopped at the time limit after ${users} users`);
  }
  // Stored with the run: one person's failure does not fail the sweep, but
  // the count says how many there were, and a sweep cut short says so. The
  // flag is written either way: the run record merges, so a run that left
  // it out would keep the last cut-short run's true.
  return { users, failed, stoppedAtTimeLimit };
}

// Exported for the sweep's own order and time-limit test.
exports._sweepActiveUsers = sweepActiveUsers;

// ── 2) Scheduled: weekly rollup (Sundays 23:15 UTC) ──

exports.weeklyPerformanceRollup = functions
  .runWith(SCHEDULED_CAP)
  .pubsub.schedule("15 23 * * 0")
  .timeZone("Etc/UTC")
  .onRun(() =>
    jobRuns.recordJobRun(db, "weeklyPerformanceRollup", async () => {
      let summary = null;
      try {
        console.log("weeklyPerformanceRollup: starting");
        summary = await sweepActiveUsers({
          name: "weeklyPerformanceRollup",
          cutoffDays: 30,
          perUser: async (uid) => {
            // R1A-Deletion: per-uid tombstone guard. The function read
            // the active-users list seconds-to-minutes ago; a user may
            // have started deletion since.
            if (
              !(await accountDeletionLocks.shouldSystemWriteProceed(
                db,
                uid,
                "weeklyPerformanceRollup"
              ))
            ) {
              return;
            }
            await computeAndWritePerformanceForUser(uid, null);
          },
        });
        console.log("weeklyPerformanceRollup: done");
      } catch (err) {
        console.error("weeklyPerformanceRollup: fatal error:", {
          message: err.message,
          stack: err.stack,
        });
        // Recorded as failed (lib/jobRuns.js), not as a success.
        throw err;
      }
      return summary;
    })
  );

// ── 3) Scheduled: daily refresh (02:10 UTC) ──

exports.dailyPerformanceRefresh = functions
  .runWith(SCHEDULED_CAP)
  .pubsub.schedule("10 2 * * *")
  .timeZone("Etc/UTC")
  .onRun(() =>
    jobRuns.recordJobRun(db, "dailyPerformanceRefresh", async () => {
      let summary = null;
      try {
        console.log("dailyPerformanceRefresh: starting");
        summary = await sweepActiveUsers({
          name: "dailyPerformanceRefresh",
          cutoffDays: 14,
          perUser: async (uid) => {
            if (
              !(await accountDeletionLocks.shouldSystemWriteProceed(
                db,
                uid,
                "dailyPerformanceRefresh"
              ))
            ) {
              return;
            }
            await computeAndWritePerformanceForUser(uid, null);
          },
        });
        console.log("dailyPerformanceRefresh: done");
      } catch (err) {
        console.error("dailyPerformanceRefresh: fatal error:", {
          message: err.message,
          stack: err.stack,
        });
        // Recorded as failed (lib/jobRuns.js), not as a success.
        throw err;
      }
      return summary;
    })
  );

// ── 4) Scheduled: challenge rollover (00:05 UTC daily) ──
//
// Server-owned replacement for the retired client-side seedChallenges().
// Global challenge definitions are app metadata, not user content; the client
// create path on /challenges is now denied by rules. Because the challenge IDs
// are time-windowed (weekly-/monthly-/seasonal-/fastest-5k-/group-goal-), a
// one-time seed script would expire within a period — so this runs DAILY and
// idempotently materialises the CURRENT period's docs (create-if-missing,
// never overwrite, so participantCount and any drift are preserved). Pinned to
// UTC so the period boundary doesn't shift under DST (see CLAUDE.md). Running
// daily (not only at boundaries) self-heals a missed run and backfills on first
// deploy; the ≤5-min gap at a week boundary before the cron fires is acceptable
// pre-launch. SCHEDULED_CAP (maxInstances:1).
exports.rolloverChallenges = functions
  .runWith(SCHEDULED_CAP)
  .pubsub.schedule("5 0 * * *")
  .timeZone("Etc/UTC")
  .onRun(() =>
    jobRuns.recordJobRun(db, "rolloverChallenges", async () => {
      try {
        console.log("rolloverChallenges: starting");
        // Current period + one UTC day of lookahead: a UTC-positive user's
        // local new-period activity lands hours before the UTC boundary, and
        // the doc must already exist for syncChallengeProgress to credit it.
        // The window predicate keeps early docs inert until their day arrives;
        // the client hides not-yet-started challenges by local day. See
        // buildUpcomingChallenges for the full seam.
        const defs = challengeDefs.buildUpcomingChallenges(new Date());
        let created = 0;
        for (const def of defs) {
          try {
            const ref = db.collection("challenges").doc(def.id);
            const snap = await ref.get();
            if (snap.exists) {
              // Words only: a description rewritten here reaches a challenge
              // already running (the Together pass rewrote "Hybrid score:
              // km x 100 + …" while Autumn Push was live). Nothing else on an
              // existing challenge changes.
              if (snap.get("description") !== def.description) {
                await ref.update({ description: def.description });
              }
              continue;
            }
            const { id: _id, startDate, endDate, ...rest } = def;
            await ref.set({
              ...rest,
              startDate: admin.firestore.Timestamp.fromDate(startDate),
              endDate: admin.firestore.Timestamp.fromDate(endDate),
              participantCount: 0,
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            created++;
          } catch (err) {
            console.error(
              `rolloverChallenges: failed for ${def.id}:`,
              err.message
            );
          }
        }
        console.log(
          `rolloverChallenges: done — ensured ${defs.length}, created ${created}`
        );
      } catch (err) {
        console.error("rolloverChallenges: fatal error:", {
          message: err.message,
          stack: err.stack,
        });
        // Recorded as failed (lib/jobRuns.js), not as a success.
        throw err;
      }
      return null;
    })
  );

// ══════════════════════════════════════════════
// Push #961 — hourly streak-at-risk nudge sender (web)
// ══════════════════════════════════════════════
//
// Composes the pure decision helpers — shouldSendStreakNudge (#964) plus the
// once-ever shouldSendFirstWeekNudge below the `>= 2` floor (D-1 day-1→day-2
// fix), isLocalSendHour (#1001), the inlined consent check (mirrors
// src/lib/pushConsent — functions/ can't import the TS client module), and the
// server-side active-date derivation (#activeDates / Option A) — with the FCM
// I/O. Fires hourly; each eligible user is sent at most once/day at ~19:00
// LOCAL, outside quiet hours, gated on streak consent. SCHEDULED_CAP
// (maxInstances:1); admin.messaging() uses the default service-account creds
// (no bound secret). Only targets users with a registered device token.

const STREAK_NUDGE_LOCAL_HOUR = 19;

// Consent gate — see functions/lib/pushConsent.js. It was inlined here under
// a comment claiming it mirrored src/lib/pushConsent.mayTargetUser, which had
// no callers: the tested copy was the dead one. Now extracted and tested where
// it runs.
const { mayTargetUserConsent } = require("./lib/pushConsent");

// ══════════════════════════════════════════════
// PUSH TOKEN OWNERSHIP (packet 19) — claim/release callables + sender leasing
// The client no longer writes users/{uid}/devices directly. A callable claims
// the token (retiring any prior owner) and a matching callable releases it.
// Senders load only canonically-claimed registrations and hold a short send
// lease so an ownership transfer can't race an in-flight FCM send.
// ══════════════════════════════════════════════

function pushTokenInput(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new functions.https.HttpsError("invalid-argument", "Invalid token.");
  }
  if (
    Object.keys(data).some(
      (key) =>
        key !== "ownerUid" &&
        key !== "token" &&
        key !== "platform" &&
        key !== "bindingId"
    )
  ) {
    throw new functions.https.HttpsError("invalid-argument", "Invalid token.");
  }
  try {
    return {
      ownerUid: typeof data.ownerUid === "string" ? data.ownerUid : "",
      token: pushTokenOwnership.assertToken(data.token),
      platform: data.platform,
      bindingId: pushTokenOwnership.assertBindingId(data.bindingId),
    };
  } catch (_) {
    throw new functions.https.HttpsError("invalid-argument", "Invalid token.");
  }
}

function assertPushTokenOwner(context, input) {
  if (input.ownerUid !== context.auth.uid) {
    // `ownerUid` is an intent fence, not an authorization claim. It stops an
    // A-originated browser continuation from executing under B's credential
    // after Firebase Auth has switched accounts.
    throw new functions.https.HttpsError(
      "permission-denied",
      "Account changed."
    );
  }
}

function pushRevocationExpiresAt() {
  return admin.firestore.Timestamp.fromMillis(
    Date.now() + pushTokenOwnership.REVOCATION_WINDOW_MS
  );
}

function rethrowPushTokenError(error) {
  const wrapped = accountDeletionLocks.wrapAsHttpsError(error);
  if (wrapped !== error) throw wrapped;
  if (error instanceof pushTokenOwnership.PushTokenOwnershipError) {
    throw new functions.https.HttpsError(
      "aborted",
      "Push-token operation was superseded. Retry the action.",
      { reason: error.code }
    );
  }
  throw error;
}

exports.claimPushDeviceToken = functions
  .runWith(DEFAULT_HTTP_CAP)
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "Auth required.");
    }
    const input = pushTokenInput(data);
    if (input.platform !== "web" && input.platform !== "ios") {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Invalid token."
      );
    }
    assertPushTokenOwner(context, input);

    const firestore = admin.firestore();
    await accountDeletionLocks.assertCallableActorNotDeleting(
      firestore,
      context.auth.uid
    );
    if (
      await isRateLimited(context.auth.uid, "claimPushDeviceToken", 30, 600_000)
    ) {
      throw new functions.https.HttpsError(
        "resource-exhausted",
        "Too many device registrations."
      );
    }

    try {
      await pushTokenOwnership.claimToken({
        firestore,
        uid: context.auth.uid,
        token: input.token,
        platform: input.platform,
        bindingId: input.bindingId,
        serverTimestamp: admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch (error) {
      // The helper re-reads deletion/tombstone state inside its transaction.
      rethrowPushTokenError(error);
    }
    return { claimed: true };
  });

exports.releasePushDeviceToken = functions
  .runWith(DEFAULT_HTTP_CAP)
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "Auth required.");
    }
    const input = pushTokenInput(data);
    if (input.platform !== "web" && input.platform !== "ios") {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Invalid token."
      );
    }
    assertPushTokenOwner(context, input);
    const firestore = admin.firestore();
    await accountDeletionLocks.assertCallableActorNotDeleting(
      firestore,
      context.auth.uid
    );
    if (
      await isRateLimited(
        context.auth.uid,
        "releasePushDeviceToken",
        60,
        600_000
      )
    ) {
      throw new functions.https.HttpsError(
        "resource-exhausted",
        "Too many device releases."
      );
    }
    try {
      await pushTokenOwnership.releaseTokenIfOwned({
        firestore,
        uid: context.auth.uid,
        token: input.token,
        bindingId: input.bindingId,
        serverTimestamp: admin.firestore.FieldValue.serverTimestamp(),
        revocationExpiresAt: pushRevocationExpiresAt(),
      });
    } catch (error) {
      rethrowPushTokenError(error);
    }
    return { released: true };
  });

// --- sender helpers: load canonical registrations, lease, release, prune ----

async function loadClaimedPushRegistrations(uid) {
  return pushTokenOwnership.loadClaimedRegistrations({ firestore: db, uid });
}

async function pruneDeadPushTokens(uid, registrations, multicastResult) {
  const tokens = registrations.map((registration) => registration.token);
  const dead = tokensToPrune(multicastResult, tokens);
  const registrationByToken = new Map(
    registrations.map((registration) => [registration.token, registration])
  );
  await Promise.all(
    dead.map((token) => {
      const registration = registrationByToken.get(token);
      if (!registration) return Promise.resolve();
      return pushTokenOwnership
        .releaseTokenIfOwned({
          firestore: db,
          uid,
          token,
          bindingId: registration.bindingId,
          serverTimestamp: admin.firestore.FieldValue.serverTimestamp(),
          revocationExpiresAt: pushRevocationExpiresAt(),
        })
        .catch(() => {});
    })
  );
  return dead;
}

async function leaseClaimedPushRegistrations(uid) {
  const candidates = await loadClaimedPushRegistrations(uid);
  const attempted = await Promise.all(
    candidates.map(async (registration) => {
      const lease = await pushTokenOwnership.acquireSendLease({
        firestore: db,
        uid,
        tokenHash: registration.hash,
        bindingId: registration.bindingId,
        serverTimestamp: admin.firestore.FieldValue.serverTimestamp(),
      });
      return lease ? { ...registration, leaseId: lease.leaseId } : null;
    })
  );
  return attempted.filter(Boolean);
}

async function releaseClaimedPushSendLeases(uid, registrations) {
  await Promise.all(
    registrations.map((registration) =>
      pushTokenOwnership
        .releaseSendLease({
          firestore: db,
          uid,
          tokenHash: registration.hash,
          bindingId: registration.bindingId,
          leaseId: registration.leaseId,
          serverTimestamp: admin.firestore.FieldValue.serverTimestamp(),
        })
        .catch(() => {})
    )
  );
}

async function maybeSendStreakNudge(uid, now, profile) {
  // The sweep passes the user's document it already read; the hour is
  // checked from it before anything else is.
  const timezone =
    (profile || (await db.doc(`users/${uid}`).get()).data() || {}).timezone ||
    null;
  if (!timezone) return false; // skip-on-null-tz (no overnight pings)

  // Hour-bucket: only at ~19:00 local, never inside quiet hours.
  if (!isLocalSendHour(now, timezone, STREAK_NUDGE_LOCAL_HOUR)) return false;

  const [streakSnap, consentSnap, stateSnap] = await Promise.all([
    db.doc(`users/${uid}/streaks/data`).get(),
    db.doc(`users/${uid}/settings/push`).get(),
    db.doc(`users/${uid}/settings/pushState`).get(),
  ]);

  // Consent: streak push must be opted in.
  if (!mayTargetUserConsent(consentSnap.data() || null, "streak")) return false;

  const streak = streakSnap.data() || {};
  const pushState = stateSnap.data() || {};
  const lastNudgeDateKey = pushState.lastStreakNudgeDateKey || null;
  const firstWeekNudgeDateKey = pushState.firstWeekNudgeDateKey || null;

  // Active-date set (Option A): re-derive from the last few days of logs, since
  // the client-computed set is never persisted.
  const windowMs = now.getTime() - 3 * 86400000;
  const windowKey =
    localDateKeyInTz(new Date(windowMs), timezone) || "0000-00-00";
  const windowTs = admin.firestore.Timestamp.fromMillis(windowMs);
  const [workoutsSnap, runsSnap, mealsSnap] = await Promise.all([
    db.collection(`users/${uid}/workouts`).where("date", ">=", windowKey).get(),
    db
      .collection(`users/${uid}/runs`)
      .where("completedAt", ">=", windowTs)
      .get(),
    db.collection(`users/${uid}/meals`).where("date", ">=", windowKey).get(),
  ]);
  const activeDateKeys = activeDateKeysFromLogs(
    {
      workouts: workoutsSnap.docs.map((d) => ({ date: d.data().date })),
      // Eligibility fields ride along so activeDates can apply the same
      // isVolumeEligibleRun gate the client applies at its snapshot
      // boundary — a junk run must not read as an active day.
      runs: runsSnap.docs.map((d) => {
        const data = d.data();
        const c = data.completedAt;
        return {
          // Lift3: the run's day is the day it started.
          date: data.date,
          completedAtMs: c && c.toMillis ? c.toMillis() : NaN,
          isInvalid: data.isInvalid,
          savedAnyway: data.savedAnyway,
          distance: data.distance,
          duration: data.duration,
        };
      }),
      meals: mealsSnap.docs.map((d) => ({
        date: d.data().date,
        items: d.data().items,
        // Soft-deleted meals ride along so activeDates can skip them, as
        // the client does at its snapshot boundary.
        deletedAt: d.data().deletedAt,
      })),
    },
    timezone
  );

  // Eligibility (consent already checked → remindersOptedIn: true). The two
  // predicates are disjoint on the `>= 2` streak floor: the regular streak
  // nudge above it, the once-ever first-week return nudge (D-1 day-1→day-2
  // fix) below it.
  const decisionInput = {
    currentStreak: streak.currentStreak || 0,
    lastActiveDate: streak.lastActiveDate,
    anchorStreak: streak.anchorStreak,
    anchorDate: streak.anchorDate,
    remindersOptedIn: true,
    timezone,
    activeDateKeys,
    lastNudgeDateKey,
    firstWeekNudgeDateKey,
  };
  const eligible = shouldSendStreakNudge(decisionInput, now);
  const firstWeek = !eligible && shouldSendFirstWeekNudge(decisionInput, now);
  if (!eligible && !firstWeek) return false;

  const registrations = await leaseClaimedPushRegistrations(uid);
  const tokens = registrations.map((r) => r.token);
  if (tokens.length === 0) return false;

  const message = firstWeek
    ? buildFirstWeekNudgeMessage()
    : buildStreakNudgeMessage();
  let batch;
  try {
    batch = await admin
      .messaging()
      .sendEachForMulticast({ tokens, ...withNativePushAlert(message, uid) });
  } finally {
    // Release send leases before pruning (prune uses releaseTokenIfOwned,
    // which must not contend with an unexpired lease of its own).
    await releaseClaimedPushSendLeases(uid, registrations);
  }

  // Prune dead tokens (Q4 prune-on-send-error) via server-owned release.
  await pruneDeadPushTokens(uid, registrations, batch);

  // ≤1/day idempotency marker (local day); the first-week nudge additionally
  // records its once-EVER marker.
  const sentDateKey = localDateKeyInTz(now, timezone);
  await db.doc(`users/${uid}/settings/pushState`).set(
    {
      lastStreakNudgeDateKey: sentDateKey,
      ...(firstWeek ? { firstWeekNudgeDateKey: sentDateKey } : {}),
    },
    { merge: true }
  );

  return batch.successCount > 0;
}

// Push #961 / badge sender #968 — badge-earned nudge. Earned badges live in
// users/{uid}/streaks/data.badges[] ({ id, earnedAt }). This fires at the next
// non-quiet local hour after a badge is earned (not pinned to one hour, so it
// feels timely), at most once/day, gated on "badge" consent. The 2-day
// recency window + pushedBadgeIds marker prevent back-spam of historical
// badges and re-sends. Generic payload (Q7 — badge names leak streak counts).
async function maybeSendBadgeNudge(uid, now, profile) {
  const timezone =
    (profile || (await db.doc(`users/${uid}`).get()).data() || {}).timezone ||
    null;
  if (!timezone) return false; // skip-on-null-tz (no overnight pings)

  // Any non-quiet local hour (timely), never inside quiet hours.
  if (withinQuietHours(localHourInTz(now, timezone))) return false;

  const [streakSnap, consentSnap, stateSnap] = await Promise.all([
    db.doc(`users/${uid}/streaks/data`).get(),
    db.doc(`users/${uid}/settings/push`).get(),
    db.doc(`users/${uid}/settings/pushState`).get(),
  ]);

  // Consent: badge push must be opted in.
  if (!mayTargetUserConsent(consentSnap.data() || null, "badge")) return false;

  const state = stateSnap.data() || {};
  // ≤1/day idempotency (local day).
  const todayKey = localDateKeyInTz(now, timezone);
  if (state.lastBadgePushDateKey === todayKey) return false;

  const badges = (streakSnap.data() || {}).badges || [];
  const pushedBadgeIds = state.pushedBadgeIds || [];
  const fresh = pushableBadgeIds(badges, pushedBadgeIds, now);
  if (fresh.length === 0) return false;

  const registrations = await leaseClaimedPushRegistrations(uid);
  const tokens = registrations.map((r) => r.token);
  if (tokens.length === 0) return false;

  let batch;
  try {
    batch = await admin.messaging().sendEachForMulticast({
      tokens,
      ...withNativePushAlert(buildBadgeNudgeMessage(), uid),
    });
  } finally {
    await releaseClaimedPushSendLeases(uid, registrations);
  }

  // Prune dead tokens (Q4 prune-on-send-error) via server-owned release.
  await pruneDeadPushTokens(uid, registrations, batch);

  // Mark these badge ids pushed + today's ≤1/day marker. Union with the
  // existing set so an earlier day's pushes aren't forgotten.
  const pushedUnion = Array.from(new Set([...pushedBadgeIds, ...fresh]));
  await db
    .doc(`users/${uid}/settings/pushState`)
    .set(
      { pushedBadgeIds: pushedUnion, lastBadgePushDateKey: todayKey },
      { merge: true }
    );

  return batch.successCount > 0;
}

// Push #961 / weekly recap #967 — Monday ~8am LOCAL recap push. Celebratory
// when the user kept up; fell-behind-aware (deep-links the Programme page where
// the FellBehindSheet surfaces) when they ran <50% of their weekly target last
// week. Fell-behind status is computed FRESH here from the prior week, NOT read
// from the persisted `pendingFellBehindPrompt`: this fires at the user's local
// Monday 8am, which for east-of-UTC users is BEFORE `weeklyFellBehindCheck`'s
// 05:00 UTC pass — so the persisted flag would be stale for them. It shares the
// `_fellBehindRatio` computation with that check (single source of truth), and
// when behind it ensures the flag is written (idempotent merge, same shape) so
// the deep-link target reliably exists when the user taps. Counts under the ≤1
// server-push/day cap with priority recap > streak: a sent recap writes the
// same `lastStreakNudgeDateKey` marker #966 reads, suppressing that evening's
// streak nudge. ≤1 recap/day via `lastRecapDateKey`. Runs inside the existing
// hourly sweep (no second active-user pass).
//
// #576 reconciliation: #576's "Friday weekly check-in" is the Watch/APNs sender
// off the same fell-behind signal; this is the FCM web/phone transport. They
// intentionally differ by transport + cadence and SHARE the `_fellBehindRatio`
// computation rather than each re-deriving "who's behind".
const RECAP_LOCAL_HOUR = 8;
const RECAP_LOCAL_WEEKDAY = 1; // Monday (0=Sun..6=Sat)

async function maybeSendWeeklyRecap(uid, now, profile) {
  // Cheap gate first: the tz (from the sweep's read, or one profile read),
  // then the local Monday-8am check (skips the heavier reads on the other
  // 167 hours of the week).
  const timezone =
    (profile || (await db.doc(`users/${uid}`).get()).data() || {}).timezone ||
    null;
  if (!timezone) return false; // skip-on-null-tz (no overnight pings)
  if (localWeekdayInTz(now, timezone) !== RECAP_LOCAL_WEEKDAY) return false;
  if (!isLocalSendHour(now, timezone, RECAP_LOCAL_HOUR)) return false;

  const todayKey = localDateKeyInTz(now, timezone);

  const [consentSnap, stateSnap] = await Promise.all([
    db.doc(`users/${uid}/settings/push`).get(),
    db.doc(`users/${uid}/settings/pushState`).get(),
  ]);

  // Consent: recap push must be opted in (absent per-type flag → on).
  if (!mayTargetUserConsent(consentSnap.data() || null, "recap")) return false;

  const state = stateSnap.data() || {};
  if (state.lastRecapDateKey === todayKey) return false; // ≤1 recap/day

  // Fell-behind status computed fresh from the prior week (shared helper, so it
  // can't drift from weeklyFellBehindCheck). null → no prescriptive target
  // (freeform / recovery / target<1) → celebratory recap.
  const ctx = await readUserProgramContext(uid);
  const range = _priorWeekUtcRange(now.getTime());
  let priorWeekRuns = [];
  if (ctx) {
    try {
      const runsSnap = await ctx.userRef
        .collection("runs")
        .where("date", ">=", range.weekStart)
        .where("date", "<=", range.weekEnd)
        .get();
      priorWeekRuns = runsSnap.docs.map((d) => d.data() || {});
    } catch (e) {
      console.warn(
        `maybeSendWeeklyRecap: runs query failed for ${uid}: ${e.message}`
      );
    }
  }
  const status = ctx
    ? _fellBehindRatio(
        ctx.profile,
        ctx.programState,
        priorWeekRuns,
        range.weekKey
      )
    : null;
  const behind = !!(status && status.fellBehind);

  const registrations = await leaseClaimedPushRegistrations(uid);
  const tokens = registrations.map((r) => r.token);
  if (tokens.length === 0) return false;

  const message = behind
    ? buildFellBehindRecapMessage()
    : buildWeeklyRecapMessage();
  let batch;
  try {
    batch = await admin
      .messaging()
      .sendEachForMulticast({ tokens, ...withNativePushAlert(message, uid) });
  } finally {
    await releaseClaimedPushSendLeases(uid, registrations);
  }

  // Prune dead tokens (Q4 prune-on-send-error) via server-owned release.
  await pruneDeadPushTokens(uid, registrations, batch);

  // Behind → ensure the deep-link target exists. Write the fell-behind flag
  // (same shape weeklyFellBehindCheck writes) if it isn't already present for
  // this week, so a user who taps before the 05:00 UTC sweep still lands on the
  // FellBehindSheet. Idempotent + deletion-lock guarded.
  const existingFlag =
    (ctx && ctx.programState && ctx.programState.pendingFellBehindPrompt) ||
    null;
  if (
    behind &&
    ctx &&
    !(existingFlag && existingFlag.weekKey === range.weekKey) &&
    (await accountDeletionLocks.shouldSystemWriteProceed(
      db,
      uid,
      "weeklyRecap"
    ))
  ) {
    await ctx.programRef.set(
      {
        pendingFellBehindPrompt: {
          weekKey: range.weekKey,
          completedRatio: status.completedRatio,
          realRunCount: status.realRunCount,
          weeklyTarget: status.weeklyTarget,
        },
      },
      { merge: true }
    );
  }

  // ≤1/day markers: record the recap AND suppress the evening streak nudge
  // (recap > streak) by writing the same marker #966 reads.
  await db
    .doc(`users/${uid}/settings/pushState`)
    .set(
      { lastRecapDateKey: todayKey, lastStreakNudgeDateKey: todayKey },
      { merge: true }
    );

  return batch.successCount > 0;
}

exports.hourlyStreakNudge = functions
  .runWith(SCHEDULED_CAP)
  .pubsub.schedule("0 * * * *")
  .timeZone("Etc/UTC")
  .onRun(() =>
    jobRuns.recordJobRun(db, "hourlyStreakNudge", async () => {
      let summary = null;
      try {
        console.log("hourlyStreakNudge: starting");
        const now = new Date();
        let sent = 0;
        let badgeSent = 0;
        let recapSent = 0;
        summary = await sweepActiveUsers({
          name: "hourlyStreakNudge",
          cutoffDays: 14,
          perUser: async (uid, profile) => {
            // Each nudge goes out at a local hour, never in quiet hours
            // and never without a timezone. The sweep's page holds the
            // user's document, so the hours when nothing can go out cost
            // no reads at all.
            const timezone = profile.timezone || null;
            if (!timezone || withinQuietHours(localHourInTz(now, timezone))) {
              return;
            }
            if (
              !(await accountDeletionLocks.shouldSystemWriteProceed(
                db,
                uid,
                "hourlyStreakNudge"
              ))
            ) {
              return;
            }
            // Three independent send-decisions per user in one sweep (avoids a
            // second full active-user pass — cost). A throw in one must not
            // skip the others. Recap is evaluated first so its per-day marker
            // (recap > streak) suppresses the evening streak nudge.
            try {
              if (await maybeSendWeeklyRecap(uid, now, profile)) recapSent++;
            } catch (e) {
              console.error("hourlyStreakNudge: recap send failed", {
                uid,
                message: e.message,
              });
            }
            try {
              if (await maybeSendStreakNudge(uid, now, profile)) sent++;
            } catch (e) {
              console.error("hourlyStreakNudge: streak send failed", {
                uid,
                message: e.message,
              });
            }
            try {
              if (await maybeSendBadgeNudge(uid, now, profile)) badgeSent++;
            } catch (e) {
              console.error("hourlyStreakNudge: badge send failed", {
                uid,
                message: e.message,
              });
            }
          },
        });
        console.log(
          `hourlyStreakNudge: done — sent=${sent} badgeSent=${badgeSent} recapSent=${recapSent}`
        );
      } catch (err) {
        console.error("hourlyStreakNudge: fatal error:", {
          message: err.message,
          stack: err.stack,
        });
        // Recorded as failed (lib/jobRuns.js), not as a success.
        throw err;
      }
      return summary;
    })
  );

// Exported for per-user decision+send testing (mirrors the reconciliation
// sweep's _runDailyRaceReconciliationForUser convention).
exports._maybeSendStreakNudge = maybeSendStreakNudge;
exports._maybeSendBadgeNudge = maybeSendBadgeNudge;
// Exported for the cold-start badge test, which must reach this function
// WITHOUT going through a trigger. Driven through onRunCreated instead, the
// deletion-guard assertion is satisfied by the TRIGGER's entry guard and
// says nothing about this one — a mutation deleting the guard below left
// that test green.
exports._awardMilestoneBadges = awardMilestoneBadges;
exports._maybeSendWeeklyRecap = maybeSendWeeklyRecap;

function challengeNotificationOptions(uid, now, profile) {
  return {
    db,
    uid,
    now,
    profile,
    serverTimestamp: admin.firestore.FieldValue.serverTimestamp(),
    leaseRegistrations: leaseClaimedPushRegistrations,
    releaseRegistrations: releaseClaimedPushSendLeases,
    send: (message) => admin.messaging().sendEachForMulticast(message),
    prune: pruneDeadPushTokens,
  };
}

async function maybeSendChallengeAnnouncement(uid, now, profile) {
  return challengeAnnouncements.maybeSendAnnouncement(
    challengeNotificationOptions(uid, now, profile)
  );
}

async function maybeSendChallengeReminder(uid, now, profile) {
  return challengeAnnouncements.maybeSendReminder(
    challengeNotificationOptions(uid, now, profile)
  );
}

// Announce only the current local edition at ~09:00 on days1–3, and remind
// opted-in members once in the final three days if a joined goal has a next tier.
// Each campaign has an independent account/month claim. This is
// separate from rollover (which creates tomorrow's definitions in advance).
// Failed work is eligible for a later scheduled catchup sweep. Atomic
// per-month claims prevent duplicate banners if a sweep is repeated.
exports.hourlyChallengeAnnouncements = functions
  .runWith(SCHEDULED_CAP)
  .pubsub.schedule("0 * * * *")
  .timeZone("Etc/UTC")
  .onRun(() =>
    jobRuns.recordJobRun(db, "hourlyChallengeAnnouncements", async () => {
      const now = new Date();
      await challengeAnnouncements.sweepAnnouncementUsers({
        db,
        now,
        documentId: admin.firestore.FieldPath.documentId(),
        includeReminders: true,
        perUser: async (uid, profile) => {
          // The all-users pass is needed for opted-in lapsed accounts. Avoid
          // deletion-ledger reads for the other local-hour buckets.
          if (
            !isLocalSendHour(
              now,
              profile?.timezone,
              challengeAnnouncements.LOCAL_HOUR
            )
          )
            return;
          if (
            await accountDeletionLocks.shouldSystemWriteProceed(
              db,
              uid,
              "hourlyChallengeAnnouncements"
            )
          ) {
            if (challengeAnnouncements.isSweepWindow(now))
              await maybeSendChallengeAnnouncement(uid, now, profile);
            if (challengeAnnouncements.isReminderSweepWindow(now))
              await maybeSendChallengeReminder(uid, now, profile);
          }
        },
      });
      return null;
    })
  );

exports._maybeSendChallengeAnnouncement = maybeSendChallengeAnnouncement;

// Push #961 / #965 — on-demand test push (the device tracer). Sends a generic
// FCM message to the caller's own registered tokens so a user can confirm
// end-to-end delivery from Settings. Prunes dead tokens like the senders do.
exports.sendTestPush = functions
  .runWith(DEFAULT_HTTP_CAP)
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "Auth required.");
    }
    const uid = context.auth.uid;
    // Outside the try below, which converts every throw into an
    // `ok: false` result: a deleting account and a rate limit are refusals
    // the client must see as errors, not as delivery reports. The lock
    // goes first because the limiter writes, and so does the send lease.
    await accountDeletionLocks.assertCallableActorNotDeleting(db, uid);
    if (await isRateLimited(uid, "sendTestPush", 5, 600_000)) {
      throw new functions.https.HttpsError(
        "resource-exhausted",
        "Too many test pushes. Wait a few minutes and try again."
      );
    }
    try {
      const registrations = await leaseClaimedPushRegistrations(uid);
      const tokens = registrations.map((r) => r.token);
      if (tokens.length === 0) {
        return { ok: false, reason: "no-registered-device", sent: 0 };
      }
      let batch;
      try {
        // Data-only (no top-level `notification`) so the SW's
        // onBackgroundMessage reliably fires on iOS PWAs and renders it.
        // Title/body travel in `data`.
        batch = await admin.messaging().sendEachForMulticast({
          tokens,
          ...withNativePushAlert(
            {
              data: {
                type: "test",
                route: "/",
                title: "Tropos",
                body: "Push notifications are working on this device.",
              },
            },
            uid
          ),
        });
      } catch (err) {
        console.error("sendTestPush: FCM send threw", {
          uid,
          code: err.code,
          message: err.message,
        });
        return {
          ok: false,
          reason: "send-threw",
          detail: err.code || err.message || "unknown",
          sent: 0,
        };
      } finally {
        // Release send leases before pruning (prune uses releaseTokenIfOwned).
        await releaseClaimedPushSendLeases(uid, registrations);
      }
      const dead = await pruneDeadPushTokens(uid, registrations, batch);
      if (batch.successCount === 0) {
        // Every token rejected — surface the first failure's FCM code so the
        // client (and we) can see WHY nothing arrived (e.g.
        // messaging/third-party-auth-error = VAPID/key mismatch on web push).
        const firstFail = (batch.responses || []).find((r) => r && !r.success);
        const code =
          (firstFail && firstFail.error && firstFail.error.code) || "unknown";
        console.error("sendTestPush: 0 delivered", {
          uid,
          code,
          pruned: dead.length,
        });
        return {
          ok: false,
          reason: "send-failed",
          detail: code,
          sent: 0,
          pruned: dead.length,
        };
      }
      return {
        ok: true,
        sent: batch.successCount,
        pruned: dead.length,
      };
    } catch (err) {
      // Any unguarded throw (devices read, admin.messaging init, etc.) — surface
      // the real message instead of an opaque functions/internal to the client.
      console.error("sendTestPush: handler threw", {
        uid,
        code: err.code,
        message: err.message,
        stack: err.stack,
      });
      return {
        ok: false,
        reason: "handler-threw",
        detail: err.code || err.message || "unknown",
        sent: 0,
      };
    }
  });

// ══════════════════════════════════════════════
// PR-L L1 + L3 — daily race-reconciliation sweep
// ══════════════════════════════════════════════
//
// Server-authoritative replacement for two `useEffect`-driven writes
// that today live in `useProgram.ts`:
//
//   L1 (race-no-show): when a user is in race_prep mode, the race
//   date passed >3 days ago, and no real race-templated saved run
//   matched the race-day slot, transition `runDay.status` from
//   "planned" to "race_no_show". Mirrors the client effect at
//   `useProgram.ts:364-403` so non-React clients (Apple Watch,
//   future native) reach the same state without per-client logic.
//
//   L3 (recovery-exit): when `runPlan.phase === "recovery"` and
//   today is past `recoveryEndDate + 7d` (PR-C's grace window),
//   clear `runPlan.phase` + `recoveryEndDate`. Mirrors the client
//   effect at `useProgram.ts:421-443`.
//
// Both passes share the same user-iteration scaffolding from
// `weeklyPerformanceRollup` — bounded `lastActiveAt >= now - 30d`
// query so a single bad write can't run away across the full users
// collection. Per-user writes are idempotent (transition gate +
// phase guard) so re-runs are safe.
//
// The PR-L L5 chunk (later in the arc) deletes the client effects
// once these triggers are production-verified. Until then the
// client effects + server triggers both run; their idempotency
// makes overlap safe — last-writer-wins on the same shape, and
// they write the same shape.

// Race-day completion rule — extracted to ./lib/raceDayCompletion.js so the
// rule that ACTUALLY RUNS is importable and pinned by golden fixtures. It is
// a deliberate NON-mirror of the client's claim-map rule (different question,
// different data shape); see that module's header.
const raceDayCompletion = require("./lib/raceDayCompletion");
const RACE_STRICT_DISTANCE_RATIO_FNS =
  raceDayCompletion.RACE_STRICT_DISTANCE_RATIO;

// Date helpers — `utcDateString` (YYYY-MM-DD in UTC) and
// `parseUtcDate` (YYYY-MM-DD → UTC 00:00 Date) live in
// `./lib/dateUtils.js`. Aliased locally to keep the existing
// `_utcDateString` / `_parseUtcDate` test-surface exports stable.
const _utcDateString = utcDateString;
const _parseUtcDate = parseUtcDate;

/** Server-side equivalent of Q1 P4's strict race-day match check.
 *  Iterates a bounded list of saved runs (date-filtered before the
 *  call) and returns true if any one of them matches the race
 *  template at ≥95% planned distance.
 *
 *  Saved-run docs carry the planMetadata flattened: `actualTemplateId`
 *  is what RunSummary writes — there is no plain `templateId` field.
 *  Also defends against `isInvalid` / `savedAnyway` runs counting
 *  as a race match (a "Save anyway" on a borked GPS trace must not
 *  clear no-show). */
const _hasStrictRaceMatch = raceDayCompletion.hasStrictRaceMatch;

// The decisions themselves (L1, L3 and L4 for the sweep below, L2 for
// onRunCreated further down) live in ./lib/raceReconciliation.js, pure, so
// the rules that run can be required without firebase-admin. The `_`
// aliases keep every call site and test export in this file unchanged.
const raceReconciliation = require("./lib/raceReconciliation");
const _needsRaceNoShowEvaluation = raceReconciliation.needsRaceNoShowEvaluation;
const _decideReconciliationActions =
  raceReconciliation.decideReconciliationActions;
const _recoveryEndDateForRace = raceReconciliation.recoveryEndDateForRace;
const _decideRecoveryEntry = raceReconciliation.decideRecoveryEntry;

/** Per-user worker. Thin I/O wrapper around `_decideReconciliationActions`.
 *  Reads profile + programState, fetches the race-day saved-runs
 *  bucket when the decision function says it'll need it, then
 *  applies the update (with the R1A tombstone guard immediately
 *  before the write). Returns a log payload for the outer loop. */
async function _runDailyRaceReconciliationForUser(uid) {
  const ctx = await readUserProgramContext(uid);
  if (!ctx) {
    return {
      noShowWritten: false,
      recoveryCleared: false,
      noShowCleared: false,
      orphanedGoalCleared: false,
    };
  }
  const { userRef, programRef, profile, programState, programUpdateTime } = ctx;
  const nowMs = Date.now();

  // Only do the bounded saved-runs query when the L1 pass would
  // need it — saves an I/O round trip for the common case where
  // the user isn't in race_prep / their race hasn't passed grace /
  // their slot is already terminal.
  let savedRunsForRaceDate = [];
  if (_needsRaceNoShowEvaluation(profile, programState, nowMs)) {
    const raceDate = programState.runPlan.raceGoal.targetDate;
    try {
      const runsSnap = await userRef
        .collection("runs")
        .where("date", "==", raceDate)
        .get();
      savedRunsForRaceDate = runsSnap.docs.map((d) => d.data() || {});
    } catch (err) {
      console.warn(
        `dailyRaceReconciliationSweep: runs query failed for ${uid}: ${err.message}`
      );
    }
  }

  const {
    payload,
    profilePayload,
    noShowWritten,
    recoveryCleared,
    noShowCleared,
    orphanedGoalCleared,
  } = _decideReconciliationActions(
    profile,
    programState,
    savedRunsForRaceDate,
    nowMs
  );

  if (!payload && !profilePayload) {
    return {
      noShowWritten,
      recoveryCleared,
      noShowCleared,
      orphanedGoalCleared,
    };
  }

  // R1A: tombstone guard immediately before the write — per spec
  // systemWriterCheckTiming, the active-users query happened
  // seconds-to-minutes ago and the user may have started deletion
  // since.
  if (
    !(await accountDeletionLocks.shouldSystemWriteProceed(
      db,
      uid,
      "dailyRaceReconciliationSweep"
    ))
  ) {
    return {
      noShowWritten: false,
      recoveryCleared: false,
      noShowCleared: false,
      orphanedGoalCleared: false,
    };
  }
  // Run9 3b — programState (runDays / runPlan) and the profile (materialized
  // runMode + raceGoal) are separate docs. Write both when present.
  //
  // CF3: the programState payload REPLACES the whole runDays array, so a plain
  // merge could clobber a concurrent edit made between our read and this write.
  // maxInstances:1 makes the sweep itself non-concurrent, but a client edit or
  // an onRunCreated recovery-entry could touch programState in between. Guard it
  // with a compare-and-swap: re-read inside a transaction and skip the write if
  // the doc changed since our decision snapshot — the decision is idempotent
  // against post-write state, so the next daily sweep self-heals. `wrote`
  // tracks whether it landed so the observability flags don't over-report a
  // skipped write. The profile payload has no array-overwrite hazard → plain
  // merge.
  let programWritten = !payload;
  if (payload) {
    await db.runTransaction(async (tx) => {
      const fresh = await tx.get(programRef);
      const changed =
        programUpdateTime &&
        fresh.updateTime &&
        !fresh.updateTime.isEqual(programUpdateTime);
      if (changed) return; // concurrent edit — skip; self-heals next sweep
      tx.set(programRef, payload, { merge: true });
      programWritten = true;
    });
  }
  if (profilePayload) {
    await userRef.set(profilePayload, { merge: true });
  }
  // If the CAS skipped the programState write, its state transitions didn't
  // land — report not-written so the sweep log stays honest (self-heals next
  // sweep). The concurrent edit that won is a valid newer state.
  if (!programWritten) {
    return {
      noShowWritten: false,
      recoveryCleared: false,
      noShowCleared: false,
      orphanedGoalCleared: false,
    };
  }
  // Include noShowCleared so the sweep's observability counter increments when
  // an L4 clear actually writes (the early no-write return above already did).
  // An orphaned goal writes no programState (`programWritten` starts true).
  return { noShowWritten, recoveryCleared, noShowCleared, orphanedGoalCleared };
}

// ── Scheduled: daily race-reconciliation sweep (04:00 UTC) ──

exports.dailyRaceReconciliationSweep = functions
  .runWith(SCHEDULED_CAP)
  .pubsub.schedule("0 4 * * *")
  .timeZone("Etc/UTC")
  .onRun(() =>
    jobRuns.recordJobRun(db, "dailyRaceReconciliationSweep", async () => {
      let summary = null;
      try {
        console.log("dailyRaceReconciliationSweep: starting");
        let totalNoShow = 0;
        let totalRecoveryCleared = 0;
        let totalNoShowCleared = 0;
        let totalOrphanedGoalCleared = 0;
        summary = await sweepActiveUsers({
          name: "dailyRaceReconciliationSweep",
          cutoffDays: 30,
          perUser: async (uid) => {
            const {
              noShowWritten,
              recoveryCleared,
              noShowCleared,
              orphanedGoalCleared,
            } = await _runDailyRaceReconciliationForUser(uid);
            if (noShowWritten) totalNoShow += 1;
            if (recoveryCleared) totalRecoveryCleared += 1;
            if (noShowCleared) totalNoShowCleared += 1;
            if (orphanedGoalCleared) totalOrphanedGoalCleared += 1;
          },
        });
        console.log(
          `dailyRaceReconciliationSweep: done — ` +
            `noShow=${totalNoShow}, recoveryCleared=${totalRecoveryCleared}, ` +
            `noShowCleared=${totalNoShowCleared}, ` +
            `orphanedGoalCleared=${totalOrphanedGoalCleared}`
        );
      } catch (err) {
        console.error("dailyRaceReconciliationSweep: fatal error:", {
          message: err.message,
          stack: err.stack,
        });
        // Recorded as failed (lib/jobRuns.js), not as a success.
        throw err;
      }
      return summary;
    })
  );

// Test surface — the per-user worker is the meaningful unit. Export
// it (and the helpers) under leading-underscore aliases so unit
// tests can drive specific paths without spinning up the pubsub
// harness end-to-end.
exports._runDailyRaceReconciliationForUser = _runDailyRaceReconciliationForUser;
exports._hasStrictRaceMatch = _hasStrictRaceMatch;
exports._utcDateString = _utcDateString;
exports._decideReconciliationActions = _decideReconciliationActions;
exports._needsRaceNoShowEvaluation = _needsRaceNoShowEvaluation;
exports._recoveryEndDateForRace = _recoveryEndDateForRace;

// ══════════════════════════════════════════════
// PR-L L2 — recovery-entry on onRunCreated
// ══════════════════════════════════════════════
//
// Server-authoritative recovery-entry write. When a saved race-day
// run lands AND it satisfies Q1 P4 (strict ≥95% on a race-templated
// run) AND that race-day runDay's id hasn't already entered
// recovery (Q2 P28 per-race tracking via runPlan.completedRaces[]),
// write the recovery phase + end date.
//
// Replaces a piece of the previously-deleted `completeRunDay`
// writer's responsibility. Lives on `onRunCreated` rather than on
// the client because Apple Watch (and future native clients) will
// also write saved-runs but can't run the React state machine.
//
// Idempotency:
//   - Per-race via `completedRaces[]` (Q2 P28 — supersedes P14).
//     Same runDay claimed twice (e.g. user logged a race, deleted
//     it, re-logged it) writes recovery once.
//   - Multi-race plans (Round 3 stress #52) can enter recovery
//     per-race; the array grows with each completion.
//   - Self-correcting: if a previous race already entered recovery
//     and a newer race lands, the recoveryEndDate updates to the
//     new race's window (later race's recovery overrides).

/** Side-effect wrapper. Reads profile + programState for the user,
 *  runs the pure decision, applies the write when needed. Callable
 *  from `onRunCreated` after the existing flow finishes. Errors
 *  are caught + logged — recovery entry is best-effort, not worth
 *  taking down the rest of the trigger over.
 *
 *  No R1A guard here: the calling trigger (`onRunCreated`) already
 *  checks `shouldSystemWriteProceed` at the top. If the user is
 *  tombstoned, the trigger early-returns before reaching this
 *  function. */
async function _maybeWriteRecoveryEntryForRun(uid, savedRun) {
  try {
    const userRef = db.collection("users").doc(uid);
    const programRef = userRef.collection("programState").doc("current");

    // Read-check-write inside a transaction. onCreate triggers are
    // at-least-once and can run concurrently, so the previous plain
    // `.get()` → whole-runPlan spread → `set(merge)` had two races:
    //   (a) a redelivered/concurrent trigger read the same pre-write
    //       snapshot, so the Gate-6 `completedRaces.includes(id)`
    //       idempotency check passed twice and double-appended the
    //       same runDay id;
    //   (b) the whole-runPlan merge payload clobbered concurrent
    //       runPlan edits (dailyRaceReconciliationSweep L3 / client)
    //       that landed between the read and the write.
    // The transaction re-reads programState (and the profile) on the
    // fresh snapshot, re-runs `_decideRecoveryEntry` against it so the
    // includes() check + the completedRaces append both see committed
    // state, and writes ONLY the three fields that change. Firestore's
    // recursive merge leaves every other runPlan field (and any
    // concurrent edit to them) untouched.
    let logFields = null;
    await db.runTransaction(async (tx) => {
      const [userSnap, programSnap] = await Promise.all([
        tx.get(userRef),
        tx.get(programRef),
      ]);
      if (!userSnap.exists || !programSnap.exists) {
        return;
      }
      const profile = userSnap.data() || {};
      const programState = programSnap.data() || {};

      const decision = _decideRecoveryEntry(profile, programState, savedRun);
      if (!decision.write) {
        return;
      }

      // Minimal field-level merge — never the whole-runPlan spread.
      // The decision derived these from the fresh in-txn snapshot:
      // `completedRaces` is the fresh array + this race's id (no
      // double-append because the includes() check ran on the same
      // committed read), `phase`/`recoveryEndDate` are the new values.
      const { phase, recoveryEndDate, completedRaces } =
        decision.payload.runPlan;
      tx.set(
        programRef,
        { runPlan: { phase, recoveryEndDate, completedRaces } },
        { merge: true }
      );

      logFields = {
        raceDayRunDayId: decision.raceDayRunDayId,
        recoveryEndDate: decision.recoveryEndDate,
      };
    });

    if (logFields) {
      console.log(
        `onRunCreated: recovery-entry written for ${uid} ` +
          `(runDay=${logFields.raceDayRunDayId}, endDate=${logFields.recoveryEndDate})`
      );
    }
  } catch (err) {
    console.error(
      `onRunCreated: recovery-entry failed for ${uid}: ${err.message}`
    );
  }
}

exports._decideRecoveryEntry = _decideRecoveryEntry;
exports._maybeWriteRecoveryEntryForRun = _maybeWriteRecoveryEntryForRun;

// ══════════════════════════════════════════════
// CHALLENGE AUTO-PROGRESS HELPER
// ══════════════════════════════════════════════

/**
 * Apply an additive (SUM) challenge increment for `uid`.
 *
 * `sourceId` is the id of the activity driving the increment (the
 * workout/run doc id). It makes the apply IDEMPOTENT: onCreate triggers are
 * at-least-once, so a redelivery re-runs this whole body. Without a guard a
 * retry would increment currentValue a second time and permanently inflate
 * workout_count / total_volume / total_km. We record a per-participant marker
 * doc (`participants/{uid}/applied/{sourceId}`) inside the same transaction as
 * the increment; a re-apply for the same source is a no-op.
 *
 * The marker is a subcollection doc (not a map field on the participant) so it
 * stays bounded even for a long-running / perpetual challenge — no 1MB
 * doc-growth footgun.
 */
/**
 * Award milestone badges server-side. The catalogue's milestone badges
 * (running distances, …) can't be computed from the client's WINDOWED streak
 * snapshots, so the activity-create triggers award them here off the full doc.
 *
 * Writes the same two surfaces the client `awardBadge` does — `streaks/data`
 * (full `badges[]`, owner-only) + the `users/{uid}/public/profile.badgeSummary`
 * mirror — inside ONE transaction so concurrent activity triggers can't lose an
 * award. Idempotent: an already-earned badge (`earnedAt` set) is left alone, so
 * a trigger re-delivery (at-least-once) never re-awards. earnedAt is an ISO
 * string to match the client (`new Date().toISOString()`); the client hydrates
 * the rest of each badge from BADGE_DEFINITIONS by id on load.
 *
 * A MISSING streak doc is created rather than skipped. This used to return
 * early, under the belief — stated in this comment — that "the client
 * materialises + reconciles it on next load". The client does no such thing
 * for these badges: `badgeEarning.ts:badgesToAward` never evaluates
 * `first_5k`, `10k_club`, `plate_club` or any other single-session
 * milestone, because they are server-owned precisely BECAUSE the client's
 * snapshots are windowed (the reason stated at the top of this comment).
 * There was nothing to reconcile, and every one of these three call sites
 * is inside an `onCreate` trigger, so nothing ever retried.
 *
 * That made it a cold-start bug with no recovery, on the app's welcome
 * moment. Nothing on the server creates `streaks/data` — this function is
 * its only server-side writer and it bailed before writing — and the
 * client only creates it when the streak CHANGES (`useStreaks` explicitly
 * skips the write when the computed streak already equals the stored one,
 * and for a brand-new user both are 0). So on a user's first ever logged
 * session the doc does not exist yet, and the client's creating write
 * races the trigger. First run ≥5 km ⇒ `first_5k`; first workout with a
 * 60 kg compound set ⇒ `plate_club`. Routine, and silently lost.
 *
 * A partial doc is safe to create: `useStreaks` spreads DEFAULT_STREAKS
 * over whatever it reads and coerces non-finite numerics to 0, and every
 * write here is `merge: true`, so the client's later write fills the rest
 * in rather than colliding.
 *
 * The deletion guard below is load-bearing BECAUSE of that change. While
 * this function could only ever update an existing document it had no way
 * to resurrect one; now that it can create, it can re-create a doc the
 * account-deletion executor has already swept. Same failure ADR-0012's
 * first amendment describes for the lifetime counters.
 */
async function awardMilestoneBadges(uid, ids) {
  if (!Array.isArray(ids) || ids.length === 0) return;
  if (
    !(await accountDeletionLocks.shouldSystemWriteProceed(
      db,
      uid,
      "awardMilestoneBadges"
    ))
  ) {
    return;
  }
  const ref = db.doc(`users/${uid}/streaks/data`);
  const publicRef = db.doc(`users/${uid}/public/profile`);
  // A failure is the caller's: the session triggers retry it (idempotent
  // through `earnedAt`), where a catch here lost the badge for good.
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const stored = snap.exists ? snap.data().badges : null;
    const badges = Array.isArray(stored) ? stored.slice() : [];
    const nowIso = new Date().toISOString();
    let changed = false;

    for (const id of ids) {
      const idx = badges.findIndex((b) => b && b.id === id);
      if (idx === -1) {
        // Def absent from an older stored array — append the minimal pair;
        // the client fills the rest from BADGE_DEFINITIONS by id.
        badges.push({ id, earnedAt: nowIso });
        changed = true;
      } else if (!badges[idx].earnedAt) {
        badges[idx] = { ...badges[idx], earnedAt: nowIso };
        changed = true;
      }
      // else: already earned → idempotent no-op.
    }

    if (!changed) return;

    // Recompute the public badge-summary mirror (same shape as the client).
    const earnedMap = {};
    for (const b of badges) {
      if (!b || !b.earnedAt) continue;
      earnedMap[b.id] =
        typeof b.earnedAt === "string"
          ? b.earnedAt
          : b.earnedAt && typeof b.earnedAt.toDate === "function"
            ? b.earnedAt.toDate().toISOString()
            : nowIso;
    }

    tx.set(ref, { badges }, { merge: true });
    tx.set(
      publicRef,
      {
        badgeSummary: {
          earnedMap,
          count: Object.keys(earnedMap).length,
        },
      },
      { merge: true }
    );
  });
}

/**
 * Maintain a per-user LIFETIME aggregate (total run distance / total lift
 * volume) and award the lifetime-milestone badges it unlocks (century_km,
 * tonnage_100). The activity-create triggers can't compute a lifetime total
 * from one doc, and the client's streak snapshots are WINDOWED (≤400 docs), so
 * the cumulative total is owned here.
 *
 * Idempotency (triggers are at-least-once + concurrent — see the project rule):
 *   • The counter read-modify-write runs in a runTransaction.
 *   • A per-source marker doc (`lifetime/applied_<kind>_<sourceId>`) is written
 *     in the SAME transaction; a re-delivery of the same activity finds the
 *     marker and skips the increment (no double-count). Markers are tiny
 *     separate docs in a dedicated subcollection — O(activities) growth, not
 *     the 1MB single-doc footgun the codebase warns about, and the same
 *     per-source shape syncChallengeProgress uses.
 *
 * The badge award itself is delegated to awardMilestoneBadges (its own
 * transaction, idempotent via `earnedAt`), so re-passing an already-crossed
 * total is harmless. `kind` is "run" (metres) or "lift" (kg).
 */
async function accrueLifetimeStat(
  uid,
  kind,
  incrementBy,
  sourceId,
  sourceRef = null
) {
  const inc = Number(incrementBy) || 0;
  if (inc <= 0 || (kind !== "run" && kind !== "lift")) return;

  const field = kind === "run" ? "runMeters" : "liftVolumeKg";
  const totalsRef = db.doc(`users/${uid}/lifetime/totals`);
  const markerRef = db.doc(`users/${uid}/lifetime/applied_${kind}_${sourceId}`);

  // A failure is the caller's to retry, as in awardMilestoneBadges; the
  // marker makes the retry credit once.
  const newTotal = await db.runTransaction(async (tx) => {
    const [totalsSnap, markerSnap, sourceSnap] = await Promise.all([
      tx.get(totalsRef),
      tx.get(markerRef),
      sourceRef ? tx.get(sourceRef) : null,
    ]);
    const current = Number(
      (totalsSnap.exists && totalsSnap.data()[field]) || 0
    );
    if (markerSnap.exists) {
      // Already applied this source — return the unchanged total so the
      // award step below is still a (no-op) idempotent re-check.
      return current;
    }
    // The session is gone: its delete can run before its create (trigger
    // delivery is unordered), find no marker and reverse nothing, so a
    // credit now would stand forever. Read here, inside the transaction,
    // a delete either lands first (nothing credits) or after (its
    // reversal finds this marker).
    if (sourceSnap && !sourceSnap.exists) return current;
    const updated = current + inc;
    tx.set(totalsRef, { [field]: updated }, { merge: true });
    tx.set(markerRef, {
      kind,
      sourceId,
      // The amount this marker applied. Read back by the delete-side
      // reversal (lib/activityReversal), which would otherwise have to
      // re-derive it from the deleted document — and a document with a
      // deterministic id can be OVERWRITTEN after the accrual (a resumed
      // programme Finish reuses `programme-{completionId}`), so the
      // re-derivation and the applied figure are not always the same
      // number. The challenge marker has recorded its `incrementBy` all
      // along; this is the lifetime marker catching up.
      appliedValue: inc,
      appliedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return updated;
  });

  await awardMilestoneBadges(uid, lifetimeMilestoneBadges(kind, newTotal));
}

/**
 * Apply one SUM-metric increment to ONE challenge. Extracted from the
 * syncChallengeProgress loop so the join-time backfill can replay a
 * historical source against exactly the challenge being joined, through
 * the SAME window check, membership guard, transaction and idempotency
 * marker as the live path — one apply path, two callers.
 */
async function applyChallengeProgressIncrement(
  challengeDocId,
  challenge,
  uid,
  metric,
  incrementBy,
  sourceId,
  activityDateKey,
  sourceRef = null
) {
  if (challenge.metric !== metric) return;
  // Credit this challenge only if the SOURCE ACTIVITY DAY is inside its
  // half-open [startDate, endDate) window — not delivery/execution time.
  if (!challengeContainsActivityDate(challenge, activityDateKey)) return;

  // Check if user is a participant
  const participantRef = db
    .collection("challenges")
    .doc(challengeDocId)
    .collection("participants")
    .doc(uid);
  // Soc10: only an explicit Join creates membership, including weekly
  // and global monthly challenges. Activity must never enrol or rejoin
  // someone who left. The join trigger backfills earlier in-window activity.
  const participantSnap = await participantRef.get();
  if (!participantSnap.exists) return;

  // Read-modify-write inside a transaction: (a) two near-simultaneous
  // triggers otherwise read the same currentValue and the second write
  // clobbers the first (lost update); (b) a redelivered onCreate would
  // double-count. The marker read guards (b); the transaction guards (a).
  const tiers = challenge.tiers || {};
  await db.runTransaction(async (tx) => {
    // All reads before any writes (Firestore transaction rule). The two
    // reads are SEQUENTIAL rather than a Promise.all because the marker's
    // path depends on the participant's `joinedAt` — see below. Both
    // still precede every write, which is what the rule requires.
    const snap = await tx.get(participantRef);
    // Leaving between the fast-path read and this transaction must also
    // prevent crediting. Firestore retries if membership changes mid-write.
    if (!snap.exists) return;

    // Marker keyed by (membership, driving activity id). The membership
    // half is what makes leaving and re-joining a clean slate: a
    // participant delete does not cascade to this subcollection, so
    // without it the join-time backfill replays every source straight
    // into a surviving marker and the re-joined user stays at zero
    // forever. See functions/lib/challengeMarkers.js.
    const markerRef = participantRef
      .collection("applied")
      .doc(
        challengeMarkers.markerDocId(
          snap.data().joinedAt,
          sourceId,
          `${metric}_legacy_nosrc`
        )
      );
    const marker = await tx.get(markerRef);
    if (marker.exists) return; // already applied this activity — idempotent no-op
    // A deleted session credits nothing; see accrueLifetimeStat.
    if (sourceRef && !(await tx.get(sourceRef)).exists) return;
    const current = snap.data().currentValue || 0;
    const newValue = current + incrementBy;
    const tierAchieved = challengeTiers.resolveTier(newValue, tiers, metric);
    tx.set(
      participantRef,
      {
        currentValue: newValue,
        tierAchieved,
      },
      { merge: true }
    );
    tx.set(markerRef, {
      metric,
      incrementBy,
      activityDateKey,
      appliedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });
}

async function syncChallengeProgress(
  uid,
  metric,
  incrementBy,
  sourceId,
  activityDateKey,
  sourceRef = null
) {
  // A failure is the caller's to retry; each challenge's marker makes the
  // retry credit once.
  // Fail closed: without a source activity day we cannot decide which
  // window this belongs to. Skip (and warn) rather than fall back to
  // execution time — that fallback IS the bug this fixes.
  if (!activityDateKey) {
    console.warn("challenge_progress_missing_activity_date", {
      uid,
      metric,
      sourceId,
    });
    return;
  }

  // Only the challenges still open on the activity day: this runs for
  // every logged session, and challenges are never deleted, so a read of
  // the whole collection grew with every week and month that passed.
  // The apply helper still checks the window.
  const dayBound = openOnDayBound(activityDateKey);
  if (!dayBound) return;
  const challengesSnap = await db
    .collection("challenges")
    .where("endDate", ">", dayBound)
    .get();

  for (const doc of challengesSnap.docs) {
    await applyChallengeProgressIncrement(
      doc.id,
      doc.data(),
      uid,
      metric,
      incrementBy,
      sourceId,
      activityDateKey,
      sourceRef
    );
  }
}

/* PR 5: fastest_effort sync.
 *
 * Doesn't fit the standard SUM-based syncChallengeProgress pattern —
 * fastest is MIN(currentValue, this_run_time), and only counts when
 * the run actually meets the challenge's targetDistance. Tier comparison
 * is also flipped: lower time = better tier.
 *
 * Caller is the onRunCreated trigger; this is its own function rather
 * than an extension of syncChallengeProgress so the SUM logic stays
 * boring and obvious for the four metrics that use it. */
async function syncFastestEffortProgress(
  uid,
  runDistanceMeters,
  runDurationSeconds,
  sourceId,
  activityDateKey,
  sourceRef = null
) {
  // A failure is the caller's to retry, as in syncChallengeProgress.
  if (!(runDistanceMeters > 0) || !(runDurationSeconds > 0)) return;

  // Fail closed on a missing source day — same rationale as the SUM path.
  if (!activityDateKey) {
    console.warn("challenge_progress_missing_activity_date", {
      uid,
      metric: "fastest_effort",
      sourceId,
    });
    return;
  }

  // Only the challenges still open on the run's day, as the SUM path reads
  // them: challenges are never deleted, so every fastest-effort challenge
  // ever would grow with each edition. The metric is checked here rather
  // than queried, which keeps to the endDate index the SUM path already
  // uses; the apply helper still checks the window.
  const dayBound = openOnDayBound(activityDateKey);
  if (!dayBound) return;
  const challengesSnap = await db
    .collection("challenges")
    .where("endDate", ">", dayBound)
    .get();

  for (const doc of challengesSnap.docs) {
    if (doc.data().metric !== "fastest_effort") continue;
    await applyFastestEffortToChallenge(
      doc.id,
      doc.data(),
      uid,
      runDistanceMeters,
      runDurationSeconds,
      sourceId,
      activityDateKey,
      sourceRef
    );
  }
}

/**
 * Apply one qualifying run to ONE fastest_effort challenge. Extracted from
 * the syncFastestEffortProgress loop for the same reason as the SUM-path
 * extraction: the join-time backfill replays historical runs against the
 * joined challenge through the identical target-distance gate, MIN
 * transaction and idempotency marker.
 */
async function applyFastestEffortToChallenge(
  challengeDocId,
  challenge,
  uid,
  runDistanceMeters,
  runDurationSeconds,
  sourceId,
  activityDateKey,
  sourceRef = null
) {
  // Same [start, end) window predicate as the SUM path.
  if (!challengeContainsActivityDate(challenge, activityDateKey)) return;

  const target = challenge.targetDistance || 0;
  if (target <= 0) return;
  if (runDistanceMeters < target) return; // run didn't reach target

  const participantRef = db
    .collection("challenges")
    .doc(challengeDocId)
    .collection("participants")
    .doc(uid);
  // Fast-path skip for non-participants (avoids opening a transaction for
  // every fastest_effort challenge the user isn't in).
  const participantSnap = await participantRef.get();
  if (!participantSnap.exists) return;

  const tiers = challenge.tiers || {};
  const runSeconds = Math.round(runDurationSeconds);

  // Read-modify-write inside a transaction, mirroring the SUM path: (a) two
  // concurrent qualifying runs (e.g. a batch device import) otherwise read
  // the same currentValue and the slower write clobbers the faster — a lost
  // PR; (b) a redelivered onRunCreated re-applies. MIN is only self-safe for
  // the SAME time, so the concurrency race is real — the transaction guards
  // (a), the marker guards (b). Pre-fix this did a bare get + set.
  await db.runTransaction(async (tx) => {
    // Sequential reads, both before any write: the marker's path depends
    // on this participant's `joinedAt` — same membership-namespacing as
    // the SUM path, for the same reason (a re-join must not inherit the
    // previous membership's markers and stay stuck at its old best).
    const snap = await tx.get(participantRef);
    if (!snap.exists) return;
    // Idempotency marker keyed by (membership, driving run id). Falls
    // back to a deterministic source key so a missing sourceId never
    // silently disables the guard.
    const markerRef = participantRef
      .collection("applied")
      .doc(
        challengeMarkers.markerDocId(
          snap.data().joinedAt,
          sourceId,
          "fastest_effort_legacy_nosrc"
        )
      );
    const marker = await tx.get(markerRef);
    if (marker.exists) return; // already applied this run — idempotent no-op
    // A deleted run credits nothing; see accrueLifetimeStat.
    if (sourceRef && !(await tx.get(sourceRef)).exists) return;
    const existingBest = snap.data().currentValue || 0;
    // 0 = no best yet, so first qualifying run always wins; else keep faster.
    const newBest =
      existingBest === 0 ? runSeconds : Math.min(existingBest, runSeconds);
    // fastest_effort tiers are time thresholds: lower is better; a newBest
    // of 0 means "no qualifying effort yet" (resolveTier guards >0).
    const tierAchieved = challengeTiers.resolveTier(
      newBest,
      tiers,
      "fastest_effort"
    );
    tx.set(
      participantRef,
      { currentValue: newBest, tierAchieved },
      { merge: true }
    );
    tx.set(markerRef, {
      metric: "fastest_effort",
      runSeconds,
      activityDateKey,
      appliedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });
}

/**
 * Join-time backfill: when a participant doc is created, credit every
 * in-window source activity the user already has — through the SAME apply
 * helpers, eligibility gate and idempotency markers as the live triggers.
 *
 * Probe sweep 2026-08-05 (third finding, verified 2026-08-08): joining
 * mid-period credited nothing retroactively — a user who joined Fastest 5K
 * on day 20 got zero credit for their day-5 run, forever, and the card
 * read "no qualifying run yet". Reference behaviour (Strava) credits all
 * in-window activity on join.
 *
 * Safety properties, all inherited rather than re-implemented:
 *   • A source already credited live has an applied/{sourceId} marker →
 *     replay is a transactional no-op (no double count).
 *   • Trigger redelivery (at-least-once) replays the whole backfill; every
 *     apply is marker-guarded, so it converges.
 *   • Runs pass the SAME isVolumeEligibleRun gate as the live trigger —
 *     isInvalid / savedAnyway / sub-threshold runs never credit.
 *   • The window predicate is re-checked per source by the apply helpers
 *     (fail closed); the query range is only a bound. Legacy docs with no
 *     `date` field fall outside the range query and are skipped — the
 *     live path fail-closes on those too.
 *   • Scoped to the ONE challenge being joined: ended or unrelated
 *     challenges are never touched, so concluded leaderboards can't be
 *     rewritten by a later join elsewhere.
 */
async function backfillChallengeProgressForParticipant(
  challengeId,
  uid,
  joinedAtMs
) {
  if (
    !(await accountDeletionLocks.shouldSystemWriteProceed(
      db,
      uid,
      "challengeJoinBackfill"
    ))
  ) {
    return;
  }

  const chSnap = await db.collection("challenges").doc(challengeId).get();
  if (!chSnap.exists) return;
  const challenge = chSnap.data() || {};
  const metric = challenge.metric;
  const window = challengeBackfill.backfillQueryWindow(challenge);
  if (!metric || !window) return; // fail closed on malformed defs
  // A join after the challenge closed credits nothing: its leaderboard is
  // final. The rules refuse such a join; this holds for one that got in.
  if (challengeBackfill.challengeJoinClosed(challenge, joinedAtMs)) return;

  // New projections propagate errors to the retryable join trigger. Keep
  // the legacy per-source backfill's existing error policy below.
  if (challengeParticipation.isParticipationMetric(metric)) {
    await challengeParticipation.recomputeParticipationChallenge(
      db,
      challengeId,
      uid
    );
    return;
  }

  try {
    if (challengeBackfill.metricNeedsWorkouts(metric)) {
      const workoutsSnap = await db
        .collection("users")
        .doc(uid)
        .collection("workouts")
        .where("date", ">=", window.startKey)
        .where("date", "<", window.endKey)
        .get();
      for (const d of workoutsSnap.docs) {
        const data = d.data() || {};
        const dayKey = sourceActivityDateKey(data);
        if (!dayKey) continue;
        for (const inc of challengeBackfill.workoutChallengeIncrements(data)) {
          if (inc.metric !== metric) continue;
          await applyChallengeProgressIncrement(
            challengeId,
            challenge,
            uid,
            inc.metric,
            inc.value,
            d.id,
            dayKey,
            d.ref
          );
        }
      }
    }

    if (challengeBackfill.metricNeedsRuns(metric)) {
      const runsSnap = await db
        .collection("users")
        .doc(uid)
        .collection("runs")
        .where("date", ">=", window.startKey)
        .where("date", "<", window.endKey)
        .get();
      for (const d of runsSnap.docs) {
        const data = d.data() || {};
        if (!isVolumeEligibleRun(data)) continue;
        const dayKey = sourceActivityDateKey(data);
        if (!dayKey) continue;
        for (const inc of challengeBackfill.runChallengeIncrements(data)) {
          if (inc.metric !== metric) continue;
          if (inc.metric === "fastest_effort") {
            await applyFastestEffortToChallenge(
              challengeId,
              challenge,
              uid,
              inc.meters,
              inc.seconds,
              d.id,
              dayKey,
              d.ref
            );
          } else {
            await applyChallengeProgressIncrement(
              challengeId,
              challenge,
              uid,
              inc.metric,
              inc.value,
              d.id,
              dayKey,
              d.ref
            );
          }
        }
      }
    }
  } catch (err) {
    console.error(
      `backfillChallengeProgress: error for ${uid}/${challengeId}:`,
      err.message
    );
  }
}

/**
 * Recompute a challenge's `participantCount` from the live participants
 * subcollection and write it to the parent doc.
 *
 * Server-owned because the parent `/challenges/{id}` doc is now server-owned
 * (rules deny client create/update/delete). The client's old approach —
 * `updateDoc(challenge, { participantCount: increment(±1) })` inside join/leave
 * — was already DENIED by the `allow update: if false` rule, so joining wrote
 * the participant doc, then threw on the count update, surfacing a spurious
 * "Failed to join challenge" toast even though the join had landed.
 *
 * Recompute-and-set (rather than increment) is deliberately idempotent: a
 * re-delivered onCreate/onDelete (triggers are at-least-once — CLAUDE.md) sets
 * the same observed count instead of double-counting. A `.count()` aggregation
 * keeps it O(1) reads regardless of participant volume.
 *
 * ORDERING (fixed 2026-07-25). This used to claim "concurrent membership
 * changes converge (the last trigger to run observes the final set)". That
 * assumed read order equals write order, and it doesn't — the read and the
 * write are separate operations:
 *
 *   join  fires, counts 5
 *   leave fires, counts 4, writes 4
 *   join's write lands second, writes 5   ← final value 5, actual 4
 *
 * The lost-update shape of 23369ef. It self-corrects on the next membership
 * change, but nothing bounded how long that took.
 *
 * The guard is a MAX on the SOURCE WRITE's commit time — `context.timestamp`,
 * assigned by Firestore, not by the instance clock, so it orders the two
 * triggers authoritatively however their instances interleave. A count
 * observed after a later commit wins; an older observation is dropped. That
 * is the "MIN/MAX-style update" CLAUDE.md names as the naturally-safe
 * exception, and it keeps the O(1) read cost.
 *
 * Chosen over the two obvious alternatives:
 *   - `FieldValue.increment(±1)` is atomic but NOT retry-idempotent, which is
 *     the dc3e4a6 double-count bug.
 *   - A transactional recompute is correct on both axes but cannot use the
 *     aggregate, so it reads every participant doc per join/leave — and the
 *     global monthly challenge is built for the whole user base.
 */
/**
 * Should an observation taken at `observedMs` overwrite a count last written
 * from an observation at `seenMs`?
 *
 * Pure so the ordering rule is testable without Firestore (the convention the
 * rest of this file's helpers follow — see _decideReconciliationActions).
 *
 * - No stored marker → write (first observation, or a pre-guard document).
 * - No usable observation time → write (degrades to the old last-write-wins
 *   rather than refusing to update at all).
 * - Equal times → WRITE, not skip: that's a re-delivery of the same event, and
 *   re-writing the same observed count is idempotent. Skipping would be too,
 *   but writing keeps the recompute self-healing if the stored count was
 *   corrupted by something else.
 */
function _shouldApplyParticipantCount(observedMs, seenMs) {
  if (!observedMs || !seenMs) return true;
  return observedMs >= seenMs;
}

async function recomputeParticipantCount(challengeId, observedAt) {
  try {
    const partsRef = db
      .collection("challenges")
      .doc(challengeId)
      .collection("participants");
    const agg = await partsRef.count().get();
    const count = agg.data().count;
    const challengeRef = db.collection("challenges").doc(challengeId);
    // Observation time = the commit time of the write that triggered us, so
    // the count we just read is the state as of that commit or later.
    const observedMs = Date.parse(observedAt || "") || 0;
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(challengeRef);
      if (!snap.exists) return; // challenge gone — nothing to count
      const seenMs = Number(snap.data().participantCountAt || 0);
      if (!_shouldApplyParticipantCount(observedMs, seenMs)) return;
      tx.update(challengeRef, {
        participantCount: count,
        participantCountAt: observedMs || Date.now(),
      });
    });
  } catch (err) {
    // A missing parent (challenge expired / never created) is benign — there's
    // nothing to keep a count on. Log anything else.
    if (err && err.code === 5 /* NOT_FOUND */) return;
    console.error(
      `recomputeParticipantCount: error for ${challengeId}:`,
      err.message
    );
  }
}

// ── Triggers: keep challenge.participantCount accurate (server-owned) ──
// onCreate + onDelete only (NOT onWrite) so per-workout progress updates to the
// participant doc don't trigger needless recomputes. TRIGGER_CAP.

exports.onChallengeParticipantCreated = functions
  .runWith({ ...TRIGGER_CAP, failurePolicy: true })
  .firestore.document("challenges/{challengeId}/participants/{uid}")
  .onCreate(async (_snap, context) => {
    await recomputeParticipantCount(
      context.params.challengeId,
      context.timestamp
    );
    // Mid-period join backfill: credit the user's existing in-window
    // activity so joining on day 20 doesn't erase days 1–19. Idempotent
    // (per-source applied markers), so redelivery and live-sync races
    // converge; a no-history user is a no-op.
    await backfillChallengeProgressForParticipant(
      context.params.challengeId,
      context.params.uid,
      // The event's own time, the same on every redelivery.
      Date.parse(context.timestamp)
    );
    return null;
  });

exports.onChallengeParticipantDeleted = functions
  .runWith({ ...TRIGGER_CAP, failurePolicy: true })
  .firestore.document("challenges/{challengeId}/participants/{uid}")
  .onDelete(async (_snap, context) => {
    // A recount, so a retry is safe; without one a failed recount left the
    // number one too high until the next join or leave.
    if (pastRetryWindow(context)) return null;
    await recomputeParticipantCount(
      context.params.challengeId,
      context.timestamp
    );
    return null;
  });

// ── 4) Trigger: instant recompute on new workout ──

exports.onWorkoutCreated = functions
  .runWith({ ...TRIGGER_CAP, failurePolicy: true })
  .firestore.document("users/{uid}/workouts/{workoutId}")
  .onCreate(async (snap, context) => {
    const { uid, workoutId } = context.params;
    if (pastRetryWindow(context)) {
      console.error("onWorkoutCreated: retry window closed, dropping", {
        uid,
        workoutId,
      });
      return null;
    }
    // R1A-Deletion: system-writer guard + compensating delete.
    // Triggers fire AFTER the source write commits — they cannot
    // pre-block the original write. Pattern per Blocker 6 trigger
    // semantics: if the user is tombstoned or mid-deletion, delete
    // the just-written source doc as defence-in-depth and skip all
    // downstream writes (lastActiveAt, challenge syncs, performance).
    // Chunk 3's post-cleanup verification also sweeps these paths;
    // compensating delete shrinks the orphan-doc window from "until
    // next sweep" to "trigger latency".
    if (
      !(await accountDeletionLocks.shouldSystemWriteProceed(
        db,
        uid,
        "onWorkoutCreated"
      ))
    ) {
      try {
        await snap.ref.delete();
      } catch (err) {
        console.warn(
          `onWorkoutCreated: compensating delete failed for ${snap.ref.path}: ${err.message}`
        );
      }
      return;
    }
    // Recompute first and let failures retry before legacy side effects.
    const sessionDays = challengeParticipation.affectedActivityDays(
      snap.data()
    );
    await challengeParticipation.reconcileParticipationChallenges(
      db,
      uid,
      sessionDays
    );
    // Polish2: the week this person shares on friends' boards, if they
    // do. Outside the steps, like the line above: a failure retries.
    await friendsBoard.refreshBoardWeek(db, uid, sessionDays);
    const data = snap.data();
    // Which day this session belongs to — the workout's own local date,
    // NOT trigger delivery time. Drives challenge-window attribution.
    const activityDateKey = sourceActivityDateKey(data);

    // Each side effect runs whatever happens to the others, and any that
    // failed fail the event, so failurePolicy delivers it again. Every
    // step is idempotent on this workout (markers, `earnedAt`, the
    // partner engine's MAX per day), so the retry repeats only what did
    // not land. Caught and logged, as they all were, a transient error
    // lost that credit for good.
    const steps = triggerSteps(`onWorkoutCreated ${uid}/${workoutId}`);

    await steps.run("lastActiveAt", () =>
      db
        .collection("users")
        .doc(uid)
        .set(
          { lastActiveAt: admin.firestore.FieldValue.serverTimestamp() },
          { merge: true }
        )
    );

    // Auto-progress challenge metrics this workout feeds: workout_count
    // always; total_volume + the hybrid_score volume term (kg×0.1,
    // SOCIAL S4 Soc8) when volume data is available. The increment
    // mapping lives in lib/challengeBackfill so the join-time backfill
    // credits history with the SAME values (idempotent on workoutId).
    for (const inc of challengeBackfill.workoutChallengeIncrements(data)) {
      await steps.run(`challenge ${inc.metric}`, () =>
        syncChallengeProgress(
          uid,
          inc.metric,
          inc.value,
          workoutId,
          activityDateKey,
          snap.ref
        )
      );
    }

    // Plate-Club weight badges (plate_club / two_plate / three_plate) — the
    // heaviest compound set in THIS workout. Single-doc determinable, so
    // awarded here off the full doc (the client's windowed snapshots can't
    // see an old PR). Idempotent via earnedAt inside awardMilestoneBadges.
    await steps.run("weight badges", () =>
      awardMilestoneBadges(uid, liftWeightMilestoneBadges(data.exercises))
    );

    // Lifetime-aggregate badge: tonnage_100 (move 100 tonnes total).
    // Maintains the cumulative volume counter idempotently (per-workout
    // marker) and awards the badge once the lifetime total crosses 100 t.
    // The amount comes from lib/lifetimeAccrual so the delete-side
    // reversal can derive it through the SAME function rather than a
    // copy (ADR-0012). accrueLifetimeStat itself returns early on a
    // non-positive amount, so the old `if (data.totalVolume)` gate is
    // redundant rather than load-bearing.
    await steps.run("lifetime volume", () =>
      accrueLifetimeStat(
        uid,
        "lift",
        lifetimeAccrual.liftVolumeKgFor(data),
        workoutId,
        snap.ref
      )
    );
    // A correction may have landed before this create event credited its
    // original snapshot. Repair those ledgers using the current workout.
    await steps.run("correction", async () => {
      if ((await snap.ref.get()).data()?.revision > 0)
        await reconcileWorkoutMetrics(db, uid, workoutId);
    });

    // SOCIAL S3 (Soc7) — advance partner-streak bonds. BEFORE the
    // rolling-window / cooldown early-returns below so a workout always
    // counts toward the streak even when it's outside the perf window.
    await steps.run("partner streak", async () => {
      const workoutStreakDay = await resolvePartnerActivityDay(
        db,
        uid,
        data.date
      );
      await applyPartnerActivity(db, uid, workoutStreakDay);
    });

    steps.settle();

    // PI1a: skip recompute when the workout falls outside the rolling
    // 7-day window. `data.date` is the person's local day and the window
    // ends on their today, which the compute reads from their timezone;
    // the gate allows a day either side of the server's, so a session
    // in the window is never skipped wherever they are.
    if (data.date && !inTriggerReach(data.date, getWeekKey(new Date()))) {
      console.log(
        `onWorkoutCreated: skipping recompute for ${uid}, workout on ${data.date} outside rolling window`
      );
      return null;
    }

    const canRun = await acquireCooldownLock(uid);
    if (!canRun) {
      console.log(`onWorkoutCreated: cooldown active for ${uid}, skipping`);
      return null;
    }

    try {
      await computeAndWritePerformanceForUser(uid, null, {
        sessionDay: data.date || null,
      });
      await releaseLock(uid, true);
      console.log(`onWorkoutCreated: computed performance for ${uid}`);
    } catch (err) {
      await releaseLock(uid, false, err.message);
      console.error(`onWorkoutCreated: compute error for ${uid}:`, err.message);
    }
    return null;
  });

// ── 5) Trigger: instant recompute on new run ──

exports.onRunCreated = functions
  .runWith({ ...TRIGGER_CAP, failurePolicy: true })
  .firestore.document("users/{uid}/runs/{runId}")
  .onCreate(async (snap, context) => {
    const { uid, runId } = context.params;
    if (pastRetryWindow(context)) {
      console.error("onRunCreated: retry window closed, dropping", {
        uid,
        runId,
      });
      return null;
    }
    // R1A-Deletion: system-writer guard + compensating delete. Same
    // Blocker 6 trigger pattern as onWorkoutCreated — delete the
    // source run doc and skip downstream writes if the user is
    // tombstoned/mid-deletion.
    if (
      !(await accountDeletionLocks.shouldSystemWriteProceed(
        db,
        uid,
        "onRunCreated"
      ))
    ) {
      try {
        await snap.ref.delete();
      } catch (err) {
        console.warn(
          `onRunCreated: compensating delete failed for ${snap.ref.path}: ${err.message}`
        );
      }
      return;
    }
    const sessionDays = challengeParticipation.affectedActivityDays(
      snap.data()
    );
    await challengeParticipation.reconcileParticipationChallenges(
      db,
      uid,
      sessionDays
    );
    // Polish2: the week this person shares on friends' boards, if they
    // do. Outside the steps, like the line above: a failure retries.
    await friendsBoard.refreshBoardWeek(db, uid, sessionDays);
    const data = snap.data();
    // The run's own local day — drives challenge-window attribution, so a
    // run flushed offline in a later month still credits the right window.
    const activityDateKey = sourceActivityDateKey(data);

    // Each side effect as a retried step, as in onWorkoutCreated: every
    // one is idempotent on this run.
    const steps = triggerSteps(`onRunCreated ${uid}/${runId}`);

    // `lastActiveAt` keeps bumping even for isInvalid / savedAnyway
    // runs — "user interacted with the app" is a reasonable read,
    // and tightening this would make the active-users pipeline
    // (weeklyPerformanceRollup / dailyPerformanceRefresh) drop
    // users who only ever save-anyway short runs. Out of scope
    // per the P0.5 plan.
    await steps.run("lastActiveAt", () =>
      db
        .collection("users")
        .doc(uid)
        .set(
          { lastActiveAt: admin.firestore.FieldValue.serverTimestamp() },
          { merge: true }
        )
    );

    // P0.5 follow-up: gate challenge + fastest-effort updates on
    // the same volume-eligibility predicate the app-side
    // aggregations use. Pre-fix, the trigger only checked
    // `distance > 0` / `duration > 0`, which let a fat-fingered
    // "too-fast" save (e.g. 20km / 0:08, isInvalid + savedAnyway
    // both true with positive distance) bump km challenges and
    // fastest-effort PRs. Missing flags default to "not flagged" so
    // pre-PR-#480 legacy writes still progress as before.
    //
    // Was an inline re-implementation until 2026-08-02, under a comment
    // claiming a direct import "isn't available" — `./lib/runEligibility`
    // is required at the top of this file and re-exported as
    // `_isVolumeEligibleRun`, and that module's own header already said
    // this duplicate had been consolidated. Two copies of the declared
    // mirror of `src/lib/runStatsEligibility.ts:isVolumeEligible`, in the
    // one file the mirror gate deliberately exempts, is exactly the
    // "tested copy does not prove the running copy" shape.
    const isCountable = isVolumeEligibleRun(data);

    if (isCountable) {
      // SOCIAL S3 (Soc7) — advance partner-streak bonds. Gated on the
      // same eligibility predicate as challenges so isInvalid /
      // savedAnyway / sub-threshold runs don't count toward a streak.
      await steps.run("partner streak", async () => {
        const runStreakDay = await resolvePartnerActivityDay(
          db,
          uid,
          data.date
        );
        await applyPartnerActivity(db, uid, runStreakDay);
      });

      // Server-side milestone badges (running distances + speed). The client
      // can't compute these from its WINDOWED streak snapshots, so they're
      // awarded here off the full run doc — gated by the same isCountable
      // eligibility as challenges, idempotent + transactional inside the
      // helper. distance is metres on the doc; fall back to distanceKm.
      // Via lib/lifetimeAccrual (an exact transcription of the
      // expression that used to be inline here) so the delete-side
      // reversal derives the same figure through the same function
      // rather than restating it — ADR-0012's load-bearing constraint.
      const runMeters = lifetimeAccrual.runMetersFor(data);
      await steps.run("run badges", () =>
        awardMilestoneBadges(
          uid,
          runMilestoneBadges(runMeters, Number(data.duration) || 0)
        )
      );
      // Lifetime-aggregate badge: century_km (run 100 km lifetime). Maintains
      // the cumulative distance counter idempotently (per-run marker) and
      // awards once the lifetime total crosses 100 km. Gated by isCountable
      // (the enclosing block) so isInvalid / savedAnyway runs don't inflate.
      await steps.run("lifetime distance", () =>
        accrueLifetimeStat(uid, "run", runMeters, runId, snap.ref)
      );

      // Auto-progress the challenge metrics this run feeds: total_km +
      // the hybrid_score distance term (km×100, SOCIAL S4 Soc8), and
      // fastest_effort (MIN-update semantics, separate sync path with a
      // targetDistance gate). The increment mapping lives in
      // lib/challengeBackfill so the join-time backfill credits history
      // with the SAME values — all gated by isCountable (the enclosing
      // block), idempotent on runId.
      for (const inc of challengeBackfill.runChallengeIncrements(data)) {
        await steps.run(`challenge ${inc.metric}`, () =>
          inc.metric === "fastest_effort"
            ? syncFastestEffortProgress(
                uid,
                inc.meters,
                inc.seconds,
                runId,
                activityDateKey,
                snap.ref
              )
            : syncChallengeProgress(
                uid,
                inc.metric,
                inc.value,
                runId,
                activityDateKey,
                snap.ref
              )
        );
      }
    } else {
      console.log(
        `onRunCreated: skipping challenge/fastest-effort sync for ${uid} ` +
          `(isInvalid=${data.isInvalid === true}, savedAnyway=${data.savedAnyway === true}, ` +
          `distance=${data.distance}, duration=${data.duration})`
      );
    }

    // PR-L L2: recovery-entry write. Runs BEFORE the rolling-window
    // and cooldown gates because recovery entry is independent of
    // the performance recompute — a race run logged late (poor
    // connectivity, Garmin sync delay) or arriving while another
    // run holds the per-user cooldown lock still needs to flip the
    // user into the recovery phase. The wrapper catches its own
    // errors and reads/writes only programState (not the
    // performance write surface), so failures here can't cascade.
    await _maybeWriteRecoveryEntryForRun(uid, data);

    steps.settle();

    // The run's day (the day it started, as the compute dates it), or
    // null for a run with neither a day nor a finish time.
    const runDay = runDayKey(data, null);
    if (runDay) {
      const currentKey = getWeekKey(new Date());
      // PI1a: skip recompute when the run falls outside the rolling
      // 7-day window, a day either side of the server's (see
      // onWorkoutCreated).
      if (!inTriggerReach(runDay, currentKey)) {
        console.log(
          `onRunCreated: skipping recompute for ${uid}, run on ${runDay} outside rolling window ending ${currentKey}`
        );
        return null;
      }
    }

    const canRun = await acquireCooldownLock(uid);
    if (!canRun) {
      console.log(`onRunCreated: cooldown active for ${uid}, skipping`);
      return null;
    }

    try {
      await computeAndWritePerformanceForUser(uid, null, {
        sessionDay: runDay,
      });
      await releaseLock(uid, true);
      console.log(`onRunCreated: computed performance for ${uid}`);
    } catch (err) {
      await releaseLock(uid, false, err.message);
      console.error(`onRunCreated: compute error for ${uid}:`, err.message);
    }
    return null;
  });

// Saved-workout corrections reconcile current source facts, including retries.
exports.onWorkoutUpdated = functions
  .runWith({ ...TRIGGER_CAP, failurePolicy: true })
  .firestore.document("users/{uid}/workouts/{workoutId}")
  .onUpdate(async (change, context) => {
    const before = change.before.data() || {};
    const after = change.after.data() || {};
    const { uid, workoutId } = context.params;
    // Reconciles from the current source documents, so a retry is safe.
    if (pastRetryWindow(context)) return null;
    if (
      !(await accountDeletionLocks.shouldSystemWriteProceed(
        db,
        uid,
        "onWorkoutUpdated"
      ))
    )
      return null;
    // A resumed Finish can overwrite duration without incrementing revision.
    // Reconcile current source facts before the correction-only gate.
    const sessionDays = challengeParticipation.affectedActivityDays(
      before,
      after
    );
    await challengeParticipation.reconcileParticipationChallenges(
      db,
      uid,
      sessionDays
    );
    // Polish2: the week this person shares on friends' boards, if they
    // do. Outside the steps, like the line above: a failure retries.
    await friendsBoard.refreshBoardWeek(db, uid, sessionDays);
    if (
      !(after.revision > 0) ||
      (before.revision === after.revision &&
        before.sharedActivityId === after.sharedActivityId)
    )
      return null;
    await reconcileWorkoutMetrics(db, uid, workoutId);
    const current = await change.after.ref.get();
    if (!current.exists) return null;
    // Older corrections can change the 28-day baseline as well as the
    // current window, so this always recomputes, for the person's today.
    await computeAndWritePerformanceForUser(uid, null, {
      sessionDay: current.data().date || null,
    });
    return null;
  });

// Source overwrites and eligibility edits affect participation goals too.
// Read current sources rather than trusting an out-of-order event snapshot.
exports.onRunUpdated = functions
  .runWith({ ...TRIGGER_CAP, failurePolicy: true })
  .firestore.document("users/{uid}/runs/{runId}")
  .onUpdate(async (change, context) => {
    const { uid } = context.params;
    // Reconciles from the current source documents, so a retry is safe.
    if (pastRetryWindow(context)) return null;
    if (
      !(await accountDeletionLocks.shouldSystemWriteProceed(
        db,
        uid,
        "onRunUpdated"
      ))
    )
      return null;
    const sessionDays = challengeParticipation.affectedActivityDays(
      change.before.data(),
      change.after.data()
    );
    await challengeParticipation.reconcileParticipationChallenges(
      db,
      uid,
      sessionDays
    );
    // Polish2: the week this person shares on friends' boards, if they
    // do. Outside the steps, like the line above: a failure retries.
    await friendsBoard.refreshBoardWeek(db, uid, sessionDays);
    return null;
  });

// ── 5b) Triggers: reverse the accumulators when a session is deleted ──
//
// ADR-0012. Until these existed there was no delete affordance for a
// workout or a run anywhere in the app — `useWorkouts.deleteWorkout` was
// written and wired to nothing, and runs had no delete function at all —
// because `onWorkoutCreated` / `onRunCreated` are onCreate ONLY and the
// state they write is guarded by markers that outlive the source
// document. Deleting the source fired nothing: the log shrank and the
// derived values did not. A delete button in front of that is worse than
// no button, because the damage is silent and the user has been told the
// record is gone.
//
// What is and is not reversed, and why, is documented on
// lib/activityReversal. In short: challenge progress and lifetime totals
// are reversed; the Performance Index needs nothing (it is a projection
// and self-heals on the next recompute); a `fastest_effort` best is
// REBUILT from surviving runs when its driving run is deleted (ADR-0012
// third amendment, lib/fastestEffortRebuild); partner streaks and
// milestone badges are deliberately left standing as history rather
// than accumulators.
//
// THE GUARD IS NOT OPTIONAL. The account-deletion executor sweeps
// `workouts` and `runs`, so these fire once per document during every
// account deletion — for a user whose accumulators are being erased in
// the same run. Beyond the fan-out, a reversal racing that sweep could
// RE-CREATE a `lifetime/totals` document the executor had already
// removed, which defeats erasure rather than merely making it untidy.
//
// The guarded behaviour differs from the create side. There,
// `shouldSystemWriteProceed` failing triggers a COMPENSATING DELETE of
// the just-written source doc. Here there is nothing to compensate — the
// document is already gone and the accumulators are being erased anyway —
// so the correct behaviour is a plain no-op.

exports.onWorkoutDeleted = functions
  .runWith({ ...TRIGGER_CAP, failurePolicy: true })
  .firestore.document("users/{uid}/workouts/{workoutId}")
  .onDelete(async (snap, context) => {
    const { uid, workoutId } = context.params;
    if (pastRetryWindow(context)) {
      console.error("onWorkoutDeleted: retry window closed, dropping", {
        uid,
        workoutId,
      });
      return null;
    }
    if (
      !(await accountDeletionLocks.shouldSystemWriteProceed(
        db,
        uid,
        "onWorkoutDeleted"
      ))
    ) {
      return null;
    }
    const sessionDays = challengeParticipation.affectedActivityDays(
      snap.data()
    );
    await challengeParticipation.reconcileParticipationChallenges(
      db,
      uid,
      sessionDays
    );
    // Polish2: the week this person shares on friends' boards, if they
    // do. Outside the steps, like the line above: a failure retries.
    await friendsBoard.refreshBoardWeek(db, uid, sessionDays);
    // Each reversal runs whatever happens to the other, and a failure
    // fails the event so failurePolicy delivers it again. The source is
    // already gone, so nothing else would ever re-fire: caught and logged,
    // as it was, a contended transaction left the deleted workout's credit
    // standing for good. Both reversals delete their marker in the same
    // transaction, so the retry applies only what did not land.
    const data = snap.data() || {};
    const steps = triggerSteps(`onWorkoutDeleted ${uid}/${workoutId}`);
    await steps.run("challenges", () =>
      activityReversal.reverseChallengeProgressForSource(db, uid, workoutId)
    );
    await steps.run("lifetime volume", () =>
      activityReversal.reverseLifetimeStat(
        db,
        uid,
        "lift",
        workoutId,
        lifetimeAccrual.liftVolumeKgFor(data)
      )
    );
    steps.settle();
    console.log(`onWorkoutDeleted: reversed ${workoutId} for ${uid}`);
    return null;
  });

exports.onRunDeleted = functions
  .runWith({ ...TRIGGER_CAP, failurePolicy: true })
  .firestore.document("users/{uid}/runs/{runId}")
  .onDelete(async (snap, context) => {
    const { uid, runId } = context.params;
    if (pastRetryWindow(context)) {
      console.error("onRunDeleted: retry window closed, dropping", {
        uid,
        runId,
      });
      return null;
    }
    if (
      !(await accountDeletionLocks.shouldSystemWriteProceed(
        db,
        uid,
        "onRunDeleted"
      ))
    ) {
      return null;
    }
    const steps = triggerSteps(`onRunDeleted ${uid}/${runId}`);
    await steps.run("health workout tombstone", () =>
      healthWorkoutLedger.markDeletedRun(
        db,
        uid,
        runId,
        admin.firestore.FieldValue.serverTimestamp
      )
    );
    const sessionDays = challengeParticipation.affectedActivityDays(
      snap.data()
    );
    await challengeParticipation.reconcileParticipationChallenges(
      db,
      uid,
      sessionDays
    );
    // Polish2: the week this person shares on friends' boards, if they
    // do. Outside the steps, like the line above: a failure retries.
    await friendsBoard.refreshBoardWeek(db, uid, sessionDays);
    const data = snap.data() || {};
    // No isVolumeEligibleRun re-check here, unlike the create side. An
    // ineligible run never credited, so it has no markers and every
    // reversal below is already a no-op for it. The marker is the record
    // of what happened; re-deriving that judgement from flags that may
    // since have been edited would be a second opinion where a fact is
    // available. Retried on failure, as onWorkoutDeleted says why.
    await steps.run("challenges", () =>
      activityReversal.reverseChallengeProgressForSource(db, uid, runId)
    );
    await steps.run("lifetime distance", () =>
      activityReversal.reverseLifetimeStat(
        db,
        uid,
        "run",
        runId,
        lifetimeAccrual.runMetersFor(data)
      )
    );
    steps.settle();
    console.log(`onRunDeleted: reversed ${runId} for ${uid}`);
    return null;
  });

// ══════════════════════════════════════════════
// BACKFILL — activity muscleGroups
// ══════════════════════════════════════════════
//
// Background: every workout activity posted before the
// inferMovementCategory fix (commit 46127d5) inherited
// "horizontal_push" from the template normalizer's hardcoded default.
// The fix corrects new posts going forward but doesn't touch existing
// docs in /activities — so a Pull A workout posted last week still
// shows the wrong tag in the social feed.
//
// This callable lets a user re-tag their OWN activities. It's
// scoped to the caller's authorId so one user can't mass-modify
// someone else's posts. Idempotent: re-running just recomputes the
// same field (or the same correct field if already fixed).
//
// Trigger from the browser DevTools console:
//   const fns = firebase.functions ? firebase.functions() :
//     getFunctions();
//   await httpsCallable(fns, "backfillMyActivityCategories")();
// or inside the app via a one-time admin button (not built — this
// is a one-shot fix, not a permanent feature).

/* Port of src/lib/exerciseMovementCategory.ts. Keep in sync if the
 * source file gains new categories or rules. */
const _BACKFILL_CATEGORY_RULES = [
  {
    category: "hip_dominant",
    keywords: [
      "deadlift",
      "rdl",
      "good morning",
      "hip thrust",
      "glute bridge",
      "kettlebell swing",
      "swing",
    ],
  },
  {
    category: "knee_dominant",
    keywords: [
      "squat",
      "lunge",
      "leg press",
      "leg extension",
      "step up",
      "split squat",
      "pistol",
      "calf raise",
      "leg curl",
    ],
  },
  {
    category: "vertical_pull",
    keywords: [
      "pull-up",
      "pull up",
      "pullup",
      "chin-up",
      "chin up",
      "chinup",
      "lat pulldown",
      "pulldown",
    ],
  },
  { category: "horizontal_pull", keywords: ["row", "face pull"] },
  {
    category: "vertical_push",
    keywords: [
      "overhead press",
      "shoulder press",
      "military press",
      "push press",
      "ohp",
      "lateral raise",
      "front raise",
      "upright row",
    ],
  },
  {
    category: "horizontal_push",
    keywords: [
      "bench press",
      "bench",
      "chest press",
      "push-up",
      "push up",
      "pushup",
      "dip",
      "fly",
      "flye",
      "incline press",
      "decline press",
    ],
  },
  {
    category: "arms_triceps",
    keywords: [
      "tricep",
      "skullcrusher",
      "skull crusher",
      "pushdown",
      "kickback",
      "extension",
    ],
  },
  { category: "arms_biceps", keywords: ["curl"] },
  {
    category: "core",
    keywords: [
      "plank",
      "crunch",
      "sit-up",
      "sit up",
      "situp",
      "leg raise",
      "ab",
      "russian twist",
      "rollout",
      "hollow",
    ],
  },
];

function _inferCategoryForBackfill(name, exerciseId) {
  const haystack = `${name || ""} ${exerciseId || ""}`.toLowerCase();
  for (const rule of _BACKFILL_CATEGORY_RULES) {
    for (const kw of rule.keywords) {
      if (haystack.includes(kw)) return rule.category;
    }
  }
  return "core";
}

exports.backfillMyActivityCategories = functions
  .runWith(DEFAULT_HTTP_CAP)
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "Auth required.");
    }
    const uid = context.auth.uid;

    // Before the limiter, which writes: a deleting account receives no new
    // server writes, and this one rewrites its activities.
    await accountDeletionLocks.assertCallableActorNotDeleting(db, uid);

    // A 500-document scan plus a batched write per call; the client runs
    // it once per account per device. Three an hour covers every honest
    // retry and bounds the read cost a looping caller can incur.
    if (
      await isRateLimited(uid, "backfillMyActivityCategories", 3, 3_600_000)
    ) {
      throw new functions.https.HttpsError(
        "resource-exhausted",
        "Activity re-tagging already ran recently. Try again later."
      );
    }

    const activitiesSnap = await db
      .collection("activities")
      .where("authorId", "==", uid)
      .where("type", "==", "workout")
      .limit(500)
      .get();

    let scanned = 0;
    let updated = 0;
    let skipped = 0;

    for (const docSnap of activitiesSnap.docs) {
      scanned++;
      const data = docSnap.data();
      const exercises = Array.isArray(data.exercises) ? data.exercises : [];
      if (exercises.length === 0) {
        skipped++;
        continue;
      }

      const fresh = [];
      for (const ex of exercises) {
        const name = typeof ex.name === "string" ? ex.name : "";
        const exerciseId =
          typeof ex.exerciseId === "string" ? ex.exerciseId : "";
        const cat = _inferCategoryForBackfill(name, exerciseId);
        if (!fresh.includes(cat)) fresh.push(cat);
      }
      if (fresh.length === 0) {
        skipped++;
        continue;
      }

      const existing = Array.isArray(data.muscleGroups)
        ? data.muscleGroups
        : [];
      const same =
        existing.length === fresh.length &&
        existing.every((m, i) => m === fresh[i]);
      if (same) {
        skipped++;
        continue;
      }

      await docSnap.ref.update({ muscleGroups: fresh });
      updated++;
    }

    return { ok: true, scanned, updated, skipped };
  });

/**
 * One-shot re-credit for lift volume that was never counted.
 *
 * `totalVolume` was read by every server consumer of a workout doc and
 * written by none of them onto `users/{uid}/workouts/{id}` — the tonnage
 * went onto the social activity post instead. So the volume branch of
 * `workoutChallengeIncrements` never ran and `liftVolumeKgFor` returned
 * 0, for every lift ever logged: `total_volume`, the hybrid score's kg
 * term, and lifetime lift volume all sat at zero. The writers and the
 * consumers are fixed, but nothing re-credits the history.
 *
 * WHY A PLAIN REPLAY IS SAFE — the part worth checking before running
 * anything against live data. Both guards failed OPEN rather than
 * recording a false success:
 *
 *   - Challenges: `applyChallengeProgressIncrement` returns at
 *     `challenge.metric !== metric` BEFORE touching the marker. A
 *     workout only ever produced a `workout_count` increment, so no
 *     marker was written under a `total_volume` / `hybrid_score`
 *     challenge. Nothing blocks the replay, and the `workout_count`
 *     challenges are untouched here anyway.
 *   - Lifetime: `accrueLifetimeStat` returns at `inc <= 0` BEFORE
 *     writing its marker, so a zero-volume call left no trace.
 *
 * Had either written a marker with the wrong value, this would need
 * marker surgery instead — which is why it is stated rather than
 * assumed.
 *
 * Idempotent by construction: a SECOND run finds the markers this one
 * wrote and no-ops. Self-service (credits the caller only), following
 * `backfillMyActivityCategories` — a one-shot fix, not a feature. It is
 * driven from `OneTimeMaintenance`, which pages it to completion:
 *
 *   let cursor;
 *   do {
 *     const r = await httpsCallable(fns, "recreditMyLiftVolume")({ startAfter: cursor });
 *     cursor = r.data.cursor;
 *   } while (r.data.truncated);
 *
 * PAGING IS THE CALLER'S JOB, and it has to be, because one invocation
 * has to fit inside the callable timeout. Pass the previous response's
 * `cursor` back as `startAfter`; a response with `truncated: false` means
 * the history is exhausted.
 */
exports.recreditMyLiftVolume = functions
  .runWith(DEFAULT_HTTP_CAP)
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "Auth required.");
    }
    const uid = context.auth.uid;

    // Validate the cursor before anything else: a malformed one is a client
    // bug, not a quota event, so it must not consume a rate-limit slot.
    const startAfter = data && data.startAfter;
    if (startAfter !== undefined && startAfter !== null) {
      if (
        typeof startAfter !== "string" ||
        !startAfter ||
        startAfter.includes("/")
      ) {
        throw new functions.https.HttpsError(
          "invalid-argument",
          "startAfter must be a workout document id."
        );
      }
    }

    // Before the limiter, which writes: a deleting account receives no new
    // server writes, and this one would credit lifetime totals and
    // challenge markers the deletion executor may already have swept.
    await accountDeletionLocks.assertCallableActorNotDeleting(db, uid);

    // Before the first read. The client drains a history page by page in
    // ONE session, so the window must fit a whole drain: thirty pages is
    // 15,000 workouts, while a looping caller stays bounded to thirty
    // 500-document scans per ten minutes.
    if (await isRateLimited(uid, "recreditMyLiftVolume", 30, 600_000)) {
      throw new functions.https.HttpsError(
        "resource-exhausted",
        "Volume re-credit is being requested too often. Wait a few minutes and try again."
      );
    }

    /* Challenges are fetched ONCE. Routing each workout through
       `syncChallengeProgress` would re-read the whole collection per
       workout per metric; the window check inside the apply helper then
       skips out-of-window workouts before opening any transaction, so
       the real transaction count is bounded by the active windows rather
       than by history. */
    const challengesSnap = await db.collection("challenges").get();
    const volumeChallenges = challengesSnap.docs.filter((d) =>
      workoutVolume.isRecreditMetric(d.data().metric)
    );

    /* Ordered EXPLICITLY by document id, and resumable. An unordered
       `.limit()` is document-ID ascending anyway — the point is that it is
       also repeatable, so without a cursor every re-run re-scanned the same
       page and a history past one page could never be reached. Stating the
       order makes the cursor meaningful rather than relying on an implicit
       default. */
    let workoutsQuery = db
      .collection("users")
      .doc(uid)
      .collection("workouts")
      .orderBy(admin.firestore.FieldPath.documentId())
      .limit(RECREDIT_PAGE_SIZE);
    if (startAfter) workoutsQuery = workoutsQuery.startAfter(startAfter);
    const workoutsSnap = await workoutsQuery.get();

    let scanned = 0;
    let withVolume = 0;
    let lifetimeKg = 0;
    let challengeApplies = 0;

    for (const docSnap of workoutsSnap.docs) {
      scanned++;
      const workout = docSnap.data();
      const volume = lifetimeAccrual.liftVolumeKgFor(workout);
      if (!(volume > 0)) continue;
      withVolume++;
      lifetimeKg += volume;

      await accrueLifetimeStat(uid, "lift", volume, docSnap.id, docSnap.ref);

      const activityDateKey = sourceActivityDateKey(workout);
      if (!activityDateKey) continue;
      for (const inc of challengeBackfill.workoutChallengeIncrements(workout)) {
        if (!workoutVolume.isRecreditMetric(inc.metric)) continue;
        for (const challengeDoc of volumeChallenges) {
          await applyChallengeProgressIncrement(
            challengeDoc.id,
            challengeDoc.data(),
            uid,
            inc.metric,
            inc.value,
            docSnap.id,
            activityDateKey,
            docSnap.ref
          );
          challengeApplies++;
        }
      }
    }

    const truncated = scanned === RECREDIT_PAGE_SIZE;
    const cursor = workoutsSnap.docs.length
      ? workoutsSnap.docs[workoutsSnap.docs.length - 1].id
      : null;

    console.log("recreditMyLiftVolume", {
      uid,
      scanned,
      withVolume,
      lifetimeKg,
      challengeApplies,
      truncated,
      startAfter: startAfter || null,
    });
    return {
      ok: true,
      scanned,
      withVolume,
      lifetimeKg,
      // Says so rather than silently covering part of the history — the
      // "no silent caps" rule.
      truncated,
      /* The id to pass back as `startAfter` to continue. This is what makes
         `truncated` actionable: without it the caller could see the flag and
         still have no way to reach the next page. */
      cursor,
    };
  });

// ══════════════════════════════════════════════
// MODERATION — UGC profanity triggers + admin callables
// ══════════════════════════════════════════════
//
// App Store Guideline 1.2 requires a moderation surface for any
// user-generated content. Tropos has three UGC surfaces (activity
// captions, comment text, user-submitted run / workout names) plus
// a /reports/ collection the client writes when a user reports
// content. This block adds:
//
//   1. onActivityCreated — auto-flag profane activities. Activity
//      stays in Firestore (the author still sees their record) but
//      `visibility: 'private'` hides it from public + follower feeds
//      and `flagged: true` flows it into the admin moderation queue.
//
//   2. onCommentCreated — auto-delete profane comments. Comments
//      are tiny and high-frequency; review-after-the-fact would let
//      objectionable content stay visible until a human moderator
//      catches it. Hard-delete is the simpler invariant. (The comment
//      callables now refuse the same text before writing it; this is
//      the backstop for anything that got past them.)
//
//   3. onSpacePostWritten — the same filter over Community Space
//      posts, removing a post whose text trips it.
//
//   4. createReport — files a report and emails the owner
//      (MODERATION_ALERT_EMAIL) that one is waiting.
//
//   5. listPendingReports — admin-only callable. Returns reports
//      with `status: 'pending'` plus their target content for
//      review.
//
//   6. resolveReport — admin-only callable. Marks a report as
//      resolved + optionally hides the reported content (any of
//      reportTargets.HIDEABLE_TARGET_TYPES) in one atomic write.
//
// The admin gate is env-var driven via adminAuth.isAdminUid — a
// proper custom-claims rollout is a separate piece of work, this
// gets us a working queue without sinking that sprint first.

/**
 * Auto-flag profane activities. Fires on every activity create.
 * Hooks into the existing public-feed visibility model: setting
 * `visibility: 'private'` removes the post from the cross-user
 * feed fan-out, but leaves the doc intact so the author can
 * appeal and a moderator can review.
 */
exports.onActivityCreated = functions
  .runWith({
    ...TRIGGER_CAP,
    failurePolicy: true,
    // The fan-out writes a page of 100 followers per transaction; five
    // minutes reaches tens of thousands of them, and the 60 s default
    // would stop a large account's post part of the way through its list.
    timeoutSeconds: 300,
  })
  .firestore.document("activities/{activityId}")
  .onCreate(async (snap, context) => {
    const activityId = context.params.activityId;
    // Retried (lib/triggerRetry): the flag is the same update each time and
    // a feed copy's id is the activity's, so a retry adds nothing twice.
    if (pastRetryWindow(context)) {
      functions.logger.error("onActivityCreated.retry_window_closed", {
        activityId,
      });
      return null;
    }
    const data = snap.data();
    const authorId = data && data.authorId;

    // 2026-05-26 audit PR 3 (finding #3) — R1A-Deletion: compensating
    // delete if author is mid-deletion. Mirrors onWorkoutCreated /
    // onRunCreated pattern: the activity doc landed via the client
    // create, but if the cascade is in flight we tear it down here
    // and skip both profanity scan AND fanout. Author-side gate;
    // recipient-side gate is intentionally omitted (deletion executor
    // Phase D sweeps feeds anyway, and per-recipient checks would
    // cost N extra reads per post).
    if (authorId) {
      const proceed = await accountDeletionLocks.shouldSystemWriteProceed(
        db,
        authorId,
        "onActivityCreated"
      );
      if (!proceed) {
        try {
          await snap.ref.delete();
        } catch (err) {
          console.warn(
            `onActivityCreated: compensating delete failed for ${snap.ref.path}: ${err.message}`
          );
        }
        return;
      }
    }

    // Profanity scan + auto-flag. Runs before fanout so flagged posts
    // get visibility=private and are then skipped by the fanout block
    // below.
    try {
      const SCAN_FIELDS = ["caption", "workoutName", "runName"];
      const flaggedField = profanityFilter.findProfaneField(data, SCAN_FIELDS);
      if (flaggedField) {
        functions.logger.warn("onActivityCreated.auto_flag", {
          activityId,
          authorId,
          flaggedField,
        });
        await snap.ref.update({
          flagged: true,
          autoFlagged: true,
          flaggedField,
          flaggedAt: admin.firestore.FieldValue.serverTimestamp(),
          visibility: "private",
        });
        // Flagged → don't fan out. Author retains read access via
        // owner rules; followers never see it.
        return;
      }
    } catch (err) {
      functions.logger.error("onActivityCreated.profanity_error", {
        activityId,
        message: err.message,
      });
      // Retried before anything fans out. Falling through, as this once
      // did, published to every follower a post the scan had just found
      // objectionable whenever the flag's write failed.
      throw err;
    }

    // 2026-05-26 audit PR 3 — server-side fan-out. Replaces the
    // client `postActivity` fan-out loop. /feeds writes are
    // server-only post-PR-3 so this is the only path that can
    // populate follower feeds.
    if (!authorId) return;
    try {
      const firestore = admin.firestore();
      const fanoutResult = await socialFanout.fanoutActivityToFeeds({
        firestore,
        activityId,
        authorId,
        activityData: data,
        serverTimestamp: admin.firestore.FieldValue.serverTimestamp,
      });
      functions.logger.info("onActivityCreated.fanout_complete", {
        activityId,
        authorId,
        fanned: fanoutResult.fanned,
      });
      // A post taken back while this ran (the finish screen's Undo comes
      // seconds after the post) can have had its delete trigger look for
      // copies before these were written. Read after the writes: either
      // this sees the post gone and removes them, or the delete lands
      // later and onActivityDeleted finds them.
      if (fanoutResult.fanned > 0 && !(await snap.ref.get()).exists) {
        const { removed } = await socialFanout.removeActivityFromFeeds({
          firestore,
          activityId,
        });
        functions.logger.info("onActivityCreated.withdrawn_during_fanout", {
          activityId,
          removed,
        });
      }
    } catch (err) {
      functions.logger.error("onActivityCreated.fanout_error", {
        activityId,
        authorId,
        message: err.message,
      });
      // Retried: the followers a failed pass missed get the post.
      throw err;
    }
  });

/**
 * Takes a deleted post out of every feed it was copied into: the finish
 * screen's Undo, deleting the session a post came from, and the account
 * deletion executor all delete `activities/{id}`, and each copy left behind
 * points at a post the rules no longer let anyone read.
 *
 * No account-deletion guard, unlike onWorkoutDeleted / onRunDeleted: those
 * write, and could re-create what the executor erased. This only deletes
 * copies of a post that is already gone, which can only shrink what the
 * executor has to erase.
 */
exports.onActivityDeleted = functions
  .runWith({ ...TRIGGER_CAP, failurePolicy: true })
  .firestore.document("activities/{activityId}")
  .onDelete(async (_snap, context) => {
    const { activityId } = context.params;
    // Retried: removing copies already gone removes nothing.
    if (pastRetryWindow(context)) return null;
    try {
      const { removed } = await socialFanout.removeActivityFromFeeds({
        firestore: admin.firestore(),
        activityId,
      });
      functions.logger.info("onActivityDeleted.feed_copies_removed", {
        activityId,
        removed,
      });
    } catch (err) {
      functions.logger.error("onActivityDeleted.error", {
        activityId,
        message: err.message,
      });
      throw err;
    }
    return null;
  });

/**
 * Auto-delete profane comments. Comments are short and
 * high-frequency; auto-delete is simpler than the activity
 * auto-flag because there's no per-comment moderation review
 * surface in v1 and the author's "feedback" comes from the
 * comment vanishing.
 *
 * Stores a redacted record under /commentModeration/{auto-id}
 * so the report queue can audit deletion volume.
 */
exports.onCommentCreated = functions
  .runWith({ ...TRIGGER_CAP, failurePolicy: true })
  .firestore.document("comments/{activityId}/items/{commentId}")
  .onCreate(async (snap, context) => {
    const { activityId, commentId } = context.params;
    // Retried: the transaction below already makes a second delivery a
    // no-op, and without a retry a failed one left the comment up.
    if (pastRetryWindow(context)) return null;
    try {
      const data = snap.data();
      if (!profanityFilter.containsProfanity(data.text)) return;

      const db = admin.firestore();
      // At-least-once delivery + retries: do the delete, the commentCount
      // decrement, and the audit write ATOMICALLY and idempotently. Re-reading
      // the comment inside a transaction and bailing when it's already gone
      // stops a re-delivery from double-decrementing the counter (it could go
      // negative) or duplicating the audit record (CROSS-H2). The audit doc is
      // keyed on commentId so a re-run overwrites rather than appends, and the
      // activity decrement only fires when the activity still exists.
      const handled = await db.runTransaction(async (tx) => {
        const commentSnap = await tx.get(snap.ref);
        if (!commentSnap.exists) return false; // an earlier delivery handled it
        const activityRef = db.doc(`activities/${activityId}`);
        const activitySnap = await tx.get(activityRef);

        tx.delete(snap.ref);
        // Redact the offending text — the audit holds the cleaned form, not
        // the original. Moderators don't need to re-read the slur.
        tx.set(db.collection("commentModeration").doc(commentId), {
          action: "auto_delete",
          reason: "profanity",
          activityId,
          commentId,
          authorId: data.authorId || null,
          textRedacted: profanityFilter.cleanProfanity(data.text || ""),
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        if (activitySnap.exists) {
          tx.update(activityRef, {
            commentCount: admin.firestore.FieldValue.increment(-1),
          });
        }
        return true;
      });

      if (handled) {
        functions.logger.warn("onCommentCreated.auto_delete", {
          activityId,
          commentId,
          authorId: data.authorId,
        });
      }
    } catch (err) {
      functions.logger.error("onCommentCreated.error", {
        activityId,
        commentId,
        message: err.message,
      });
      throw err;
    }
  });

/**
 * The word filter over Community Space posts — the activity pattern
 * above, applied to a post's title, body and author name. A post whose
 * text trips it is removed (any signed-in user can read a space post, so
 * there is no visibility to turn off). Fires on edits too: an author may
 * rewrite a post's title and body. The decision lives in
 * lib/spacePostModeration.js; deleting only ever shrinks data, so no
 * account-deletion guard is needed (the reasoning onActivityDeleted gives).
 */
exports.onSpacePostWritten = functions
  .runWith({ ...TRIGGER_CAP, failurePolicy: true })
  .firestore.document("spaces/{spaceId}/posts/{postId}")
  .onWrite(async (change, context) => {
    const { spaceId, postId } = context.params;
    // Retried: the removal re-reads the post in its transaction, and the
    // photo's delete treats a file already gone as done.
    if (pastRetryWindow(context)) return null;
    const before = change.before.exists ? change.before.data() : null;
    const after = change.after.exists ? change.after.data() : null;
    try {
      await spacePostModeration.removeObjectionableSpacePost({
        firestore: admin.firestore(),
        ref: change.after.ref,
        before,
        after,
        logger: functions.logger,
      });
      // A deleted post's photo goes with it (lib/spacePostPhoto.js). Only
      // a file under the author's own prefix in this bucket is deleted.
      await spacePostPhoto.deleteOrphanedPhoto({
        before,
        after,
        getBucket: () => admin.storage().bucket(),
        logger: functions.logger,
      });
    } catch (err) {
      functions.logger.error("onSpacePostWritten.error", {
        spaceId,
        postId,
        message: err && err.message,
      });
      throw err;
    }
    return null;
  });

/**
 * Admin-only: fetch pending reports for the moderation queue.
 * Joins each report with its target content so the reviewer
 * doesn't have to chase doc references. Returns a sanitised
 * subset of the target (no full HTML / nothing executable).
 *
 * Page size is fixed at 50 — the queue should be small in v1, and
 * a runaway list of pending reports means we need to add
 * pagination + filtering, not return 10k docs to the client.
 */
// Packet 14 — report creation is callable-only + target resolution is
// server-side. A report is EVIDENCE, never authority: hide/restrict actions
// re-resolve the target from a server-issued reportAuthority marker inside
// the resolution transaction. Legacy / forged direct-write reports have no
// authority marker and are dismiss-only.
function invalidReportInput() {
  return new functions.https.HttpsError(
    "invalid-argument",
    "The report request is invalid."
  );
}
function unavailableReportTarget() {
  return new functions.https.HttpsError(
    "failed-precondition",
    "Reported content is unavailable."
  );
}
function nullableString(value) {
  return typeof value === "string" ? value : null;
}
function queueReason(value) {
  return ["spam", "harassment", "inappropriate", "other"].includes(value)
    ? value
    : "other";
}

/**
 * Screens a photo the caller just uploaded for other people to see, a
 * Space post's or their profile's, before the app uses it
 * (lib/photoScreen.js, Ship1). Answers { ok: false } when the photo is
 * refused as nudity, its file already deleted, and "unavailable" when it
 * could not be checked, so the app posts nothing it couldn't check.
 */
exports.screenPhoto = functions
  .runWith(DEFAULT_HTTP_CAP)
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Sign-in required."
      );
    }
    const path = data && typeof data === "object" ? data.path : undefined;
    if (photoScreen.screenedOwner(path) !== context.auth.uid) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Which photo? Send the path of one you uploaded."
      );
    }
    // Every call is a paid Cloud Vision request, and the same photo can be
    // sent again and again. Thirty in ten minutes is far past any real
    // upload pace; the upload trigger screens every file either way.
    if (await isRateLimited(context.auth.uid, "screenPhoto", 30, 600_000)) {
      throw new functions.https.HttpsError(
        "resource-exhausted",
        "Too many photos checked at once. Wait a few minutes and try again."
      );
    }
    try {
      const accessToken = await admin.credential
        .applicationDefault()
        .getAccessToken();
      const { refused, adult } = await photoScreen.screenStoredPhoto({
        bucket: admin.storage().bucket(),
        path,
        accessToken: accessToken.access_token,
      });
      if (refused)
        functions.logger.warn("screenPhoto.refused", {
          uid: context.auth.uid,
          path,
          adult,
        });
      return { ok: !refused };
    } catch (error) {
      functions.logger.error("screenPhoto.failed", {
        path,
        message: String(error && error.message),
      });
      throw new functions.https.HttpsError(
        "unavailable",
        "Couldn't check this photo. Try again."
      );
    }
  });

/**
 * The same check on every upload to a screened path, for a client that
 * skips `screenPhoto`: a refused photo's file is deleted, so a post or
 * profile that names it shows nothing.
 */
exports.screenUploadedPhoto = functions
  .runWith(TRIGGER_CAP)
  .storage.object()
  .onFinalize(async (object) => {
    const path = object.name;
    if (photoScreen.screenedOwner(path) === null) return;
    try {
      const accessToken = await admin.credential
        .applicationDefault()
        .getAccessToken();
      const { refused, adult } = await photoScreen.screenStoredPhoto({
        bucket: admin.storage().bucket(object.bucket),
        path,
        accessToken: accessToken.access_token,
      });
      if (refused)
        functions.logger.warn("screenUploadedPhoto.refused", { path, adult });
    } catch (error) {
      // Gone already: the callable refused it first.
      if (error && error.code === 404) return;
      // Vision unavailable: the callable is the gate the app waits on,
      // and this is the backstop.
      functions.logger.error("screenUploadedPhoto.failed", {
        path,
        message: String(error && error.message),
      });
    }
  });

exports.createReport = functions
  .runWith({ ...DEFAULT_HTTP_CAP, secrets: [RESEND_API_KEY] })
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Sign-in required."
      );
    }

    const firestore = admin.firestore();
    // Deleting users cannot file new reports (mirrors the old Rules gate).
    await accountDeletionLocks.assertCallableActorNotDeleting(
      firestore,
      context.auth.uid
    );

    let input;
    try {
      input = reportTargets.normalizeCreateReportInput(data);
    } catch (error) {
      if (reportTargets.isReportTargetError(error)) throw invalidReportInput();
      throw error;
    }

    const limited = await isRateLimited(
      context.auth.uid,
      "createReport",
      10,
      60 * 60 * 1000
    );
    if (limited) {
      throw new functions.https.HttpsError(
        "resource-exhausted",
        "Too many reports. Try again later."
      );
    }

    let target;
    try {
      target = await reportTargets.resolveReportTarget({
        firestore,
        reporterUid: context.auth.uid,
        targetType: input.targetType,
        targetId: input.targetId,
      });
    } catch (error) {
      if (reportTargets.isReportTargetError(error)) {
        throw unavailableReportTarget();
      }
      throw error;
    }

    const reportRef = firestore.collection("reports").doc();
    const authorityRef = firestore
      .collection("reportAuthority")
      .doc(reportRef.id);

    // The report is user evidence; the separate, Rules-denied authority record
    // is the server-issued proof its target was resolved at creation time.
    // They commit together — an unmarked report is intentionally dismiss-only.
    await firestore.runTransaction(async (transaction) => {
      transaction.create(reportRef, {
        reporterId: context.auth.uid,
        targetType: target.targetType,
        targetId: target.targetId,
        targetUid: target.targetUid,
        reason: input.reason,
        category: input.category,
        ...(input.subReason ? { subReason: input.subReason } : {}),
        ...(input.freeformNote ? { freeformNote: input.freeformNote } : {}),
        hideFromFeed: input.hideFromFeed,
        blockAuthor: input.blockAuthor,
        status: "pending",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      transaction.create(authorityRef, {
        version: 1,
        targetType: target.targetType,
        targetId: target.targetId,
        targetUid: target.targetUid,
        issuedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    // Tell the owner a report is waiting. After the commit, so an alert
    // never announces a report that failed to store. sendReportAlert never
    // throws and gives up on a slow provider: a reporter told their report
    // failed would file it again.
    await reportAlert.sendReportAlert({
      sendEmail: sendViaResend,
      to: reportAlert.alertRecipient(),
      queueUrl: reportAlert.moderationQueueUrl(
        helpers.getStripeReturnBaseUrl()
      ),
      report: {
        reportId: reportRef.id,
        targetType: target.targetType,
        category: input.category,
        subReason: input.subReason,
        freeformNote: input.freeformNote,
      },
      logger: functions.logger,
    });

    return { reportId: reportRef.id };
  });

exports.listPendingReports = functions
  .runWith(ADMIN_HTTP_CAP)
  .https.onCall(async (_data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Sign-in required."
      );
    }
    adminAuth.assertAdminCallable(context.auth.uid);

    const firestore = admin.firestore();
    const reportsSnap = await firestore
      .collection("reports")
      .where("status", "==", "pending")
      .orderBy("createdAt", "desc")
      .limit(50)
      .get();

    const reports = await Promise.all(
      reportsSnap.docs.map(async (reportDoc) => {
        const report = reportDoc.data() || {};
        const authoritySnap = await firestore
          .collection("reportAuthority")
          .doc(reportDoc.id)
          .get();
        const authority = authoritySnap.exists
          ? authoritySnap.data() || {}
          : null;
        let target = null;
        // Never use report.targetType/targetId to select an actionable target.
        // A missing authority is an intentionally non-actionable legacy report.
        if (authority && authority.version === 1) {
          try {
            target = await reportTargets.resolveReportTarget({
              firestore,
              targetType: authority.targetType,
              targetId: authority.targetId,
            });
          } catch (error) {
            if (!reportTargets.isReportTargetError(error)) {
              functions.logger.error(
                "listPendingReports.target_lookup_failed",
                {
                  reportId: reportDoc.id,
                  message: error && error.message,
                }
              );
            }
          }
        }

        return {
          reportId: reportDoc.id,
          reporterId: nullableString(report.reporterId),
          // Canonical values that control the UI.
          targetType: target ? target.targetType : null,
          targetId: target ? target.targetId : null,
          targetUid: target ? target.targetUid : null,
          targetActionable: target !== null,
          // Whether resolveReport's hideActivity can act on it (Hide
          // content in the queue). Decided here so the page holds no list
          // of its own.
          targetHideable:
            target !== null &&
            reportTargets.HIDEABLE_TARGET_TYPES.includes(target.targetType),
          target: target ? target.preview : null,
          // Display-only diagnostics — they never select a target.
          reportedTargetType: nullableString(report.targetType),
          reportedTargetId: nullableString(report.targetId),
          reason: queueReason(report.reason),
          details:
            nullableString(report.freeformNote) ||
            nullableString(report.details),
          createdAt:
            report.createdAt && typeof report.createdAt.toMillis === "function"
              ? report.createdAt.toMillis()
              : null,
        };
      })
    );

    return { reports };
  });

/**
 * Admin-only: mark a report as resolved. Optional `hideActivity`
 * flag takes the reported content out of the app in the same call so
 * a moderator can dismiss + hide in one click: an activity becomes
 * `flagged: true, visibility: 'private'`; a comment (activity or space
 * post) or a space post is deleted. See reportTargets.queueContentHide.
 */
// S4e (PR #722): resolveReport gains an optional `restrictUser` field
// that atomically writes to globalRestrictedUids/{targetUid} alongside
// the report resolution. S4e is the manual-restriction MVP — full
// strike-counter automation (S4d-original) is deferred per the lock's
// D2. Schema per S4e critical implication (1): { uid, restrictedAt,
// restrictionEndsAt: null, lastActionedReport, strikes: null }. The
// nulls signal "manually restricted via admin action, not auto-strike"
// — schema forward-compatible with S4d-full where strikes/endsAt get
// populated by the future auto-strike trigger.
exports.resolveReport = functions
  .runWith(ADMIN_HTTP_CAP)
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Sign-in required."
      );
    }
    adminAuth.assertAdminCallable(context.auth.uid);

    if (!data || typeof data !== "object" || Array.isArray(data)) {
      throw invalidReportInput();
    }
    const reportId = data.reportId;
    const hideActivity =
      data.hideActivity === undefined ? false : data.hideActivity;
    const restrictUser =
      data.restrictUser === undefined ? false : data.restrictUser;
    if (
      typeof reportId !== "string" ||
      !reportId ||
      reportId !== reportId.trim() ||
      reportId.includes("/") ||
      reportId === "." ||
      reportId === ".." ||
      typeof hideActivity !== "boolean" ||
      typeof restrictUser !== "boolean"
    ) {
      throw invalidReportInput();
    }

    const firestore = admin.firestore();
    const reportRef = firestore.collection("reports").doc(reportId);
    const authorityRef = firestore.collection("reportAuthority").doc(reportId);
    // A hidden space post's likes and comments, swept after the commit.
    let removedSpacePostRef = null;

    await firestore.runTransaction(async (transaction) => {
      removedSpacePostRef = null; // a retried attempt starts clean
      const reportSnap = await transaction.get(reportRef);
      if (!reportSnap.exists) {
        throw new functions.https.HttpsError("not-found", "Report not found.");
      }
      const report = reportSnap.data() || {};
      if (report.status !== "pending") {
        throw new functions.https.HttpsError(
          "failed-precondition",
          "Report is no longer pending."
        );
      }

      const authoritySnap = await transaction.get(authorityRef);
      const authority = authoritySnap.exists
        ? authoritySnap.data() || {}
        : null;
      // Legacy / direct-write reports have no server-issued authority. They may
      // be dismissed, but their attacker-controlled fields can never select a
      // target for a moderation action.
      if (!authority || authority.version !== 1) {
        if (hideActivity || restrictUser) throw unavailableReportTarget();
        transaction.update(reportRef, {
          status: "resolved",
          resolvedBy: context.auth.uid,
          resolvedAt: admin.firestore.FieldValue.serverTimestamp(),
          hideAppliedByAdmin: false,
          restrictAppliedByAdmin: false,
          targetResolution: "untrusted-legacy",
        });
        return;
      }

      let target;
      try {
        target = await reportTargets.resolveReportTarget({
          firestore,
          reader: transaction,
          targetType: authority.targetType,
          targetId: authority.targetId,
        });
      } catch (error) {
        if (!reportTargets.isReportTargetError(error)) throw error;
        // A server-issued target later deleted/malformed can be dismissed, but
        // no content action may be taken from it.
        if (hideActivity || restrictUser) throw unavailableReportTarget();
        transaction.update(reportRef, {
          status: "resolved",
          resolvedBy: context.auth.uid,
          resolvedAt: admin.firestore.FieldValue.serverTimestamp(),
          hideAppliedByAdmin: false,
          restrictAppliedByAdmin: false,
          targetResolution: "unavailable",
        });
        return;
      }

      // `hideActivity` is the wire name from when only activities could be
      // hidden; it now means "hide the reported content", whatever kind.
      if (
        hideActivity &&
        !reportTargets.HIDEABLE_TARGET_TYPES.includes(target.targetType)
      ) {
        throw new functions.https.HttpsError(
          "invalid-argument",
          "Only content reports can be hidden."
        );
      }

      // Activities are flagged and made private; comments and space posts
      // are deleted (reportTargets.queueContentHide says why).
      const hideOutcome = hideActivity
        ? reportTargets.queueContentHide({
            transaction,
            target,
            adminUid: context.auth.uid,
            serverTimestamp: admin.firestore.FieldValue.serverTimestamp,
            increment: admin.firestore.FieldValue.increment,
          })
        : null;
      if (hideActivity && target.targetType === "space_post") {
        removedSpacePostRef = target.targetRef;
      }

      transaction.update(reportRef, {
        status: "resolved",
        resolvedBy: context.auth.uid,
        resolvedAt: admin.firestore.FieldValue.serverTimestamp(),
        hideAppliedByAdmin: hideActivity,
        ...(hideOutcome ? { hideOutcome } : {}),
        restrictAppliedByAdmin: restrictUser,
        targetResolution: "revalidated",
      });

      if (restrictUser) {
        const restrictionRef = firestore
          .collection("globalRestrictedUids")
          .doc(target.targetUid);
        transaction.set(
          restrictionRef,
          {
            uid: target.targetUid,
            restrictedAt: admin.firestore.FieldValue.serverTimestamp(),
            restrictionEndsAt: null,
            strikes: null,
            lastActionedReport: reportId,
          },
          { merge: true }
        );
      }
    });

    if (removedSpacePostRef) {
      // The post is gone; its likes and comments subcollections are not
      // (a document delete leaves them, and recursiveDelete cannot run in a
      // transaction). Best effort: the report is already resolved, and
      // nothing reads a subcollection whose post no longer exists.
      try {
        await firestore.recursiveDelete(removedSpacePostRef);
      } catch (err) {
        functions.logger.warn("resolveReport.space_post_cleanup_failed", {
          reportId,
          error: err && err.message,
        });
      }
    }

    return { ok: true };
  });

/* The restricted accounts and the undo (S4e, STATUS 2026-10-06). Once a
   restriction refuses posts, comments, props and follows, a mistaken one
   needs a way back that is not the Firebase console. Admin-only, like the
   queue: the page's VITE_ADMIN_UIDS gate is a convenience, ADMIN_UIDS here
   is the check. */

/** Admin-only: accounts under a restriction, most recent first. */
exports.listRestrictedUsers = functions
  .runWith(ADMIN_HTTP_CAP)
  .https.onCall(async (_data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Sign-in required."
      );
    }
    adminAuth.assertAdminCallable(context.auth.uid);

    const firestore = admin.firestore();
    const snap = await firestore
      .collection("globalRestrictedUids")
      .orderBy("restrictedAt", "desc")
      .limit(100)
      .get();
    const restricted = await Promise.all(
      snap.docs.map(async (restrictionDoc) => {
        const row = restrictionDoc.data() || {};
        const profileSnap = await firestore
          .collection("users")
          .doc(restrictionDoc.id)
          .collection("public")
          .doc("profile")
          .get();
        return {
          uid: restrictionDoc.id,
          displayName: profileSnap.exists
            ? nullableString((profileSnap.data() || {}).displayName)
            : null,
          restrictedAt:
            row.restrictedAt && typeof row.restrictedAt.toMillis === "function"
              ? row.restrictedAt.toMillis()
              : null,
          lastActionedReport: nullableString(row.lastActionedReport),
        };
      })
    );
    return { restricted };
  });

/**
 * Admin-only: lift a restriction. Deletes globalRestrictedUids/{uid} and
 * records who lifted it, and when, on the report that caused it — the
 * report already holds who restricted (`resolvedBy`), so the two ends of
 * one restriction sit together. Lifting an account that is not restricted
 * succeeds with `lifted: false`, so a second tap is harmless.
 */
exports.liftRestriction = functions
  .runWith({
    ...ADMIN_HTTP_CAP,
    secrets: [BILLING_HMAC_SECRET, BILLING_PREVIOUS_HMAC_SECRET],
  })
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Sign-in required."
      );
    }
    adminAuth.assertAdminCallable(context.auth.uid);

    const uid = data && typeof data === "object" ? data.uid : undefined;
    if (
      typeof uid !== "string" ||
      !uid ||
      uid !== uid.trim() ||
      uid.includes("/") ||
      uid === "." ||
      uid === ".."
    ) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Which account? Send its uid."
      );
    }

    const firestore = admin.firestore();
    // The identities a deleted restricted account left, which would
    // restrict this account's next one (S4e; lib/restrictedIdentities.js),
    // go first:
    // a lift that fails after this is retried, one that lifted and kept
    // them would restrict a person a moderator meant to clear.
    await restrictedIdentities.forgetRestrictedIdentities({
      firestore,
      auth: admin.auth(),
      uid,
      logger: functions.logger,
    });
    const restrictionRef = firestore
      .collection("globalRestrictedUids")
      .doc(uid);
    const lifted = await firestore.runTransaction(async (transaction) => {
      const snap = await transaction.get(restrictionRef);
      if (!snap.exists) return false;
      const reportId = nullableString((snap.data() || {}).lastActionedReport);
      const reportRef =
        reportId && !reportId.includes("/")
          ? firestore.collection("reports").doc(reportId)
          : null;
      const reportSnap = reportRef ? await transaction.get(reportRef) : null;
      transaction.delete(restrictionRef);
      if (reportSnap && reportSnap.exists) {
        transaction.update(reportRef, {
          restrictionLiftedBy: context.auth.uid,
          restrictionLiftedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
      return true;
    });

    functions.logger.info("liftRestriction", {
      adminUid: context.auth.uid,
      uid,
      lifted,
    });
    return { ok: true, lifted };
  });

/**
 * A person's public name, held to the word filter on the server (survey
 * item 18). The Settings name field writes users/{uid}/public/profile
 * straight to Firestore and checks the name on the device
 * (src/lib/displayName.ts), so a client that skipped the check published a
 * name every other writer refuses. One that trips the filter is taken back
 * to none: profiles, search and the boards then show the person unnamed
 * until they choose another, which a restricted person may still do (P11).
 */
exports.onPublicProfileWritten = functions
  .runWith({ ...TRIGGER_CAP, failurePolicy: true })
  .firestore.document("users/{uid}/public/{docId}")
  .onWrite(async (change, context) => {
    if (pastRetryWindow(context)) return null;
    if (!change.after.exists) return null;
    const name = (change.after.data() || {}).displayName;
    const before = change.before.exists ? change.before.data() || {} : {};
    if (name === before.displayName) return null;
    if (!objectionableText.displayNameRefusal(name)) return null;
    const { uid } = context.params;
    if (
      !(await accountDeletionLocks.shouldSystemWriteProceed(
        db,
        uid,
        "onPublicProfileWritten"
      ))
    )
      return null;
    const removed = await db.runTransaction(async (transaction) => {
      // Trigger deliveries can arrive after a newer edit, or out of order.
      // Classify the current name inside the transaction so an older refusal
      // cannot clear a correction committed before this moderation write.
      const current = await transaction.get(change.after.ref);
      if (
        !current.exists ||
        !objectionableText.displayNameRefusal(
          (current.data() || {}).displayName
        )
      )
        return false;
      transaction.update(change.after.ref, {
        displayName: null,
        displayNameLower: null,
      });
      return true;
    });
    if (removed)
      functions.logger.info("onPublicProfileWritten.name_removed", { uid });
    return null;
  });

/**
 * A new public name or photo, carried to the copies of the person other
 * people read: their posts and comments from the last 90 days, their Space
 * and Circle memberships, their place in recent challenges
 * (lib/identityResync.js has what, and the bounds). Each copy took the
 * name and photo when it was written, and nothing updated them after.
 *
 * Runs only when the name or the photo changed, and carries only that one.
 * It reads the profile as it is now, never the event, so a refused name
 * the filter above takes back is never carried, and an older delivery
 * cannot undo a newer one. Retried: a second run writes nothing that is
 * already right.
 */
exports.onPublicProfileIdentityChanged = functions
  .runWith({ ...TRIGGER_CAP, failurePolicy: true, timeoutSeconds: 120 })
  .firestore.document("users/{uid}/public/{docId}")
  .onWrite(async (change, context) => {
    if (pastRetryWindow(context)) return null;
    const { uid, docId } = context.params;
    if (docId !== "profile" || !change.after.exists) return null;
    const before = change.before.exists ? change.before.data() || {} : {};
    const after = change.after.data() || {};
    const fields = {
      name: before.displayName !== after.displayName,
      photo: before.photoURL !== after.photoURL,
    };
    if (!fields.name && !fields.photo) return null;
    if (
      !(await accountDeletionLocks.shouldSystemWriteProceed(
        db,
        uid,
        "onPublicProfileIdentityChanged"
      ))
    )
      return null;
    const at = Date.parse(context.timestamp || "");
    const result = await identityResync.resyncAuthorIdentity({
      firestore: db,
      uid,
      fields,
      // The event's own time, so a retry looks back over the same days.
      now: Number.isFinite(at) ? at : Date.now(),
      deleteField: admin.firestore.FieldValue.delete,
    });
    functions.logger.info("onPublicProfileIdentityChanged.resynced", {
      uid,
      ...result,
    });
    return null;
  });

/**
 * A new Auth account (any sign-in: email, Google, Apple). When its email
 * or sign-in id belonged to a restricted account that was deleted within
 * 13 months, the restriction is back before the person reaches anyone
 * (S4e; lib/restrictedIdentities.js). Every other
 * account is a read of one or two keys and nothing written. Retried: the
 * restriction it writes is the same document each time.
 */
exports.onAuthUserCreated = functions
  .runWith({
    ...TRIGGER_CAP,
    failurePolicy: true,
    secrets: [BILLING_HMAC_SECRET, BILLING_PREVIOUS_HMAC_SECRET],
  })
  .auth.user()
  .onCreate(async (user, context) => {
    if (pastRetryWindow(context)) return null;
    await restrictedIdentities.carryRestriction({
      firestore: db,
      userRecord: user,
      now: Date.now(),
      logger: functions.logger,
    });
    return null;
  });

// ══════════════════════════════════════════════
// SOCIAL COUNTERS — 2026-05-26 audit PR 2
//
// Closes findings #2 + #5. Pre-PR-2, kudosCount / commentCount /
// memberCount were client-writable via direct Firestore updateDoc.
// `affectedKeys().hasOnly([...])` in the rules restricted WHICH
// fields could change but not the VALUES — any authed user could
// set a counter to 999999. Post-PR-2 those fields are denied at
// the rules layer; mutations route through these callables, which
// flip the counter and the underlying member/kudos/comment doc in
// one Firestore transaction.
// ══════════════════════════════════════════════

exports.toggleKudosCallable = functions
  .runWith(DEFAULT_HTTP_CAP)
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Sign-in required."
      );
    }
    const activityId = data && data.activityId;
    // One document's id: a "/" would point .doc() somewhere else.
    if (!isDocumentId(activityId)) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "activityId required."
      );
    }
    // R1A-Deletion: callable-actor lock. A user mid-deletion cannot
    // mutate kudos on other users' activities on the way out — the
    // counter+sub-doc write would leak past the cascade.
    await accountDeletionLocks.assertCallableActorNotDeleting(
      admin.firestore(),
      context.auth.uid
    );
    // Read before the toggle; the toggle refuses only an add with it.
    const refuseAdd = await restriction.isRestricted(
      admin.firestore(),
      context.auth.uid
    );
    const limited = await isRateLimited(
      context.auth.uid,
      "toggleKudos",
      30,
      60_000
    );
    if (limited) {
      throw new functions.https.HttpsError(
        "resource-exhausted",
        "Too many props at once. Slow down."
      );
    }
    /* Blocking is enforced HERE, before any write. It used to be client-side
       suppression only: the callable wrote the counter, the sub-doc and the
       notification, and the recipient's app then hid the feed row while the
       tray row and the push had already landed. A notification is exactly the
       part a suppression-on-read model cannot take back. See lib/blockGuard. */
    const activitySnap = await admin
      .firestore()
      .collection("activities")
      .doc(activityId)
      .get();
    if (
      activitySnap.exists &&
      (await blockGuard.isBlockedBetween(
        admin.firestore(),
        activitySnap.data().authorId,
        context.auth.uid
      ))
    ) {
      // Answered exactly as a private or missing activity is below: a
      // different sentence would tell the person blocked that the activity
      // exists and that its author blocked them (lib/blockGuard says why
      // that must not be said).
      throw new functions.https.HttpsError(
        "permission-denied",
        "This activity is unavailable."
      );
    }

    try {
      const result = await socialCounters.toggleKudos({
        firestore: admin.firestore(),
        uid: context.auth.uid,
        activityId,
        increment: admin.firestore.FieldValue.increment,
        serverTimestamp: admin.firestore.FieldValue.serverTimestamp,
        refuseAdd,
      });
      // 2026-05-26 audit PR 3 (finding #6) — kudos notification is
      // now written server-side, atomically with the kudos doc.
      // Pre-PR-3 the client wrote `/notifications/...` directly
      // after the callable returned; that path is now rule-denied.
      // Only notify on the ADD edge (kudosed=true) so re-tapping
      // doesn't spam the recipient.
      if (result && result.kudosed) {
        try {
          // Use the author verified inside the toggle txn — no post-txn
          // re-read (which would also re-expose a now-private activity).
          const activityAuthorId = result && result.activityAuthorId;
          if (activityAuthorId && activityAuthorId !== context.auth.uid) {
            const fromName = await socialFanout.senderDisplayName(
              admin.firestore(),
              context.auth.uid
            );
            await socialFanout.createNotification({
              firestore: admin.firestore(),
              fromUid: context.auth.uid,
              toUid: activityAuthorId,
              data: {
                type: "kudos",
                fromName,
                activityId,
                message: `${fromName} gave you props`,
              },
              serverTimestamp: admin.firestore.FieldValue.serverTimestamp,
            });
          }
        } catch (notifErr) {
          // Notification write failure is non-fatal — the kudos
          // already landed. Log and continue so the client still
          // sees kudosed=true and the UI stays consistent.
          functions.logger.warn("toggleKudosCallable.notification_failed", {
            uid: context.auth.uid,
            activityId,
            error: notifErr && notifErr.message,
          });
        }
      }
      return result;
    } catch (err) {
      if (err && err.code === restriction.RESTRICTED_REASON) {
        throw restriction.restrictedError(functions);
      }
      functions.logger.warn("toggleKudosCallable.error", {
        uid: context.auth.uid,
        activityId,
        error: err && err.message,
      });
      // A visibility denial maps to a GENERIC permission-denied — never
      // disclose whether the activity exists, is private, or followers-only.
      // Anything else is a sentence for the person or a generic internal,
      // never the engine's own message (lib/engagementRejection.js).
      throw engagementRejection(err, {
        functions,
        isAccessError: err && err.code === "activity-not-accessible",
        accessMessage: "This activity is unavailable.",
        fallback: "Couldn't give props. Try again.",
      });
    }
  });

// SOC-P2c — space-post like toggle (props for Community Space posts).
// Mirrors toggleKudosCallable: server-owned counter + sub-doc flipped in
// one transaction (lib/spacePostEngagement.js), deletion actor-lock,
// rate-limited. spaceId is validated against the known-space allowlist so
// junk paths never reach Firestore. SOC-P2g added the space_post_like
// notification on the add edge (self + the retired coach author excluded).
const spacePostEngagement = require("./lib/spacePostEngagement");
const { SPACE_IDS: KNOWN_SPACE_IDS } = require("./lib/spaceIds");

exports.toggleSpacePostLikeCallable = functions
  .runWith(DEFAULT_HTTP_CAP)
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Sign-in required."
      );
    }
    const spaceId = data && data.spaceId;
    const postId = data && data.postId;
    if (
      typeof spaceId !== "string" ||
      !KNOWN_SPACE_IDS.includes(spaceId) ||
      !isDocumentId(postId)
    ) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "spaceId and postId required."
      );
    }
    await accountDeletionLocks.assertCallableActorNotDeleting(
      admin.firestore(),
      context.auth.uid
    );
    const refuseAdd = await restriction.isRestricted(
      admin.firestore(),
      context.auth.uid
    );
    const limited = await isRateLimited(
      context.auth.uid,
      "toggleSpacePostLike",
      30,
      60_000
    );
    if (limited) {
      throw new functions.https.HttpsError(
        "resource-exhausted",
        "Too many updates. Slow down."
      );
    }
    try {
      const result = await spacePostEngagement.toggleSpacePostLike({
        firestore: admin.firestore(),
        uid: context.auth.uid,
        spaceId,
        postId,
        increment: admin.firestore.FieldValue.increment,
        serverTimestamp: admin.firestore.FieldValue.serverTimestamp,
        refuseAdd,
      });
      // SOC-P2g — notify on the ADD edge only (re-tap can't spam), never
      // self, never the retired coach author (not a notifiable user).
      if (result && result.liked) {
        try {
          const postAuthorId = result.postAuthorId;
          if (
            postAuthorId &&
            postAuthorId !== context.auth.uid &&
            postAuthorId !== spacePostEngagement.COACH_AUTHOR_ID
          ) {
            const fromName = await socialFanout.senderDisplayName(
              admin.firestore(),
              context.auth.uid
            );
            await socialFanout.createNotification({
              firestore: admin.firestore(),
              fromUid: context.auth.uid,
              toUid: postAuthorId,
              data: {
                type: "space_post_like",
                fromName,
                spaceId,
                postId,
                message: `${fromName} gave your space post props`,
              },
              serverTimestamp: admin.firestore.FieldValue.serverTimestamp,
            });
          }
        } catch (notifErr) {
          functions.logger.warn(
            "toggleSpacePostLikeCallable.notification_failed",
            {
              uid: context.auth.uid,
              spaceId,
              postId,
              error: notifErr && notifErr.message,
            }
          );
        }
      }
      return result;
    } catch (err) {
      if (err && err.code === restriction.RESTRICTED_REASON) {
        throw restriction.restrictedError(functions);
      }
      functions.logger.warn("toggleSpacePostLikeCallable.error", {
        uid: context.auth.uid,
        spaceId,
        postId,
        error: err && err.message,
      });
      throw engagementRejection(err, {
        functions,
        isAccessError:
          err && err.code === spacePostEngagement.POST_NOT_ACCESSIBLE,
        accessMessage: "This post is unavailable.",
        fallback: "Couldn't like the post. Try again.",
      });
    }
  });

// SOC-P2g — Space-post comments (the addComment lockdown applied to
// spaces/{id}/posts/{postId}/comments). Client writes are rules-denied;
// creates/deletes route through these callables, which flip the comment
// doc and the server-owned commentCount in one transaction. The add edge
// notifies the post author (space_post_comment) unless the author is the
// commenter or the retired coach author ("tropos-coach" is not a
// notifiable user). The like callable above gained the matching space_post_like
// notification in this slice.

/* Comments are public content and the callable is the only writer, so
   the rules' isEmailVerified() gate (activities + space-post creates)
   cannot see this write — the same claim is checked here. `email_verified`
   is true for OAuth accounts and for an email/password account once the
   verification link is tapped; a missing token reads as unverified.
   Runs immediately after the auth check and before any Firestore read,
   so an unverified caller writes nothing, notifies nobody, and cannot
   probe the rate limiter or the block guard. */
function assertCallerEmailVerified(context) {
  const token = context.auth && context.auth.token;
  if (!token || token.email_verified !== true) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "Verify your email to comment."
    );
  }
}

/* Comments are public text: the word filter refuses one before it is
   written, as failed-precondition so the client shows the sentence
   (lib/objectionableText.js). The name rides on every comment, so it is
   checked too. Pure and free, so it runs ahead of every Firestore read. */
function assertCommentTextAllowed({ text, authorName }) {
  const refusal = objectionableText.commentRefusal({ text, authorName });
  if (refusal) {
    throw new functions.https.HttpsError("failed-precondition", refusal);
  }
}

exports.addSpacePostCommentCallable = functions
  .runWith(DEFAULT_HTTP_CAP)
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Sign-in required."
      );
    }
    assertCallerEmailVerified(context);
    const { spaceId, postId, text, authorName, authorPhotoURL } = data || {};
    if (
      typeof spaceId !== "string" ||
      !KNOWN_SPACE_IDS.includes(spaceId) ||
      typeof postId !== "string" ||
      !postId.trim()
    ) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "spaceId and postId required."
      );
    }
    // The word filter, before any read or write: this callable is the only
    // writer of space comments, so nothing gets past it to clean up later.
    assertCommentTextAllowed({ text, authorName });
    await accountDeletionLocks.assertCallableActorNotDeleting(
      admin.firestore(),
      context.auth.uid
    );
    await restriction.assertNotRestricted(
      admin.firestore(),
      context.auth.uid,
      functions
    );
    const limited = await isRateLimited(
      context.auth.uid,
      "addSpacePostComment",
      20,
      60_000
    );
    if (limited) {
      throw new functions.https.HttpsError(
        "resource-exhausted",
        "Too many comments. Slow down."
      );
    }
    // The name on the comment and in the notification is the commenter's
    // public profile name; the request's authorName is never written.
    const fromName = await socialFanout.senderDisplayName(
      admin.firestore(),
      context.auth.uid
    );
    try {
      const result = await spacePostEngagement.addSpacePostComment({
        firestore: admin.firestore(),
        uid: context.auth.uid,
        spaceId,
        postId,
        text,
        authorName: fromName,
        authorPhotoURL,
        increment: admin.firestore.FieldValue.increment,
        serverTimestamp: admin.firestore.FieldValue.serverTimestamp,
      });
      try {
        const postAuthorId = result && result.postAuthorId;
        if (
          postAuthorId &&
          postAuthorId !== context.auth.uid &&
          postAuthorId !== spacePostEngagement.COACH_AUTHOR_ID
        ) {
          await socialFanout.createNotification({
            firestore: admin.firestore(),
            fromUid: context.auth.uid,
            toUid: postAuthorId,
            data: {
              type: "space_post_comment",
              fromName,
              spaceId,
              postId,
              message: `${fromName} commented on your space post`,
            },
            serverTimestamp: admin.firestore.FieldValue.serverTimestamp,
          });
        }
      } catch (notifErr) {
        functions.logger.warn(
          "addSpacePostCommentCallable.notification_failed",
          {
            uid: context.auth.uid,
            spaceId,
            postId,
            error: notifErr && notifErr.message,
          }
        );
      }
      return result;
    } catch (err) {
      functions.logger.warn("addSpacePostCommentCallable.error", {
        uid: context.auth.uid,
        spaceId,
        postId,
        error: err && err.message,
      });
      throw commentRejection(err, {
        functions,
        isAccessError:
          !!err && err.code === spacePostEngagement.POST_NOT_ACCESSIBLE,
        accessMessage: "This post is unavailable.",
      });
    }
  });

exports.deleteSpacePostCommentCallable = functions
  .runWith(DEFAULT_HTTP_CAP)
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Sign-in required."
      );
    }
    const { spaceId, postId, commentId } = data || {};
    if (
      typeof spaceId !== "string" ||
      !KNOWN_SPACE_IDS.includes(spaceId) ||
      typeof postId !== "string" ||
      !postId.trim() ||
      typeof commentId !== "string" ||
      !commentId.trim()
    ) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "spaceId, postId and commentId required."
      );
    }
    await accountDeletionLocks.assertCallableActorNotDeleting(
      admin.firestore(),
      context.auth.uid
    );
    try {
      await spacePostEngagement.deleteSpacePostComment({
        firestore: admin.firestore(),
        uid: context.auth.uid,
        spaceId,
        postId,
        commentId,
        increment: admin.firestore.FieldValue.increment,
      });
      return { ok: true };
    } catch (err) {
      functions.logger.warn("deleteSpacePostCommentCallable.error", {
        uid: context.auth.uid,
        spaceId,
        postId,
        commentId,
        error: err && err.message,
      });
      throw commentRejection(err, {
        functions,
        isAccessError:
          !!err && err.code === spacePostEngagement.POST_NOT_ACCESSIBLE,
        accessMessage: "This post is unavailable.",
      });
    }
  });

exports.addCommentCallable = functions
  .runWith(DEFAULT_HTTP_CAP)
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Sign-in required."
      );
    }
    assertCallerEmailVerified(context);
    const { activityId, text, authorName, authorPhotoURL } = data || {};
    if (!isDocumentId(activityId)) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "activityId required."
      );
    }
    // Refused here rather than written and then deleted by
    // onCommentCreated: the comment would be visible until the trigger ran,
    // and its notification would already have gone to the author.
    assertCommentTextAllowed({ text, authorName });
    // R1A-Deletion: callable-actor lock — deleting users cannot
    // post new comments mid-cascade.
    await accountDeletionLocks.assertCallableActorNotDeleting(
      admin.firestore(),
      context.auth.uid
    );
    await restriction.assertNotRestricted(
      admin.firestore(),
      context.auth.uid,
      functions
    );
    const limited = await isRateLimited(
      context.auth.uid,
      "addComment",
      20,
      60_000
    );
    if (limited) {
      throw new functions.https.HttpsError(
        "resource-exhausted",
        "Too many comments. Slow down."
      );
    }
    // Same block enforcement as kudos — a comment is at least as intrusive.
    const commentActivitySnap = await admin
      .firestore()
      .collection("activities")
      .doc(activityId)
      .get();
    if (
      commentActivitySnap.exists &&
      (await blockGuard.isBlockedBetween(
        admin.firestore(),
        commentActivitySnap.data().authorId,
        context.auth.uid
      ))
    ) {
      // Answered exactly as an activity the person cannot see is below, so
      // the refusal does not confirm the activity or the block (blockGuard).
      throw commentRejection(null, {
        functions,
        isAccessError: true,
        accessMessage: "This activity is unavailable.",
      });
    }

    // The name on the comment and in the notification is the commenter's
    // public profile name; the request's authorName is never written.
    const fromName = await socialFanout.senderDisplayName(
      admin.firestore(),
      context.auth.uid
    );
    try {
      const result = await socialCounters.addComment({
        firestore: admin.firestore(),
        uid: context.auth.uid,
        activityId,
        text,
        authorName: fromName,
        authorPhotoURL,
        increment: admin.firestore.FieldValue.increment,
        serverTimestamp: admin.firestore.FieldValue.serverTimestamp,
      });
      // 2026-05-26 audit PR 3 (finding #6) — comment notification is
      // now written server-side. Lookup activity author so we don't
      // trust client-supplied target uid (no impersonation surface).
      try {
        // Notify the author verified inside the addComment txn — no post-txn
        // re-read of a possibly-now-private activity.
        const activityAuthorId = result && result.activityAuthorId;
        if (activityAuthorId && activityAuthorId !== context.auth.uid) {
          await socialFanout.createNotification({
            firestore: admin.firestore(),
            fromUid: context.auth.uid,
            toUid: activityAuthorId,
            data: {
              type: "comment",
              fromName,
              activityId,
              message: `${fromName} commented on your activity`,
            },
            serverTimestamp: admin.firestore.FieldValue.serverTimestamp,
          });
        }
      } catch (notifErr) {
        functions.logger.warn("addCommentCallable.notification_failed", {
          uid: context.auth.uid,
          activityId,
          error: notifErr && notifErr.message,
        });
      }
      return result;
    } catch (err) {
      functions.logger.warn("addCommentCallable.error", {
        uid: context.auth.uid,
        activityId,
        error: err && err.message,
      });
      throw commentRejection(err, {
        functions,
        isAccessError: !!err && err.code === "activity-not-accessible",
        accessMessage: "This activity is unavailable.",
      });
    }
  });

exports.deleteCommentCallable = functions
  .runWith(DEFAULT_HTTP_CAP)
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Sign-in required."
      );
    }
    const { activityId, commentId } = data || {};
    if (
      typeof activityId !== "string" ||
      !activityId.trim() ||
      typeof commentId !== "string" ||
      !commentId.trim()
    ) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "activityId + commentId required."
      );
    }
    // R1A-Deletion: callable-actor lock — author-checked delete still
    // needs the freeze gate; the cascade will tear down the user's
    // comments in Phase D and a mid-cascade self-delete would race.
    await accountDeletionLocks.assertCallableActorNotDeleting(
      admin.firestore(),
      context.auth.uid
    );
    try {
      await socialCounters.deleteComment({
        firestore: admin.firestore(),
        uid: context.auth.uid,
        activityId,
        commentId,
        increment: admin.firestore.FieldValue.increment,
      });
      return { ok: true };
    } catch (err) {
      functions.logger.warn("deleteCommentCallable.error", {
        uid: context.auth.uid,
        activityId,
        commentId,
        error: err && err.message,
      });
      // "not authorized" (wrong author) AND "activity-not-accessible" (lost
      // visibility) both → permission-denied; the access case returns a
      // generic message that doesn't disclose the activity's state.
      throw commentRejection(err, {
        functions,
        isAccessError: !!err && err.code === "activity-not-accessible",
        accessMessage: "This activity is unavailable.",
      });
    }
  });

/**
 * Comment reactions (social features pass, 2026-07) — one-tap 💪/🔥 on a
 * comment. Comments are server-write-only (rules deny client writes), so
 * the toggle goes through a callable like kudos/comments. Transactional +
 * idempotent per (uid, reaction) — see lib/commentReactions.js.
 */
exports.toggleCommentReactionCallable = functions
  .runWith(DEFAULT_HTTP_CAP)
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Sign-in required."
      );
    }
    const { activityId, commentId, reaction } = data || {};
    if (
      !isDocumentId(activityId) ||
      !isDocumentId(commentId) ||
      !commentReactions.REACTION_KEYS.includes(reaction)
    ) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "activityId + commentId + valid reaction required."
      );
    }
    await accountDeletionLocks.assertCallableActorNotDeleting(
      admin.firestore(),
      context.auth.uid
    );
    const refuseAdd = await restriction.isRestricted(
      admin.firestore(),
      context.auth.uid
    );
    // Same budget as kudos — reactions are the same tap economy.
    const limited = await isRateLimited(
      context.auth.uid,
      "toggleCommentReaction",
      30,
      60_000
    );
    if (limited) {
      throw new functions.https.HttpsError(
        "resource-exhausted",
        "Too many reactions. Slow down."
      );
    }
    try {
      return await commentReactions.toggleCommentReaction({
        firestore: admin.firestore(),
        uid: context.auth.uid,
        activityId,
        commentId,
        reaction,
        refuseAdd,
      });
    } catch (err) {
      if (err && err.code === restriction.RESTRICTED_REASON) {
        throw restriction.restrictedError(functions);
      }
      functions.logger.warn("toggleCommentReactionCallable.error", {
        uid: context.auth.uid,
        activityId,
        commentId,
        error: err && err.message,
      });
      throw engagementRejection(err, {
        functions,
        isAccessError: err && err.code === "activity-not-accessible",
        accessMessage: "This activity is unavailable.",
        fallback: "Couldn't react. Try again.",
      });
    }
  });

/* Account email callables — moved to email/accountEmails.js (audit
   batch 6, extraction 1). Re-exported here so the deployed function
   names are unchanged; triggerMetadata.test.js pins names, caps, and
   the RESEND_API_KEY binding across the move. */
const accountEmails = require("./email/accountEmails");
exports.sendPasswordResetLinkCallable =
  accountEmails.sendPasswordResetLinkCallable;
exports.sendVerificationEmailCallable =
  accountEmails.sendVerificationEmailCallable;

// ══════════════════════════════════════════════
// PR-L L4 — weekly fell-behind detection
// ══════════════════════════════════════════════
//
// New surface (not a port — this didn't exist client-side before).
// Once per week, check whether each active user actually ran ≥50%
// of their weekly target the prior week. If not, set
// `programState.pendingFellBehindPrompt` so the client can surface
// the adaptive-plan prompt on next app open (per the Q24 lock —
// shift / compress / skip-and-continue).
//
// Schedule: Mondays 05:00 UTC. Runs AFTER `weeklyPerformanceRollup`
// (Sundays 23:15 UTC) so any week-end reconciliation has settled
// before the fell-behind check evaluates the prior week.
//
// Bounded reads — same `lastActiveAt >= now - 30d` discipline as
// other sweep functions; we don't iterate the full users collection
// even on query failure.
//
// Implementation notes:
//   - "Prior week" is Mon..Sun in UTC (Monday-anchored per RunWk2;
//     it was Sun..Sat before that). The server runs in UTC and
//     `date` fields on saved runs are local-date strings — close
//     enough at the 50% threshold that timezone edges don't matter
//     for the prompt trigger.
//   - "Real saved run" mirrors the volume-eligibility predicate
//     from `onRunCreated`: not invalid, not save-anyway, distance
//     ≥50m, duration ≥30s. Q5 P25 ("real activity only" for
//     gamification) carried forward.
//   - Freeform users + recovery-phase users are skipped — neither
//     has a prescriptive weekly target to fall behind on.
//   - Pure decision function (`_decideFellBehindFlag`) so the
//     logic gets exhaustive coverage without Firestore.

/* Fell-behind week decision helpers — moved to lib/fellBehindWeek.js
   (audit batch 6, extraction 2a; pure, unit-testable without Firestore).
   Local `_` aliases keep every internal call site + the historical
   test-surface exports identical. */
const fellBehindWeek = require("./lib/fellBehindWeek");
const _priorWeekUtcRange = fellBehindWeek.priorWeekUtcRange;
const _fellBehindRatio = fellBehindWeek.fellBehindRatio;
const _decideFellBehindFlag = fellBehindWeek.decideFellBehindFlag;

// Volume-eligibility predicate lives in `./lib/runEligibility.js`
// (mirrors `src/lib/runStatsEligibility.ts`). Aliased locally to
// preserve the existing `_isVolumeEligibleRun` test-surface export.
const _isVolumeEligibleRun = isVolumeEligibleRun;

/** Per-user worker. Reads profile + programState + prior-week
 *  saved runs, runs the pure decision, applies the write when
 *  needed. Errors caught + logged per-user — one bad user doesn't
 *  break the sweep. */
async function _runWeeklyFellBehindCheckForUser(uid, range) {
  const ctx = await readUserProgramContext(uid);
  if (!ctx) {
    return { action: "noop" };
  }
  const { userRef, programRef, profile, programState } = ctx;

  // Bounded query — only the prior week, never the full subscription.
  let priorWeekRuns = [];
  try {
    const runsSnap = await userRef
      .collection("runs")
      .where("date", ">=", range.weekStart)
      .where("date", "<=", range.weekEnd)
      .get();
    priorWeekRuns = runsSnap.docs.map((d) => d.data() || {});
  } catch (err) {
    console.warn(
      `weeklyFellBehindCheck: runs query failed for ${uid}: ${err.message}`
    );
  }

  const decision = _decideFellBehindFlag(
    profile,
    programState,
    priorWeekRuns,
    range.weekKey
  );
  if (decision.action === "noop") {
    return decision;
  }

  // R1A: tombstone guard immediately before the write.
  if (
    !(await accountDeletionLocks.shouldSystemWriteProceed(
      db,
      uid,
      "weeklyFellBehindCheck"
    ))
  ) {
    return { action: "noop" };
  }

  if (decision.action === "clear") {
    // Use FieldValue.delete() to actually drop the field rather
    // than setting it to null (cleaner read shape on the client).
    await programRef.set(
      {
        pendingFellBehindPrompt: admin.firestore.FieldValue.delete(),
      },
      { merge: true }
    );
  } else {
    // "set"
    await programRef.set(decision.payload, { merge: true });
  }
  return decision;
}

// ── Scheduled: weekly fell-behind check (Mondays 05:00 UTC) ──

exports.weeklyFellBehindCheck = functions
  .runWith(SCHEDULED_CAP)
  .pubsub.schedule("0 5 * * 1")
  .timeZone("Etc/UTC")
  .onRun(() =>
    jobRuns.recordJobRun(db, "weeklyFellBehindCheck", async () => {
      let summary = null;
      try {
        console.log("weeklyFellBehindCheck: starting");
        const range = _priorWeekUtcRange(Date.now());
        console.log(
          `weeklyFellBehindCheck: evaluating week ${range.weekKey} ` +
            `(${range.weekStart}..${range.weekEnd})`
        );
        let setCount = 0;
        let clearCount = 0;
        summary = await sweepActiveUsers({
          name: "weeklyFellBehindCheck",
          cutoffDays: 30,
          perUser: async (uid) => {
            const decision = await _runWeeklyFellBehindCheckForUser(uid, range);
            if (decision.action === "set") setCount += 1;
            if (decision.action === "clear") clearCount += 1;
          },
        });
        console.log(
          `weeklyFellBehindCheck: done — set=${setCount}, clear=${clearCount}`
        );
      } catch (err) {
        console.error("weeklyFellBehindCheck: fatal error:", {
          message: err.message,
          stack: err.stack,
        });
        // Recorded as failed (lib/jobRuns.js), not as a success.
        throw err;
      }
      return summary;
    })
  );

exports._priorWeekUtcRange = _priorWeekUtcRange;
exports._isVolumeEligibleRun = _isVolumeEligibleRun;
exports._fellBehindRatio = _fellBehindRatio;
exports._decideFellBehindFlag = _decideFellBehindFlag;
exports._runWeeklyFellBehindCheckForUser = _runWeeklyFellBehindCheckForUser;

// ═══════════════════════════════════════════════════════════════
// Partner streaks: the one way a bond is made. The rules refuse every
// client create, because only a transaction can count each person's
// bonds against the limit (lib/partnerBonds.js). A restricted account
// is refused, as the rules refused it, and so is one being deleted.
// ═══════════════════════════════════════════════════════════════
const partnerBonds = require("./lib/partnerBonds");

exports.startPartnerStreak = functions
  .runWith(DEFAULT_HTTP_CAP)
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "Auth required.");
    }
    const uid = context.auth.uid;
    await accountDeletionLocks.assertCallableActorNotDeleting(
      admin.firestore(),
      uid
    );
    await restriction.assertNotRestricted(admin.firestore(), uid, functions);
    if (await isRateLimited(uid, "partnerStreakStart", 10, 600_000)) {
      throw new functions.https.HttpsError(
        "resource-exhausted",
        "Too many requests. Try again in a few minutes."
      );
    }
    try {
      return await partnerBonds.startPartnerBond({
        firestore: admin.firestore(),
        uid,
        partnerUid: data?.partnerUid,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch (err) {
      if (err instanceof partnerBonds.PartnerBondError) {
        throw new functions.https.HttpsError(err.code, err.reason, {
          reason: err.reason,
        });
      }
      functions.logger.error("startPartnerStreak failed", err);
      throw new functions.https.HttpsError("internal", "Something went wrong.");
    }
  });

// ═══════════════════════════════════════════════════════════════
// GOALS-CORE-01 (slice 3) — Goal Space membership callables.
// Server-owned membership: the rules lock goalSpaces/{id} + members
// to `write: if false`, so these callables are the ONLY writers.
// Logic lives in lib/goalSpaceMembership (injected-firestore, unit-
// tested); this wiring adds auth, the deletion actor-lock, rate
// limits and HttpsError mapping. GsPb1 lock: invite-only, max 8,
// free at launch (no entitlement gate).
// ═══════════════════════════════════════════════════════════════
const goalSpaceMembership = require("./lib/goalSpaceMembership");
const { randomUUID: goalSpaceRandomId, randomInt } = require("crypto");

// Short, human-shareable invite code: 8 chars from an unambiguous
// alphabet (no 0/1/I/L/O/U) so "K7P4-9M2H" reads the same spoken, typed,
// or texted. 30^8 ≈ 6.5e11 combinations; codes are reserved with a
// collision-retry, and Circles cap at 8 members, so this is ample for a
// bearer invite token.
const GOAL_SPACE_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";
function goalSpaceInviteCode() {
  let out = "";
  for (let i = 0; i < 8; i++) {
    out += GOAL_SPACE_CODE_ALPHABET[randomInt(GOAL_SPACE_CODE_ALPHABET.length)];
  }
  return out;
}

/** Safe display projection from the caller's own profile doc —
 *  never trusted from client input. */
async function goalSpaceCallerProfile(uid) {
  const snap = await admin.firestore().doc(`users/${uid}`).get();
  const data = snap.exists ? snap.data() : {};
  return {
    displayName: data.displayName || "Member",
    photoURL: data.photoURL || null,
  };
}

function mapGoalSpaceError(err) {
  if (err instanceof goalSpaceMembership.GoalSpaceError) {
    return new functions.https.HttpsError(err.code, err.message);
  }
  functions.logger.error("goalSpace callable failed", err);
  return new functions.https.HttpsError("internal", "Something went wrong.");
}

/* `reachesOthers`: the action puts this person in front of the other
   members (starting or joining a Circle, a check-in, backing one), so a
   restricted account is refused it (S4e). Leaving and removing are not. */
async function goalSpaceCallableGate(
  context,
  action,
  limit,
  { reachesOthers = false } = {}
) {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Auth required.");
  }
  const uid = context.auth.uid;
  await accountDeletionLocks.assertCallableActorNotDeleting(
    admin.firestore(),
    uid
  );
  if (reachesOthers) {
    await restriction.assertNotRestricted(admin.firestore(), uid, functions);
  }
  const limited = await isRateLimited(uid, action, limit, 600_000);
  if (limited) {
    throw new functions.https.HttpsError(
      "resource-exhausted",
      "Too many requests. Try again in a few minutes."
    );
  }
  return uid;
}

exports.createGoalSpace = functions
  .runWith(DEFAULT_HTTP_CAP)
  .https.onCall(async (data, context) => {
    const uid = await goalSpaceCallableGate(context, "goalSpaceCreate", 5, {
      reachesOthers: true,
    });
    const profile = await goalSpaceCallerProfile(uid);
    try {
      return await goalSpaceMembership.createGoalSpace({
        firestore: admin.firestore(),
        uid,
        displayName: profile.displayName,
        photoURL: profile.photoURL,
        input: data || {},
        now: Date.now(),
        makeId: goalSpaceRandomId,
        makeCode: goalSpaceInviteCode,
      });
    } catch (err) {
      throw mapGoalSpaceError(err);
    }
  });

exports.joinGoalSpace = functions
  .runWith(DEFAULT_HTTP_CAP)
  .https.onCall(async (data, context) => {
    const uid = await goalSpaceCallableGate(context, "goalSpaceJoin", 10, {
      reachesOthers: true,
    });
    const profile = await goalSpaceCallerProfile(uid);
    try {
      await goalSpaceMembership.joinGoalSpace({
        firestore: admin.firestore(),
        uid,
        displayName: profile.displayName,
        photoURL: profile.photoURL,
        spaceId: data?.spaceId,
        inviteCode: data?.inviteCode,
        code: data?.code,
        now: Date.now(),
        makeId: goalSpaceRandomId,
      });
      return { ok: true };
    } catch (err) {
      throw mapGoalSpaceError(err);
    }
  });

/* The owner's new invite code: the old one stops working at once, and
   the new one works for seven days (lib/goalSpaceMembership). Handing
   out a way in reaches the people who use it, so a restricted owner is
   refused it as they are refused starting a Circle. */
exports.renewGoalSpaceInviteCode = functions
  .runWith(DEFAULT_HTTP_CAP)
  .https.onCall(async (data, context) => {
    const uid = await goalSpaceCallableGate(context, "goalSpaceRenewCode", 10, {
      reachesOthers: true,
    });
    try {
      return await goalSpaceMembership.renewGoalSpaceInviteCode({
        firestore: admin.firestore(),
        uid,
        spaceId: String(data?.spaceId || ""),
        now: Date.now(),
        makeCode: goalSpaceInviteCode,
      });
    } catch (err) {
      throw mapGoalSpaceError(err);
    }
  });

exports.leaveGoalSpace = functions
  .runWith(DEFAULT_HTTP_CAP)
  .https.onCall(async (data, context) => {
    const uid = await goalSpaceCallableGate(context, "goalSpaceLeave", 10);
    try {
      await goalSpaceMembership.leaveGoalSpace({
        firestore: admin.firestore(),
        uid,
        spaceId: String(data?.spaceId || ""),
      });
      return { ok: true };
    } catch (err) {
      throw mapGoalSpaceError(err);
    }
  });

exports.removeGoalSpaceMember = functions
  .runWith(DEFAULT_HTTP_CAP)
  .https.onCall(async (data, context) => {
    const uid = await goalSpaceCallableGate(context, "goalSpaceRemove", 10);
    try {
      await goalSpaceMembership.removeGoalSpaceMember({
        firestore: admin.firestore(),
        uid,
        spaceId: String(data?.spaceId || ""),
        memberUid: data?.memberUid,
      });
      return { ok: true };
    } catch (err) {
      throw mapGoalSpaceError(err);
    }
  });

// ── SOCIAL-FOCUS-01 — server-owned weekly check-in + focus backing.
// The rules drop 'weekly_check_in' from the client-creatable event
// kinds: these callables are the ONLY check-in writers, which is what
// makes the deterministic ${uid}_${weekKey} event ID (one check-in
// per member per week; focus changes update in place) enforceable.
const goalSpaceCheckIn = require("./lib/goalSpaceCheckIn");

exports.goalSpaceWeeklyCheckIn = functions
  .runWith(DEFAULT_HTTP_CAP)
  .https.onCall(async (data, context) => {
    const uid = await goalSpaceCallableGate(context, "goalSpaceCheckIn", 10, {
      reachesOthers: true,
    });
    try {
      return await goalSpaceCheckIn.weeklyCheckIn({
        firestore: admin.firestore(),
        uid,
        spaceId: String(data?.spaceId || ""),
        weekKey: data?.weekKey,
        weeklyFocus: data?.weeklyFocus,
        now: Date.now(),
      });
    } catch (err) {
      throw mapGoalSpaceError(err);
    }
  });

exports.backGoalSpaceCheckIn = functions
  .runWith(DEFAULT_HTTP_CAP)
  .https.onCall(async (data, context) => {
    const uid = await goalSpaceCallableGate(context, "goalSpaceBack", 20, {
      reachesOthers: true,
    });
    try {
      const result = await goalSpaceCheckIn.backWeeklyCheckIn({
        firestore: admin.firestore(),
        uid,
        spaceId: String(data?.spaceId || ""),
        eventId: String(data?.eventId || ""),
      });
      if (!result.alreadyBacked) {
        // Generic AND anonymous by design: the copy never carries the
        // focus, and `anonymous` keeps the backer's uid out of the
        // stored doc (the recipient can read their own notification
        // docs — UI-only anonymity would not be anonymity). No push.
        // A notification failure is non-fatal — the back is recorded,
        // and a retry would be alreadyBacked (no duplicate notify).
        try {
          await socialFanout.createNotification({
            firestore: admin.firestore(),
            fromUid: uid,
            toUid: result.authorUid,
            anonymous: true,
            data: {
              type: "circle_focus_backed",
              message: "A Circle member backed your weekly focus",
            },
            serverTimestamp: admin.firestore.FieldValue.serverTimestamp,
          });
        } catch (notifErr) {
          functions.logger.warn("backGoalSpaceCheckIn.notification_failed", {
            message: notifErr && notifErr.message,
          });
        }
      }
      return { ok: true, alreadyBacked: result.alreadyBacked };
    } catch (err) {
      throw mapGoalSpaceError(err);
    }
  });

// ── CIRCLE-TARGET-LIFECYCLE / CONTINUATION — owner resolves a Circle
// whose targetDate has passed (client detects "reached" from the date
// it already loads). continue = new future targetDate; wrap =
// active:false + endedAt. Space doc is server-only-writable, so this
// callable is the only lifecycle-transition path.
const goalSpaceLifecycle = require("./lib/goalSpaceLifecycle");

exports.resolveGoalSpaceTarget = functions
  .runWith(DEFAULT_HTTP_CAP)
  .https.onCall(async (data, context) => {
    const uid = await goalSpaceCallableGate(
      context,
      "goalSpaceResolveTarget",
      10
    );
    try {
      return await goalSpaceLifecycle.resolveTarget({
        firestore: admin.firestore(),
        uid,
        spaceId: String(data?.spaceId || ""),
        action: data?.action,
        newTargetDate: data?.newTargetDate,
        now: Date.now(),
      });
    } catch (err) {
      throw mapGoalSpaceError(err);
    }
  });

// ── CIRCLE-ACTIVITY-NOTIFICATIONS — fan an in-app notification to the
// other Circle members when a co-member publishes a high-signal event.
// Only these four kinds notify: session_completed is too frequent (and
// already shows in the timeline), and weekly_check_in has its own
// SOCIAL-FOCUS-01 backing loop. NAMED (unlike circle_focus_backed): a
// co-member can already see the author + event in the shared timeline,
// so naming the actor is consistent, not a leak. No push (matches the
// SOCIAL-FOCUS-01 lock). Deterministic notification id per recipient
// (`${spaceId}_${eventId}`) makes the at-least-once trigger idempotent.
/** How many events one member may add to one Circle in an hour. */
const CIRCLE_EVENTS_PER_HOUR = 20;

const CIRCLE_EVENT_NOTIFICATION_TYPES = {
  milestone: "circle_milestone",
  needs_support: "circle_needs_support",
  joined: "circle_joined",
  routine_shared: "circle_routine_shared",
};

exports.onGoalSpaceEventCreated = functions
  .runWith({ ...TRIGGER_CAP, failurePolicy: true })
  .firestore.document("goalSpaces/{spaceId}/events/{eventId}")
  .onCreate(async (snap, context) => {
    const { spaceId, eventId } = context.params;
    // Retried: each member's notification has a fixed id, so a retry
    // rewrites the ones that landed and adds the ones that did not.
    if (pastRetryWindow(context)) return null;
    const event = snap.data() || {};
    // A member writes an event's note straight to Firestore, where the
    // rules can bound its length but cannot read it. One the word filter
    // refuses comes out before anyone is told of it, as a feed comment
    // does (onCommentCreated); the app refuses it first.
    if (profanityFilter.containsProfanity(event.text)) {
      await snap.ref.delete();
      functions.logger.info("onGoalSpaceEventCreated.removed_objectionable", {
        spaceId,
        eventId,
      });
      return null;
    }
    const authorUid = event.uid;
    if (!authorUid) return null;

    // R1A — if the author is mid-deletion, skip the fan-out. Do NOT
    // delete the event (unlike onActivityCreated): it's a legitimate
    // member-created timeline entry, and the deletion sweep
    // (cleanupGoalSpacesForUser) removes their events separately.
    const proceed = await accountDeletionLocks.shouldSystemWriteProceed(
      db,
      authorUid,
      "onGoalSpaceEventCreated"
    );
    if (!proceed) return null;

    // A member writes events straight to Firestore, as fast as a client can
    // send them, and each notifying one reaches every co-member (survey
    // item 20). Past twenty an hour in one Circle, far past a real day's
    // sessions and milestones, an event comes out before anyone is told of
    // it. The weekly check-in is the callable's, one per week, so it is not
    // counted. Acceptance is marked on the source in the SAME quota
    // transaction: an at-least-once redelivery must never count again and
    // delete an event that was already accepted. A failed count throws for
    // retry before any delete/notification, keeping what the member wrote.
    if (
      event.kind !== "weekly_check_in" &&
      (await rateLimiter.isRateLimited(
        db,
        authorUid,
        `circleEvent_${spaceId}`,
        CIRCLE_EVENTS_PER_HOUR,
        3_600_000,
        { receiptRef: snap.ref }
      ))
    ) {
      functions.logger.info("onGoalSpaceEventCreated.over_rate", {
        spaceId,
        eventId,
      });
      return null;
    }

    const notifType = CIRCLE_EVENT_NOTIFICATION_TYPES[event.kind];
    if (!notifType) return null; // non-notifying kind

    try {
      const [membersSnap, authorSnap] = await Promise.all([
        db.collection(`goalSpaces/${spaceId}/members`).get(),
        db.doc(`goalSpaces/${spaceId}/members/${authorUid}`).get(),
      ]);
      const authorName =
        (authorSnap.exists && authorSnap.data().displayName) ||
        "A Circle member";
      // Member doc ids ARE member uids. Fan out to everyone but the
      // author (createNotification also no-ops any self-notify).
      const recipients = membersSnap.docs
        .map((d) => d.id)
        .filter((memberUid) => memberUid !== authorUid);
      await Promise.all(
        recipients.map((memberUid) =>
          socialFanout.createNotification({
            firestore: admin.firestore(),
            fromUid: authorUid,
            toUid: memberUid,
            data: { type: notifType, fromName: authorName },
            serverTimestamp: admin.firestore.FieldValue.serverTimestamp,
            notificationId: `${spaceId}_${eventId}`,
            sourceEvent: socialFanout.notificationSourceEvent(snap, context),
          })
        )
      );
    } catch (err) {
      functions.logger.warn("onGoalSpaceEventCreated.fanout_failed", {
        spaceId,
        eventId,
        message: err && err.message,
      });
      throw err;
    }
    return null;
  });

/**
 * The follow notices: "X started following you", "X asked to follow you"
 * and "X accepted your follow request". Each fires on a doc a client
 * writes (socialApi), so these triggers are the only place the server sees
 * a follow, a request or an answer. Each id is fixed per person, so the
 * same person following, asking or accepting again refreshes one row
 * instead of adding another, and its source receipt makes a retry of the
 * same event keep the delivery time the recipient has already seen.
 * createNotification holds the block check and each recipient's switch,
 * and skips an account that is being deleted.
 */
async function sendFollowNotice({
  toUid,
  fromUid,
  type,
  verb,
  logKey,
  sourceEvent,
}) {
  try {
    const profileSnap = await db.doc(`users/${fromUid}/public/profile`).get();
    const fromName =
      (profileSnap.exists && profileSnap.data().displayName) || "Someone";
    await socialFanout.createNotification({
      firestore: admin.firestore(),
      fromUid,
      toUid,
      data: { type, fromName, message: `${fromName} ${verb}` },
      serverTimestamp: admin.firestore.FieldValue.serverTimestamp,
      notificationId: `${type}_${fromUid}`,
      sourceEvent,
    });
  } catch (err) {
    functions.logger.warn(`${logKey}.notification_failed`, {
      uid: toUid,
      fromUid,
      message: err && err.message,
    });
    throw err;
  }
}

/**
 * onFollowerCreated — "X started following you", for the people who turn
 * New followers on in Settings → Notifications (S3: off by default, so
 * createNotification skips everyone else before writing anything).
 *
 * A follow the person accepted from a request (`fromRequest` on the edge,
 * written by acceptFollowRequest) tells them nothing, since they have just
 * said yes. It tells the person who asked instead: "X accepted your follow
 * request", under the Follow requests switch. Only the person asked can
 * write an edge carrying `fromRequest` (firestore.rules), so the notice
 * cannot be forged by the asker.
 */
exports.onFollowerCreated = functions
  .runWith({ ...TRIGGER_CAP, failurePolicy: true })
  .firestore.document("followers/{uid}/users/{followerUid}")
  .onCreate(async (snap, context) => {
    const { uid, followerUid } = context.params;
    if (!uid || !followerUid || uid === followerUid) return null;
    // Retried: the notification's id is fixed per follower (above).
    if (pastRetryWindow(context)) return null;
    if (snap.data() && snap.data().fromRequest === true) {
      await sendFollowNotice({
        toUid: followerUid,
        fromUid: uid,
        type: "follow_accepted",
        verb: "accepted your follow request",
        logKey: "onFollowerCreated",
        sourceEvent: socialFanout.notificationSourceEvent(snap, context),
      });
      return null;
    }
    await sendFollowNotice({
      toUid: uid,
      fromUid: followerUid,
      type: "follow",
      verb: "started following you",
      logKey: "onFollowerCreated",
      sourceEvent: socialFanout.notificationSourceEvent(snap, context),
    });
    return null;
  });

/**
 * onFollowRequestCreated — "X asked to follow you" (Polish2 call 4). An
 * account approves each follower unless it turns that off, so following it
 * writes a request (`followRequests/{uid}/users/{requesterUid}`) instead.
 * Follow requests are on by default in Settings → Notifications: a request
 * nobody hears about just waits.
 */
exports.onFollowRequestCreated = functions
  .runWith({ ...TRIGGER_CAP, failurePolicy: true })
  .firestore.document("followRequests/{uid}/users/{requesterUid}")
  .onCreate(async (snap, context) => {
    const { uid, requesterUid } = context.params;
    if (!uid || !requesterUid || uid === requesterUid) return null;
    // Retried: the notification's id is fixed per asker (above).
    if (pastRetryWindow(context)) return null;
    await sendFollowNotice({
      toUid: uid,
      fromUid: requesterUid,
      type: "follow_request",
      verb: "asked to follow you",
      logKey: "onFollowRequestCreated",
      sourceEvent: socialFanout.notificationSourceEvent(snap, context),
    });
    return null;
  });

/**
 * onBlockWritten — keeps `blockedBy/{blocked}/users/{blocker}` matching
 * `blocks/{blocker}/users/{blocked}` (Polish3 call 1), so the app of the
 * person blocked can leave the blocker out of everything it shows them.
 * Only the person blocking can read their block; this row is the copy the
 * other person's app reads (lib/blockMirror.js).
 *
 * On every write, and each delivery sets the row to what the block is now,
 * read in the transaction that writes it, so a retry or a delivery out of
 * order changes nothing that is already right.
 */
exports.onBlockWritten = functions
  .runWith({ ...TRIGGER_CAP, failurePolicy: true })
  .firestore.document("blocks/{blockerUid}/users/{blockedUid}")
  .onWrite(async (_change, context) => {
    if (pastRetryWindow(context)) return null;
    const { blockerUid, blockedUid } = context.params;
    const result = await blockMirror.reconcileBlockMirror({
      firestore: admin.firestore(),
      blockerUid,
      blockedUid,
    });
    functions.logger.info("onBlockWritten.reconciled", { result });
    return null;
  });

/**
 * setBoardSharing — the person's answer to "Show my week" on friends'
 * boards (Polish2 call 5). Yes stores the answer and computes this week's
 * tally at once (friendsBoard.js); no stores the answer and deletes the
 * tally. The answer is server-written, so the tally and the answer cannot
 * disagree because a client wrote one and not the other.
 *
 * A restricted account cannot start sharing (it reaches no one, S4e) but
 * can always stop.
 */
exports.setBoardSharing = functions
  .runWith(DEFAULT_HTTP_CAP)
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "Sign in first.");
    }
    const uid = context.auth.uid;
    const share = data && data.share;
    if (typeof share !== "boolean") {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "share must be true or false."
      );
    }
    await accountDeletionLocks.assertCallableActorNotDeleting(
      admin.firestore(),
      uid
    );
    if (share) await restriction.assertNotRestricted(db, uid, functions);
    const limited = await isRateLimited(uid, "boardSharing", 10, 60_000);
    if (limited) {
      throw new functions.https.HttpsError(
        "resource-exhausted",
        "Too many attempts. Try again in a minute."
      );
    }
    await friendsBoard.setBoardSharing(db, uid, share);
    return { share };
  });

// ══════════════════════════════════════════════
// ROAD-AWARE ROUTE PLANNING (Run11 — Mapbox supersession 2026-07-17)
// ══════════════════════════════════════════════

/**
 * planRunningRoute — Pro-gated proxy to the Mapbox Directions walking
 * network (lib/routePlanning.js owns the pure logic). Two actions:
 *
 *   { action: "align", waypoints: [{lat,lon} x2..12] }
 *   { action: "loop",  start: {lat,lon}, targetKm: 3|5|10|15 }
 *
 * Returns { points: [{lat,lon}], distanceM, durationS } only. Request
 * coordinates are never persisted or logged (privacy contract in the
 * rollout doc) — failures log action + error code, nothing else. The
 * Pro gate is the Run11 lock's enforceable half: the token lives only
 * in Secret Manager, so entitlement is checked where the key is.
 */
exports.planRunningRoute = functions
  .runWith({ ...DEFAULT_HTTP_CAP, secrets: [MAPBOX_DIRECTIONS_TOKEN] })
  .https.onCall(async (data, context) => {
    // The published Mapbox Product Terms (2026-10-20, §§1.9 and 2.10.1)
    // prohibit storing Directions results. Our client saves the returned
    // geometry as a planned route. Keep the callable closed even to older
    // client builds until a replacement router or explicit licence is in
    // place; hiding the buttons in new bundles is not a server boundary.
    // This source-level hold also covers direct calls from older app builds.
    // Re-enable only in a reviewed change with a licensed routing provider.
    const roadRoutingReleased = false;
    if (!roadRoutingReleased) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Road routing is unavailable."
      );
    }
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "Auth required.");
    }
    const uid = context.auth.uid;
    const firestore = admin.firestore();
    await accountDeletionLocks.assertCallableActorNotDeleting(firestore, uid);

    const userSnap = await firestore.doc(`users/${uid}`).get();
    const tier = _computeEffectiveTier(
      userSnap.exists ? userSnap.data() : null
    );
    if (tier !== "pro") {
      throw new functions.https.HttpsError("permission-denied", "pro-required");
    }

    const action = data && data.action;
    const isAlign = action === "align";
    const isLoop = action === "loop";
    if (!isAlign && !isLoop) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Unknown action."
      );
    }

    // Per-action rate limits from the rollout doc: 15 manual alignments /
    // 10 min, 4 loop generations / 10 min (each loop ≤4 provider calls).
    const limited = await isRateLimited(
      uid,
      isAlign ? "planRouteAlign" : "planRouteLoop",
      isAlign ? 15 : 4,
      600_000
    );
    if (limited) {
      throw new functions.https.HttpsError(
        "resource-exhausted",
        "Too many route requests. Try again in a few minutes."
      );
    }

    const token = process.env.MAPBOX_DIRECTIONS_TOKEN;
    if (!token) {
      // Bound secret missing at runtime — misconfiguration, not user error.
      functions.logger.error("routePlanning.failed", {
        action,
        code: "token-missing",
      });
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Route planning is not configured."
      );
    }

    try {
      if (isAlign) {
        const waypoints = routePlanning.validateAlignWaypoints(
          data && data.waypoints
        );
        return await routePlanning.alignToRoads({
          fetchImpl: fetch,
          token,
          waypoints,
        });
      }
      const loopRequest = routePlanning.validateLoopRequest(data);
      return await routePlanning.generateLoop({
        fetchImpl: fetch,
        token,
        start: loopRequest.start,
        targetKm: loopRequest.targetKm,
      });
    } catch (error) {
      if (error instanceof routePlanning.RoutePlanningError) {
        // No coordinates in logs — action + bounded code + numeric HTTP
        // status only. The status is what distinguishes a dead/quota'd
        // token (401/403/429) from a genuinely unroutable request.
        functions.logger.warn("routePlanning.failed", {
          action,
          code: error.code,
          status: typeof error.status === "number" ? error.status : null,
        });
        if (error.code === "invalid-request") {
          throw new functions.https.HttpsError(
            "invalid-argument",
            "Invalid route request."
          );
        }
        if (error.code === "no-route") {
          throw new functions.https.HttpsError(
            "not-found",
            "No route found for those points."
          );
        }
        throw new functions.https.HttpsError(
          "unavailable",
          "Route planning is temporarily unavailable."
        );
      }
      throw error;
    }
  });
