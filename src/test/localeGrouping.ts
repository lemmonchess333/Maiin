/**
 * The runtime's thousands separator, for assertions about grouped numbers.
 *
 * Grouping follows the VIEWER's locale by design — `dateTreatment.test.ts`
 * bans a locale-less `toLocaleDateString` because date ORDER must not
 * follow the device, and in the same breath puts numeric grouping out of
 * scope because grouping should. So "2,933" is one locale's rendering of
 * a value with no fixed rendering.
 *
 * Spelling a comma in an assertion therefore pins the RUNNER, not the
 * app: 26 assertions across 14 files passed only because CI happens to
 * resolve en-US, and failed under de-DE ("2.933") — with fr-FR's narrow
 * no-break space the nastiest of the three, since it is invisible in a
 * diff.
 *
 * Use `group()` to build the expected string, or `GROUP` directly when a
 * matcher needs the character. Assert that grouping is PRESENT rather
 * than which character it is; the character is not ours to choose.
 */

/** What this runtime groups thousands with: "," in en-GB, "." in de-DE. */
export const GROUP = (1000).toLocaleString().replace(/\d/g, "");

/**
 * Group an integer the way the runtime does — `group(2933)` is "2,933"
 * under en-GB and "2.933" under de-DE.
 *
 * Deliberately `toLocaleString()` rather than hand-inserting `GROUP`
 * every three digits: the app formats with `toLocaleString`, so this
 * agrees with it by construction, including for locales that group in
 * anything other than threes.
 */
export function group(n: number): string {
  return n.toLocaleString();
}

/**
 * `group(n)` escaped for use inside a RegExp — `groupRe(1800)` builds
 * `1,800` under en-GB and `1\.800` under de-DE.
 *
 * The escaping is the whole point and is easy to miss: de-DE groups with
 * `.`, which is a regex metacharacter. Interpolating the raw separator
 * would quietly widen `/1,800 cal/` into a pattern matching "1X800 cal"
 * for any X — a matcher that still passes while asserting less than it
 * says. fr-FR's narrow no-break space has the same hazard in reverse:
 * it looks like a plain space in a diff and is not one.
 */
export function groupRe(n: number): string {
  return group(n).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * The separator alone, escaped for a RegExp — for patterns that assert
 * the SHAPE of a grouped number rather than a particular value, e.g.
 * `^\\+\\d{1,3}${SEP_RE}\\d{3} kcal$`.
 *
 * Same metacharacter hazard as `groupRe`: unescaped, de-DE's `.` turns
 * such a pattern into one that accepts any character where the
 * separator belongs.
 */
export const SEP_RE = GROUP.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
