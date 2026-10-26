/**
 * Display-name validation shared by Onboarding's name-entry step and the
 * Settings profile name field.
 *
 * Rules (applied to trimmed input):
 *   - Minimum 2 characters.
 *   - Maximum 50 characters: the same number the server keeps
 *     (functions/profileSanitizer.js) and the rules cap a copied name at
 *     (firestore.rules), pinned by displayNameLimit.cross.test.ts.
 *   - Must have at least one non-whitespace character (enforced by the
 *     minimum-2-after-trim rule).
 *   - Nothing the word filter flags. A display name is public (profile,
 *     feed, spaces, leaderboards), so it meets the same filter as posts and
 *     comments (src/lib/profanityFilter.ts). The server refuses the same
 *     names where it writes one (completeOnboarding, configurePlan); the
 *     Settings field writes the profile directly, so this is its check.
 *     The caller passes the filter in (`useWordFilter`, `loadWordFilter`),
 *     which keeps its word lists out of the screens that import this; until
 *     it has loaded, a name of the right length is not valid yet, with no
 *     problem to show.
 *   - Accept emoji, non-Latin scripts, apostrophes, spaces, anything else.
 *     No uniqueness check, no character-set allowlist.
 *
 * Known quirk: JS string length counts UTF-16 code units, so a single emoji
 * like "🏃" has length 2 and passes the ≥ 2 rule on its own. That's acceptable
 * — an emoji-only display name is a valid user choice.
 */
import { OBJECTIONABLE_NAME_MESSAGE } from "@/lib/objectionableMessages";
import type { WordFilter } from "@/lib/wordFilter";
import { DISPLAY_NAME_MAX } from "@/lib/displayNameLimit";

export { DISPLAY_NAME_MAX };

export const DISPLAY_NAME_MIN = 2;

export const DISPLAY_NAME_LENGTH_MESSAGE = `Enter a name between ${DISPLAY_NAME_MIN} and ${DISPLAY_NAME_MAX} characters.`;

export type DisplayNameProblem = "length" | "objectionable";

export interface DisplayNameValidation {
  /** True when `trimmed` passes every rule above, the word filter
   *  included: false while the filter is still loading. */
  valid: boolean;
  /** The input with leading / trailing whitespace stripped — the value
   *  callers should persist on success. */
  trimmed: string;
  /** Which rule failed, or null when valid or not yet checked. */
  problem: DisplayNameProblem | null;
  /** The sentence to show for `problem`, or null when there is none. */
  message: string | null;
}

export function validateDisplayName(
  raw: string,
  wordFilter: WordFilter | null
): DisplayNameValidation {
  const trimmed = raw.trim();
  if (trimmed.length < DISPLAY_NAME_MIN || trimmed.length > DISPLAY_NAME_MAX) {
    return {
      valid: false,
      trimmed,
      problem: "length",
      message: DISPLAY_NAME_LENGTH_MESSAGE,
    };
  }
  if (!wordFilter) {
    return { valid: false, trimmed, problem: null, message: null };
  }
  if (wordFilter.containsProfanity(trimmed)) {
    return {
      valid: false,
      trimmed,
      problem: "objectionable",
      message: OBJECTIONABLE_NAME_MESSAGE,
    };
  }
  return { valid: true, trimmed, problem: null, message: null };
}
