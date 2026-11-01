/**
 * Account email callables (audit batch 6, extraction 1 of N — moved
 * verbatim from functions/index.js; index re-exports so the deployed
 * function NAMES, caps, and secret bindings are unchanged — pinned by
 * __tests__/triggerMetadata.test.js).
 *
 * - sendPasswordResetLinkCallable — UNAUTHENTICATED by design (user is
 *   logged out); Admin-minted link works for OAuth-only accounts;
 *   enumeration-neutral response (the same reply whether or not the
 *   address has an account or the email went); per-email rate limit.
 * - sendVerificationEmailCallable — AUTH-required, caller's own email
 *   only; branded Resend template instead of the Firebase default.
 *
 * Pure decision logic stays in lib/passwordResetRequest.js,
 * lib/passwordResetEmail.js and lib/verificationEmail.js
 * (dependency-injected, unit-tested); this module owns only the trigger
 * wiring + Resend transport.
 */
const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
const { defineSecret } = require("firebase-functions/params");
const { DEFAULT_HTTP_CAP } = require("../lib/runtimeCaps");
const { isEmailRateLimited } = require("../lib/emailRateLimit");
const { requestPasswordReset } = require("../lib/passwordResetRequest");
const verificationEmail = require("../lib/verificationEmail");

// Resend API key — provisioned via: firebase functions:secrets:set RESEND_API_KEY
// (defineSecret registers by NAME; index.js declaring the same name is fine.)
const RESEND_API_KEY = defineSecret("RESEND_API_KEY");

/** Deliver one email via the Resend REST API (global fetch, no SDK
 *  dependency). `from` is a plain env var so the sender can move from Resend's
 *  test domain (onboarding@resend.dev — sends only to the Resend account
 *  owner) to a verified domain at launch without a code change. `text`, the
 *  plain-text part, is optional; the trial reminder sends one. */
async function sendViaResend({ to, subject, html, text }) {
  const from = process.env.RESEND_FROM || "Tropos <onboarding@resend.dev>";
  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to,
      subject,
      html,
      ...(text ? { text } : {}),
    }),
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    // The message is logged by every caller, and Resend's error body can
    // name the recipient ("Invalid `to` field: …"): the password-reset
    // callable, which anyone can call, would log every address tried.
    // Addresses are cut here, once, as trialReminders.js cuts its own.
    throw new Error(
      `Resend send failed (${resp.status}): ${body
        .slice(0, 200)
        .replace(/\S+@\S+/g, "[address]")}`
    );
  }
}
// Also the transport for createReport's moderation alert (lib/reportAlert.js).
exports.sendViaResend = sendViaResend;

/**
 * Forgot-password entry point (auth pass, 2026-07). UNAUTHENTICATED by design
 * — the user is logged out. Mints a reset link via the Admin SDK (works for
 * OAuth-only accounts too, unlike the client SDK) and emails it via Resend, so
 * a Google/Apple user can set a password — matching Spotify / MyFitnessPal.
 * Rate-limited per email to blunt reset-bombing; App Check enforcement
 * (roadmap) is the production hardening for the unauthed surface.
 *
 * The request itself is lib/passwordResetRequest.js, whose header says why
 * the reply is the same whether or not the address has an account.
 */
exports.sendPasswordResetLinkCallable = functions
  .runWith({ ...DEFAULT_HTTP_CAP, secrets: [RESEND_API_KEY] })
  .https.onCall(async (data) => {
    const reply = await requestPasswordReset({
      data,
      firestore: admin.firestore(),
      generateLink: (e) => admin.auth().generatePasswordResetLink(e),
      sendEmail: sendViaResend,
      logger: functions.logger,
    });
    if (reply.refused) {
      throw new functions.https.HttpsError(
        reply.refused.code,
        reply.refused.message
      );
    }
    return reply;
  });

/**
 * Email-verification sender (account table-stakes pass, 2026-07). AUTH-
 * REQUIRED and verifies the CALLER's own email only — no enumeration
 * surface. Same Admin-mint + Resend delivery as the password reset: the
 * client SDK's sendEmailVerification ships Firebase's default template from
 * noreply@<project>.firebaseapp.com (spam-prone, off-brand); this sends the
 * branded template from the Resend sender instead. Fired on email/password
 * signup (fire-and-forget) and from the Settings resend button.
 */
exports.sendVerificationEmailCallable = functions
  .runWith({ ...DEFAULT_HTTP_CAP, secrets: [RESEND_API_KEY] })
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "Sign in first.");
    }
    const currentUser = await admin.auth().getUser(context.auth.uid);
    const email = currentUser.email;
    if (!email) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "This account has no email address to verify."
      );
    }
    // Token already says verified → nothing to send. (The token can lag a
    // just-completed verification; treating it as success is harmless.)
    if (currentUser.emailVerified) {
      return { ok: true, alreadyVerified: true };
    }
    const limited = await isEmailRateLimited({
      firestore: admin.firestore(),
      key: `verifyemail_${context.auth.uid}`,
      action: "verificationEmail",
      maxCalls: 3,
      windowMs: 600_000,
    });
    if (limited) {
      throw new functions.https.HttpsError(
        "resource-exhausted",
        "Too many requests. Try again in a few minutes."
      );
    }
    try {
      await verificationEmail.sendVerificationEmail({
        generateLink: (e) => admin.auth().generateEmailVerificationLink(e),
        sendEmail: sendViaResend,
        email,
      });
      functions.logger.info("sendVerificationEmailCallable", {
        uid: context.auth.uid,
      });
    } catch (err) {
      functions.logger.error("sendVerificationEmailCallable.error", {
        error: err && err.message,
      });
      throw new functions.https.HttpsError(
        "internal",
        "Couldn't send the verification email. Try again in a moment."
      );
    }
    return { ok: true };
  });
