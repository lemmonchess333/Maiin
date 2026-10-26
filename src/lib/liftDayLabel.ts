/**
 * What a lift day is called on screen.
 *
 * The programme generator names its days `<category> — <focus> Focus`
 * ("Push — Chest Focus", "Full Body — Squat Focus"), and those STORED
 * names stay as they are: the engine finds a person's saved days by them
 * when it rebuilds a plan (`alignExistingTo`), a schema migration matches
 * them, and a workout draft, an offline save's replay and every programme
 * edit's precondition key on them. Renaming them would cut a saved plan
 * loose from its weights at the next settings change.
 *
 * So the words change here and only here (Lift19). A generated day shows
 * as its type ("Push"), with a letter when its week holds another day of
 * the same type ("Push A", "Push B"), the way Push/Pull/Legs plans name
 * their days. "Lat", "Squat" and "Row" under the circles mixed a muscle,
 * a lift and a movement; the session card says which lift a day starts
 * with instead. A day the person built or renamed keeps its own name.
 */

/**
 * The type of each day the generator names (`programEngine.ts`).
 * `liftDayLabel.test.ts` fails if the generator produces a name this does
 * not cover.
 */
const GENERATED_DAY_TYPES: Readonly<Record<string, string>> = {
  "Full Body — Squat Focus": "Full Body",
  "Full Body — Deadlift Focus": "Full Body",
  "Full Body — Posterior Focus": "Full Body",
  "Upper — Chest & Back": "Upper",
  "Upper — Shoulders & Arms": "Upper",
  "Lower — Squat Focus": "Lower",
  "Lower — Deadlift Focus": "Lower",
  "Push — Chest Focus": "Push",
  "Push — Shoulder Focus": "Push",
  "Pull — Lat Focus": "Pull",
  "Pull — Row Focus": "Pull",
  "Legs — Squat Focus": "Legs",
  "Legs — Deadlift Focus": "Legs",
};

/** The type of a day the generator named ("Pull"), or null for any other
 *  name. Where the week is not to hand (a saved session, a post), this is
 *  the day's whole name. */
export function generatedDayType(dayName: string): string | null {
  return GENERATED_DAY_TYPES[dayName.trim()] ?? null;
}

/**
 * The on-screen names of a week's days, in order. A generated day is its
 * type, lettered in the week's order when the type comes more than once
 * (a 6-day week: Push A, Pull A, Legs A, Push B, Pull B, Legs B; a 5-day
 * one: Push, Pull, Legs, Upper, Lower). Any other day is its own name, as
 * `liftDayLine` reads it.
 */
export function liftWeekDayNames(week: readonly string[]): string[] {
  const types = week.map(generatedDayType);
  const seen = new Map<string, number>();
  return week.map((name, i) => {
    const type = types[i];
    if (!type) return liftDayLine(name);
    const count = types.filter((t) => t === type).length;
    if (count < 2) return type;
    const n = seen.get(type) ?? 0;
    seen.set(type, n + 1);
    return `${type} ${String.fromCharCode(65 + n)}`;
  });
}

/**
 * One day's on-screen name within its week. `week` is the plan's day
 * names in order and `index` the day's place in it; a day the week does
 * not hold at that place is named without a letter.
 */
export function liftDayNameIn(
  week: readonly string[],
  index: number,
  dayName: string
): string {
  return week[index]?.trim() === dayName.trim()
    ? liftWeekDayNames(week)[index]
    : liftDayLine(dayName);
}

/** ` — `, ` – ` or ` - `: a dash with whitespace on both sides. */
const SEPARATOR = /\s+[—–-]\s+/;

/** The trailing noun a custom name may carry. Dropping it leaves one word
 *  under a numbered circle, which is the whole budget a cell has.
 *  Unanchored whitespace, so a name whose focus is only the noun strips to
 *  nothing and takes the whole-name fallback rather than labelling a day
 *  "Focus". */
const FOCUS_SUFFIX = /\s*Focus$/i;

/**
 * The word a custom day's selector cell carries: the part of its name
 * after the dash, which is the part that differs from day to day. A
 * generated day's cell takes its week name (`liftWeekDayNames`); without
 * the week, this gives its type.
 */
export function dayFocusLabel(dayName: string): string {
  const type = generatedDayType(dayName);
  if (type) return type;
  const full = dayName.trim();
  const parts = full.split(SEPARATOR);
  if (parts.length < 2) return full;
  const focus = parts.slice(1).join(" ").trim().replace(FOCUS_SUFFIX, "");
  return focus.trim() || full;
}

/**
 * A lift's title on its Home card: a generated day as Train names it in its
 * week ("Pull B") when that name is known, any other day as `liftDayTitle`
 * reads it. The first-visit walk names today's lift with the same words.
 */
export function liftCardTitle(dayName: string, weekName?: string): string {
  return weekName && generatedDayType(dayName)
    ? weekName
    : liftDayTitle(dayName).title;
}

/**
 * A lift day's name for a card: the title, and the category above it when
 * a custom name carries one. A generated day is its type alone here;
 * a card that knows the week titles it with `liftDayNameIn`. A custom name
 * with a dash splits there ("Arms" above "Pump"), since setting it whole
 * broke it at the dash on a phone. A name with no separator is the title,
 * with no category.
 */
export function liftDayTitle(dayName: string): {
  category: string | null;
  title: string;
} {
  const type = generatedDayType(dayName);
  if (type) return { category: null, title: type };
  const full = dayName.trim();
  // Only the first separator divides the name. A routine's own name can
  // carry more, and after the first they are the lifter's wording.
  const separator = SEPARATOR.exec(full);
  if (!separator) return { category: null, title: full };
  const category = full.slice(0, separator.index).trim();
  const title = full
    .slice(separator.index + separator[0].length)
    .trim()
    .replace(/\bFocus$/, "focus");
  return category && title
    ? { category, title }
    : { category: null, title: full };
}

/**
 * A lift day's name on one line, where the week is not to hand: a
 * generated day's type ("Pull"), a custom name's two halves joined with
 * the middot the app uses between a thing and its detail. A routine's own
 * name is itself.
 */
export function liftDayLine(dayName: string): string {
  const { category, title } = liftDayTitle(dayName);
  return category ? `${category} · ${title}` : title;
}
