/**
 * Re-reading the profile just after writing it.
 *
 * The app holds a live listener on `users/{uid}` (subscription changes),
 * and a `getDoc` of a document a listener is open on is answered from that
 * listener's view. A write committed in a transaction reaches the view a
 * moment later, so a read straight after it can return the profile from
 * before the write. A finished starter goal read that way stayed "on the
 * goal, not finished" until the app was next opened, and Home and Train
 * never said Done. Re-reading until the written fields show closes it.
 */

/** Reads of the profile before giving up and taking the last one. */
export const PROFILE_REFRESH_ATTEMPTS = 8;
/** Wait between reads, in ms. */
export const PROFILE_REFRESH_WAIT_MS = 250;

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (
    a === null ||
    b === null ||
    typeof a !== "object" ||
    typeof b !== "object"
  )
    return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const aKeys = Object.keys(a as object);
  const bKeys = Object.keys(b as object);
  return (
    aKeys.length === bKeys.length &&
    aKeys.every((key) =>
      sameValue(
        (a as Record<string, unknown>)[key],
        (b as Record<string, unknown>)[key]
      )
    )
  );
}

/**
 * Whether a read of the profile shows a patch just written: every field the
 * patch sets holds the value it set (a field it removes, `undefined`, is
 * absent).
 */
export function profileShowsPatch(
  data: Record<string, unknown>,
  patch: Record<string, unknown>
): boolean {
  return Object.entries(patch).every(([key, value]) =>
    sameValue(data[key], value)
  );
}
