"use strict";

/**
 * Report alerts: an email to the owner when a report comes in.
 *
 * Before this, a report sat in the queue until someone happened to open
 * /admin/moderation, while the Terms promise that reports are reviewed
 * within 24 hours. createReport calls `sendReportAlert` once the report and
 * its authority marker have committed.
 *
 * The email carries what is needed to triage from the inbox: the reason,
 * what kind of thing was reported, the reporter's note, and a link to the
 * queue. It carries no uids and none of the reported content; those stay
 * behind the admin gate.
 *
 * A failed alert never fails the report. `sendReportAlert` catches, logs
 * and returns, and gives up after `timeoutMs`: a report the reporter is
 * told failed gets filed again, so a slow or broken mail provider must not
 * reach them.
 *
 * Pure orchestration with an injected `sendEmail` (Resend in production,
 * email/accountEmails.js), like passwordResetEmail.js and
 * verificationEmail.js.
 */

const DEFAULT_ALERT_EMAIL = "support@troposfit.com";
const DEFAULT_TIMEOUT_MS = 8000;

/**
 * How many alerts go: from one reporter in a rolling day, and from
 * everyone in a UTC day (Tropos heuristics). Filing a report needs no
 * verified email and allows ten an hour per account, and every alert was an
 * email through Resend, whose allowance the password reset, verification
 * and trial emails share (passwordResetRequest.js caps resets for the same
 * reason). One account could send 240 a day, and a few could use up the
 * day's sending for everyone. Past either number the report is stored and
 * queued as always, with no email. The day's last email says it is the
 * last until midnight UTC, so a quiet inbox after it is not read as no
 * reports: everyone's number is one count per UTC day, so that sentence is
 * true, where a rolling window would let alerts start again minutes later.
 */
const REPORTER_ALERTS_PER_DAY = 3;
const ALERTS_PER_DAY = 50;
const ALERT_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Whether this report's alert is sent, and whether it is the day's last.
 * `isLimited(key, action, maxCalls, windowMs)` is the shared rate limiter,
 * which counts a call it allows and fails closed. The reporter's number is
 * checked first, so one account's reports past it use none of everyone's.
 * Everyone's is one counter per UTC day in `rateLimits`, with the
 * limiter's `expiresAt` for its TTL; when it cannot be read, no alert goes.
 * @returns {Promise<{send: boolean, last?: boolean, held?: string}>}
 */
async function alertAllowance({
  firestore,
  reporterUid,
  isLimited,
  now = new Date(),
}) {
  if (
    await isLimited(
      reporterUid,
      "reportAlert",
      REPORTER_ALERTS_PER_DAY,
      ALERT_WINDOW_MS
    )
  )
    return { send: false, held: "reporter" };
  const day = now.toISOString().slice(0, 10);
  const ref = firestore.collection("rateLimits").doc(`reportalert_all_${day}`);
  let before;
  try {
    before = await firestore.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const stored = snap.exists ? (snap.data() || {}).count : 0;
      const count = typeof stored === "number" ? stored : 0;
      if (count < ALERTS_PER_DAY)
        tx.set(ref, {
          count: count + 1,
          expiresAt: new Date(now.getTime() + 2 * ALERT_WINDOW_MS),
        });
      return count;
    });
  } catch {
    return { send: false, held: "count-unavailable" };
  }
  if (before >= ALERTS_PER_DAY) return { send: false, held: "everyone" };
  return { send: true, last: before === ALERTS_PER_DAY - 1 };
}

/** Labels for the reasons the report form offers: mirrors the labels in
 *  src/lib/reportCategories.ts, pinned by
 *  src/lib/__tests__/reportTargets.cross.test.ts. */
const CATEGORY_LABELS = Object.freeze({
  harassment: "Harassment or bullying",
  spam: "Spam or misleading",
  inappropriate: "Inappropriate content",
  impersonation: "Impersonation",
  other: "Other",
});

/** What was reported, one entry per lib/reportTargets.js TARGET_TYPES. */
const TARGET_LABELS = Object.freeze({
  activity: "An activity in the feed",
  comment: "A comment on an activity",
  user: "A profile",
  space_post: "A post in a space",
  space_post_comment: "A comment on a space post",
  segment: "A segment",
});

/** The inbox for alerts: the plain env var MODERATION_ALERT_EMAIL, or the
 *  support address. */
function alertRecipient(env = process.env) {
  const raw =
    typeof env.MODERATION_ALERT_EMAIL === "string"
      ? env.MODERATION_ALERT_EMAIL.trim()
      : "";
  return raw || DEFAULT_ALERT_EMAIL;
}

/** The moderation queue on the app's public origin (helpers.js
 *  getStripeReturnBaseUrl: PUBLIC_APP_BASE_URL, or the production default). */
function moderationQueueUrl(baseUrl) {
  const base = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return `${base}admin/moderation`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function reasonLine({ category, subReason }) {
  const label = CATEGORY_LABELS[category] || "Other";
  return subReason ? `${label}: ${subReason}` : label;
}

/**
 * Subject and HTML for one report. Everything the reporter typed is
 * escaped: the note is user input landing in an HTML email.
 */
function buildReportAlertEmail({
  reportId,
  targetType,
  category,
  subReason,
  freeformNote,
  queueUrl,
  lastForNow = false,
}) {
  const reason = reasonLine({ category, subReason });
  const what = TARGET_LABELS[targetType] || "Something";
  const note =
    typeof freeformNote === "string" && freeformNote.trim()
      ? freeformNote.trim()
      : null;
  const row = (label, value) =>
    `<tr><td style="padding:6px 12px 6px 0;color:#6b6878;font-size:13px;vertical-align:top;white-space:nowrap;">${label}</td>` +
    `<td style="padding:6px 0;color:#1c1b22;font-size:14px;line-height:1.5;">${value}</td></tr>`;

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f2f2f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f2f7;padding:32px 16px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;padding:28px;">
          <tr><td>
            <h1 style="font-size:20px;font-weight:800;color:#1c1b22;margin:0 0 16px;">A report is waiting for review</h1>
            <table role="presentation" cellpadding="0" cellspacing="0">
              ${row("Reason", escapeHtml(reason))}
              ${row("Reported", escapeHtml(what))}
              ${row("Note", note ? escapeHtml(note).replace(/\n/g, "<br>") : "None")}
              ${row("Report", escapeHtml(reportId))}
            </table>
            ${
              lastForNow
                ? `<p style="font-size:14px;line-height:1.5;color:#1c1b22;margin:20px 0 0;"><strong>This is the last alert until midnight UTC.</strong> Tropos sends at most ${ALERTS_PER_DAY} in a day. Reports that come in meanwhile are in the queue without an email.</p>`
                : ""
            }
            <p style="margin:24px 0 0;">
              <a href="${escapeHtml(queueUrl)}" style="display:inline-block;background:#6560C8;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 24px;border-radius:12px;">Open the moderation queue</a>
            </p>
            <p style="font-size:12px;line-height:1.5;color:#8e8e93;margin:20px 0 0;">
              The Terms say reports are reviewed within 24 hours. If the button doesn't work, open this address:<br>
              <span style="color:#6560C8;word-break:break-all;">${escapeHtml(queueUrl)}</span>
            </p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;

  return {
    subject: `New report: ${CATEGORY_LABELS[category] || "Other"} (${what.toLowerCase()})`,
    html,
  };
}

/**
 * Email the alert for one stored report. Never throws.
 *
 * @param {object} args
 * @param {(msg: {to: string, subject: string, html: string}) => Promise<void>} args.sendEmail
 * @param {string} args.to
 * @param {string} args.queueUrl
 * @param {{reportId: string, targetType: string, category: string,
 *          subReason?: string, freeformNote?: string}} args.report
 * @param {{warn: Function, info?: Function}} [args.logger]
 * @param {number} [args.timeoutMs]
 * @returns {Promise<{sent: boolean}>}
 */
async function sendReportAlert({
  sendEmail,
  to,
  queueUrl,
  report,
  logger = console,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) {
  let timer;
  try {
    const { subject, html } = buildReportAlertEmail({ ...report, queueUrl });
    const timedOut = new Promise((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`no answer after ${timeoutMs} ms`)),
        timeoutMs
      );
    });
    await Promise.race([sendEmail({ to, subject, html }), timedOut]);
    return { sent: true };
  } catch (err) {
    logger.warn("createReport.alert_failed", {
      reportId: report && report.reportId,
      error: err && err.message,
    });
    return { sent: false };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  ALERTS_PER_DAY,
  REPORTER_ALERTS_PER_DAY,
  alertAllowance,
  DEFAULT_ALERT_EMAIL,
  CATEGORY_LABELS,
  TARGET_LABELS,
  alertRecipient,
  moderationQueueUrl,
  buildReportAlertEmail,
  sendReportAlert,
};
