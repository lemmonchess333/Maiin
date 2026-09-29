/**
 * The saved sharing default — the answer to "Share sessions
 * automatically?", per type.
 *
 * The finish screens read it: `finishShareStart` turns it into what happens
 * to a session the moment it is saved — ask once, post without a sheet, or
 * hold. It is asked for once (`answerShareQuestion`) and edited in
 * Settings → Privacy (`ShareDefaultsRow`). It is saved on the account
 * (`profile.shareDefaults`), so one answer applies on every device; the
 * functions here take that value as an argument and never read the profile
 * themselves. AuthProvider loads it and writes it (`updateShareDefaults`).
 *
 * Apart from the share composer (the one-off sheet and the offline queue)
 * because AuthProvider, which loads before the login form paints, needs
 * the helpers at the bottom of this file and none of the composer.
 */
import { readString, remove, writeString } from "@/lib/localStore";
import type { ShareType, ShareVisibility } from "@/lib/shareComposer";

/** An answer to "Share sessions automatically?". */
export type ShareDefault = ShareVisibility | "never";

/** What the finish screen acts on: an answer, or null to ask. */
export type AlwaysPref = ShareDefault | null;

/**
 * The account's answers — `shareDefaults` on `users/{uid}`, so one answer
 * applies on every device. A type that is absent was never answered; `null`
 * was cleared ("Ask" in Settings). Neither posts anything on its own: the
 * next finish asks. `firestore.rules` and `functions/profileSanitizer.js`
 * accept exactly these two keys and these values.
 */
export type ShareDefaults = Partial<Record<ShareType, ShareDefault | null>>;

const SHARE_TYPES: readonly ShareType[] = ["run", "workout"];

function isShareDefault(value: unknown): value is ShareDefault {
  return value === "followers" || value === "public" || value === "never";
}

/** A type's stored answer: undefined when it was never answered (or holds
 *  something that is not an answer), null when it was cleared. */
function storedAnswer(
  saved: ShareDefaults | null | undefined,
  type: ShareType
): ShareDefault | null | undefined {
  const value =
    saved !== null && typeof saved === "object" ? saved[type] : undefined;
  if (value === null) return null;
  return isShareDefault(value) ? value : undefined;
}

/** The account's answer for one type, as the finish screen acts on it. */
export function savedShareDefault(
  saved: ShareDefaults | null | undefined,
  type: ShareType
): AlwaysPref {
  return storedAnswer(saved, type) ?? null;
}

/**
 * The answers to save when the finish screen's one question ("Share
 * sessions automatically?") is answered: `value` for `asking`, and for
 * every other type that has no answer yet. `asking` is always among them:
 * the question only appears while that type has no answer.
 *
 * A type that already has one keeps it. The user chose it on purpose, in
 * Settings or with the share sheet's "Make this my default", and answering
 * the question after a workout must not overwrite a "never" they picked
 * for runs.
 */
export function answerShareQuestion(
  saved: ShareDefaults | null | undefined,
  asking: ShareType,
  value: ShareDefault
): ShareDefaults {
  const answers: ShareDefaults = {};
  for (const type of SHARE_TYPES) {
    if (type === asking || savedShareDefault(saved, type) === null) {
      answers[type] = value;
    }
  }
  return answers;
}

/** What a finish screen does with a session the moment it is saved. */
export type FinishShareStart =
  /** No default yet: ask the one question. */
  | { kind: "ask" }
  /** Post it now, with no sheet. */
  | { kind: "post"; visibility: ShareVisibility }
  /** Post nothing; offer the one-off share button. */
  | { kind: "hold"; reason: "never" | "verify" };

export function finishShareStart(
  pref: AlwaysPref,
  needsEmailVerification: boolean
): FinishShareStart {
  if (pref === null) return { kind: "ask" };
  if (pref === "never") return { kind: "hold", reason: "never" };
  // An unverified email/password account cannot post publicly (the rules'
  // isEmailVerified). A post the rules will refuse must never be attempted
  // on the strength of a remembered choice: hold it, and let the one-off
  // sheet, where the verification notice lives, do the posting.
  if (needsEmailVerification) return { kind: "hold", reason: "verify" };
  return { kind: "post", visibility: pref };
}

// ── Answers saved on this device ─────────────────────────────────
//
// A device that answered before answers were saved on the account holds
// its answers under `tropos.share.always.<uid>.<type>`. Left there, they
// would each decide for one phone while Settings on another device said
// something else. AuthProvider moves them to the account once, online,
// inside a transaction (`shareDefaultsToMove`), then removes them, so the
// profile alone decides. Until then it applies them to the profile it loads
// (`withDeviceShareDefaults`), so an answer is never less private for
// waiting to move.
//
// Privacy order, most private first: "never"; no answer (asks, and posts
// nothing on its own); followers; public. Two devices that answered
// differently must never end with the less private answer winning without
// the user choosing it again.

const DEVICE_KEY_PREFIX = "tropos.share.always";

function deviceKey(uid: string, type: ShareType): string {
  // uid-scoped (money-path audit F9): a global key bled across account
  // switches on a shared device — user A's "always share publicly" would
  // auto-post user B's next workout under B's account.
  return `${DEVICE_KEY_PREFIX}.${uid}.${type}`;
}

const PRIVACY_RANK: Record<ShareDefault | "ask", number> = {
  never: 0,
  ask: 1,
  followers: 2,
  public: 3,
};

function privacyRank(answer: ShareDefault | null): number {
  return PRIVACY_RANK[answer ?? "ask"];
}

/** The answers this device saved for `uid` before answers moved to the
 *  account. Another account's are never read. */
export function readDeviceShareDefaults(
  uid: string
): Partial<Record<ShareType, ShareDefault>> {
  const answers: Partial<Record<ShareType, ShareDefault>> = {};
  for (const type of SHARE_TYPES) {
    // Purge the pre-uid-scoping global key. Never moved: a global answer
    // can't be safely attributed to one account (that IS the leak).
    remove(`${DEVICE_KEY_PREFIX}.${type}`);
    const raw = readString(deviceKey(uid, type));
    if (isShareDefault(raw)) answers[type] = raw;
    // Crews retirement: the retired audience falls back to its underlying
    // fan-out rather than silently clearing the answer.
    else if (raw === "crews") answers[type] = "followers";
  }
  return answers;
}

/**
 * The answers to write so that, for each type this device answered, the
 * account holds the more private of its own answer and this device's. A
 * type the account never answered takes the device's answer. Empty when
 * the account already holds an answer at least as private for every type.
 */
export function shareDefaultsToMove(
  account: ShareDefaults | null | undefined,
  device: Partial<Record<ShareType, ShareDefault>>
): ShareDefaults {
  const answers: ShareDefaults = {};
  for (const type of SHARE_TYPES) {
    const mine = device[type];
    if (mine === undefined) continue;
    const theirs = storedAnswer(account, type);
    if (theirs === undefined || privacyRank(mine) < privacyRank(theirs)) {
      answers[type] = mine;
    }
  }
  return answers;
}

/** The account's answers with this device's applied on the same terms as
 *  the move, for a profile loaded before the move has happened. */
export function withDeviceShareDefaults(
  uid: string,
  account: ShareDefaults | null | undefined
): ShareDefaults | null | undefined {
  const moving = shareDefaultsToMove(account, readDeviceShareDefaults(uid));
  if (Object.keys(moving).length === 0) return account;
  const kept: ShareDefaults = {};
  for (const type of SHARE_TYPES) {
    const answer = storedAnswer(account, type);
    if (answer !== undefined) kept[type] = answer;
  }
  return { ...kept, ...moving };
}

/** Removes this device's answers for `types`, once the account holds them
 *  or the user has answered again. Returns the answers it removed. */
export function forgetDeviceShareDefaults(
  uid: string,
  types: readonly ShareType[]
): Partial<Record<ShareType, ShareDefault>> {
  const device = readDeviceShareDefaults(uid);
  const removed: Partial<Record<ShareType, ShareDefault>> = {};
  for (const type of types) {
    remove(deviceKey(uid, type));
    const answer = device[type];
    if (answer !== undefined) removed[type] = answer;
  }
  return removed;
}

/** Puts back answers `forgetDeviceShareDefaults` removed, when the answer
 *  that replaced them could not be saved. */
export function restoreDeviceShareDefaults(
  uid: string,
  answers: Partial<Record<ShareType, ShareDefault>>
): void {
  for (const type of SHARE_TYPES) {
    const answer = answers[type];
    if (answer !== undefined) writeString(deviceKey(uid, type), answer);
  }
}
