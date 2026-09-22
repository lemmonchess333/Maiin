/**
 * The word a lift day's selector cell carries.
 *
 * Every programme day is named `<category> — <focus> Focus`
 * ("Push — Chest Focus", "Full Body — Squat Focus"), and the cell takes
 * the FOCUS.
 *
 * The category is the half that REPEATS: a Full Body programme names
 * all three days "Full Body", and a Push/Pull/Legs x2 week names days 1
 * and 4 both "Push". It is also already on the page, as the header's
 * subtitle. A cell labelled with it spends its one line restating the
 * programme and none distinguishing the day it numbers.
 *
 * The focus is what varies within a week, by construction: it is the
 * emphasis that makes day 1's Push different from day 4's.
 *
 * The separator must be SPACED. A bare hyphen character is not one:
 * "Upper-Lower — Squat Focus" has to split at the em dash, not inside
 * the category, and the old `[—–-]` class split at the first hyphen it
 * met. A name with no separator at all (a custom or renamed day) is its
 * own label.
 */

/** ` — `, ` – ` or ` - `: a dash with whitespace on both sides. */
const SEPARATOR = /\s+[—–-]\s+/;

/** The trailing noun the templates append to every focus. Dropping it
 *  leaves one word ("Squat", "Chest", "Posterior") under a numbered
 *  circle, which is the whole budget a cell has. Unanchored whitespace,
 *  so a name whose focus is only the noun strips to nothing and takes
 *  the whole-name fallback rather than labelling a day "Focus". */
const FOCUS_SUFFIX = /\s*Focus$/i;

export function dayFocusLabel(dayName: string): string {
  const full = dayName.trim();
  const parts = full.split(SEPARATOR);
  if (parts.length < 2) return full;
  const focus = parts.slice(1).join(" ").trim().replace(FOCUS_SUFFIX, "");
  return focus.trim() || full;
}
