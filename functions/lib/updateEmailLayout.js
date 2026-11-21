"use strict";

/**
 * What every email a person chose shares (App1 Q55): the card, the button,
 * and the footer with who sent it, why it came and how to stop it.
 *
 * The footer is the part the law asks for. PECR regulation 23: say who is
 * sending and give an address that answers. Regulation 22 and UK GDPR
 * Article 7(3): stopping is as easy as saying yes, so every email links to
 * a page that unsubscribes in one tap, and carries the List-Unsubscribe
 * headers (RFC 2369, RFC 8058) that let a mail app do it in one more.
 * The link is the person's own: their uid and a random token kept for them
 * on the server (lib/emailUnsubscribe.js), on Tropos's own address, which
 * Hosting hands to the `emailUnsubscribe` function (firebase.json).
 *
 * Nothing in an email tracks its reader: no pixel and no rewritten links.
 * Resend's open and click tracking stay off on the sending domain (an
 * owner setting, docs/qa/pre-launch-backlog.md): a tracking pixel needs
 * consent of its own (PECR regulation 6), and a rewritten link would stop
 * the button opening the app.
 *
 * The card is the trial reminder's (lib/trialReminderEmail.js), with inline
 * styles, as email clients strip <style>. Everything is escaped.
 */

const { escapeHtml } = require("./trialReminderEmail");

/** Tropos's own address: the website, and where shared links land. */
const PUBLIC_ORIGIN = "https://troposfit.com";
const SUPPORT_EMAIL = "support@troposfit.com";

/** Where an email's link unsubscribes. */
function unsubscribeUrl(uid, token) {
  const url = new URL("/email/unsubscribe", PUBLIC_ORIGIN);
  url.searchParams.set("u", uid);
  url.searchParams.set("t", token);
  return url.toString();
}

/** The headers a mail app reads to offer its own Unsubscribe, one tap
 *  (RFC 8058: a POST to the same address). */
function unsubscribeHeaders(url) {
  return {
    "List-Unsubscribe": `<${url}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}

/** An address in the app, marked as an email's: on an iPhone with Tropos
 *  the universal-links file opens it in the app (scripts/ios/
 *  universal-links.ts), and the app follows only these two
 *  (`nativePostRoute`). */
function appUrl(path) {
  const url = new URL(path, PUBLIC_ORIGIN);
  url.searchParams.set("from", "email");
  return url.toString();
}

/** Who sent it: Tropos, and its postal address once the owner has set one
 *  (`system/config.emailPostalAddress`, read by the sweep). US law asks a
 *  commercial email for one (CAN-SPAM); the code does not know it. */
function senderLine(postalAddress) {
  const address = typeof postalAddress === "string" ? postalAddress.trim() : "";
  return address ? `Sent by Tropos, ${address}.` : "Sent by Tropos.";
}

/** The last lines of every email: why it came, how to stop it, and who
 *  sent it. */
function footerLines(reason, unsubscribe, postalAddress) {
  return [
    reason,
    `To stop these emails, unsubscribe here: ${unsubscribe}. You can also change them in Tropos, under Settings, then Notifications.`,
    `${senderLine(postalAddress)} Questions: ${SUPPORT_EMAIL}`,
  ];
}

const TEXT = "font-size:15px;line-height:1.5;color:#3a3846;margin:0 0 16px;text-align:left;";
const SMALL = "font-size:12px;line-height:1.5;color:#8e8e93;margin:12px 0 0;text-align:left;";
const LINK = "color:#6560C8;word-break:break-all;";

/**
 * The email, as plain text and HTML.
 *
 * @param {object} args
 * @param {string} args.heading
 * @param {string} [args.kicker] - a line above the heading (the week's dates)
 * @param {string[]} args.paragraphs
 * @param {{ label: string, url: string }} args.button
 * @param {string} args.reason - why this email came
 * @param {string} args.unsubscribe - the person's unsubscribe link
 * @param {string} [args.postalAddress] - Tropos's, when the owner set one
 * @returns {{ text: string, html: string }}
 */
function renderEmail({
  heading,
  kicker,
  paragraphs,
  button,
  reason,
  unsubscribe,
  postalAddress,
}) {
  const footer = footerLines(reason, unsubscribe, postalAddress);
  const text = [
    ...(kicker ? [kicker] : []),
    heading,
    ...paragraphs,
    `${button.label}: ${button.url}`,
    ...footer,
  ].join("\n\n");

  const body = paragraphs
    .map((p) => `<p style="${TEXT}">${escapeHtml(p)}</p>`)
    .join("\n            ");
  const footerHtml = [
    `<p style="${SMALL}">${escapeHtml(footer[0])}</p>`,
    `<p style="${SMALL}">To stop these emails, <a href="${escapeHtml(unsubscribe)}" style="${LINK}">unsubscribe</a>. You can also change them in Tropos, under Settings, then Notifications.</p>`,
    `<p style="${SMALL}">${escapeHtml(senderLine(postalAddress))} Questions: <a href="mailto:${SUPPORT_EMAIL}" style="${LINK}">${SUPPORT_EMAIL}</a></p>`,
  ].join("\n            ");
  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f2f2f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f2f7;padding:32px 16px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:440px;background:#ffffff;border-radius:16px;padding:32px;">
          <tr><td>
            <div style="font-size:12px;font-weight:800;letter-spacing:4px;color:#7B72E9;text-transform:uppercase;text-align:center;">Tropos</div>
            ${kicker ? `<p style="font-size:13px;color:#8e8e93;margin:12px 0 0;text-align:center;">${escapeHtml(kicker)}</p>` : ""}
            <h1 style="font-size:22px;font-weight:800;color:#1c1b22;margin:8px 0 20px;text-align:center;">${escapeHtml(heading)}</h1>
            ${body}
            <p style="margin:24px 0 8px;text-align:center;"><a href="${escapeHtml(button.url)}" style="display:inline-block;background:#1c1b22;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;padding:12px 22px;border-radius:12px;">${escapeHtml(button.label)}</a></p>
            ${footerHtml}
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
  return { text, html };
}

module.exports = {
  PUBLIC_ORIGIN,
  SUPPORT_EMAIL,
  unsubscribeUrl,
  unsubscribeHeaders,
  appUrl,
  footerLines,
  renderEmail,
};
