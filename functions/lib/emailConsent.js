"use strict";

/**
 * Email beyond receipts is opt-in (App1 Q55, owner, 13 November 2026): the
 * weekly review and the later steps of the win-back ladder (Q54), asked at
 * setup, and nothing else. No newsletters. This file is the consent record:
 * its shape, how a change is applied to it, and the one question every
 * sender asks before it sends.
 *
 * Both emails are direct marketing in the ICO's reading (a message that
 * encourages someone to use a service is marketing), so PECR regulation 22
 * needs consent, and UK GDPR Article 7(1) needs Tropos to be able to show
 * it: who said yes, when, how and to what words, and when and how they
 * withdrew. So each kind keeps, on `users/{uid}.emailConsent`:
 *
 *   on            whether that email may be sent now
 *   givenAt       server time of the last yes, kept after a withdrawal,
 *                 so a past send can still be shown to have had consent
 *   givenVia      "setup" or "settings": where the yes was given
 *   wording       which version of the words the person saw when they said
 *                 yes (src/lib/emailConsent.ts holds each version's text,
 *                 pinned by emailConsentWording.test.ts)
 *   withdrawnAt   server time of the last no, if there has been one
 *   withdrawnVia  "settings" or "unsubscribe" (the link in every email)
 *
 * Absent means never asked, which is a no. Only the server writes it:
 * completeOnboarding for setup's yes, setEmailConsent for the Settings
 * switches, and the unsubscribe link. `firestore.rules` refuses a client
 * write (the field is not in allowedUserFields()), so a client cannot
 * backdate a yes or invent one. Nothing else about the person is kept for
 * these emails: the address is the one they sign in with, read from Auth
 * when an email goes.
 *
 * Mirrored by src/lib/emailConsent.ts (the app's reader and the words);
 * emailConsent.cross.test.ts holds the kinds and the wording versions to
 * one list.
 */

/** The two emails a person can say yes to (Q55). */
const EMAIL_KINDS = Object.freeze(["weeklyReview", "winBack"]);

/** The versions of the words the app has asked with. The newest is what
 *  the app shows now; an older one stays known so a record that names it
 *  still reads. Add a version, never edit one (the client's test pins the
 *  text of each). */
const EMAIL_CONSENT_WORDINGS = Object.freeze([1]);
const CURRENT_EMAIL_CONSENT_WORDING = 1;

const GIVEN_VIA = Object.freeze(["setup", "settings"]);
const WITHDRAWN_VIA = Object.freeze(["settings", "unsubscribe"]);

function isKind(kind) {
  return EMAIL_KINDS.includes(kind);
}

/** Whether `kind` may be emailed, from the stored user document. Only an
 *  explicit `on: true` is a yes: absent, malformed or anything else is no. */
function emailConsentOn(userData, kind) {
  if (!isKind(kind)) return false;
  const record =
    userData &&
    typeof userData === "object" &&
    userData.emailConsent &&
    typeof userData.emailConsent === "object"
      ? userData.emailConsent[kind]
      : null;
  return Boolean(record) && typeof record === "object" && record.on === true;
}

/** A known wording version, or null. */
function readWording(value) {
  return Number.isInteger(value) && EMAIL_CONSENT_WORDINGS.includes(value)
    ? value
    : null;
}

/**
 * The next `emailConsent` after `changes`, from the stored one.
 *
 * Each kind in `changes` is set on (a yes, given `via` with `wording`) or
 * off (a withdrawal, through `via`). A kind already in the asked state is
 * left as it is, so a second yes does not move the time of the first and a
 * second unsubscribe does not move the time of the withdrawal. Fields the
 * record already has are kept: a yes after a withdrawal keeps when that
 * withdrawal was, and the other kind is untouched.
 *
 * @param {object | null | undefined} stored - `users/{uid}.emailConsent`
 * @param {{ weeklyReview?: boolean, winBack?: boolean }} changes
 * @param {{ via: string, wording?: number | null, at: unknown }} how - `at`
 *   is the server time (FieldValue.serverTimestamp() in production)
 * @returns {{ next: object, changed: string[] }}
 */
function applyEmailConsent(stored, changes, how) {
  const base = stored && typeof stored === "object" ? stored : {};
  const next = {};
  for (const kind of EMAIL_KINDS) {
    if (base[kind] && typeof base[kind] === "object") {
      next[kind] = { ...base[kind] };
    }
  }
  const changed = [];
  for (const kind of EMAIL_KINDS) {
    if (typeof changes[kind] !== "boolean") continue;
    const want = changes[kind];
    const current = next[kind] || {};
    if ((current.on === true) === want) continue;
    if (want) {
      if (!GIVEN_VIA.includes(how.via)) {
        throw new Error(`applyEmailConsent: a yes cannot come via ${how.via}`);
      }
      const wording = readWording(how.wording);
      if (wording === null) {
        throw new Error("applyEmailConsent: a yes needs a known wording");
      }
      next[kind] = {
        ...current,
        on: true,
        givenAt: how.at,
        givenVia: how.via,
        wording,
      };
    } else {
      if (!WITHDRAWN_VIA.includes(how.via)) {
        throw new Error(`applyEmailConsent: a no cannot come via ${how.via}`);
      }
      next[kind] = {
        ...current,
        on: false,
        withdrawnAt: how.at,
        withdrawnVia: how.via,
      };
    }
    changed.push(kind);
  }
  return { next, changed };
}

/**
 * What setEmailConsent was sent, checked: at least one kind, each a
 * boolean, and when anything is turned on, the wording version the switch
 * showed. Returns the changes and the wording, or `{ error }`.
 */
function readEmailConsentRequest(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { error: "Send the emails to change." };
  }
  const changes = {};
  for (const key of Object.keys(data)) {
    if (key === "wording") continue;
    if (!isKind(key)) return { error: `Unknown email: ${key}` };
    if (typeof data[key] !== "boolean") {
      return { error: `${key} must be true or false.` };
    }
    changes[key] = data[key];
  }
  if (Object.keys(changes).length === 0) {
    return { error: "Send the emails to change." };
  }
  const turningOn = Object.values(changes).some((v) => v === true);
  const wording = readWording(data.wording);
  if (turningOn && wording === null) {
    return { error: "Unknown wording." };
  }
  return { changes, wording };
}

/**
 * Setup's answer, as completeOnboarding is sent it: `emailOptIn: true` with
 * the wording version the toggle showed is a yes to both emails (the
 * toggle names both). Anything else asks for nothing: an unticked toggle
 * records nothing, as absent already means no. A malformed value is
 * `{ error }`, so a client cannot slip something else through.
 */
function readSetupEmailOptIn(data) {
  const raw = data && typeof data === "object" ? data.emailOptIn : undefined;
  if (raw === undefined || raw === false) return { optIn: false };
  if (raw !== true) return { error: "emailOptIn must be true or false." };
  const wording = readWording(data.emailWording);
  if (wording === null) return { error: "Unknown email wording." };
  return { optIn: true, wording };
}

/** The plain on/off of each kind, for a callable's reply. */
function emailConsentSummary(record) {
  const out = {};
  for (const kind of EMAIL_KINDS) {
    out[kind] = emailConsentOn({ emailConsent: record }, kind);
  }
  return out;
}

module.exports = {
  EMAIL_KINDS,
  EMAIL_CONSENT_WORDINGS,
  CURRENT_EMAIL_CONSENT_WORDING,
  GIVEN_VIA,
  WITHDRAWN_VIA,
  emailConsentOn,
  applyEmailConsent,
  readEmailConsentRequest,
  readSetupEmailOptIn,
  emailConsentSummary,
};
