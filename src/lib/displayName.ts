/**
 * Display-name validation shared by Onboarding's name-entry step and any
 * future Settings / profile-edit surface that collects the same value.
 *
 * Rules (applied to trimmed input):
 *   - Minimum 2 characters.
 *   - Maximum 30 characters.
 *   - Must have at least one non-whitespace character (enforced by the
 *     minimum-2-after-trim rule).
 *   - Accept emoji, non-Latin scripts, apostrophes, spaces, anything.
 *     No profanity filter, no uniqueness check, no character-set allowlist.
 *
 * Known quirk: JS string length counts UTF-16 code units, so a single emoji
 * like "🏃" has length 2 and passes the ≥ 2 rule on its own. That's acceptable
 * — an emoji-only display name is a valid user choice.
 */

export const DISPLAY_NAME_MIN = 2;
export const DISPLAY_NAME_MAX = 30;

export interface DisplayNameValidation {
  /** True when `trimmed` passes the length bounds. */
  valid: boolean;
  /** The input with leading / trailing whitespace stripped — the value
   *  callers should persist on success. */
  trimmed: string;
}

export function validateDisplayName(raw: string): DisplayNameValidation {
  const trimmed = raw.trim();
  const valid =
    trimmed.length >= DISPLAY_NAME_MIN && trimmed.length <= DISPLAY_NAME_MAX;
  return { valid, trimmed };
}
