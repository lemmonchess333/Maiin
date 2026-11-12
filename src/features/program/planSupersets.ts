/**
 * The supersets a plan writes (Lift22): in a 30 or 45 minute plan, a day's
 * last lifts are done in pairs, one set of each and then the rest, and the
 * time that saves goes to lifts the day had given up (`sizeSessionsToTime`).
 *
 * A pair is two neighbouring lifts after the day's main lift. Never two for
 * the same muscle, never a barbell lift, and at least one of the two an
 * isolation: a supporting dumbbell, cable or machine lift may pair with an
 * isolation for another muscle (STATUS 2026-11-12), and two supporting
 * compounds may not. Pairs are taken from the end of the day. A beginner's
 * plan writes none: whether it should is not decided.
 *
 * The first lift of a pair holds its partner's slot (`supersetWith`, the
 * next lift's `instanceId`), so a pair lasts only while the two stand
 * together. A lift moved between them, or either one removed, ends it with
 * nothing to clear. A superset a person makes in a session stays the
 * session's (`superset.ts`) and never reaches the plan.
 */

import { getExerciseById } from "@/lib/exercises";
import { exerciseRole } from "./exerciseRole";
import { toExperience } from "./experienceModel";
import type { Experience, ProgramExercise } from "./programTypes";
import { pairedWithNext } from "./pairSlot";
import type { SessionSuperset } from "./superset";
import { primaryJudgementForExercise } from "./volumeModel";

/** The longest session a plan pairs lifts in (Lift22 call 1): from 60
 *  minutes a day holds five lifts and keeps straight sets. */
export const LONGEST_PAIRED_SESSION_MINUTES = 45;

export { pairedWithNext };

type Pairable = Pick<
  ProgramExercise,
  | "exerciseId"
  | "movementCategory"
  | "isAccessory"
  | "repUnit"
  | "instanceId"
  | "supersetWith"
>;

/** Whether a plan of this length and level writes pairs. */
export function plansPairs(
  minutes: number,
  experience: Experience | string | undefined
): boolean {
  return (
    Number.isFinite(minutes) &&
    minutes <= LONGEST_PAIRED_SESSION_MINUTES &&
    toExperience(experience) !== "beginner"
  );
}

const isIsolation = (ex: Pairable) => exerciseRole(ex) === "isolation";
const isBarbell = (ex: Pairable) =>
  getExerciseById(ex.exerciseId)?.equipment === "Barbell";

/** A lift that may stand in a pair at all: after the main lift, with a
 *  slot to be named by, and counted in reps. */
function mayPair(ex: Pairable): boolean {
  return (
    ex.isAccessory === true &&
    ex.repUnit !== "seconds" &&
    !!ex.instanceId &&
    !isBarbell(ex)
  );
}

/** Whether two neighbouring lifts may be done as a pair. */
export function canPair(a: Pairable, b: Pairable): boolean {
  if (!mayPair(a) || !mayPair(b)) return false;
  if (!isIsolation(a) && !isIsolation(b)) return false;
  const muscleA = primaryJudgementForExercise(a);
  const muscleB = primaryJudgementForExercise(b);
  return muscleA !== null && muscleB !== null && muscleA !== muscleB;
}

/** The day's lifts with no pairs. */
export function withoutPairs<T extends Pairable>(exercises: readonly T[]): T[] {
  return exercises.map((ex) => {
    if (ex.supersetWith === undefined) return ex;
    const { supersetWith: _gone, ...rest } = ex;
    return rest as T;
  });
}

/**
 * The day's lifts with their pairs written: from the end of the day, among
 * the run of lifts after its last main lift, each two neighbours that may
 * pair do, and a lift that cannot pair with the one after it is passed
 * over. Copies; the lifts given are untouched.
 */
export function writePairs<T extends Pairable>(exercises: readonly T[]): T[] {
  const out = withoutPairs(exercises).map((ex) => ({ ...ex }));
  let start = out.length;
  while (start > 0 && out[start - 1].isAccessory === true) start--;
  let k = out.length - 1;
  while (k - 1 >= start) {
    const a = out[k - 1];
    const b = out[k];
    if (canPair(a, b)) {
      a.supersetWith = b.instanceId;
      k -= 2;
    } else k -= 1;
  }
  return out;
}

/** The plan's pairs as the session's supersets, so a day's pairs open
 *  as supersets on the workout screen. */
export function plannedSupersets(
  exercises: ReadonlyArray<Pick<ProgramExercise, "instanceId" | "supersetWith">>
): SessionSuperset[] {
  const out: SessionSuperset[] = [];
  exercises.forEach((ex, i) => {
    if (pairedWithNext(exercises, i))
      out.push({ ids: [ex.instanceId!, exercises[i + 1].instanceId!] });
  });
  return out;
}
