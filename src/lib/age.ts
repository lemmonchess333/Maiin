/**
 * A person's age, worked out from the date of birth the profile stores.
 *
 * App1 (grill Q57 and Q21, 13 November 2026): the date of birth replaces
 * the age range, and it is the one stored fact about a person's age. The
 * age the calorie maths and the heart-rate zones read is worked out from it
 * on the day they read it, so it goes up on a birthday, which the stored
 * `age` number never did (grill Round 6). An account set up before then has
 * no date of birth, and its `age` is read in its place until it adds one;
 * `age` is never written for an account with a date of birth, and
 * `ageRange` is never written at all.
 *
 * The bounds are the server's: `functions/profileSanitizer.js` keeps a date
 * of birth only when it makes the person 16 to 120 (`AGE_YEARS`), and
 * `bodyMetrics.cross.test.ts` holds the two to the same answers.
 */
import { AGE_YEARS } from "./bodyMetrics";
import { addLocalDays, localDateString, parseLocalDate } from "./dateHelpers";

/** A real local calendar day in "YYYY-MM-DD" form. */
export function isCalendarDateKey(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    localDateString(parseLocalDate(value)) === value
  );
}

/**
 * Whole years from a date of birth to a day, both local "YYYY-MM-DD", or
 * null when either is not a real day or the day comes before the birth.
 * A birthday on 29 February comes on 1 March in a year without one.
 */
export function ageOn(dateOfBirth: string, day: string): number | null {
  if (!isCalendarDateKey(dateOfBirth) || !isCalendarDateKey(day)) return null;
  if (day < dateOfBirth) return null;
  const [by, bm, bd] = dateOfBirth.split("-").map(Number);
  const [y, m, d] = day.split("-").map(Number);
  const beforeBirthday = m < bm || (m === bm && d < bd);
  return y - by - (beforeBirthday ? 1 : 0);
}

/** Why a date of birth cannot be kept. */
export type DateOfBirthProblem = "invalid" | "future" | "too-young" | "too-old";

/** Why `dateOfBirth` cannot be kept on `today`, or null when it can. */
export function dateOfBirthProblem(
  dateOfBirth: string,
  today: string
): DateOfBirthProblem | null {
  if (!isCalendarDateKey(dateOfBirth)) return "invalid";
  const years = ageOn(dateOfBirth, today);
  if (years === null) return "future";
  if (years < AGE_YEARS.min) return "too-young";
  if (years > AGE_YEARS.max) return "too-old";
  return null;
}

/** What setup and Settings say about a date of birth they cannot keep. The
 *  under-16 line is setup's age gate, word for word. */
export const DATE_OF_BIRTH_MESSAGES: Record<DateOfBirthProblem, string> = {
  invalid: "Enter your whole date of birth.",
  future: "That date is in the future.",
  "too-young": `You need to be at least ${AGE_YEARS.min} to use Tropos.`,
  "too-old": "Check the year you were born.",
};

/** The first and last dates of birth a date picker offers on `today`: the
 *  day after someone turns 121, and today. Inside them a date can still
 *  make someone under 16, which `dateOfBirthProblem` says. */
export function dateOfBirthBounds(today: string): { min: string; max: string } {
  const day = parseLocalDate(today);
  const oldest = new Date(
    day.getFullYear() - (AGE_YEARS.max + 1),
    day.getMonth(),
    day.getDate()
  );
  return { min: localDateString(addLocalDays(oldest, 1)), max: today };
}

/**
 * The age the calorie maths and the heart-rate zones use: from the date of
 * birth when there is one, else the `age` an older account was given at
 * setup. Undefined when there is neither, and each caller keeps the default
 * it had.
 */
export function profileAge(
  profile:
    | { dateOfBirth?: string | null; age?: number | null }
    | null
    | undefined,
  today: string = localDateString()
): number | undefined {
  if (!profile) return undefined;
  const fromBirth = profile.dateOfBirth
    ? ageOn(profile.dateOfBirth, today)
    : null;
  return fromBirth ?? profile.age ?? undefined;
}
