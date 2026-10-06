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
 *  - The week before a lighter one comes from `generateWeekPrescription`,
 *    or with a race plan from the run plan's step-back weeks
 *    (`isRunStepBackWeek`), where advanceWeek puts the lighter week then.
 *    advanceWeek withholds the lighter recipe after a week with no training
 *    in it, so the lighter week is "planned", never promised.
 *  - The hold is `isProgressionHeld`, called exactly as session completion
 *    calls it, so the sentence appears in the weeks progression is held.
 */
import {
  generateWeekPrescription,
  lighterWeeksScheduled,
  raceBlockWeek,
  type RaceBlockWeek,
} from "@/features/program/weekPrescription";
import { isRunStepBackWeek } from "@/features/program/runPlanTiming";
import { loadsTheLegs } from "@/features/program/easierToday";
import {
  addLocalDays,
  localDateString,
  parseLocalDate,
} from "@/lib/dateHelpers";
import { isDemandingScheduledRun } from "@/lib/runSpacing";
import { RUN_TEMPLATES, isScheduledRaceRunDay } from "@/lib/workoutTemplates";
import { formatWeekdayDayMonth } from "@/utils/formatters";
import type {
  Experience,
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
    | "weekNumber"
    | "currentPhase"
    | "primaryGoal"
    | "trainingBlock"
    | "workouts"
    | "runPlan"
    | "raceWeek"
    | "runDays"
    | "settings"
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
  "This is a lighter week, with half the sets at the same weights, so the fatigue of recent weeks can clear.";

/* Lift4 (10): the race's final weeks, each a lighter week for its own
   reason. */
export const RACE_TAPER =
  "This is a lighter week before your race, with half the sets at the same weights, so you start it fresh.";

export const RACE_WEEK =
  "This is race week: one short session, with nothing heavy for your legs.";

export const RACE_AFTER =
  "This is a lighter week after your race, with half the sets at the same weights, while you recover.";

/** Lift4 (10): a leg session the day before a long run or a key session. */
export const legsBefore = (run: string) =>
  `Your ${run} is the next day, and heavy leg work can leave your legs tired for it.`;

/* Lift4 (10): a build week's leg trim, on a yes at race setup. */
export const RACE_BUILD_LEGS =
  "Your leg lifts have a third fewer sets at the same weights while your runs build, as you chose for your race.";

/** The run the day after a session, when it is a long run or a key
 *  session (`isDemandingScheduledRun`), named as the note below names it.
 *  The plan leaves a leg session before one where it is: the person
 *  decides (Lift4 (10)). */
function demandingRunNextDay(
  programme: LiftPurposeProgramme,
  date: string
): string | null {
  const day = parseLocalDate(date);
  if (Number.isNaN(day.getTime())) return null;
  const next = localDateString(addLocalDays(day, 1));
  const run = programme.runDays?.find(
    (rd) => rd.date === next && isDemandingScheduledRun(rd)
  );
  if (!run) return null;
  if (isScheduledRaceRunDay(run)) return "race";
  const type =
    RUN_TEMPLATES.find((template) => template.id === run.userOverride)?.type ??
    run.type;
  return type === "long"
    ? "long run"
    : type === "tempo"
      ? "tempo run"
      : type === "intervals"
        ? "interval session"
        : "hard run";
}

/** Whether the race build's trim took sets off one of the day's leg lifts
 *  (a lift of two sets keeps them). */
function legsTrimmed(day: Partial<Pick<WorkoutDay, "exercises">>): boolean {
  return (day.exercises ?? []).some(
    (ex) =>
      loadsTheLegs(ex) && ex.baseSets !== undefined && ex.sets < ex.baseSets
  );
}

/** Race week's last day to lift: three days before the race. */
function raceWeekCutoff(targetDate: string | undefined): string | null {
  if (!targetDate) return null;
  const race = parseLocalDate(targetDate);
  return Number.isNaN(race.getTime())
    ? null
    : formatWeekdayDayMonth(addLocalDays(race, -3));
}

export const LAST_FULL_WEEK =
  "This is the last full week before a lighter one, planned for next week.";

export const CYCLE = `Your plan builds for ${count(buildWeeks())} weeks, then a lighter week follows.`;

export const RACE_CYCLE =
  "Your lighter weeks fall on your run plan's easier weeks.";

/** Whether a later week of the race block is one of the run plan's
 *  step-back weeks. */
function stepBackAhead(race: RaceBlockWeek): boolean {
  for (let w = race.weekIndex + 1; w < race.totalWeeks; w++) {
    if (isRunStepBackWeek(w, race.totalWeeks, race.distance)) return true;
  }
  return false;
}

/** What a full week says of the lighter weeks to come: that the next week
 *  is one, or how they come, or nothing on the week the calendar marks as
 *  one that came full. */
function lighterWeeksAhead(
  programme: LiftPurposeProgramme,
  week: number
): string | null {
  const race = raceBlockWeek(programme.runPlan);
  if (race) {
    const { weekIndex, totalWeeks, distance } = race;
    if (
      weekIndex + 1 < totalWeeks &&
      isRunStepBackWeek(weekIndex + 1, totalWeeks, distance)
    ) {
      return LAST_FULL_WEEK;
    }
    return stepBackAhead(race) &&
      !isRunStepBackWeek(weekIndex, totalWeeks, distance)
      ? RACE_CYCLE
      : null;
  }
  if (generateWeekPrescription(week + 1).deload) return LAST_FULL_WEEK;
  return generateWeekPrescription(week).deload ? null : CYCLE;
}

export const HOLD = `Your weights hold for the first ${count(EASING_HOLD_WEEKS)} weeks of the block while you ease back in.`;

/**
 * @param date the day's local YYYY-MM-DD — the date the session falls on
 *   where the surface has one, today on Train's split-ordered lift tab.
 * @param experience the person's level, which with the plan's day count
 *   decides whether the calendar brings lighter weeks at all
 *   (`lighterWeeksScheduled`).
 */
export function liftSessionPurpose(
  programme: LiftPurposeProgramme | null | undefined,
  day:
    | (Pick<WorkoutDay, "isCustom"> & Partial<Pick<WorkoutDay, "exercises">>)
    | null
    | undefined,
  date: string,
  experience?: Experience
): string | null {
  const week = programme?.weekNumber;
  if (!programme || !day || week === undefined) return null;
  if (!Number.isInteger(week) || week < 1) return null;

  const block = programme.trainingBlock;
  const blockWeek = block ? blockWeekOf(block, date) : null;
  const held = isProgressionHeld(block, blockWeek);
  const sentences: string[] = [];

  if (programme.currentPhase === "deload") {
    const raceWeek = programme.raceWeek;
    if (raceWeek === "race") {
      sentences.push(RACE_WEEK);
      const cutoff = raceWeekCutoff(programme.runPlan?.raceGoal?.targetDate);
      sentences.push(
        cutoff
          ? `Lift by ${cutoff}, three days before the race.`
          : "Lift at least three days before the race."
      );
    } else {
      sentences.push(
        raceWeek === "taper"
          ? RACE_TAPER
          : raceWeek === "after"
            ? RACE_AFTER
            : LIGHTER_WEEK
      );
    }
  } else {
    if (!day.isCustom) {
      const focus =
        (block?.owned && blockWeek !== null
          ? block.focus
          : programme.primaryGoal) ?? "general";
      sentences.push(FOCUS_PURPOSE[focus] ?? FOCUS_PURPOSE.general);
    }
    if (programme.raceWeek === "build" && legsTrimmed(day)) {
      sentences.push(RACE_BUILD_LEGS);
    }
    if (lighterWeeksScheduled(experience, programme.workouts?.length ?? 0)) {
      const ahead = lighterWeeksAhead(programme, week);
      if (ahead) sentences.push(ahead);
    }
  }
  // Heavy legs the day before a long run or a key session stay the
  // person's choice: said once, here, and nothing moves (Lift4 (10)). Not in
  // race week, which has nothing heavy for the legs.
  if (
    programme.raceWeek !== "race" &&
    (day.exercises ?? []).some(loadsTheLegs)
  ) {
    const run = demandingRunNextDay(programme, date);
    if (run) sentences.push(legsBefore(run));
  }
  if (held) sentences.push(HOLD);
  return sentences.length > 0 ? sentences.join(" ") : null;
}
