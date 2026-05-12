/**
 * Client-side profanity filter for UGC inputs.
 *
 * App Store Guideline 1.2 requires "objectionable content filter"
 * for user-generated content. This wrapper around `leo-profanity`
 * is the client-facing half of that filter — gives the user
 * inline feedback at the composer level ("your post contains
 * objectionable language; please edit"). The server-side mirror
 * in `functions/profanityFilter.js` is the definitive gate —
 * client validation is a UX nicety, the server is the trust
 * boundary.
 *
 * Why leo-profanity over bad-words: `bad-words@4` has a broken
 * CJS export (requires a non-existent `./badwords.js`).
 * leo-profanity ships clean CJS + ESM, is actively maintained,
 * and the English list (~250 words) covers App Review's bar
 * without aggressive false-positives on legitimate fitness
 * language like "ripped" or "smashed".
 *
 * The filter operates on full strings, not per-word — so a caption
 * like "ate a whole pizza, what a beast" doesn't fire on "beast",
 * but "f*** this hill" does.
 */

import leoProfanity from "leo-profanity";

// leo-profanity's default English dictionary loads on first
// import. No need to call `loadDictionary` ourselves.

/**
 * Returns true when `text` contains any blocked word. Whitespace-
 * only / empty / non-string inputs short-circuit to false — the
 * caller should validate non-emptiness via a different gate, this
 * helper is only about *content* of provided text.
 */
export function containsProfanity(text: unknown): boolean {
  if (typeof text !== "string" || !text.trim()) return false;
  return leoProfanity.check(text);
}

/**
 * Returns a cleaned version of `text` with blocked words replaced
 * by asterisks. Used by the auto-clean fallback path on the
 * server when a write would otherwise be rejected — exposed here
 * for parity with the server module and so the composer's "clean
 * for me" affordance can preview the cleaned form.
 */
export function cleanProfanity(text: string): string {
  if (typeof text !== "string") return "";
  return leoProfanity.clean(text);
}
