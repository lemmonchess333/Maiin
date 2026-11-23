/**
 * Sex as the calorie maths and the starting loads read it.
 *
 * `profile.sex` is stored only when the person answered female or male.
 * "Prefer not to say" stores none, and so does an account that never
 * answered; none is never read as male.
 *
 * A figure that differs by sex takes the person's answer, or, with none,
 * the mean of the two (owner, 22 November 2026): a figure between, not a
 * guess at either. `figureForSex` is that rule, and every reader of a sex
 * constant goes through it (`tdee.ts`, `startingLoads.ts`,
 * `microTargets.ts`).
 */
export type Sex = "male" | "female";

export function isSex(value: unknown): value is Sex {
  return value === "male" || value === "female";
}

/** The answer's figure, or the mean of the two when there is no answer. */
export function figureForSex(
  figures: Readonly<Record<Sex, number>>,
  sex: unknown
): number {
  return isSex(sex) ? figures[sex] : (figures.male + figures.female) / 2;
}

/** Setup's answer as stored: female or male, and nothing for "Prefer not
 *  to say" or any other answer. */
export function sexFromAnswer(answer: unknown): Sex | undefined {
  return isSex(answer) ? answer : undefined;
}
