/**
 * Where setup's signed-out answers are kept on the phone (A6), and in what
 * form, with nothing but the storage door under it.
 *
 * `onboardingDraft.ts` reads and checks the draft; this module is the key,
 * the envelope's version and owner, and the three storage calls. It stays
 * this small on purpose: the e2e rig plants a draft through these same
 * constants (`e2e/helpers/auth.ts`), and Playwright's Node has no
 * `import.meta.env`, which the logger and most of `src/lib` read as they
 * load. Keep this module's imports to `./localStore`.
 */
import { readString, remove, writeJson } from "./localStore";

/** The draft envelope's version, for an account's draft and this one.
 *  2 (2026-07-28): added `experience`. */
export const DRAFT_VERSION = 2;

/** The one key setup's signed-out answers wait under. */
export const SIGNED_OUT_DRAFT_KEY = "tropos.onboarding.draft.signedOut";

/** The owner a signed-out draft's envelope echoes: no Firebase uid can be
 *  this (they are letters and digits), so the cross-check still holds. */
export const SIGNED_OUT_OWNER = "(signed out)";

/** How long signed-out answers wait: two days. They can be someone else's
 *  by the time the phone is picked up again, so far shorter than an
 *  account's 14. */
export const SIGNED_OUT_DRAFT_TTL_MS = 2 * 24 * 60 * 60 * 1000;

/** The stored envelope, as written. */
export function readSignedOutDraftRecord(): string | null {
  return readString(SIGNED_OUT_DRAFT_KEY);
}

/** True only when the envelope is now stored. */
export function writeSignedOutDraftRecord(envelope: unknown): boolean {
  return writeJson(SIGNED_OUT_DRAFT_KEY, envelope);
}

/** Forget setup's signed-out answers. True when they are gone. */
export function forgetSignedOutDraft(): boolean {
  return remove(SIGNED_OUT_DRAFT_KEY);
}
