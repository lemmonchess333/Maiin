/**
 * Tiny list-formatting helpers for human-readable enumerations
 * in toasts, captions, and confirm-dialog bodies.
 *
 * The Tropos style is to use the ampersand (&) instead of the
 * Oxford "and" to keep toast bodies tight on narrow viewports —
 * `Breakfast & Lunch` reads cleaner than `Breakfast and Lunch`
 * at 12px in a sonner toast.
 */

/**
 * Join a list of strings with comma separators and an ampersand
 * before the final item, in the Tropos house style.
 *
 *   [] → ""
 *   ["a"] → "a"
 *   ["a", "b"] → "a & b"
 *   ["a", "b", "c"] → "a, b & c"
 *   ["a", "b", "c", "d"] → "a, b, c & d"
 */
export function joinHumanList(items: readonly string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} & ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} & ${items[items.length - 1]}`;
}
