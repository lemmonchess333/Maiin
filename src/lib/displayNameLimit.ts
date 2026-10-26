/**
 * The display-name limit, and the cut for a name the person did not type.
 *
 * Kept apart from displayName.ts, which loads the word filter and its
 * dictionary: the auth provider is in the app's first chunk and needs only
 * the cut. displayName.ts re-exports the limit, so its importers are
 * unchanged.
 */

/** The same number the server keeps (functions/profileSanitizer.js) and the
 *  rules cap a name at (firestore.rules), pinned by
 *  displayNameLimit.cross.test.ts. */
export const DISPLAY_NAME_MAX = 50;

/**
 * A name taken from a Google or Apple account at sign-up, trimmed and cut
 * to DISPLAY_NAME_MAX. The rules refuse a longer name on the public
 * profile, and sign-up writes that profile in one batch with the account,
 * so an uncut name would fail the sign-up itself. Never ends on half an
 * emoji. Setup's name step and Settings can change it afterwards.
 */
export function clampDisplayName(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length <= DISPLAY_NAME_MAX) return trimmed;
  return trimmed
    .slice(0, DISPLAY_NAME_MAX)
    .replace(/[\uD800-\uDBFF]$/, "")
    .trimEnd();
}
