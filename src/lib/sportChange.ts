/**
 * Adding or removing a sport after setup (TrainWk1 step 6; the Train grill's
 * Q27, Q28, Q31 to Q33). One place says what each change builds, so the Lift
 * plan and Run plan editors, and Train's rows that open them, can never
 * differ.
 *
 * Four intents: add lifting with setup's three lifting answers, remove
 * lifting, add running at a running level, remove running. Each gives the
 * plan builder's input and the profile fields saved beside its output, or
 * a refusal with the sentence that says why.
 *
 * What a change writes (TrainWk1 STATUS of 18 November 2026, calls 4 to 7):
 *   - the plan, through `buildPlan` and `configurePlan`, and the running
 *     level (`runFrequency`). Never `athleteType`, which stays setup's answer
 *     for the first-week numbers (App1 Q23); what a person trains is read
 *     from the plan (`trainingKind`).
 *   - Removing a sport takes its days off the plan and nothing a person
 *     logged: saved workouts and runs, best lifts and the weights in them
 *     stay where they are, outside the plan.
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
import type { ScheduleDay } from "./scheduleUtils";
import { weekScheduleFor } from "./trainingResolver";
import { trainingKind } from "./trainingKind";
import { MIN_RACE_RUN_DAYS } from "./raceGoalPlanner";
import type { PlanBuilderInput } from "@/features/program/planBuilder";
import { liftPlanInput, savedLiftPlan } from "@/features/program/liftPlanInput";
import type { DatedRun, LayoffClass } from "@/features/program/layoffDetection";
import { profileNewRunnerUntil } from "@/features/program/newRunner";
import {
  setStarterGoalPatch,
  type StarterGoal,
} from "@/features/program/runModeResolution";
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

export type SportIntent =
  | { kind: "add_lifting"; answers: LiftingAnswers }
  | { kind: "remove_lifting" }
  | { kind: "add_running"; level: RunLevel }
  | { kind: "remove_running" };

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
  starterGoal?: StarterGoal | null;
}

export type SportChange =
  | { ok: true; input: PlanBuilderInput; patch: SportProfilePatch }
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

/** Which sport an intent changes. */
export function sportOf(kind: SportIntent["kind"]): Sport {
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
  kind: SportIntent["kind"]
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
 * them back to back; then the earliest days. A layout already holding the
 * sport is returned as it is.
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
    const score = [
      -doubles,
      sport === "running" && weekendFree && onWeekend ? 1 : 0,
      n > 1 ? Math.min(...gaps) : 0,
      -gaps.filter((gap) => gap === 1).length,
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
      // "I have small plates" is the programme's setting, which a plan the
      // person has keeps through a build, so the answer goes on it here.
      const plan = programState
        ? {
            ...programState,
            settings: {
              ...(programState.settings ?? DEFAULT_PROGRAM_SETTINGS),
              smallPlates: answers.smallPlates,
            },
          }
        : null;
      const input = base(plan, {
        liftDays: answers.liftDays,
        sessionMinutes: answers.sessionMinutes,
        equipment: answers.equipment,
        barbellAtHome: answers.barbellAtHome,
        pullUpBar: answers.pullUpBar,
        experience: answers.experience,
        injuries: answers.injuries,
      });
      return {
        ok: true,
        input: {
          ...input,
          smallPlates: answers.smallPlates,
          weekSchedule: layoutWithSport(layout, "lifting", answers.liftDays),
        },
        patch: {},
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
    case "add_running": {
      const start = runLevelStart(intent.level);
      // The starter goal begins today, as choosing it in Run plan begins it.
      // No race goal is set: a plan with one already has running.
      const patch: SportProfilePatch = {
        runFrequency: intent.level,
        ...(start.runMode === "starter"
          ? { starterGoal: setStarterGoalPatch(today).starterGoal }
          : {}),
      };
      const runDays = start.runMode === "starter" ? start.weeklyRunDays : 0;
      const { raceGoal: _race, ...input } = base(programState);
      return {
        ok: true,
        input: {
          ...input,
          runMode: start.runMode,
          rollingGoal: null,
          weeklyRunDays: start.weeklyRunDays,
          newRunnerUntil: profileNewRunnerUntil({
            ...profile,
            runFrequency: intent.level,
            starterGoal: patch.starterGoal ?? profile.starterGoal,
          }),
          weekSchedule: layoutWithSport(layout, "running", runDays),
        },
        patch,
      };
    }
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
