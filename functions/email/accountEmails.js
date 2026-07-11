/**
 * Account email callables (audit batch 6, extraction 1 of N — moved
 * verbatim from functions/index.js; index re-exports so the deployed
 * function NAMES, caps, and secret bindings are unchanged — pinned by
 * __tests__/triggerMetadata.test.js).
 *
 * - sendPasswordResetLinkCallable — UNAUTHENTICATED by design (user is
 *   logged out); Admin-minted link works for OAuth-only accounts;
 *   enumeration-neutral response; per-email rate limit.
 * - sendVerificationEmailCallable — AUTH-required, caller's own email
 *   only; branded Resend template instead of the Firebase default.
 *
 * Pure decision logic stays in lib/passwordResetEmail.js and
 * lib/verificationEmail.js (dependency-injected, unit-tested); this
 * module owns only the trigger wiring + Resend transport.
 */
const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
const { defineSecret } = require("firebase-functions/params");
const { DEFAULT_HTTP_CAP } = require("../lib/runtimeCaps");
const rateLimiter = require("../rateLimiter");
const passwordResetEmail = require("../lib/passwordResetEmail");
const verificationEmail = require("../lib/verificationEmail");

// Resend API key — provisioned via: firebase functions:secrets:set RESEND_API_KEY
// (defineSecret registers by NAME; index.js declaring the same name is fine.)
const RESEND_API_KEY = defineSecret("RESEND_API_KEY");

/** Deliver one email via the Resend REST API (Node 20 global fetch — no SDK
 *  dependency). `from` is a plain env var so the sender can move from Resend's
 *  test domain (onboarding@resend.dev — sends only to the Resend account
 *  owner) to a verified domain at launch without a code change. */
async function sendViaResend({ to, subject, html }) {
  const from = process.env.RESEND_FROM || "Tropos <onboarding@resend.dev>";
  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to, subject, html }),
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(
      `Resend send failed (${resp.status}): ${body.slice(0, 200)}`
    );
  }
}

/**
 * Forgot-password entry point (auth pass, 2026-07). UNAUTHENTICATED by design
 * — the user is logged out. Mints a reset link via the Admin SDK (works for
 * OAuth-only accounts too, unlike the client SDK) and emails it via Resend, so
 * a Google/Apple user can set a password — matching Spotify / MyFitnessPal.
 * Always returns { ok: true } (enumeration defence: a non-existent email
 * looks identical). Rate-limited per email to blunt reset-bombing; App Check
 * enforcement (roadmap) is the production hardening for the unauthed surface.
 */
exports.sendPasswordResetLinkCallable = functions
  .runWith({ ...DEFAULT_HTTP_CAP, secrets: [RESEND_API_KEY] })
  .https.onCall(async (data) => {
    const email =
      data && typeof data.email === "string" ? data.email.trim() : "";
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "A valid email is required."
      );
    }
    // Keyed on a sanitised email (no auth uid — logged out). 5 per 5 min per
    // email caps bombing a single victim.
    const key = `pwreset_${email.toLowerCase().replace(/[^a-z0-9]/g, "_")}`;
    const limited = await rateLimiter.isRateLimited(
      key,
      "passwordReset",
      5,
      300_000
    );
    if (limited) {
      throw new functions.https.HttpsError(
        "resource-exhausted",
        "Too many reset requests. Try again in a few minutes."
      );
    }
    try {
      const result = await passwordResetEmail.sendPasswordResetEmail({
        generateLink: (e) => admin.auth().generatePasswordResetLink(e),
        sendEmail: sendViaResend,
        email,
      });
      functions.logger.info("sendPasswordResetLinkCallable", {
        sent: result.sent,
        reason: result.reason,
      });
    } catch (err) {
      // A genuine failure (Admin outage, Resend down) — surface so the client
      // can say "try again", without leaking whether the account exists.
      functions.logger.error("sendPasswordResetLinkCallable.error", {
        error: err && err.message,
      });
      throw new functions.https.HttpsError(
        "internal",
        "Couldn't send the reset email. Try again in a moment."
      );
    }
    // Neutral: identical response whether or not the account existed.
    return { ok: true };
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
    const email = context.auth.token.email;
    if (!email) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "This account has no email address to verify."
      );
    }
    // Token already says verified → nothing to send. (The token can lag a
    // just-completed verification; treating it as success is harmless.)
    if (context.auth.token.email_verified) {
      return { ok: true, alreadyVerified: true };
    }
    const limited = await rateLimiter.isRateLimited(
      `verifyemail_${context.auth.uid}`,
      "verificationEmail",
      3,
      600_000
    );
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
