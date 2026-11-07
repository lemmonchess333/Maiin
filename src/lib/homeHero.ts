/**
 * Home's hero (DS4): the words around today's session that its card does
 * not draw itself. Which session leads, the kicker beside the date, the
 * one line under the picture that carries a number and what it is
 * compared with, the muscles as a phrase, and the week's count with the
 * next session. `todaySession` decides which day it is; this decides how
 * the hero says it, so the rules are tested without rendering Home.
 *
 * The register is CODING_STANDARDS' measured words rules: the kicker gives
 * time and position with a number ("Week 9 of 12"), the line below the
 * picture gives one figure and its comparison ("2.5 kg more than last
 * time"), and the reasons stay behind "Why this session" on Train.
 */
import type {
  ProgramExercise,
  ProgramState,
} from "@/features/program/programTypes";
import type { TodaySession, NextSession } from "@/lib/todaySession";
import type { WeekSummaryCounts } from "@/lib/weekSummary";
import type { RunTemplate } from "@/lib/workoutTemplates";
import { formatLoad, type LiftUnit } from "@/lib/liftLoad";
import { blockWeekOf } from "@/features/program/trainingBlock";
import { racePlanWeek, racePlanWeekLabel } from "@/lib/racePlanWeek";
import { getFormArtCutout } from "@/lib/formArtCutouts";
import { paceLabel } from "@/lib/runLabels";
import type { DistanceUnit } from "@/lib/distanceUnits";
import { parseLocalDate } from "@/lib/dateHelpers";
import { formatWeekday } from "@/utils/formatters";

/** The hero's one line under its picture: a figure, and what it is
 *  compared with. */
export interface HeroLine {
  /** What it is, with its number: "Barbell row 35 kg × 8". */
  title: string;
  /** Its comparison or the step to take: "2.5 kg more than last time". */
  detail: string;
  /** The mark beside it: which way the number moved since last time, or
   *  the session's sport where nothing is compared. */
  mark: "up" | "down" | "same" | "lift" | "run";
}

/** Which session the hero draws, on a day with one or two. */
export type HeroLead = "lift" | "run" | "rest" | "first-meal" | null;

/**
 * The session the hero draws. On a day with both, the run leads when
 * running is the person's aim (`runFirst`), as the cards were ordered.
 * A lifting day with no workout linked leads with its recovery banner,
 * which is not a hero, and so does nothing here.
 */
export function heroLead(session: TodaySession): HeroLead {
  if (session.runFirst && session.run) return "run";
  if (session.lift?.workout) return "lift";
  if (session.run) return "run";
  if (session.rest?.kind === "first-meal") return "first-meal";
  if (session.rest?.kind === "first-workout") return "lift";
  if (session.rest?.kind === "free-run") return "run";
  if (session.rest) return "rest";
  return null;
}

/**
 * Where the plan stands today, for the kicker beside the date: a training
 * block's week ("Week 9 of 12"), else a race plan's or its recovery's
 * (`racePlanWeek`), the count Train's lifting week takes during a race
 * plan too (`liftPlanWeek`, read here from its two sources so Home does
 * not carry Train's week labels). Null for a plan with no length to count
 * against: "Week 7" on its own says nothing about where the plan ends.
 */
export function planPosition(
  state: ProgramState | null | undefined,
  /** Local "yyyy-MM-dd". */
  todayKey: string
): string | null {
  const block = state?.trainingBlock;
  const week = block ? blockWeekOf(block, todayKey) : null;
  if (block && week !== null) return `Week ${week} of ${block.durationWeeks}`;
  const runPlan = state?.runPlan;
  const race = racePlanWeek({
    raceGoal: runPlan?.raceGoal ?? null,
    runPlan,
    todayKey,
  });
  if (!race || race.week == null || race.of == null) return null;
  return racePlanWeekLabel(race, "long");
}

/**
 * The kicker beside the date. A new person's first session is named as
 * the first (the eyebrows the cards carried before DS4: a lift offered on
 * a rest day is "Your first workout", a new runner's run "Your first
 * run"), a free runner's rest day says the run is theirs to place, and
 * any other day gives the plan's position, when the plan has a length.
 *
 * A lifting day's workout is never called the first: Home resolves a lift
 * by weekday and Train by rotation (ADR-0002), so a later calendar session
 * must not claim to be it (`liftCardRegister.test.tsx`).
 */
export function heroKicker(
  session: TodaySession,
  position: string | null
): string | null {
  const lead = heroLead(session);
  if (session.rest?.kind === "first-workout") return "Your first workout";
  if (session.rest?.kind === "free-run") return "Run when it suits you";
  if (lead === "run" && session.run?.isFirst) return "Your first run";
  return position;
}

/** A programme exercise, as much of one as the hero line reads. */
export type HeroExercise = Partial<
  Pick<
    ProgramExercise,
    "exerciseId" | "sets" | "reps" | "repUnit" | "weight" | "lastPerformance"
  >
> & { name: string };

/**
 * The exercise the hero pictures and talks about: the first with released
 * art, as the drawing is chosen (`sessionLeadArt`), so the picture and the
 * line are about one lift; the first exercise when none has art.
 */
export function heroLeadExercise<T extends HeroExercise>(
  exercises: readonly T[]
): T | null {
  for (const ex of exercises) {
    if (ex.exerciseId && getFormArtCutout(ex.exerciseId)) return ex;
  }
  return exercises[0] ?? null;
}

/** The step a lift with no last time takes: the weight is the person's to
 *  pick, with reps in reserve (the plan starts at RIR 3). */
export const FIRST_LIFT_STEP =
  "Pick a weight you could lift 3 more times than the reps ask.";

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function finite(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

/** "3 more reps than last time", "5 s shorter than last time". */
function repsAgainst(
  planned: number,
  last: number,
  timed: boolean
): Pick<HeroLine, "detail" | "mark"> {
  const diff = Math.round(planned - last);
  if (diff === 0) return { detail: "Same as last time", mark: "same" };
  const n = Math.abs(diff);
  if (timed)
    return {
      detail: `${n} s ${diff > 0 ? "longer" : "shorter"} than last time`,
      mark: diff > 0 ? "up" : "down",
    };
  return {
    detail: `${plural(n, "rep", "reps")} ${diff > 0 ? "more" : "fewer"} than last time`,
    mark: diff > 0 ? "up" : "down",
  };
}

/**
 * The lift hero's line: the lead lift as the plan asks for it today, and
 * what that is against the last time it was done ("Barbell row 35 kg × 8",
 * "2.5 kg more than last time"). With no last time it is the day's size
 * and the step a first session takes ("4 exercises · 12 sets", "Pick a
 * weight you could lift 3 more times than the reps ask."). Null with no
 * exercises.
 */
export function liftHeroLine(
  exercises: readonly HeroExercise[],
  unit: LiftUnit
): HeroLine | null {
  const lead = heroLeadExercise(exercises);
  if (!lead) return null;
  const last = lead.lastPerformance;
  const timed = lead.repUnit === "seconds";
  const reps = finite(lead.reps) && lead.reps > 0 ? lead.reps : null;
  if (!last || !finite(last.reps) || !(last.reps > 0) || reps === null) {
    const sets = exercises.reduce(
      (n, ex) => n + (finite(ex.sets) && ex.sets > 0 ? ex.sets : 0),
      0
    );
    return {
      title: [
        plural(exercises.length, "exercise", "exercises"),
        ...(sets > 0 ? [plural(sets, "set", "sets")] : []),
      ].join(" · "),
      detail: FIRST_LIFT_STEP,
      mark: "lift",
    };
  }
  const weight = finite(lead.weight) && lead.weight > 0 ? lead.weight : 0;
  const dose = timed ? `${reps} s` : `× ${reps}`;
  const title =
    weight > 0
      ? `${lead.name} ${formatLoad(weight, unit)} ${dose}`
      : `${lead.name} ${dose}`;
  const lastWeight = finite(last.weight) && last.weight > 0 ? last.weight : 0;
  const diff = Math.round((weight - lastWeight) * 100) / 100;
  if (weight > 0 && lastWeight > 0 && diff !== 0) {
    return {
      title,
      detail: `${formatLoad(Math.abs(diff), unit)} ${diff > 0 ? "more" : "less"} than last time`,
      mark: diff > 0 ? "up" : "down",
    };
  }
  return { title, ...repsAgainst(reps, last.reps, timed) };
}

/** A span of seconds as the run line says it: "90 s", "2 min", "2½ min". */
function span(sec: number): string {
  if (sec < 120 && sec % 60 !== 0) return `${sec} s`;
  const minutes = Math.floor(sec / 60);
  return sec % 60 === 30 ? `${minutes}½ min` : `${Math.round(sec / 60)} min`;
}

/** A run's shape and how much of it there is, as much of a template as the
 *  run line reads. */
export type HeroRunTemplate = Pick<RunTemplate, "type" | "config">;

/**
 * The run hero's line, in the run's own numbers: its repeats and the rest
 * between them, a tempo's minutes at effort, a run-walk's runs, or the
 * easy pace the person's benchmark gives an easy or long run ("About 6:10
 * /km"). Null for a run with none of those: its name and dose say it all.
 */
export function runHeroLine(
  template: HeroRunTemplate | null | undefined,
  /** The confirmed easy pace (`planningEasyPaceSPerKm`), s/km. */
  easyPaceSPerKm: number | null | undefined,
  unit: DistanceUnit
): HeroLine | null {
  if (!template) return null;
  const { intervals, tempo, runWalk } = template.config;
  if (intervals && intervals.reps > 0) {
    const rep = intervals.workDistance
      ? intervals.workDistance >= 1000
        ? `${intervals.workDistance / 1000}K`
        : `${intervals.workDistance} m`
      : intervals.workDuration
        ? span(intervals.workDuration)
        : null;
    if (rep)
      return {
        title: `${intervals.reps} × ${rep}`,
        detail: `${span(intervals.restDuration)} easy between`,
        mark: "run",
      };
  }
  if (tempo && tempo.workSecs.length > 0) {
    const work = tempo.workSecs.reduce((a, b) => a + b, 0);
    return {
      title: `${span(work)} comfortably hard`,
      detail: "An easy warm-up and cool-down",
      mark: "run",
    };
  }
  if (runWalk && runWalk.runSecs.length > 0) {
    const alike = runWalk.runSecs.every((s) => s === runWalk.runSecs[0]);
    const runs = runWalk.runSecs.length;
    return {
      title: alike
        ? `${runs} × ${span(runWalk.runSecs[0])} running`
        : `${plural(runs, "run", "runs")}, ${span(runWalk.runSecs.reduce((a, b) => a + b, 0))} in all`,
      detail:
        runWalk.walkSecs.length > 0
          ? "Brisk walks between"
          : "A walk to start and finish",
      mark: "run",
    };
  }
  if (
    (template.type === "easy" || template.type === "long") &&
    finite(easyPaceSPerKm) &&
    easyPaceSPerKm > 0
  ) {
    return {
      title: `About ${paceLabel(easyPaceSPerKm, unit)}`,
      detail: "Your confirmed easy pace",
      mark: "run",
    };
  }
  return null;
}

/**
 * A day's muscle groups as words, not a list: "Back · Biceps" is "Back and
 * biceps", three are "Chest, back and shoulders", and a day with more ends
 * "and more". Empty for none.
 */
export function focusPhrase(groups: string): string {
  const more = /\s*\+\s*more$/.test(groups);
  const parts = groups
    .replace(/\s*\+\s*more$/, "")
    .split(" · ")
    .map((g) => g.trim())
    .filter(Boolean)
    .map((g, i) => (i === 0 ? g : g.toLowerCase()));
  if (more) parts.push("more");
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/** The week's sessions: how many are done, out of how many the plan holds
 *  (null when it plans none, as a free runner's week). */
export function weekSessions(
  counts: Pick<WeekSummaryCounts, "lifts" | "runs">
): {
  done: number;
  of: number | null;
} {
  const { lifts, runs } = counts;
  const done = lifts.done + runs.done;
  if (lifts.planned === null && runs.planned === null)
    return { done, of: null };
  // A discipline the week plans nothing in still counts what was done in
  // it, so an extra run beside a lifting plan is not "4 of 3".
  const of = (lifts.planned ?? lifts.done) + (runs.planned ?? runs.done);
  return { done, of };
}

/**
 * The next session, beside the week's count: "Long run tomorrow", "Lower A
 * on Monday". Null on a rest day whose hero already names it, and with no
 * session in the days ahead.
 */
export function nextSessionLine(
  next: NextSession | null | undefined,
  session: Pick<TodaySession, "rest">
): string | null {
  if (!next) return null;
  if (session.rest?.kind === "rest" && session.rest.tomorrow) return null;
  return next.daysAhead === 1
    ? `${next.label} tomorrow`
    : `${next.label} on ${formatWeekday(parseLocalDate(next.dateKey))}`;
}
