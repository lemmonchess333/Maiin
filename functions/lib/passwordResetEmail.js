/**
 * Password-reset email delivery (auth pass, 2026-07).
 *
 * Firebase's client sendPasswordResetEmail REFUSES OAuth-only accounts —
 * "password reset does not work with OAuth accounts; they have no Firebase
 * password to reset" — and with enumeration protection on it fails silently
 * (the dead end a Google user hit). The Admin SDK's generatePasswordResetLink
 * DOES mint a valid link for any existing account (completing it sets a
 * password, adding the password provider), but Admin doesn't SEND email — so
 * we deliver it ourselves. This is how Spotify / MyFitnessPal behave:
 * forgot-password emails a set-password link regardless of how you signed up.
 *
 * Pure orchestration with injected generateLink + sendEmail, so it's
 * unit-testable without the Admin SDK or a live email provider. It NEVER
 * reveals whether the account exists (enumeration defence): a missing account
 * resolves { sent: false } and the caller returns the same neutral response.
 */

/** Branded HTML for the reset email. Inline styles — email clients strip
 *  <style>/CSS classes. Dark card on light bg, purple CTA (brand). */
function resetEmailHtml(link, appName) {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f2f2f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f2f7;padding:32px 16px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:440px;background:#ffffff;border-radius:16px;padding:32px;">
          <tr><td style="text-align:center;">
            <div style="font-size:12px;font-weight:800;letter-spacing:4px;color:#7B72E9;text-transform:uppercase;">${appName}</div>
            <h1 style="font-size:22px;font-weight:800;color:#1c1b22;margin:12px 0 8px;">Set a new password</h1>
            <p style="font-size:15px;line-height:1.5;color:#6b6878;margin:0 0 24px;">
              Tap the button to set a password for your ${appName} account. If you didn't ask for this, you can safely ignore this email.
            </p>
            <a href="${link}" style="display:inline-block;background:#6560C8;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:14px 28px;border-radius:12px;">Set my password</a>
            <p style="font-size:12px;line-height:1.5;color:#8e8e93;margin:24px 0 0;">
              This link expires soon and can only be used once. If the button doesn't work, copy and paste this URL:<br>
              <span style="color:#6560C8;word-break:break-all;">${link}</span>
            </p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

/**
 * Generate a reset link for `email` and email it.
 *
 * @param {object} args
 * @param {(email: string) => Promise<string>} args.generateLink - admin.auth().generatePasswordResetLink
 * @param {(msg: {to: string, subject: string, html: string}) => Promise<void>} args.sendEmail
 * @param {string} args.email
 * @param {string} [args.appName]
 * @returns {Promise<{sent: boolean, reason?: string}>}
 */
async function sendPasswordResetEmail({
  generateLink,
  sendEmail,
  email,
  appName = "Tropos",
}) {
  let link;
  try {
    link = await generateLink(email);
  } catch (err) {
    // No account for this email → nothing to send. Stay silent so the flow
    // can't be used to probe which emails are registered.
    const msg = (err && err.message) || "";
    if (/user-not-found|no user record|email-not-found/i.test(msg)) {
      return { sent: false, reason: "no-account" };
    }
    throw err;
  }
  await sendEmail({
    to: email,
    subject: `Set your ${appName} password`,
    html: resetEmailHtml(link, appName),
  });
  return { sent: true };
}

module.exports = { sendPasswordResetEmail, resetEmailHtml };
