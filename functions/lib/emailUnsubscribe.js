"use strict";

/**
 * The unsubscribe link in every email a person chose (App1 Q55).
 *
 * Withdrawing has to be as easy as saying yes (UK GDPR Article 7(3)), and
 * PECR regulation 22 asks for a simple way to refuse in every message. So
 * the link needs no sign-in: it carries the account's uid and a token, 32
 * random bytes kept for that account on the server
 * (`users/{uid}/settings/emailState.unsubscribeToken`, made with the
 * first email; the rules refuse a client write to that document). A token
 * rather than a signature needs no new secret and can be replaced.
 *
 * Opening the link shows one button; the button (a POST) turns both
 * emails off, recorded as withdrawn through the link with the server's
 * time (lib/emailConsent.js). A GET changes nothing because mail scanners
 * and link previews open links nobody tapped. A mail app's own Unsubscribe
 * is the same POST (RFC 8058, the List-Unsubscribe-Post header), so it
 * works in one tap. An unknown account and a wrong token get the same
 * page, which names no one.
 *
 * The page sends nothing to anyone else, is never cached or indexed, and
 * sends no Referer, since its address holds the token.
 */

const crypto = require("crypto");
const emailConsent = require("./emailConsent");

/** A Firebase Auth uid: letters and digits, 1 to 128. */
const UID = /^[A-Za-z0-9]{1,128}$/;
/** 32 bytes, base64url without padding. */
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

/** A new token for an account's links. */
function newUnsubscribeToken() {
  return crypto.randomBytes(32).toString("base64url");
}

/** Whether `uid` can go in a link: an account whose uid cannot is sent no
 *  email, since its link could not stop one. Firebase's own uids can. */
function isLinkableUid(uid) {
  return typeof uid === "string" && UID.test(uid);
}

/** Whether `token` has a token's shape. */
function isToken(token) {
  return typeof token === "string" && TOKEN.test(token);
}

/** The uid and token from a link's query, or null when either is not one. */
function readUnsubscribeQuery(query) {
  const uid = query && typeof query.u === "string" ? query.u : "";
  const token = query && typeof query.t === "string" ? query.t : "";
  return UID.test(uid) && TOKEN.test(token) ? { uid, token } : null;
}

/** Equal tokens, compared in constant time. */
function tokensMatch(stored, given) {
  if (typeof stored !== "string" || typeof given !== "string") return false;
  const a = Buffer.from(stored);
  const b = Buffer.from(given);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Whether the link is this account's: its stored token is the one given. */
async function linkIsValid(db, link) {
  const state = await db
    .collection("users")
    .doc(link.uid)
    .collection("settings")
    .doc("emailState")
    .get();
  return state.exists && tokensMatch(state.data().unsubscribeToken, link.token);
}

/**
 * Both emails off, through the link, in a transaction that checks the
 * token again. Returns false when the link is not this account's.
 */
async function unsubscribe(db, link, at) {
  const userRef = db.collection("users").doc(link.uid);
  const stateRef = userRef.collection("settings").doc("emailState");
  return db.runTransaction(async (tx) => {
    const [user, state] = await Promise.all([tx.get(userRef), tx.get(stateRef)]);
    if (!state.exists || !tokensMatch(state.data().unsubscribeToken, link.token)) {
      return false;
    }
    if (!user.exists) return true;
    const { next, changed } = emailConsent.applyEmailConsent(
      (user.data() || {}).emailConsent,
      { weeklyReview: false, winBack: false },
      { via: "unsubscribe", at }
    );
    if (changed.length > 0) tx.update(userRef, { emailConsent: next });
    return true;
  });
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** A page: the heading, its lines, and the button when there is one. */
function page(heading, lines, button) {
  const body = lines
    .map(
      (line) =>
        `<p style="font-size:16px;line-height:1.5;color:#3a3846;margin:0 0 16px;">${escapeHtml(line)}</p>`
    )
    .join("\n      ");
  const form = button
    ? `<form method="post" action="${escapeHtml(button.action)}">
        <button type="submit" style="min-height:44px;width:100%;background:#1c1b22;color:#ffffff;font-size:16px;font-weight:700;border:0;border-radius:12px;padding:12px 22px;">${escapeHtml(button.label)}</button>
      </form>`
    : "";
  return `<!doctype html>
<html lang="en-GB">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex">
    <title>${escapeHtml(heading)} · Tropos</title>
  </head>
  <body style="margin:0;background:#f2f2f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <main style="max-width:440px;margin:48px auto;padding:32px;background:#ffffff;border-radius:16px;">
      <div style="font-size:12px;font-weight:800;letter-spacing:4px;color:#6560C8;text-transform:uppercase;text-align:center;">Tropos</div>
      <h1 style="font-size:22px;font-weight:800;color:#1c1b22;margin:12px 0 20px;text-align:center;">${escapeHtml(heading)}</h1>
      ${body}
      ${form}
    </main>
  </body>
</html>`;
}

const ASK = Object.freeze({
  heading: "Stop emails from Tropos?",
  lines: [
    "You’ll stop getting your weekly review and the emails after a break.",
    "Account emails, such as a password reset, still come.",
  ],
  button: "Unsubscribe",
});

const DONE = Object.freeze({
  heading: "You’re unsubscribed",
  lines: [
    "Tropos won’t send you the weekly review or the emails after a break.",
    "You can turn them back on in Tropos, under Settings, then Notifications.",
  ],
});

const BROKEN = Object.freeze({
  heading: "This link doesn’t work",
  lines: [
    "It may be from an old email. You can turn emails off in Tropos, under Settings, then Notifications, or use the link in your latest email.",
  ],
});

/** Headers for every answer: never cached, never indexed, no Referer, and
 *  nothing loaded from anywhere. `security` is the site's own list
 *  (publicPost.SECURITY_HEADERS); this page's CSP replaces its one. */
function headers(security) {
  return {
    ...security,
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Robots-Tag": "noindex, nofollow",
    "Referrer-Policy": "no-referrer",
    "Content-Security-Policy":
      "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
  };
}

/**
 * One request to the link. Returns the status and the page.
 *
 * @param {object} args
 * @param {string} args.method
 * @param {Record<string, unknown>} args.query
 * @param {string} args.action - where the button posts: the link itself
 * @param {FirebaseFirestore.Firestore} args.db
 * @param {unknown} args.at - the server time to record a withdrawal with
 * @returns {Promise<{ status: number, html: string, allow?: string }>}
 */
async function handleUnsubscribe({ method, query, action, db, at }) {
  if (method !== "GET" && method !== "HEAD" && method !== "POST") {
    return { status: 405, html: "", allow: "GET, HEAD, POST" };
  }
  const link = readUnsubscribeQuery(query);
  const broken = { status: 400, html: page(BROKEN.heading, BROKEN.lines) };
  if (!link) return broken;
  if (method === "POST") {
    return (await unsubscribe(db, link, at))
      ? { status: 200, html: page(DONE.heading, DONE.lines) }
      : broken;
  }
  return (await linkIsValid(db, link))
    ? {
        status: 200,
        html: page(ASK.heading, ASK.lines, { label: ASK.button, action }),
      }
    : broken;
}

module.exports = {
  newUnsubscribeToken,
  isLinkableUid,
  isToken,
  readUnsubscribeQuery,
  tokensMatch,
  unsubscribe,
  handleUnsubscribe,
  headers,
  ASK,
  DONE,
  BROKEN,
};
