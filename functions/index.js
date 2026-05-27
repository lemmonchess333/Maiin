const functions = require("firebase-functions");
const admin = require("firebase-admin");
const cors = require("cors")({ origin: true });

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
const { utcDateString, parseUtcDate } = require("./lib/dateUtils");
const { isVolumeEligibleRun } = require("./lib/runEligibility");
const checkoutTrial = require("./lib/checkoutTrial");
const subscriptionReconciliation = require("./lib/subscriptionReconciliation");
const aiScanQuota = require("./lib/aiScanQuota");
const socialCounters = require("./lib/socialCounters");
const socialFanout = require("./lib/socialFanout");

const appleIAP = require("./appleIAP");
exports.verifyApplePurchase = appleIAP.verifyApplePurchase;
exports.appleIAPWebhook = appleIAP.appleIAPWebhook;
exports.restoreApplePurchases = appleIAP.restoreApplePurchases;

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
// Account deletion logic. Extracted so the call-ordering invariant
// (Firestore + Storage before Auth-user delete; pre-W1f had the
// inverse, leaving orphans) is unit-testable with stub handles —
// see functions/__tests__/accountDeletion.test.js.
const accountDeletion = require("./accountDeletion");
// UGC profanity gate. Used by the onActivityCreated /
// onCommentCreated triggers below to auto-flag or auto-delete
// objectionable content (App Store Guideline 1.2 requirement).
const profanityFilter = require("./profanityFilter");
// Admin-uid allowlist for moderation callables. Trust boundary for
// the listPendingReports / resolveReport / hideActivity surfaces.
const adminAuth = require("./adminAuth");

// Payment endpoints use a tighter cors config keyed off the same
// origin allowlist as Stripe return URLs. AI / food-analysis
// endpoints stay on the permissive `cors` above — they're already
// gated by Bearer auth and don't carry the same blast radius.
// See helpers.getAppCorsOptions for the rejection-via-Error
// short-circuit semantics.
const corsForPayments = require("cors")(helpers.getAppCorsOptions());

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
const TRIGGER_CAP = { maxInstances: 50 };

// 2026-05-26 audit PR 4 (finding #10) — Vertex AI response redactor.
// Logs structural metadata only; never the actual user-facing text /
// inputs. See functions/lib/vertexLogRedaction.js for the contract.
const { redactVertexResponse } = require("./lib/vertexLogRedaction");

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
  .runWith(DEFAULT_HTTP_CAP)
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
          const stripeKey =
            process.env.STRIPE_SECRET_KEY ||
            (functions.config().stripe && functions.config().stripe.secret_key);
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
      return { ok: true };
    } catch (err) {
      // Kill-switch trip is an intentional operator-controlled abort,
      // not an internal failure. Surface as `failed-precondition` with
      // a structured `details.reason` so the client can branch on a
      // typed code instead of substring-matching the message.
      if (err && err.code === "executor-disabled") {
        functions.logger.warn("deleteMyAccount.kill_switch_trip", { uid });
        throw new functions.https.HttpsError(
          "failed-precondition",
          "Account deletion is temporarily paused. Please try again later.",
          { reason: "executor-disabled" }
        );
      }
      functions.logger.error("deleteMyAccount.error", {
        uid,
        message: err && err.message,
      });
      throw new functions.https.HttpsError("internal", err.message);
    }
  });

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

// ══════════════════════════════════════════════
// MONTHLY SCAN QUOTA — per-user, Firestore-backed
// ══════════════════════════════════════════════

const SCAN_LIMITS = { free: 10, pro: 300 };

/** Delegates to helpers.computeEffectiveTier — see helpers.js for docs. */
const _computeEffectiveTier = helpers.computeEffectiveTier;

/** Delegates to helpers.currentMonthCount — see helpers.js for docs. */
const _currentMonthCount = helpers.currentMonthCount;

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
/** Delegates to rateLimiter.checkMonthlyQuota — see rateLimiter.js for docs. */
async function checkMonthlyQuota(uid) {
  return rateLimiter.checkMonthlyQuota(admin.firestore(), uid);
}

// Pure helpers exported for unit-testability. Not part of the public
// Cloud Functions API; the underscore prefix marks them as
// implementation detail. When a functions/ test runner is wired
// (audit P0 #1 follow-up), tests should import these via
// `require("./index")` and exercise the predicates without booting
// Firestore.
exports._pruneOldTimestamps = _pruneOldTimestamps;
exports._computeEffectiveTier = _computeEffectiveTier;
exports._currentMonthCount = _currentMonthCount;
exports._SCAN_LIMITS = SCAN_LIMITS;

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

    // Rate limit: 5 onboarding attempts per 10 minutes
    const limited = await isRateLimited(uid, "onboarding", 5, 600_000);
    if (limited) {
      throw new functions.https.HttpsError(
        "resource-exhausted",
        "Too many attempts. Please wait."
      );
    }

    try {
      // Validate required fields
      const {
        profileData: rawProfileData,
        programState,
        weekSchedule: rawWeekSchedule,
      } = data;
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
      // server-managed regardless of what the client sent.
      profileData.uid = uid;
      profileData.subscriptionTier = "free";
      profileData.onboardingComplete = true;

      const db = admin.firestore();

      // Check if profile already exists (preserve trialExpiresAt, createdAt)
      const userRef = db.collection("users").doc(uid);
      const existing = await userRef.get();

      if (existing.exists) {
        // Don't overwrite protected fields on update
        delete profileData.trialExpiresAt;
        delete profileData.createdAt;
      } else {
        // New profile: set defaults
        if (!profileData.trialExpiresAt) {
          const d = new Date();
          d.setDate(d.getDate() + 7);
          profileData.trialExpiresAt = d.toISOString();
        }
        if (!profileData.createdAt) {
          profileData.createdAt = admin.firestore.FieldValue.serverTimestamp();
        }
      }

      // P0-4: atomic batch write so profile + programState land
      // together. Pre-P0-4 wrote them sequentially; if the second
      // write failed, the user was left with a hydrated profile but no
      // programState — onboarding completed flag set, but Programme
      // tab crashed on its first render. A batch commits both or
      // neither, matching the contract the spec expects.
      const programRef = userRef.collection("programState").doc("current");
      const batch = db.batch();
      if (existing.exists) {
        batch.set(userRef, profileData, { merge: true });
      } else {
        batch.set(userRef, profileData);
      }
      batch.set(programRef, programState);
      await batch.commit();

      return { success: true };
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

    // Same rate-limit envelope as onboarding. The Configure Plan
    // wizard is a deliberate user action with a confirm step, not a
    // hot path, so 5/10min is plenty even on retake flows.
    const limited = await isRateLimited(uid, "configurePlan", 5, 600_000);
    if (limited) {
      throw new functions.https.HttpsError(
        "resource-exhausted",
        "Too many attempts. Please wait."
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

      // Atomic — same rationale as completeOnboarding above. The
      // profile patch and programState rebuild commit together or
      // not at all.
      const batch = db.batch();
      batch.set(userRef, profileUpdates, { merge: true });
      batch.set(programRef, programState);
      await batch.commit();

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
// EXISTING — analyzeFood (untouched)
// ══════════════════════════════════════════════

exports.analyzeFood = functions
  .runWith(DEFAULT_HTTP_CAP)
  .https.onRequest((req, res) => {
    cors(req, res, async () => {
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

        // Remote kill switch — operators flip `geminiEnabled=false` in
        // config/flags to cut off scans instantly if costs spike or
        // Vertex AI is returning bad data. Checked before rate limit so
        // disabled-state requests don't eat a user's quota window.
        if (!(await isFlagEnabled("geminiEnabled"))) {
          res.status(503).json({
            error:
              "AI food scan is temporarily unavailable. Please use manual entry.",
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
              "Rate limit reached. Please wait before analyzing more food.",
          });
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
              error:
                "Couldn't verify your scan quota. Please try again in a moment.",
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

        const { imageBase64 } = req.body;
        if (!imageBase64) {
          res.status(400).json({ error: "No image provided" });
          return;
        }

        const projectId = process.env.GCLOUD_PROJECT;
        const accessToken = await admin.credential
          .applicationDefault()
          .getAccessToken();

        const prompt =
          'Analyze this food image and provide nutritional estimates. Return ONLY a valid JSON object with this exact format, no other text: {"foodName": "name of the food/meal", "items": [{"name": "item name", "portionSize": "estimated portion", "calories": 0, "protein": 0, "carbs": 0, "fat": 0}], "totalCalories": 0, "totalProtein": 0, "totalCarbs": 0, "totalFat": 0, "confidence": "high/medium/low"}';

        const url =
          "https://us-central1-aiplatform.googleapis.com/v1/projects/" +
          projectId +
          "/locations/us-central1/publishers/google/models/gemini-2.0-flash:generateContent";

        const response = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: "Bearer " + accessToken.access_token,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            contents: [
              {
                role: "user",
                parts: [
                  { text: prompt },
                  { inlineData: { mimeType: "image/jpeg", data: imageBase64 } },
                ],
              },
            ],
            generationConfig: {
              temperature: 0.1,
              maxOutputTokens: 1024,
            },
          }),
        });

        const data = await response.json();
        // 2026-05-26 audit PR 4 (finding #10) — success-path full-body
        // log dropped; structural-metadata log on the error path only.
        if (!response.ok) {
          console.error(
            "Vertex AI error:",
            redactVertexResponse(data, { httpStatus: response.status })
          );
          res.status(500).json({ error: "AI service error" });
          return;
        }

        let responseText = "";
        if (
          data.candidates &&
          data.candidates[0] &&
          data.candidates[0].content &&
          data.candidates[0].content.parts
        ) {
          responseText = data.candidates[0].content.parts[0].text;
        } else if (data.predictions && data.predictions[0]) {
          responseText = data.predictions[0];
        } else {
          console.error(
            "Unexpected response format:",
            redactVertexResponse(data, { httpStatus: response.status })
          );
          res.status(500).json({ error: "Unexpected AI response format" });
          return;
        }

        const cleaned = responseText
          .replace(/```json\n?/g, "")
          .replace(/```\n?/g, "")
          .trim();
        const nutrition = JSON.parse(cleaned);

        res.status(200).json(nutrition);
      } catch (error) {
        console.error("Error analyzing food:", error);
        res.status(500).json({ error: "Failed to analyze food image" });
      }
    });
  });

// ══════════════════════════════════════════════
// AI TEXT FOOD PARSING (Pro feature)
// ══════════════════════════════════════════════

exports.analyzeFoodText = functions
  .runWith(DEFAULT_HTTP_CAP)
  .https.onRequest((req, res) => {
    cors(req, res, async () => {
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

        // Remote kill switch — shared flag with analyzeFood. One toggle
        // disables both modalities so scan pricing stays predictable.
        if (!(await isFlagEnabled("geminiEnabled"))) {
          res.status(503).json({
            error:
              "AI food scan is temporarily unavailable. Please use manual entry.",
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
              "Rate limit reached. Please wait before analyzing more food.",
          });
          return;
        }

        // F1b — daily text-AI scan quota. Independent of image_ai
        // (lock pin #7). Free=10/day, Pro=100/day server-side cap.
        const quota = await aiScanQuota.checkDailyAiQuota(admin.firestore(), {
          uid: authUser.uid,
          action: aiScanQuota.ACTION_TEXT_AI,
        });
        if (!quota.allowed) {
          if (quota.error === "quota-check-failed") {
            res.status(503).json({
              error:
                "Couldn't verify your scan quota. Please try again in a moment.",
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

        const { text } = req.body;
        if (!text || !text.trim()) {
          res.status(400).json({ error: "No text provided" });
          return;
        }

        const projectId = process.env.GCLOUD_PROJECT;
        const accessToken = await admin.credential
          .applicationDefault()
          .getAccessToken();

        const prompt = `You are a nutrition expert. Parse this food description and estimate accurate macronutrient values per serving.
Return ONLY a valid JSON object with this exact format, no other text:
{"foodName": "short summary name", "items": [{"name": "item name", "portionSize": "estimated portion", "calories": 0, "protein": 0, "carbs": 0, "fat": 0}], "totalCalories": 0, "totalProtein": 0, "totalCarbs": 0, "totalFat": 0, "confidence": "high/medium/low"}

Be accurate with calorie and macro estimates. Use standard serving sizes unless the user specifies a quantity.

Food description: "${text.replace(/"/g, '\\"')}"`;

        const url =
          "https://us-central1-aiplatform.googleapis.com/v1/projects/" +
          projectId +
          "/locations/us-central1/publishers/google/models/gemini-2.0-flash:generateContent";

        const response = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: "Bearer " + accessToken.access_token,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            contents: [
              {
                role: "user",
                parts: [{ text: prompt }],
              },
            ],
            generationConfig: {
              temperature: 0.2,
              maxOutputTokens: 1024,
            },
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          console.error(
            "Vertex AI error:",
            redactVertexResponse(data, { httpStatus: response.status })
          );
          res.status(500).json({ error: "AI service error" });
          return;
        }

        let responseText = "";
        if (
          data.candidates &&
          data.candidates[0] &&
          data.candidates[0].content &&
          data.candidates[0].content.parts
        ) {
          responseText = data.candidates[0].content.parts[0].text;
        } else {
          console.error(
            "Unexpected response format:",
            redactVertexResponse(data, { httpStatus: response.status })
          );
          res.status(500).json({ error: "Unexpected AI response format" });
          return;
        }

        const cleaned = responseText
          .replace(/```json\n?/g, "")
          .replace(/```\n?/g, "")
          .trim();
        const nutrition = JSON.parse(cleaned);

        res.status(200).json(nutrition);
      } catch (error) {
        console.error("Error analyzing food text:", error);
        res.status(500).json({ error: "Failed to analyze food description" });
      }
    });
  });

// ══════════════════════════════════════════════
// GEMINI TEXT PROXY — keeps API key server-side
// ══════════════════════════════════════════════

exports.askGeminiText = functions
  .runWith(DEFAULT_HTTP_CAP)
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "Auth required.");
    }
    const uid = context.auth.uid;
    // R1A-Deletion: actor lock. askGeminiText writes rateLimits/{uid}_askGemini.
    await accountDeletionLocks.assertCallableActorNotDeleting(
      admin.firestore(),
      uid
    );

    // Rate limit: 5 calls per 60 seconds per user
    const limited = await isRateLimited(uid, "askGemini", 5, 60_000);
    if (limited) {
      throw new functions.https.HttpsError(
        "resource-exhausted",
        "Rate limit reached. Please wait a moment before trying again."
      );
    }

    const { prompt } = data;
    if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "prompt is required."
      );
    }

    // Cap prompt length to prevent abuse
    if (prompt.length > 5000) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Prompt too long (max 5000 characters)."
      );
    }

    try {
      const projectId = process.env.GCLOUD_PROJECT;
      const accessToken = await admin.credential
        .applicationDefault()
        .getAccessToken();

      const url =
        "https://us-central1-aiplatform.googleapis.com/v1/projects/" +
        projectId +
        "/locations/us-central1/publishers/google/models/gemini-2.0-flash:generateContent";

      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: "Bearer " + accessToken.access_token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 1024,
          },
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        console.error(
          "askGeminiText: Vertex AI error:",
          redactVertexResponse(result, { httpStatus: response.status })
        );
        throw new functions.https.HttpsError("internal", "AI service error");
      }

      let responseText = "";
      if (
        result.candidates &&
        result.candidates[0] &&
        result.candidates[0].content &&
        result.candidates[0].content.parts
      ) {
        responseText = result.candidates[0].content.parts[0].text;
      } else {
        console.error(
          "askGeminiText: unexpected response format:",
          redactVertexResponse(result, { httpStatus: response.status })
        );
        throw new functions.https.HttpsError(
          "internal",
          "Unexpected AI response format"
        );
      }

      return { text: responseText };
    } catch (err) {
      if (err instanceof functions.https.HttpsError) throw err;
      console.error("askGeminiText error:", err.message);
      throw new functions.https.HttpsError("internal", "AI request failed");
    }
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

// FOLLOWUP(payment-security): tighten per-uid rate limiting on
//   createCheckoutSession; the existing 5/10min check uses body.uid
//   pre-reorder semantics and should re-key on authUser.uid.
exports.createCheckoutSession = functions
  .runWith(DEFAULT_HTTP_CAP)
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
        // a new checkout that would recreate the user doc.
        try {
          await accountDeletionLocks.assertCallableActorNotDeleting(
            admin.firestore(),
            uid
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
          res
            .status(429)
            .json({ error: "Too many checkout attempts. Please wait." });
          return;
        }

        // Stripe secret key from Firebase config or environment
        const stripeKey =
          process.env.STRIPE_SECRET_KEY ||
          (functions.config().stripe && functions.config().stripe.secret_key);

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

exports.stripeWebhook = functions
  .runWith(DEFAULT_HTTP_CAP)
  .https.onRequest(async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const stripeKey =
      process.env.STRIPE_SECRET_KEY ||
      (functions.config().stripe && functions.config().stripe.secret_key);
    const webhookSecret =
      process.env.STRIPE_WEBHOOK_SECRET ||
      (functions.config().stripe && functions.config().stripe.webhook_secret);

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
    // duplicate delivery re-runs the same write. We claim the event
    // before processing and finalise after. If `claim` already exists
    // we acknowledge (200) and skip — Stripe stops retrying.
    const eventRef = dbRef.collection("stripeEvents").doc(event.id);
    try {
      const existing = await eventRef.get();
      if (existing.exists) {
        console.log(
          `stripeWebhook: duplicate delivery for ${event.id}, skipping`
        );
        res.status(200).json({ received: true, duplicate: true });
        return;
      }
    } catch (err) {
      // Failure to read the dedup doc shouldn't break webhook processing
      // entirely, but log it loudly — we lose idempotency for this event.
      console.error(
        `stripeWebhook: idempotency lookup failed for ${event.id}:`,
        err.message
      );
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

          console.log(
            `stripeWebhook: updated ${userDoc.id} to ${tier} (status: ${status})`
          );
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

          // PR D: out-of-order + subscription-id-match + lifetime
          // protection. Three reasons we might want to ignore a
          // `deleted` event:
          //   (a) lifetime entitlement — never downgraded by sub events.
          //   (b) the stored subscription ID doesn't match — a
          //       different subscription was deleted, ours is still
          //       active.
          //   (c) staleness — a newer update already happened.
          if (userData.planKind === "lifetime") {
            console.log(
              `stripeWebhook: skipping subscription.deleted for ${userDoc.id} — lifetime entitlement`
            );
            break;
          }

          if (
            userData.stripeSubscriptionId &&
            userData.stripeSubscriptionId !== subscription.id
          ) {
            console.log(
              `stripeWebhook: ignoring subscription.deleted for ${userDoc.id} — sub IDs differ (stored=${userData.stripeSubscriptionId}, event=${subscription.id})`
            );
            break;
          }

          const lastUpdate = Number(userData.subscriptionUpdatedAt) || 0;
          if (event.created && event.created <= lastUpdate) {
            console.log(
              `stripeWebhook: ignoring stale subscription.deleted for ${userDoc.id} (event=${event.created}, last=${lastUpdate})`
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
      // Storing the event.id with a TTL-ish expiresAt for ops cleanup.
      try {
        await eventRef.set({
          type: event.type,
          created: event.created || null,
          processedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      } catch (err) {
        // Already processed but we couldn't write the record — Stripe
        // may retry. The handlers above are idempotent on retry because
        // of the out-of-order/sub-id-match guards.
        console.error(
          `stripeWebhook: failed to record processed event ${event.id}:`,
          err.message
        );
      }

      res.status(200).json({ received: true });
    } catch (err) {
      console.error("stripeWebhook: processing error:", err.message);
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
  isInRollingWindow,
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
        "Too many requests. Please wait."
      );
    }

    const weekKey = data.weekKey || null;

    try {
      const result = await computeAndWritePerformanceForUser(uid, weekKey);
      return result;
    } catch (err) {
      console.error("computePerformanceWeek error:", err);
      throw new functions.https.HttpsError("internal", err.message);
    }
  });

// ══════════════════════════════════════════════
// SHARED ACTIVE-USERS SWEEP SCAFFOLD
// ══════════════════════════════════════════════
//
// Four scheduled functions iterate active users in lockstep:
// weeklyPerformanceRollup, dailyPerformanceRefresh,
// dailyRaceReconciliationSweep, weeklyFellBehindCheck. All share
// the same shape:
//
//   1. Query `users` filtered by `lastActiveAt >= cutoff` (fail
//      loud — never fall back to a full scan, runaway-cost risk).
//   2. Chunk the uid list into batches of 10 and run each batch
//      with `Promise.all` for bounded concurrency.
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
  };
}

async function sweepActiveUsers({ name, cutoffDays, perUser }) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - cutoffDays);
  const cutoffTs = admin.firestore.Timestamp.fromDate(cutoff);

  let usersSnap;
  try {
    usersSnap = await db
      .collection("users")
      .where("lastActiveAt", ">=", cutoffTs)
      .get();
  } catch (err) {
    console.error(
      `${name}: lastActiveAt query failed, skipping run:`,
      err.message
    );
    return;
  }

  const uids = usersSnap.docs.map((d) => d.id);
  console.log(`${name}: processing ${uids.length} users`);

  for (let i = 0; i < uids.length; i += 10) {
    const batch = uids.slice(i, i + 10);
    await Promise.all(
      batch.map(async (uid) => {
        try {
          await perUser(uid);
        } catch (err) {
          console.error(`${name}: failed for ${uid}:`, err.message);
        }
      })
    );
  }
}

// ── 2) Scheduled: weekly rollup (Sundays 23:15 UTC) ──

exports.weeklyPerformanceRollup = functions.pubsub
  .schedule("15 23 * * 0")
  .timeZone("Europe/London")
  .onRun(async () => {
    try {
      console.log("weeklyPerformanceRollup: starting");
      await sweepActiveUsers({
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
    }
    return null;
  });

// ── 3) Scheduled: daily refresh (02:10 UTC) ──

exports.dailyPerformanceRefresh = functions.pubsub
  .schedule("10 2 * * *")
  .timeZone("Europe/London")
  .onRun(async () => {
    try {
      console.log("dailyPerformanceRefresh: starting");
      await sweepActiveUsers({
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
    }
    return null;
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

const RACE_NO_SHOW_GRACE_DAYS = 3;
const RECOVERY_EXIT_GRACE_DAYS = 7;
const RACE_STRICT_DISTANCE_RATIO_FNS = 0.95;
const PLANNED_RACE_DISTANCE_METERS_FNS = {
  "5k": 5000,
  "10k": 10000,
  half: 21097,
  marathon: 42195,
};

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
function _hasStrictRaceMatch(savedRunsForDate, plannedDistanceMeters) {
  if (!Array.isArray(savedRunsForDate) || savedRunsForDate.length === 0) {
    return false;
  }
  for (const r of savedRunsForDate) {
    if (!r || r.isInvalid === true || r.savedAnyway === true) continue;
    if (r.actualTemplateId !== "race") continue;
    if (typeof r.distance !== "number") continue;
    if (!plannedDistanceMeters || plannedDistanceMeters <= 0) {
      // Defensive — without a planned distance we can't gate on the
      // strict ratio. Treat any race-templated run as a match in
      // that case (matches client behavior at Q1 P29 fallback).
      return true;
    }
    if (r.distance / plannedDistanceMeters >= RACE_STRICT_DISTANCE_RATIO_FNS) {
      return true;
    }
  }
  return false;
}

/** Whether the race-no-show pass needs to fetch the bounded
 *  saved-run query for this user. Pure; called BEFORE the read so
 *  we can skip the I/O when grace / mode / status disqualify the
 *  user. */
function _needsRaceNoShowEvaluation(profile, programState, nowMs) {
  if (!profile || profile.runMode !== "race_prep") return false;
  const runPlan = (programState && programState.runPlan) || null;
  if (!runPlan || !runPlan.raceGoal) return false;
  const raceDate = runPlan.raceGoal.targetDate;
  if (typeof raceDate !== "string") return false;
  const raceDayRunDay = ((programState && programState.runDays) || []).find(
    (rd) => rd && rd.date === raceDate
  );
  if (!raceDayRunDay || raceDayRunDay.status !== "planned") return false;
  const dayMs = 24 * 60 * 60 * 1000;
  const daysPast = Math.floor(
    (nowMs - _parseUtcDate(raceDate).getTime()) / dayMs
  );
  return daysPast > RACE_NO_SHOW_GRACE_DAYS;
}

/** Pure decision function — given the user's profile, programState,
 *  the bounded saved-runs-for-race-date list, and `now`, returns
 *  the Firestore update payload to apply (or null when nothing
 *  needs to change). Idempotent — a second call with the post-write
 *  state returns null. Easy to test exhaustively without Firestore. */
function _decideReconciliationActions(
  profile,
  programState,
  savedRunsForRaceDate,
  nowMs
) {
  const updatePayload = {};
  let noShowWritten = false;
  let recoveryCleared = false;

  // ── L1 decision ────────────────────────────────────────────────
  if (_needsRaceNoShowEvaluation(profile, programState, nowMs)) {
    const runPlan = programState.runPlan;
    const raceDate = runPlan.raceGoal.targetDate;
    const raceDayRunDay = programState.runDays.find(
      (rd) => rd && rd.date === raceDate
    );
    const plannedDistance =
      PLANNED_RACE_DISTANCE_METERS_FNS[runPlan.raceGoal.distance] || 0;
    if (!_hasStrictRaceMatch(savedRunsForRaceDate, plannedDistance)) {
      const updatedRunDays = programState.runDays.map((rd) =>
        rd === raceDayRunDay ? { ...rd, status: "race_no_show" } : rd
      );
      updatePayload.runDays = updatedRunDays;
      noShowWritten = true;
    }
  }

  // ── L3 decision ────────────────────────────────────────────────
  const runPlan = (programState && programState.runPlan) || null;
  if (
    runPlan &&
    runPlan.phase === "recovery" &&
    typeof runPlan.recoveryEndDate === "string"
  ) {
    const exitMs = _parseUtcDate(runPlan.recoveryEndDate).getTime();
    const graceEndMs = exitMs + RECOVERY_EXIT_GRACE_DAYS * 24 * 60 * 60 * 1000;
    if (nowMs >= graceEndMs) {
      // Firestore `set(merge: true)` does a *recursive* merge of
      // nested maps — fields omitted from `runPlan` inside the
      // payload remain untouched in storage. JS-side `delete cleared.phase`
      // is therefore a no-op at the wire level and the user stays
      // stuck in `phase: 'recovery'` forever. Writing explicit
      // `null` overwrites the stored value; downstream readers all
      // check `phase === 'recovery'` and `typeof recoveryEndDate
      // === 'string'`, both of which falsify against null.
      updatePayload.runPlan = {
        ...runPlan,
        phase: null,
        recoveryEndDate: null,
      };
      recoveryCleared = true;
    }
  }

  if (!noShowWritten && !recoveryCleared) {
    return { payload: null, noShowWritten, recoveryCleared };
  }
  return { payload: updatePayload, noShowWritten, recoveryCleared };
}

/** Per-user worker. Thin I/O wrapper around `_decideReconciliationActions`.
 *  Reads profile + programState, fetches the race-day saved-runs
 *  bucket when the decision function says it'll need it, then
 *  applies the update (with the R1A tombstone guard immediately
 *  before the write). Returns a log payload for the outer loop. */
async function _runDailyRaceReconciliationForUser(uid) {
  const ctx = await readUserProgramContext(uid);
  if (!ctx) {
    return { noShowWritten: false, recoveryCleared: false };
  }
  const { userRef, programRef, profile, programState } = ctx;
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

  const { payload, noShowWritten, recoveryCleared } =
    _decideReconciliationActions(
      profile,
      programState,
      savedRunsForRaceDate,
      nowMs
    );

  if (!payload) {
    return { noShowWritten, recoveryCleared };
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
    return { noShowWritten: false, recoveryCleared: false };
  }
  await programRef.set(payload, { merge: true });
  return { noShowWritten, recoveryCleared };
}

// ── Scheduled: daily race-reconciliation sweep (04:00 UTC) ──

exports.dailyRaceReconciliationSweep = functions.pubsub
  .schedule("0 4 * * *")
  .timeZone("Etc/UTC")
  .onRun(async () => {
    try {
      console.log("dailyRaceReconciliationSweep: starting");
      let totalNoShow = 0;
      let totalRecoveryCleared = 0;
      await sweepActiveUsers({
        name: "dailyRaceReconciliationSweep",
        cutoffDays: 30,
        perUser: async (uid) => {
          const { noShowWritten, recoveryCleared } =
            await _runDailyRaceReconciliationForUser(uid);
          if (noShowWritten) totalNoShow += 1;
          if (recoveryCleared) totalRecoveryCleared += 1;
        },
      });
      console.log(
        `dailyRaceReconciliationSweep: done — ` +
          `noShow=${totalNoShow}, recoveryCleared=${totalRecoveryCleared}`
      );
    } catch (err) {
      console.error("dailyRaceReconciliationSweep: fatal error:", {
        message: err.message,
        stack: err.stack,
      });
    }
    return null;
  });

// Test surface — the per-user worker is the meaningful unit. Export
// it (and the helpers) under leading-underscore aliases so unit
// tests can drive specific paths without spinning up the pubsub
// harness end-to-end.
exports._runDailyRaceReconciliationForUser = _runDailyRaceReconciliationForUser;
exports._hasStrictRaceMatch = _hasStrictRaceMatch;
exports._utcDateString = _utcDateString;
exports._decideReconciliationActions = _decideReconciliationActions;
exports._needsRaceNoShowEvaluation = _needsRaceNoShowEvaluation;

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

const RECOVERY_WEEKS_BY_DISTANCE_FNS = {
  "5k": 1,
  "10k": 2,
  half: 3,
  marathon: 4,
};

/** Pure decision function for the recovery-entry write triggered
 *  by `onRunCreated`. Returns `{ write, payload?, raceDayRunDayId?,
 *  recoveryEndDate? }`. Easy to test exhaustively without Firestore
 *  — same pattern as L1+L3's `_decideReconciliationActions`. */
function _decideRecoveryEntry(profile, programState, savedRun) {
  // Gate 1 — user must be in race_prep mode with a race goal +
  // active runPlan.
  if (!profile || profile.runMode !== "race_prep") {
    return { write: false };
  }
  const runPlan = (programState && programState.runPlan) || null;
  if (!runPlan || !runPlan.raceGoal || !runPlan.raceGoal.targetDate) {
    return { write: false };
  }
  const raceDate = runPlan.raceGoal.targetDate;

  // Gate 2 — saved run must be on the race date. Q1 P4 is strict
  // on date for race claims (no day-late / day-early forgiveness).
  if (!savedRun || savedRun.date !== raceDate) {
    return { write: false };
  }

  // Gate 2b — reject invalid / save-anyway runs. A user who hit
  // "Save anyway" on a borked GPS trace (impossible pace, partial
  // crash recovery) must not trip recovery entry off a junk save
  // that they explicitly flagged as invalid.
  if (savedRun.isInvalid === true || savedRun.savedAnyway === true) {
    return { write: false };
  }

  // Gate 3 — saved run must be race-templated. RunSummary stores the
  // resolved template as `actualTemplateId` (planMetadata flattened
  // to top-level); there is no plain `templateId` field on the doc.
  if (savedRun.actualTemplateId !== "race") {
    return { write: false };
  }

  // Gate 4 — saved run must clear the ≥95% planned-distance bar
  // (Q1 P4 strict). Defensive 0-planned fallback per Q1 P29 —
  // unconfigured race goal accepts any distance.
  const plannedDistance =
    PLANNED_RACE_DISTANCE_METERS_FNS[runPlan.raceGoal.distance] || 0;
  if (plannedDistance > 0) {
    if (typeof savedRun.distance !== "number") return { write: false };
    if (savedRun.distance / plannedDistance < RACE_STRICT_DISTANCE_RATIO_FNS) {
      return { write: false };
    }
  }

  // Gate 5 — race-day runDay must exist in the plan.
  const raceDayRunDay = ((programState && programState.runDays) || []).find(
    (rd) => rd && rd.date === raceDate
  );
  if (!raceDayRunDay || !raceDayRunDay.id) {
    return { write: false };
  }

  // Gate 6 — per-race idempotency (Q2 P28). If this runDay's id is
  // already in completedRaces, recovery already entered for this
  // race; no-op even if the user re-logs.
  const completedRaces = Array.isArray(runPlan.completedRaces)
    ? runPlan.completedRaces
    : [];
  if (completedRaces.includes(raceDayRunDay.id)) {
    return { write: false };
  }

  // All gates passed — compute the recovery end date and build the
  // runPlan update. Recovery clock anchors on the race date so the
  // user's countdown reads correctly even if the trigger fires
  // hours after the actual run.
  const distanceKey = runPlan.raceGoal.distance;
  const recoveryWeeks = RECOVERY_WEEKS_BY_DISTANCE_FNS[distanceKey];
  if (typeof recoveryWeeks !== "number") {
    // Unknown distance string — defensive bail. Real values are
    // gated by the onboarding UI; this guard protects against
    // schema drift.
    return { write: false };
  }
  const recoveryEndMs =
    _parseUtcDate(raceDate).getTime() + recoveryWeeks * 7 * 24 * 60 * 60 * 1000;
  const recoveryEndDate = _utcDateString(new Date(recoveryEndMs));

  const updatedRunPlan = {
    ...runPlan,
    phase: "recovery",
    recoveryEndDate,
    completedRaces: [...completedRaces, raceDayRunDay.id],
  };

  return {
    write: true,
    payload: { runPlan: updatedRunPlan },
    raceDayRunDayId: raceDayRunDay.id,
    recoveryEndDate,
  };
}

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
    const ctx = await readUserProgramContext(uid);
    if (!ctx) {
      return;
    }
    const { programRef, profile, programState } = ctx;

    const decision = _decideRecoveryEntry(profile, programState, savedRun);
    if (!decision.write) {
      return;
    }

    await programRef.set(decision.payload, { merge: true });
    console.log(
      `onRunCreated: recovery-entry written for ${uid} ` +
        `(runDay=${decision.raceDayRunDayId}, endDate=${decision.recoveryEndDate})`
    );
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

async function syncChallengeProgress(uid, metric, incrementBy) {
  try {
    const challengesSnap = await db.collection("challenges").get();
    const now = new Date();

    for (const doc of challengesSnap.docs) {
      const challenge = doc.data();
      // Only update active challenges matching this metric
      const endDate =
        challenge.endDate && challenge.endDate.toDate
          ? challenge.endDate.toDate()
          : null;
      if (endDate && endDate < now) continue;
      if (challenge.metric !== metric) continue;

      // Check if user is a participant
      const participantRef = db
        .collection("challenges")
        .doc(doc.id)
        .collection("participants")
        .doc(uid);
      const participantSnap = await participantRef.get();
      if (!participantSnap.exists()) continue;

      const current = participantSnap.data().currentValue || 0;
      const newValue = current + incrementBy;

      // Compute tier
      const tiers = challenge.tiers || {};
      let tierAchieved = null;
      if (newValue >= (tiers.gold || Infinity)) tierAchieved = "gold";
      else if (newValue >= (tiers.silver || Infinity)) tierAchieved = "silver";
      else if (newValue >= (tiers.bronze || Infinity)) tierAchieved = "bronze";

      await participantRef.set(
        { currentValue: newValue, tierAchieved },
        { merge: true }
      );
    }
  } catch (err) {
    console.error(
      `syncChallengeProgress: error for ${uid}/${metric}:`,
      err.message
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
  runDurationSeconds
) {
  try {
    if (!(runDistanceMeters > 0) || !(runDurationSeconds > 0)) return;

    const challengesSnap = await db
      .collection("challenges")
      .where("metric", "==", "fastest_effort")
      .get();
    const now = new Date();

    for (const doc of challengesSnap.docs) {
      const challenge = doc.data();
      const endDate =
        challenge.endDate && challenge.endDate.toDate
          ? challenge.endDate.toDate()
          : null;
      if (endDate && endDate < now) continue;

      const target = challenge.targetDistance || 0;
      if (target <= 0) continue;
      if (runDistanceMeters < target) continue; // run didn't reach target

      const participantRef = db
        .collection("challenges")
        .doc(doc.id)
        .collection("participants")
        .doc(uid);
      const participantSnap = await participantRef.get();
      if (!participantSnap.exists()) continue;

      const existingBest = participantSnap.data().currentValue || 0;
      // 0 = no best yet, so first qualifying run always wins.
      // Otherwise keep the lower (faster) time.
      const newBest =
        existingBest === 0
          ? Math.round(runDurationSeconds)
          : Math.min(existingBest, Math.round(runDurationSeconds));

      // For fastest_effort, tiers are time thresholds: lower is better.
      // Gold tier = quickest threshold; user qualifies if newBest <= tier.
      const tiers = challenge.tiers || {};
      let tierAchieved = null;
      if (tiers.gold && newBest <= tiers.gold) tierAchieved = "gold";
      else if (tiers.silver && newBest <= tiers.silver) tierAchieved = "silver";
      else if (tiers.bronze && newBest <= tiers.bronze) tierAchieved = "bronze";

      await participantRef.set(
        { currentValue: newBest, tierAchieved },
        { merge: true }
      );
    }
  } catch (err) {
    console.error(`syncFastestEffortProgress: error for ${uid}:`, err.message);
  }
}

// ── 4) Trigger: instant recompute on new workout ──

exports.onWorkoutCreated = functions
  .runWith(TRIGGER_CAP)
  .firestore.document("users/{uid}/workouts/{workoutId}")
  .onCreate(async (snap, context) => {
    const { uid } = context.params;
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
    try {
      const data = snap.data();

      await db
        .collection("users")
        .doc(uid)
        .set(
          { lastActiveAt: admin.firestore.FieldValue.serverTimestamp() },
          { merge: true }
        );

      // Auto-progress workout_count challenges
      await syncChallengeProgress(uid, "workout_count", 1);

      // Auto-progress total_volume challenges (if volume data available)
      if (data.totalVolume) {
        await syncChallengeProgress(uid, "total_volume", data.totalVolume);
      }

      if (data.date) {
        const currentKey = getWeekKey(new Date());
        // PI1a: skip recompute when the workout falls outside the
        // rolling 7-day window (was: outside the current Sunday-week).
        if (!isInRollingWindow(data.date, currentKey)) {
          console.log(
            `onWorkoutCreated: skipping recompute for ${uid}, workout on ${data.date} outside rolling window ending ${currentKey}`
          );
          return null;
        }
      }

      const canRun = await acquireCooldownLock(uid);
      if (!canRun) {
        console.log(`onWorkoutCreated: cooldown active for ${uid}, skipping`);
        return null;
      }

      try {
        await computeAndWritePerformanceForUser(uid, null);
        await releaseLock(uid, true);
        console.log(`onWorkoutCreated: computed performance for ${uid}`);
      } catch (err) {
        await releaseLock(uid, false, err.message);
        console.error(
          `onWorkoutCreated: compute error for ${uid}:`,
          err.message
        );
      }
    } catch (err) {
      console.error("onWorkoutCreated: fatal error:", {
        uid,
        message: err.message,
        stack: err.stack,
      });
    }
    return null;
  });

// ── 5) Trigger: instant recompute on new run ──

exports.onRunCreated = functions
  .runWith(TRIGGER_CAP)
  .firestore.document("users/{uid}/runs/{runId}")
  .onCreate(async (snap, context) => {
    const { uid } = context.params;
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
    try {
      const data = snap.data();

      // `lastActiveAt` keeps bumping even for isInvalid / savedAnyway
      // runs — "user interacted with the app" is a reasonable read,
      // and tightening this would make the active-users pipeline
      // (weeklyPerformanceRollup / dailyPerformanceRefresh) drop
      // users who only ever save-anyway short runs. Out of scope
      // per the P0.5 plan.
      await db
        .collection("users")
        .doc(uid)
        .set(
          { lastActiveAt: admin.firestore.FieldValue.serverTimestamp() },
          { merge: true }
        );

      // P0.5 follow-up: gate challenge + fastest-effort updates on
      // the same volume-eligibility predicate the app-side
      // aggregations use. Pre-fix, the trigger only checked
      // `distance > 0` / `duration > 0`, which let a fat-fingered
      // "too-fast" save (e.g. 20km / 0:08, isInvalid + savedAnyway
      // both true with positive distance) bump km challenges and
      // fastest-effort PRs. Inline equivalent of `isVolumeEligible`
      // from src/lib/runStatsEligibility.ts (functions/ is plain
      // JS / excluded from the TS path alias, so direct import
      // isn't available). Missing flags default to "not flagged"
      // so pre-PR-#480 legacy writes still progress as before.
      const isCountable =
        data.isInvalid !== true &&
        data.savedAnyway !== true &&
        (Number(data.distance) || 0) >= 50 &&
        (Number(data.duration) || 0) >= 30;

      if (isCountable) {
        // Auto-progress km-based challenges
        const distanceKm =
          data.distanceKm || (data.distance ? data.distance / 1000 : 0);
        if (distanceKm > 0) {
          await syncChallengeProgress(
            uid,
            "total_km",
            Math.round(distanceKm * 100) / 100
          );
        }

        // PR 5: fastest_effort uses MIN-update semantics, separate
        // sync path. Pass distance in metres + duration in seconds;
        // the helper gates on runDistance >= challenge.targetDistance.
        const runDistanceMeters = data.distance || distanceKm * 1000 || 0;
        const runDurationSeconds = data.duration || 0;
        if (runDistanceMeters > 0 && runDurationSeconds > 0) {
          await syncFastestEffortProgress(
            uid,
            runDistanceMeters,
            runDurationSeconds
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

      if (data.completedAt) {
        const runDate = data.completedAt.toDate
          ? data.completedAt.toDate()
          : new Date(data.completedAt);
        const runDateStr = runDate.toISOString().split("T")[0];
        const currentKey = getWeekKey(new Date());
        // PI1a: skip recompute when the run falls outside the rolling
        // 7-day window (was: outside the current Sunday-week).
        if (!isInRollingWindow(runDateStr, currentKey)) {
          console.log(
            `onRunCreated: skipping recompute for ${uid}, run on ${runDateStr} outside rolling window ending ${currentKey}`
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
        await computeAndWritePerformanceForUser(uid, null);
        await releaseLock(uid, true);
        console.log(`onRunCreated: computed performance for ${uid}`);
      } catch (err) {
        await releaseLock(uid, false, err.message);
        console.error(`onRunCreated: compute error for ${uid}:`, err.message);
      }
    } catch (err) {
      console.error("onRunCreated: fatal error:", {
        uid,
        message: err.message,
        stack: err.stack,
      });
    }
    return null;
  });

// ══════════════════════════════════════════════
// CREW WEEKLY LEADERBOARD ROLLUP
// ══════════════════════════════════════════════
//
// For every crew with at least one member, compute each member's
// this-week score on the crew's chosen `leaderboardMetric` and write
// the top-10 standings back to the crew doc as `currentLeaderboard`.
//
// Read paths:
//   - groups/{crewId}                  (crew metadata + leaderboardMetric)
//   - groups/{crewId}/members/{uid}    (member list, denormalised displayName)
//   - users/{uid}/workouts             (this-week, for total_volume / count / hybrid)
//   - users/{uid}/runs                 (this-week, for total_km / hybrid)
//
// Write path: groups/{crewId}.currentLeaderboard
//
// Scheduled daily so users see ~current-day standings during the week,
// not just a frozen end-of-week snapshot. Cost is bounded by the
// memberCount filter (limit(50) crews) and the per-member week-window
// queries (limit(100) each); for 50 crews × ~10 members × 2 colls = at
// most ~1000 small reads per run.

const CREW_LEADERBOARD_TOP_N = 10;
const CREW_MAX_PER_RUN = 50;

function _startOfIsoWeekUtc(date) {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  const dow = d.getUTCDay() || 7; // Sunday → 7 so Monday is the start
  d.setUTCDate(d.getUTCDate() - (dow - 1));
  return d;
}

function _isoWeekKey(date) {
  // ISO week year-week — used as the leaderboardWeek tag so the client
  // can show "Week of …" without a separate parse.
  const d = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

function _toDateKey(date) {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

async function _computeMemberWeekTotals(uid, weekStartTs, weekStartKey) {
  const [runsSnap, workoutsSnap] = await Promise.all([
    db
      .collection("users")
      .doc(uid)
      .collection("runs")
      .where("completedAt", ">=", weekStartTs)
      .orderBy("completedAt")
      .limit(100)
      .get()
      .catch(() => ({ docs: [] })),
    db
      .collection("users")
      .doc(uid)
      .collection("workouts")
      .where("date", ">=", weekStartKey)
      .orderBy("date")
      .limit(100)
      .get()
      .catch(() => ({ docs: [] })),
  ]);

  let km = 0;
  for (const d of runsSnap.docs) {
    // Volume-eligibility filter: crew leaderboards exclude invalid,
    // savedAnyway, and sub-threshold records. Plain JS inline
    // equivalent of `isVolumeEligible` from
    // src/lib/runStatsEligibility.ts; functions/ is excluded from
    // the TS path alias so we can't import it. Missing flags /
    // fields default to "not flagged" / 0 so legacy docs
    // (pre-PR #480) keep counting honestly.
    const data = d.data();
    if (data.isInvalid === true) continue;
    if (data.savedAnyway === true) continue;
    const distance = Number(data.distance) || 0;
    const duration = Number(data.duration) || 0;
    if (distance < 50) continue;
    if (duration < 30) continue;
    km += distance / 1000;
  }
  let kg = 0;
  for (const d of workoutsSnap.docs) {
    const exercises = d.data().exercises || [];
    for (const ex of exercises) {
      for (const set of ex.sets || []) {
        kg += (Number(set.weightKg) || 0) * (Number(set.reps) || 0);
      }
    }
  }
  return {
    km: Math.round(km * 10) / 10,
    kg: Math.round(kg),
    workoutCount: workoutsSnap.docs.length,
    runCount: runsSnap.docs.length,
  };
}

function _scoreFor(metric, totals) {
  switch (metric) {
    case "workout_count":
      return totals.workoutCount;
    case "total_volume":
      return totals.kg;
    case "total_km":
      return totals.km;
    case "hybrid_score":
    default:
      // Mirrors src/lib/personalTrajectory.ts so the crew leaderboard
      // and the user's solo trajectory card use the same formula.
      return Math.round(totals.km * 100 + totals.kg * 0.1);
  }
}

exports.crewWeeklyLeaderboardRollup = functions.pubsub
  .schedule("30 2 * * *")
  .timeZone("UTC")
  .onRun(async () => {
    try {
      console.log("crewWeeklyLeaderboardRollup: starting");

      const now = new Date();
      const weekStart = _startOfIsoWeekUtc(now);
      const weekStartTs = admin.firestore.Timestamp.fromDate(weekStart);
      const weekStartKey = _toDateKey(weekStart);
      const weekIso = _isoWeekKey(weekStart);

      let crewsSnap;
      try {
        crewsSnap = await db
          .collection("groups")
          .where("memberCount", ">", 0)
          .limit(CREW_MAX_PER_RUN)
          .get();
      } catch (err) {
        console.error(
          "crewWeeklyLeaderboardRollup: crews query failed:",
          err.message
        );
        return null;
      }

      console.log(
        `crewWeeklyLeaderboardRollup: rolling up ${crewsSnap.size} crews for ${weekIso}`
      );

      for (const crewDoc of crewsSnap.docs) {
        try {
          const crew = crewDoc.data();
          const metric = crew.leaderboardMetric || "hybrid_score";

          const membersSnap = await crewDoc.ref
            .collection("members")
            .limit(100)
            .get();
          if (membersSnap.empty) continue;

          const standings = [];
          for (const memberDoc of membersSnap.docs) {
            const uid = memberDoc.id;
            const memberData = memberDoc.data();
            // R1A-Deletion: per-UID tombstone guard inside the iteration.
            // Re-embedding a deleted user in the crew leaderboard array
            // would surface stale displayName + uid to other crew
            // members. Skipping the member here keeps them out of the
            // rebuilt top-N. Chunk 3's crewMemberships cleanup will
            // remove the member doc itself; this guard handles the
            // window between deletion-status flip and member-doc
            // removal.
            if (
              !(await accountDeletionLocks.shouldSystemWriteProceed(
                db,
                uid,
                "crewWeeklyLeaderboardRollup"
              ))
            ) {
              continue;
            }
            try {
              const totals = await _computeMemberWeekTotals(
                uid,
                weekStartTs,
                weekStartKey
              );
              standings.push({
                uid,
                displayName: memberData.displayName || "Athlete",
                score: _scoreFor(metric, totals),
                km: totals.km,
                kg: totals.kg,
                workoutCount: totals.workoutCount,
                runCount: totals.runCount,
              });
            } catch (err) {
              console.warn(
                `crewWeeklyLeaderboardRollup: member ${uid} compute failed:`,
                err.message
              );
            }
          }

          standings.sort((a, b) => b.score - a.score);
          const top = standings
            .slice(0, CREW_LEADERBOARD_TOP_N)
            .map((s, i) => ({ ...s, rank: i + 1 }));

          await crewDoc.ref.update({
            currentLeaderboard: top,
            leaderboardMetric: metric,
            leaderboardWeek: weekIso,
            leaderboardUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        } catch (err) {
          console.error(
            `crewWeeklyLeaderboardRollup: failed for crew ${crewDoc.id}:`,
            err.message
          );
        }
      }

      console.log("crewWeeklyLeaderboardRollup: done");
    } catch (err) {
      console.error("crewWeeklyLeaderboardRollup: fatal:", {
        message: err.message,
        stack: err.stack,
      });
    }
    return null;
  });

// On-demand companion: lets a logged-in user trigger a rollup for
// their own crew without waiting for the next 02:30 UTC run. Used by
// the "Refresh leaderboard" affordance on the Crew page (a manual
// pull-to-refresh-like fallback when you've just logged something
// and want the standings to reflect it). Only the user's primary
// crewId is allowed — no arbitrary crew computes from the client.
exports.refreshMyCrewLeaderboard = functions
  .runWith(DEFAULT_HTTP_CAP)
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "Auth required.");
    }
    const uid = context.auth.uid;
    const userSnap = await db.collection("users").doc(uid).get();
    const userCrewId = userSnap.exists ? userSnap.data().crewId : null;
    if (!userCrewId) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Not in a crew."
      );
    }

    const crewRef = db.collection("groups").doc(userCrewId);
    const crewSnap = await crewRef.get();
    if (!crewSnap.exists) {
      throw new functions.https.HttpsError("not-found", "Crew not found.");
    }
    const crew = crewSnap.data();
    const metric = crew.leaderboardMetric || "hybrid_score";

    const now = new Date();
    const weekStart = _startOfIsoWeekUtc(now);
    const weekStartTs = admin.firestore.Timestamp.fromDate(weekStart);
    const weekStartKey = _toDateKey(weekStart);
    const weekIso = _isoWeekKey(weekStart);

    const membersSnap = await crewRef.collection("members").limit(100).get();
    const standings = [];
    for (const memberDoc of membersSnap.docs) {
      const memberUid = memberDoc.id;
      const memberData = memberDoc.data();
      try {
        const totals = await _computeMemberWeekTotals(
          memberUid,
          weekStartTs,
          weekStartKey
        );
        standings.push({
          uid: memberUid,
          displayName: memberData.displayName || "Athlete",
          score: _scoreFor(metric, totals),
          km: totals.km,
          kg: totals.kg,
          workoutCount: totals.workoutCount,
          runCount: totals.runCount,
        });
      } catch (err) {
        console.warn(
          `refreshMyCrewLeaderboard: member ${memberUid} compute failed:`,
          err.message
        );
      }
    }
    standings.sort((a, b) => b.score - a.score);
    const top = standings
      .slice(0, CREW_LEADERBOARD_TOP_N)
      .map((s, i) => ({ ...s, rank: i + 1 }));

    await crewRef.update({
      currentLeaderboard: top,
      leaderboardMetric: metric,
      leaderboardWeek: weekIso,
      leaderboardUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return { ok: true, count: top.length, weekIso };
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
//      catches it. Hard-delete is the simpler invariant.
//
//   3. listPendingReports — admin-only callable. Returns reports
//      with `status: 'pending'` plus their target content for
//      review.
//
//   4. resolveReport — admin-only callable. Marks a report as
//      resolved + optionally hides the target activity in one
//      atomic write.
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
  .runWith(TRIGGER_CAP)
  .firestore.document("activities/{activityId}")
  .onCreate(async (snap, context) => {
    const activityId = context.params.activityId;
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
      // Fall through to fanout — a profanity-scan failure shouldn't
      // strand the activity. Re-flag manually via the report queue
      // if false-positive.
    }

    // 2026-05-26 audit PR 3 — server-side fan-out. Replaces the
    // client `postActivity` fan-out loop. /feeds writes are
    // server-only post-PR-3 so this is the only path that can
    // populate follower feeds.
    if (!authorId) return;
    try {
      const fanoutResult = await socialFanout.fanoutActivityToFeeds({
        firestore: admin.firestore(),
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
    } catch (err) {
      functions.logger.error("onActivityCreated.fanout_error", {
        activityId,
        authorId,
        message: err.message,
      });
    }
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
  .runWith(TRIGGER_CAP)
  .firestore.document("comments/{activityId}/items/{commentId}")
  .onCreate(async (snap, context) => {
    try {
      const data = snap.data();
      if (!profanityFilter.containsProfanity(data.text)) return;

      functions.logger.warn("onCommentCreated.auto_delete", {
        activityId: context.params.activityId,
        commentId: context.params.commentId,
        authorId: data.authorId,
      });

      // Write the audit record FIRST so a partial failure on
      // delete still leaves a trace.
      await admin
        .firestore()
        .collection("commentModeration")
        .add({
          action: "auto_delete",
          reason: "profanity",
          activityId: context.params.activityId,
          commentId: context.params.commentId,
          authorId: data.authorId || null,
          // Redact the offending text — the audit record holds the
          // cleaned form, not the original. Moderators don't need
          // to re-read the slur.
          textRedacted: profanityFilter.cleanProfanity(data.text || ""),
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

      await snap.ref.delete();
      // Best-effort: decrement the parent activity's commentCount
      // so the counter stays accurate. Wrapped in try so a stale
      // activity doc doesn't fail the cleanup.
      try {
        await admin
          .firestore()
          .doc(`activities/${context.params.activityId}`)
          .update({
            commentCount: admin.firestore.FieldValue.increment(-1),
          });
      } catch (_) {
        // Activity doc may have been deleted — silent.
      }
    } catch (err) {
      functions.logger.error("onCommentCreated.error", {
        activityId: context.params.activityId,
        commentId: context.params.commentId,
        message: err.message,
      });
    }
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
exports.listPendingReports = functions
  .runWith(ADMIN_HTTP_CAP)
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Sign-in required."
      );
    }
    adminAuth.assertAdminCallable(context.auth.uid);

    const reportsSnap = await admin
      .firestore()
      .collection("reports")
      .where("status", "==", "pending")
      .orderBy("createdAt", "desc")
      .limit(50)
      .get();

    const reports = [];
    for (const reportDoc of reportsSnap.docs) {
      const r = reportDoc.data();
      let target = null;
      try {
        if (r.targetType === "activity" && r.targetId) {
          const tSnap = await admin
            .firestore()
            .doc(`activities/${r.targetId}`)
            .get();
          if (tSnap.exists) {
            const t = tSnap.data();
            target = {
              authorId: t.authorId,
              authorName: t.authorName || null,
              type: t.type,
              caption: t.caption || null,
              workoutName: t.workoutName || null,
              runName: t.runName || null,
              visibility: t.visibility || null,
              flagged: t.flagged === true,
            };
          }
        } else if (r.targetType === "comment" && r.targetId) {
          // Comment IDs are scoped under activities; clients send
          // them as `activityId:commentId`. If a different shape
          // arrives the lookup silently fails and target stays
          // null — the moderator sees the report with no target
          // preview rather than a 500.
          const [aId, cId] = String(r.targetId).split(":");
          if (aId && cId) {
            const tSnap = await admin
              .firestore()
              .doc(`comments/${aId}/items/${cId}`)
              .get();
            if (tSnap.exists) {
              const t = tSnap.data();
              target = {
                authorId: t.authorId,
                authorName: t.authorName || null,
                text: t.text || null,
                activityId: aId,
              };
            }
          }
        } else if (r.targetType === "user" && r.targetId) {
          const tSnap = await admin
            .firestore()
            .doc(`users/${r.targetId}/public/profile`)
            .get();
          if (tSnap.exists) {
            const t = tSnap.data();
            target = {
              uid: r.targetId,
              displayName: t.displayName || null,
            };
          }
        }
      } catch (_) {
        // Target lookup failed (rules race, deleted doc); leave
        // target null. The report itself is still surfaced so the
        // moderator can dismiss / annotate.
      }
      reports.push({
        reportId: reportDoc.id,
        reporterId: r.reporterId,
        targetType: r.targetType,
        targetId: r.targetId,
        // S4e (PR #722): expose targetUid in the admin queue payload
        // so the Restrict-user button can gate on its presence (the
        // CF requires it; surfacing nullability here lets the UI hide
        // the button rather than fail the call).
        targetUid: r.targetUid || null,
        reason: r.reason,
        details: r.details || null,
        createdAt:
          (r.createdAt && r.createdAt.toMillis && r.createdAt.toMillis()) ||
          null,
        target,
      });
    }

    return { reports };
  });

/**
 * Admin-only: mark a report as resolved. Optional `hideActivity`
 * flag flips the target activity to `flagged: true,
 * visibility: 'private'` in the same call so a moderator can
 * dismiss + hide in one click.
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
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Request body required."
      );
    }
    const { reportId, hideActivity, restrictUser } = data;
    if (typeof reportId !== "string" || !reportId) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "reportId required."
      );
    }

    const reportRef = admin.firestore().doc(`reports/${reportId}`);
    const reportSnap = await reportRef.get();
    if (!reportSnap.exists) {
      throw new functions.https.HttpsError("not-found", "Report not found.");
    }
    const report = reportSnap.data();

    // S4e: restrictUser requires a targetUid on the report. Reports
    // about activities carry the activity author's uid as report.targetUid
    // (set when reportContent is called by the client). Reject restrict
    // requests if we can't identify the user to restrict.
    if (
      restrictUser === true &&
      (typeof report.targetUid !== "string" || !report.targetUid)
    ) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Cannot restrict user: report is missing targetUid."
      );
    }

    const batch = admin.firestore().batch();
    batch.update(reportRef, {
      status: "resolved",
      resolvedBy: context.auth.uid,
      resolvedAt: admin.firestore.FieldValue.serverTimestamp(),
      hideAppliedByAdmin: hideActivity === true,
      restrictAppliedByAdmin: restrictUser === true,
    });

    if (
      hideActivity === true &&
      report.targetType === "activity" &&
      report.targetId
    ) {
      const targetRef = admin.firestore().doc(`activities/${report.targetId}`);
      batch.update(targetRef, {
        flagged: true,
        flaggedBy: "admin",
        flaggedByAdminUid: context.auth.uid,
        flaggedAt: admin.firestore.FieldValue.serverTimestamp(),
        visibility: "private",
      });
    }

    // S4e: atomic restriction write. set() with merge:true so calling
    // resolveReport with restrictUser:true on an already-restricted user
    // updates lastActionedReport + restrictedAt without resetting other
    // fields. Atomicity preserved by being in the same batch as the
    // report-resolution update.
    if (restrictUser === true) {
      const restrictionRef = admin
        .firestore()
        .doc(`globalRestrictedUids/${report.targetUid}`);
      batch.set(
        restrictionRef,
        {
          uid: report.targetUid,
          restrictedAt: admin.firestore.FieldValue.serverTimestamp(),
          // S4e-P1: null on manual restriction; future S4d-full
          // auto-strike trigger populates restrictionEndsAt (30-day
          // window) and strikes (count toward auto-restrict at 3).
          restrictionEndsAt: null,
          strikes: null,
          lastActionedReport: reportId,
        },
        { merge: true }
      );
    }

    await batch.commit();
    return { ok: true };
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
    if (typeof activityId !== "string" || !activityId.trim()) {
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
    const limited = await isRateLimited(
      context.auth.uid,
      "toggleKudos",
      30,
      60_000
    );
    if (limited) {
      throw new functions.https.HttpsError(
        "resource-exhausted",
        "Too many kudos updates. Slow down."
      );
    }
    try {
      const result = await socialCounters.toggleKudos({
        firestore: admin.firestore(),
        uid: context.auth.uid,
        activityId,
        increment: admin.firestore.FieldValue.increment,
        serverTimestamp: admin.firestore.FieldValue.serverTimestamp,
      });
      // 2026-05-26 audit PR 3 (finding #6) — kudos notification is
      // now written server-side, atomically with the kudos doc.
      // Pre-PR-3 the client wrote `/notifications/...` directly
      // after the callable returned; that path is now rule-denied.
      // Only notify on the ADD edge (kudosed=true) so re-tapping
      // doesn't spam the recipient.
      if (result && result.kudosed) {
        try {
          const activitySnap = await admin
            .firestore()
            .collection("activities")
            .doc(activityId)
            .get();
          const activity = activitySnap.exists ? activitySnap.data() : null;
          if (
            activity &&
            activity.authorId &&
            activity.authorId !== context.auth.uid
          ) {
            const fromName =
              (data && typeof data.fromName === "string" && data.fromName) ||
              "Someone";
            await socialFanout.createNotification({
              firestore: admin.firestore(),
              fromUid: context.auth.uid,
              toUid: activity.authorId,
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
      functions.logger.warn("toggleKudosCallable.error", {
        uid: context.auth.uid,
        activityId,
        error: err && err.message,
      });
      throw new functions.https.HttpsError(
        "failed-precondition",
        (err && err.message) || "Kudos toggle failed."
      );
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
    const { activityId, text, authorName, authorPhotoURL } = data || {};
    if (typeof activityId !== "string" || !activityId.trim()) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "activityId required."
      );
    }
    // R1A-Deletion: callable-actor lock — deleting users cannot
    // post new comments mid-cascade.
    await accountDeletionLocks.assertCallableActorNotDeleting(
      admin.firestore(),
      context.auth.uid
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
    try {
      const result = await socialCounters.addComment({
        firestore: admin.firestore(),
        uid: context.auth.uid,
        activityId,
        text,
        authorName,
        authorPhotoURL,
        increment: admin.firestore.FieldValue.increment,
        serverTimestamp: admin.firestore.FieldValue.serverTimestamp,
      });
      // 2026-05-26 audit PR 3 (finding #6) — comment notification is
      // now written server-side. Lookup activity author so we don't
      // trust client-supplied target uid (no impersonation surface).
      try {
        const activitySnap = await admin
          .firestore()
          .collection("activities")
          .doc(activityId)
          .get();
        const activity = activitySnap.exists ? activitySnap.data() : null;
        if (
          activity &&
          activity.authorId &&
          activity.authorId !== context.auth.uid
        ) {
          const fromName =
            (typeof authorName === "string" && authorName) || "Someone";
          await socialFanout.createNotification({
            firestore: admin.firestore(),
            fromUid: context.auth.uid,
            toUid: activity.authorId,
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
      throw new functions.https.HttpsError(
        "failed-precondition",
        (err && err.message) || "Comment create failed."
      );
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
      // "not authorized" → permission-denied; other errors →
      // failed-precondition.
      const isAuthz = err && /not authorized/.test(err.message || "");
      throw new functions.https.HttpsError(
        isAuthz ? "permission-denied" : "failed-precondition",
        (err && err.message) || "Comment delete failed."
      );
    }
  });

exports.setCrewMembershipCallable = functions
  .runWith(DEFAULT_HTTP_CAP)
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Sign-in required."
      );
    }
    const { crewId, action, displayName } = data || {};
    if (
      typeof crewId !== "string" ||
      !crewId.trim() ||
      (action !== "join" && action !== "leave")
    ) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "crewId + action required."
      );
    }
    // R1A-Deletion: callable-actor lock. Replaces the rule-layer
    // freeze that previously lived on /groups/{crewId}/members/{userId}
    // (now `write: if false` — server-only). The cascade clears crew
    // memberships in Phase D; a mid-cascade write here would race.
    await accountDeletionLocks.assertCallableActorNotDeleting(
      admin.firestore(),
      context.auth.uid
    );
    const limited = await isRateLimited(
      context.auth.uid,
      "setCrewMembership",
      10,
      60_000
    );
    if (limited) {
      throw new functions.https.HttpsError(
        "resource-exhausted",
        "Too many crew membership changes. Slow down."
      );
    }
    try {
      await socialCounters.setCrewMembership({
        firestore: admin.firestore(),
        uid: context.auth.uid,
        crewId,
        action,
        displayName,
        increment: admin.firestore.FieldValue.increment,
        serverTimestamp: admin.firestore.FieldValue.serverTimestamp,
      });
      return { ok: true };
    } catch (err) {
      functions.logger.warn("setCrewMembershipCallable.error", {
        uid: context.auth.uid,
        crewId,
        action,
        error: err && err.message,
      });
      throw new functions.https.HttpsError(
        "failed-precondition",
        (err && err.message) || "Crew membership update failed."
      );
    }
  });

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
//   - "Prior week" is Sun..Sat in UTC. The server runs in UTC and
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

const FELL_BEHIND_THRESHOLD = 0.5;

/** Compute the prior-week boundaries given a "now" timestamp. The
 *  trigger fires Monday 05:00 UTC; prior week is the Sun..Sat
 *  block immediately preceding today. */
function _priorWeekUtcRange(nowMs) {
  // Anchor on UTC midnight of "today" so dates align cleanly with
  // the saved-runs `date` field (which is a local-date string that
  // happens to look like a UTC date for the purpose of >=/<=
  // ordering).
  const now = new Date(nowMs);
  const todayUtc = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
  const todayDow = todayUtc.getUTCDay(); // 0=Sun..6=Sat
  // Last Saturday = today - (todayDow + 1) days. Monday → -2 days.
  // Sunday → -1 day. Etc.
  const lastSaturday = new Date(todayUtc.getTime());
  lastSaturday.setUTCDate(lastSaturday.getUTCDate() - todayDow - 1);
  const lastSunday = new Date(lastSaturday.getTime());
  lastSunday.setUTCDate(lastSunday.getUTCDate() - 6);
  return {
    weekStart: _utcDateString(lastSunday),
    weekEnd: _utcDateString(lastSaturday),
    weekKey: _utcDateString(lastSunday),
  };
}

// Volume-eligibility predicate lives in `./lib/runEligibility.js`
// (mirrors `src/lib/runStatsEligibility.ts`). Aliased locally to
// preserve the existing `_isVolumeEligibleRun` test-surface export.
const _isVolumeEligibleRun = isVolumeEligibleRun;

/** Pure decision function for the fell-behind flag. Returns
 *  `{ payload, action }` where `action` is one of:
 *    - "set": new fell-behind state → write flag
 *    - "clear": previously fell-behind but this week clears it →
 *      delete the flag (write `null`)
 *    - "noop": nothing to do this week
 *  Easy to test exhaustively without Firestore. */
function _decideFellBehindFlag(
  profile,
  programState,
  priorWeekRuns,
  priorWeekKey
) {
  // Gate 1 — freeform users have no prescriptive target; skip.
  const runMode = profile && profile.runMode;
  if (!runMode || runMode === "freeform") {
    return { action: "noop" };
  }

  // Gate 2 — users in active recovery phase aren't falling behind
  // on training; they're recovering by design. The "prescription"
  // for the recovery weeks is easy_30s at the same frequency, but
  // missing those isn't fell-behind territory.
  const runPlan = (programState && programState.runPlan) || null;
  if (runPlan && runPlan.phase === "recovery") {
    return { action: "noop" };
  }

  // Gate 3 — read the user's weekly run target. Use `??` (not `||`)
  // to mirror `getWeeklyRunTarget` in src/lib/scheduleUtils.ts — a
  // user with an explicit `weeklyRunDaysTarget: 0` (e.g. a zeroed
  // taper week) should treat the new field as authoritative rather
  // than falling back to the legacy `weeklyRunsTarget`. After
  // resolution, 0 still falls through to the `< 1` guard below.
  const weeklyTarget =
    (profile && profile.weeklyRunDaysTarget) ??
    (profile && profile.weeklyRunsTarget) ??
    0;
  if (weeklyTarget < 1) {
    return { action: "noop" };
  }

  // Count volume-eligible runs in the prior week.
  const realRunCount = (priorWeekRuns || []).filter(
    _isVolumeEligibleRun
  ).length;
  const completedRatio = realRunCount / weeklyTarget;
  const fellBehind = completedRatio < FELL_BEHIND_THRESHOLD;

  const existingFlag =
    (programState && programState.pendingFellBehindPrompt) || null;

  if (fellBehind) {
    // Idempotent: if the same flag is already present (re-firing on
    // the same week), no-op so we don't generate spurious writes.
    if (
      existingFlag &&
      existingFlag.weekKey === priorWeekKey &&
      existingFlag.completedRatio === completedRatio
    ) {
      return { action: "noop" };
    }
    return {
      action: "set",
      payload: {
        pendingFellBehindPrompt: {
          weekKey: priorWeekKey,
          completedRatio,
          realRunCount,
          weeklyTarget,
        },
      },
    };
  }

  // Not fell-behind this week. If a flag for an OLDER week is still
  // present (user dismissed the previous one slowly), leave it —
  // the client owns the dismissal. Only clear if the flag belongs
  // to THIS evaluation's week (defensive — caller shouldn't have
  // re-evaluated the same week twice, but be safe).
  if (existingFlag && existingFlag.weekKey === priorWeekKey) {
    return {
      action: "clear",
      payload: { pendingFellBehindPrompt: null },
    };
  }
  return { action: "noop" };
}

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

exports.weeklyFellBehindCheck = functions.pubsub
  .schedule("0 5 * * 1")
  .timeZone("Etc/UTC")
  .onRun(async () => {
    try {
      console.log("weeklyFellBehindCheck: starting");
      const range = _priorWeekUtcRange(Date.now());
      console.log(
        `weeklyFellBehindCheck: evaluating week ${range.weekKey} ` +
          `(${range.weekStart}..${range.weekEnd})`
      );
      let setCount = 0;
      let clearCount = 0;
      await sweepActiveUsers({
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
    }
    return null;
  });

exports._priorWeekUtcRange = _priorWeekUtcRange;
exports._isVolumeEligibleRun = _isVolumeEligibleRun;
exports._decideFellBehindFlag = _decideFellBehindFlag;
exports._runWeeklyFellBehindCheckForUser = _runWeeklyFellBehindCheckForUser;
