/**
 * A person's age, worked out from the year of birth the profile stores.
 *
 * App1 (grill Q57 and Q21; the owner chose a year of birth over a full date
 * and over the age range, 13 November 2026): the year of birth is the one
 * stored fact about a person's age. The age the calorie maths and the
 * heart-rate zones read is worked out from it on the day they read it, so
 * it goes up as the years do, which the stored `age` number never did
 * (grill Round 6). An account set up before then has no year of birth, and
 * its `age` is read in its place until it adds one; `age` is never written
 * for an account with a year of birth, and `ageRange` is never written at
 * all.
 *
 * A year is not a birthday, so the age is the one a person born that year
 * most likely is on the day: half of them have had their birthday by
 * 1 July. That is a year younger than the year's difference before then
 * and the difference from then on, with no lean either way.
 *
 * The limits are counted in the year's terms (this year less the year of
 * birth), the same in setup and Settings: a year of birth of this year less
 * 16 or earlier passes, and a later one meets setup's under-16 line; one
 * earlier than this year less 120 is refused (`AGE_YEARS`, the server's
 * range).
 */
import { AGE_YEARS } from "./bodyMetrics";
import { localDateString } from "./dateHelpers";

const yearOf = (day: string) => Number(day.slice(0, 4));

/**
 * The age someone born in `birthYear` most likely is on `day` (a local
 * "YYYY-MM-DD"): the year's difference less one before 1 July, the year's
 * difference from 1 July.
 */
export function ageFromBirthYear(birthYear: number, day: string): number {
  const beforeJuly = day.slice(5) < "07-01";
  return yearOf(day) - birthYear - (beforeJuly ? 1 : 0);
}

/** A year of birth as typed: four digits, or null. */
export function parseBirthYear(text: string): number | null {
  const trimmed = text.trim();
  return /^\d{4}$/.test(trimmed) ? Number(trimmed) : null;
}

/** Why a year of birth cannot be kept. */
export type BirthYearProblem = "invalid" | "too-young" | "too-old";

/**
 * Why `birthYear` cannot be kept on `today`, or null when it can: a year
 * after this one, under 16 in the year's terms, or over 120.
 */
export function birthYearProblem(
  birthYear: number,
  today: string
): BirthYearProblem | null {
  const years = yearOf(today) - birthYear;
  if (!Number.isInteger(birthYear) || years < 0) return "invalid";
  if (years < AGE_YEARS.min) return "too-young";
  if (years > AGE_YEARS.max) return "too-old";
  return null;
}

/** What setup and Settings say about a year of birth they cannot keep. The
 *  under-16 line is setup's age gate, word for word. */
export const BIRTH_YEAR_MESSAGES: Record<BirthYearProblem, string> = {
  invalid: "Check the year you were born.",
  "too-young": `You need to be at least ${AGE_YEARS.min} to use Tropos.`,
  "too-old": "Check the year you were born.",
};

/**
 * The age the calorie maths and the heart-rate zones use: from the year of
 * birth when there is one, else the `age` an older account was given at
 * setup. Undefined when there is neither, and each caller keeps the default
 * it had.
 */
export function profileAge(
  profile:
    { birthYear?: number | null; age?: number | null } | null | undefined,
  today: string = localDateString()
): number | undefined {
  if (!profile) return undefined;
  const { birthYear } = profile;
  if (typeof birthYear === "number" && Number.isInteger(birthYear)) {
    const years = ageFromBirthYear(birthYear, today);
    if (years >= 0) return years;
  }
  return profile.age ?? undefined;
}
