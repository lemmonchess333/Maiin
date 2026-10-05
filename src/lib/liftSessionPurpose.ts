/**
 * liftSessionPurpose — what a lift day's "Why this session" says.
 *
 * Home's and Train's cards show the session and its dose; the reason for
 * it sits one tap away in the day's details (the owner's daily-logging
 * direction in DESIGN_GUIDE.md). Runs have had that ("Why this run"), and
 * a lift day had nothing to open.
 * This writes it, in sentences, from what the programme stores and nothing
 * else, and returns null when there is no programme to read.
 *
 * Every sentence restates an engine rule, so each is read from the rule
 * rather than written from memory:
 *
 *  - The focus sentence says what the session is built for: the user's
 *    training focus, or the block's while a block owns the plan.
 *    `goalProfileFor` and `volumeLandmark` set the reps and the weekly sets
 *    it describes, and `liftSessionPurpose.test.ts` fails if either moves
 *    under the words. It explains the focus rather than naming it: Train's
 *    week row already names it in Settings' words ("Build muscle"), and a
 *    second name for one setting on the same screen is the two-vocabulary
 *    problem `programHeaderLine` was trimmed to avoid.
 *    A day the user built themselves (`isCustom`) gets no focus sentence:
 *    its reps are whatever they chose.
 *  - "A lighter week" only when `currentPhase` is "deload", which is set
 *    only once the lighter recipe has actually been applied (advanceWeek's
 *    `applyDeloadThisWeek`, or the applyDeloadWeek command). It replaces
 *    the focus sentence: "heavier main lifts" over a lighter week would
 *    say two things at once.
 *  - The week before a lighter one comes from `generateWeekPrescription`.
 *    advanceWeek withholds the lighter recipe after a week with no training
 *    in it, so the lighter week is "planned", never promised.
 *  - The hold is `isProgressionHeld`, called exactly as session completion
 *    calls it, so the sentence appears in the weeks progression is held.
 */
import { generateWeekPrescription } from "@/features/program/weekPrescription";
import type {
  PrimaryGoal,
  ProgramState,
  WorkoutDay,
} from "@/features/program/programTypes";
import {
  blockWeekOf,
  EASING_HOLD_WEEKS,
  isProgressionHeld,
} from "@/features/program/trainingBlock";

export type LiftPurposeProgramme = Partial<
  Pick<
    ProgramState,
    "weekNumber" | "currentPhase" | "primaryGoal" | "trainingBlock"
  >
>;

/** What a session built for each focus asks of the lifting. */
export const FOCUS_PURPOSE: Record<PrimaryGoal, string> = {
  strength:
    "This session is built for strength: heavier main lifts for lower reps.",
  hypertrophy:
    "This session is built for muscle growth: higher reps, and more weekly sets for each muscle.",
  fat_loss:
    "This session is built to keep your strength and muscle while you lose fat.",
  general:
    "This session is built for general fitness: a balanced mix of reps and sets.",
  running:
    "This session is built to support your running: heavy main lifts and fewer sets, so the lifting doesn't compete with your runs.",
};

const NUMBER_WORDS = ["no", "one", "two", "three", "four"];

function count(n: number): string {
  return NUMBER_WORDS[n] ?? String(n);
}

/** Weeks a lighter week comes after, read from the engine's cadence. */
function buildWeeks(): number {
  let week = 1;
  while (!generateWeekPrescription(week).deload) week += 1;
  return week - 1;
}

export const LIGHTER_WEEK =
  "This is a lighter week, with fewer sets and easier targets, so the fatigue of recent weeks can clear.";

export const LAST_FULL_WEEK =
  "This is the last full week before a lighter one, planned for next week.";

export const CYCLE = `Your plan builds for ${count(buildWeeks())} weeks, then a lighter week follows.`;

export const HOLD = `Your weights hold for the first ${count(EASING_HOLD_WEEKS)} weeks of the block while you ease back in.`;

/**
 * @param date the day's local YYYY-MM-DD — the date the session falls on
 *   where the surface has one, today on Train's split-ordered lift tab.
 */
export function liftSessionPurpose(
  programme: LiftPurposeProgramme | null | undefined,
  day: Pick<WorkoutDay, "isCustom"> | null | undefined,
  date: string
): string | null {
  const week = programme?.weekNumber;
  if (!programme || !day || week === undefined) return null;
  if (!Number.isInteger(week) || week < 1) return null;

  const block = programme.trainingBlock;
  const blockWeek = block ? blockWeekOf(block, date) : null;
  const held = isProgressionHeld(block, blockWeek);
  const sentences: string[] = [];

  if (programme.currentPhase === "deload") {
    sentences.push(LIGHTER_WEEK);
  } else {
    if (!day.isCustom) {
      const focus =
        (block?.owned && blockWeek !== null
          ? block.focus
          : programme.primaryGoal) ?? "general";
      sentences.push(FOCUS_PURPOSE[focus] ?? FOCUS_PURPOSE.general);
    }
    if (generateWeekPrescription(week + 1).deload) {
      sentences.push(LAST_FULL_WEEK);
    } else if (!generateWeekPrescription(week).deload) {
      sentences.push(CYCLE);
    }
  }
  if (held) sentences.push(HOLD);
  return sentences.length > 0 ? sentences.join(" ") : null;
}
