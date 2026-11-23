/**
 * Adding or removing a sport after setup (TrainWk1 step 6; the Train grill's
 * Q27, Q28, Q31 to Q33). One place says what each change builds, so the Lift
 * plan and Run plan editors, and Train's rows that open them, can never
 * differ.
 *
 * Three changes are built here: add lifting with setup's three lifting
 * answers, remove lifting, remove running. Each gives the plan builder's
 * input and the profile fields saved beside its output, or a refusal with
 * the sentence that says why. Adding running is Run plan's own save, since
 * the goal card the person chooses decides that plan; this module gives it
 * the refusal and the level it writes (`runningAdded`), and the layout its
 * run days go around (`layoutWithSport`).
 *
 * What a change writes (TrainWk1 STATUS of 18 November 2026, calls 4 to 7):
 *   - the plan, through `buildPlan` and `configurePlan`, and the running
 *     level (`runFrequency`). Never `athleteType`, which stays setup's answer
 *     for the first-week numbers (App1 Q23); what a person trains is read
 *     from the plan (`trainingKind`).
 *   - Removing a sport takes its days off the plan and nothing a person
 *     logged: saved workouts and runs, and best lifts, stay where they are,
 *     outside the plan. Lifting added again starts each lift done before
 *     from its last session (`withLastLoads`, which Lift plan applies to
 *     the built plan).
 *   - A person always keeps one sport: removing the last is refused. So is
 *     removing running while a race goal is set (choose No race first), and
 *     removing lifting while a training block runs (end the block first).
 *
 * The week's layout keeps the other sport's days. `planWeekSchedule` gives
 * a new default week whenever a count changes, which would move a runner's
 * runs to other days, mid-week, for adding lifting. So the layout handed to
 * the builder already has the change in it (`layoutWithoutSport`,
 * `layoutWithSport`), with the counts the builder will match.
 */
import type { UserProfile } from "./auth";
import { SLOT_ORDER, type ScheduleDay } from "./scheduleUtils";
import { weekScheduleFor } from "./trainingResolver";
import { trainingKind } from "./trainingKind";
import { MIN_RACE_RUN_DAYS } from "./raceGoalPlanner";
import { addLocalDays, localDateString, parseLocalDate } from "./dateHelpers";
import { isVolumeEligible } from "./runStatsEligibility";
import type { PlanBuilderInput } from "@/features/program/planBuilder";
import { liftPlanInput, savedLiftPlan } from "@/features/program/liftPlanInput";
import {
  RECENT_RUN_DAYS,
  type DatedRun,
  type LayoffClass,
} from "@/features/program/layoffDetection";
import {
  takesBarbellAtHome,
  takesSmallPlates,
} from "@/features/program/programLabels";
import {
  DEFAULT_PROGRAM_SETTINGS,
  type Equipment,
  type Experience,
  type ProgramState,
} from "@/features/program/programTypes";

export type Sport = "lifting" | "running";

/** Setup's answer to "how much do you run?", which a plan's running is
 *  built from (`runFrequency`; "none" is someone who doesn't run). */
export type RunLevel = "new" | "occasional" | "regular";

/** Setup's three lifting questions, answered: days and minutes, the kit and
 *  the experience, anything to work around. */
export interface LiftingAnswers {
  /** Two to six, as setup offers. */
  liftDays: number;
  sessionMinutes: number;
  equipment: Equipment;
  barbellAtHome: boolean;
  /** "A pull-up bar" (Lift4 (11)), the answer the plan follows where the
   *  kit takes one (`takesPullUpBar`). */
  pullUpBar: boolean;
  smallPlates: boolean;
  experience: Experience;
  injuries: string[];
}

/** The changes this module builds. */
export type SportIntent =
  | { kind: "add_lifting"; answers: LiftingAnswers }
  | { kind: "remove_lifting" }
  | { kind: "remove_running" };

/** Every change a person can ask for: adding running too, which Run plan's
 *  save builds (`runningAdded`). */
export type SportChangeKind = SportIntent["kind"] | "add_running";

export type SportRefusal =
  /** The change would leave the plan with no sport. */
  | "last_sport"
  /** Running with a race goal set. */
  | "race_plan"
  /** Lifting with a training block running. */
  | "training_block"
  /** Adding a sport the plan has. */
  | "on_plan"
  /** Removing a sport the plan doesn't have. */
  | "not_on_plan";

/** The profile fields a change writes beside the builder's own. */
export interface SportProfilePatch {
  runFrequency?: RunLevel | "none";
  nonRaceGoal?: null;
  raceGoal?: null;
  starterGoal?: null;
}

export type SportChange =
  | { ok: true; input: PlanBuilderInput; patch: SportProfilePatch }
  | { ok: false; refusal: SportRefusal; sentence: string };

/** Running added: the level Run plan's save writes beside its plan, or the
 *  refusal. */
export type RunningAdded =
  | { ok: true; patch: { runFrequency: RunLevel } }
  | { ok: false; refusal: SportRefusal; sentence: string };

export interface SportChangeContext {
  profile: UserProfile;
  programState: ProgramState | null;
  /** Local YYYY-MM-DD: the day the plan is built from. */
  today: string;
  recentLayoff: LayoffClass;
  recentRuns: readonly DatedRun[] | null;
}

const NAME: Record<Sport, string> = { lifting: "Lifting", running: "Running" };

/** The sentence for each refusal, in the house voice: the verdict, then
 *  the step. */
function refusalSentence(refusal: SportRefusal, sport: Sport): string {
  const other: Sport = sport === "lifting" ? "running" : "lifting";
  switch (refusal) {
    case "last_sport":
      return `Your plan is ${sport} only. To stop ${sport}, add ${other} first.`;
    case "race_plan":
      return "You’re training for a race. To stop running, choose No race first.";
    case "training_block":
      return "Your training block is still on. To stop lifting, end it on Train first.";
    case "on_plan":
      return `${NAME[sport]} is already on your plan.`;
    case "not_on_plan":
      return `${NAME[sport]} isn’t on your plan.`;
  }
}

/** Run plan's line in place of Stop running while a race plan is saved but
 *  the person has chosen a goal with no race and not saved it yet: the
 *  refusal's "choose No race first" is already done (owner's recording,
 *  23 November 2026). Draft words for the owner. */
export const RACE_PLAN_ENDS_ON_SAVE =
  "Save to end your race plan. Then you can stop running.";

/** Which sport an intent changes. */
export function sportOf(kind: SportChangeKind): Sport {
  return kind === "add_lifting" || kind === "remove_lifting"
    ? "lifting"
    : "running";
}

/**
 * Why the change can't be made, or null when it can. The editors show the
 * sentence in place of the action.
 */
export function sportChangeRefusal(
  profile: UserProfile,
  programState: ProgramState | null,
  kind: SportChangeKind
): { refusal: SportRefusal; sentence: string } | null {
  const plan = trainingKind(profile, programState);
  const sport = sportOf(kind);
  const has = sport === "lifting" ? plan.lifts : plan.runs;
  const hasOther = sport === "lifting" ? plan.runs : plan.lifts;
  const refuse = (refusal: SportRefusal) => ({
    refusal,
    sentence: refusalSentence(refusal, sport),
  });
  if (kind === "add_lifting" || kind === "add_running")
    return has ? refuse("on_plan") : null;
  if (!has) return refuse("not_on_plan");
  if (!hasOther) return refuse("last_sport");
  if (
    kind === "remove_running" &&
    (!!profile.raceGoal || profile.runMode === "race_prep")
  )
    return refuse("race_plan");
  if (kind === "remove_lifting" && programState?.trainingBlock)
    return refuse("training_block");
  return null;
}

/** The days a layout gives a sport: its own and the days holding both. */
function holds(day: ScheduleDay, sport: Sport): boolean {
  return (
    day.type === "both" || day.type === (sport === "lifting" ? "lift" : "run")
  );
}

/**
 * The layout with a sport's days taken off: its own days become rest, and a
 * day holding both keeps the other sport. The other sport's days don't move.
 */
export function layoutWithoutSport(
  layout: readonly ScheduleDay[],
  sport: Sport
): ScheduleDay[] {
  const other = sport === "lifting" ? "run" : "lift";
  return layout.map((day) => ({
    day: day.day,
    type: day.type === "both" ? other : holds(day, sport) ? "rest" : day.type,
  }));
}

/** The days between each chosen day and the next, round the week. */
function gapsRoundTheWeek(days: readonly number[]): number[] {
  const sorted = [...days].sort((a, b) => a - b);
  return sorted.map((day, i) =>
    i + 1 < sorted.length ? sorted[i + 1] - day : sorted[0] + 7 - day
  );
}

/** Whether a score beats another, the first differing place deciding. */
function ranksAbove(
  score: readonly number[],
  than: readonly number[]
): boolean {
  const i = score.findIndex((s, j) => s !== than[j]);
  return i >= 0 && score[i] > than[i];
}

/** Every way to choose `n` of `items`, in order. */
function choose<T>(items: readonly T[], n: number): T[][] {
  if (n === 0) return [[]];
  if (items.length < n) return [];
  const [head, ...tail] = items;
  return [
    ...choose(tail, n - 1).map((rest) => [head, ...rest]),
    ...choose(tail, n),
  ];
}

/**
 * The layout with `count` days of a sport added around the days it has,
 * which don't move. Tropos heuristic, in order: rest days before days that
 * would then hold both; for running, a weekend day when one is free (a
 * week's long run is a weekend's, as `defaultWeekSchedule` puts it); the
 * widest spacing between the sport's days, round the week; the fewest of
 * them back to back; then the days setup fills first (`SLOT_ORDER`: Monday,
 * Wednesday, Friday, then Tuesday, Thursday, Saturday, Sunday), so three
 * lift days into an empty week are setup's Monday, Wednesday and Friday. A
 * layout already holding the sport is returned as it is.
 */
export function layoutWithSport(
  layout: readonly ScheduleDay[],
  sport: Sport,
  count: number
): ScheduleDay[] {
  const week = layout.map((day) => ({ ...day }));
  if (count <= 0 || week.some((day) => holds(day, sport))) return week;
  const n = Math.min(7, count);
  const added = sport === "lifting" ? "lift" : "run";
  let best: { days: number[]; score: number[] } | null = null;
  for (const days of choose(
    week.map((day) => day.day),
    n
  )) {
    const doubles = days.filter((d) => week[d].type !== "rest").length;
    const weekendFree = [0, 6].some((d) => week[d].type === "rest");
    const onWeekend = days.some((d) => d === 0 || d === 6);
    const gaps = gapsRoundTheWeek(days);
    const fillOrder = days
      .map((d) => SLOT_ORDER.indexOf(d))
      .sort((a, b) => a - b);
    const score = [
      -doubles,
      sport === "running" && weekendFree && onWeekend ? 1 : 0,
      n > 1 ? Math.min(...gaps) : 0,
      -gaps.filter((gap) => gap === 1).length,
      // Setup's order last: the earlier a day is filled there, the better.
      ...fillOrder.map((rank) => -rank),
    ];
    if (!best || ranksAbove(score, best.score)) best = { days, score };
  }
  for (const d of best?.days ?? [])
    week[d] = { day: d, type: week[d].type === "rest" ? added : "both" };
  return week;
}

/**
 * Whether Run plan offers Run9's starter goal, 30 minutes without stopping:
 * to anyone adding running (the Train grill's Q32: "new to running" is who
 * a lifter adding running is), to someone who runs only, to anyone new to
 * running, to anyone on it already, and when a card asked for it
 * (`?goal=starter`).
 */
export function starterOfferedTo(
  profile: UserProfile,
  programState: ProgramState | null,
  asked = false
): boolean {
  const plan = trainingKind(profile, programState);
  return (
    !plan.runs ||
    !plan.lifts ||
    profile.runFrequency === "new" ||
    profile.runMode === "starter" ||
    asked
  );
}

/**
 * The plan a running level starts on, as setup starts it: new to running
 * begins the starter goal on two runs a week; anyone else runs freely, with
 * two or three run days kept ready for a goal they choose
 * (`Onboarding.tsx`'s running question).
 */
export function runLevelStart(level: RunLevel): {
  runMode: "starter" | "freeform";
  weeklyRunDays: number;
} {
  return {
    runMode: level === "new" ? "starter" : "freeform",
    weeklyRunDays: level === "regular" ? 3 : MIN_RACE_RUN_DAYS,
  };
}

/**
 * The running level a plan that runs already shows, for a profile that
 * keeps none: one set up before the level was kept (11 October 2026), or
 * one that says "none" beside its running. `trainingKind` reads such a
 * person as running only while the plan has no lifts, so adding lifting
 * writes the level their running matches, or the running would leave the
 * plan with it.
 *
 * Read from their run days a week: the plan's own (its week's layout)
 * where it has any, and otherwise the runs saved in the last four weeks
 * (`RECENT_RUN_DAYS`). Three or more a week is "regular", setup's Regular
 * runner ("three or more runs a week"); fewer is "occasional", and so is
 * a week that can't be read. Never "new": that is someone starting out,
 * whose first weeks of a race plan are counted from the day setup
 * finished, and a person whose plan runs already is not starting. Tropos
 * heuristic.
 */
export function runLevelOfRunning(
  profile: UserProfile,
  recentRuns: readonly DatedRun[] | null,
  today: string
): Exclude<RunLevel, "new"> {
  const planDays = weekScheduleFor(profile).filter((day) =>
    holds(day, "running")
  ).length;
  if (planDays > 0) return planDays >= 3 ? "regular" : "occasional";
  if (!recentRuns) return "occasional";
  const weeks = RECENT_RUN_DAYS / 7;
  const from = localDateString(
    addLocalDays(parseLocalDate(today), 1 - RECENT_RUN_DAYS)
  );
  const saved = recentRuns.filter(
    (run) =>
      !!run.date &&
      run.date >= from &&
      run.date <= today &&
      isVolumeEligible(run)
  ).length;
  return saved >= 3 * weeks ? "regular" : "occasional";
}

/**
 * Running added from Run plan: the level its save writes beside the plan
 * the chosen goal card builds, or why it can't be added.
 */
export function runningAdded(
  profile: UserProfile,
  programState: ProgramState | null,
  level: RunLevel
): RunningAdded {
  const refused = sportChangeRefusal(profile, programState, "add_running");
  if (refused) return { ok: false, ...refused };
  return { ok: true, patch: { runFrequency: level } };
}

/**
 * The plan builder's input and the profile fields for a sport added or
 * removed, or the refusal. The lifting stays as it is when running changes,
 * and the running when lifting does: both build from the saved setup over
 * the programme the person has (`preserveHistory`).
 */
export function sportChange(
  ctx: SportChangeContext,
  intent: SportIntent
): SportChange {
  const { profile, programState, today, recentLayoff, recentRuns } = ctx;
  const refused = sportChangeRefusal(profile, programState, intent.kind);
  if (refused) return { ok: false, ...refused };

  const saved = savedLiftPlan(profile);
  const layout = weekScheduleFor(profile);
  const base = (
    plan: ProgramState | null,
    draft: Partial<Parameters<typeof liftPlanInput>[0]["draft"]> = {}
  ): PlanBuilderInput => ({
    ...liftPlanInput({
      profile,
      programState: plan,
      saved,
      draft: { ...saved, ...draft },
      recentLayoff,
      recentRuns,
    }),
    currentDate: today,
  });

  switch (intent.kind) {
    case "add_lifting": {
      const { answers } = intent;
      if (
        !Number.isInteger(answers.liftDays) ||
        answers.liftDays < 2 ||
        answers.liftDays > 6
      )
        throw new RangeError(`lift days ${answers.liftDays} is not 2 to 6`);
      // Only what the kit takes, as setup saves it: no barbell beside a
      // full gym, no small plates with no equipment.
      const smallPlates =
        takesSmallPlates(answers.equipment) && answers.smallPlates;
      // "I have small plates" is the programme's setting, which a plan the
      // person has keeps through a build, so the answer goes on it here.
      const plan = programState
        ? {
            ...programState,
            settings: {
              ...(programState.settings ?? DEFAULT_PROGRAM_SETTINGS),
              smallPlates,
            },
          }
        : null;
      const input = base(plan, {
        liftDays: answers.liftDays,
        sessionMinutes: answers.sessionMinutes,
        equipment: answers.equipment,
        barbellAtHome:
          takesBarbellAtHome(answers.equipment) && answers.barbellAtHome,
        pullUpBar: answers.pullUpBar,
        experience: answers.experience,
        injuries: answers.injuries,
      });
      // Running that only `!lifts` said is on the plan keeps its place once
      // there are lifts: the level goes with it (`runLevelOfRunning`).
      const level = profile.runFrequency;
      return {
        ok: true,
        input: {
          ...input,
          smallPlates,
          weekSchedule: layoutWithSport(layout, "lifting", answers.liftDays),
        },
        patch:
          !level || level === "none"
            ? { runFrequency: runLevelOfRunning(profile, recentRuns, today) }
            : {},
      };
    }
    case "remove_lifting":
      return {
        ok: true,
        input: {
          ...base(programState, { liftDays: 0 }),
          weekSchedule: layoutWithoutSport(layout, "lifting"),
        },
        patch: {},
      };
    case "remove_running": {
      const { raceGoal: _race, ...input } = base(programState);
      return {
        ok: true,
        input: {
          ...input,
          runMode: "freeform",
          // Takes a plan with no race date away (Run24 (3)).
          rollingGoal: null,
          weeklyRunDays: 0,
          weekSchedule: layoutWithoutSport(layout, "running"),
        },
        patch: {
          runFrequency: "none",
          ...(profile.nonRaceGoal ? { nonRaceGoal: null } : {}),
          ...(profile.raceGoal ? { raceGoal: null } : {}),
          // A starter goal, running or kept from before, says the person
          // runs (`trainingKind`), so it goes with the running.
          ...(profile.starterGoal ? { starterGoal: null } : {}),
        },
      };
    }
  }
}
