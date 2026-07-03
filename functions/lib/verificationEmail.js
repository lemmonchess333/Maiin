/**
 * Email-verification delivery (account table-stakes pass, 2026-07).
 *
 * Same shape as passwordResetEmail.js: the client SDK's sendEmailVerification
 * ships Firebase's default template from noreply@<project>.firebaseapp.com —
 * spam-prone and off-brand. The Admin SDK mints the same verification link
 * (generateEmailVerificationLink) without sending, so we deliver it ourselves
 * through the existing Resend path with the branded template.
 *
 * Pure orchestration with injected generateLink + sendEmail, unit-testable
 * without the Admin SDK or a live email provider. No enumeration concern:
 * the caller is authenticated and can only verify their OWN email.
 */

/** Branded HTML for the verification email. Inline styles — email clients
 *  strip <style>/CSS classes. Mirrors resetEmailHtml (dark-on-light card,
 *  purple CTA). */
function verifyEmailHtml(link, appName) {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f2f2f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f2f7;padding:32px 16px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:440px;background:#ffffff;border-radius:16px;padding:32px;">
          <tr><td style="text-align:center;">
            <div style="font-size:12px;font-weight:800;letter-spacing:4px;color:#7B72E9;text-transform:uppercase;">${appName}</div>
            <h1 style="font-size:22px;font-weight:800;color:#1c1b22;margin:12px 0 8px;">Confirm your email</h1>
            <p style="font-size:15px;line-height:1.5;color:#6b6878;margin:0 0 24px;">
              Tap the button to verify this address for your ${appName} account. If you didn't create a ${appName} account, you can safely ignore this email.
            </p>
            <a href="${link}" style="display:inline-block;background:#6560C8;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:14px 28px;border-radius:12px;">Verify my email</a>
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
 * Generate a verification link for `email` and email it.
 *
 * @param {object} args
 * @param {(email: string) => Promise<string>} args.generateLink - admin.auth().generateEmailVerificationLink
 * @param {(msg: {to: string, subject: string, html: string}) => Promise<void>} args.sendEmail
 * @param {string} args.email
 * @param {string} [args.appName]
 * @returns {Promise<{sent: boolean}>}
 */
async function sendVerificationEmail({
  generateLink,
  sendEmail,
  email,
  appName = "Tropos",
}) {
  const link = await generateLink(email);
  await sendEmail({
    to: email,
    subject: `Verify your ${appName} email`,
    html: verifyEmailHtml(link, appName),
  });
  return { sent: true };
}

module.exports = { sendVerificationEmail, verifyEmailHtml };
