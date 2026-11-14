/**
 * Which finish a session gets, and its words (DS4, DESIGN_GUIDE §14m rules
 * 29-32; CODING_STANDARDS' measured words rules).
 *
 * A first, a new best, a streak milestone and a finished plan get the
 * full-screen reward: one object in the achievement's own colour, one
 * display figure, one sentence. Every other session gets the calm summary,
 * the same structure without the reward colour or the confetti. A
 * four-day-a-week lifter would otherwise see a celebration about 200 times
 * a year, and it would stop meaning anything.
 *
 * The decision reads the moments the session's post already carries
 * (`postMoments.ts`: `liftPostMoments`, `runPostMoments`), so the finish
 * screen and the post never disagree about what happened. No Firebase and
 * no React here.
 */
import {
  pickMoments,
  STREAK_MILESTONES,
  type PostMoment,
} from "@/lib/postMoments";
import type { DistanceUnit } from "@/lib/distanceUnits";
import { distanceLabel } from "@/lib/runLabels";
import {
  formatClock,
  formatShortWeekdayDayMonth,
  formatTimeOfDay,
  keepTogether,
} from "@/utils/formatters";

export type FinishSport = "lift" | "run";

/** The achievement's own colour (rule 12): gold is a new best and nothing
 *  else, the streak keeps its flame's brand purple, and a first or a plan
 *  finished takes its sport's. */
export type FinishTone = "achievement" | "lifting" | "running";

export type FinishRegister =
  | { register: "summary" }
  | {
      register: "reward";
      /** The moment the screen is about: the most significant one. */
      moment: PostMoment;
      tone: FinishTone;
      /** Rule 32: a first, a new best and a finished plan; never a
       *  streak. Reduce Motion throws none, whatever this says. */
      confetti: boolean;
    };

const BESTS = new Set<PostMoment["kind"]>([
  "pr",
  "fastestEffort",
  "longestRun",
  "firstDistance",
]);

/**
 * The finish a session gets from its moments. A plan's week done is not
 * one of the four (it comes every week), so it stays on the summary.
 */
export function finishRegister(
  moments: readonly PostMoment[] | null | undefined,
  sport: FinishSport,
  /** The first session of its sport (`isFirstOfSport`): a lifter's first
   *  run is a first here, though its post claims none, since the post's
   *  first is the account's. */
  { firstOfSport = false }: { firstOfSport?: boolean } = {}
): FinishRegister {
  const all =
    firstOfSport && !(moments ?? []).some((m) => m.kind === "firstSession")
      ? [...(moments ?? []), { kind: "firstSession" } as const]
      : (moments ?? []);
  const lead = pickMoments(all).find((moment) => moment.kind !== "planWeek");
  if (!lead) return { register: "summary" };
  const sportTone: FinishTone = sport === "run" ? "running" : "lifting";
  if (BESTS.has(lead.kind))
    return {
      register: "reward",
      moment: lead,
      tone: "achievement",
      confetti: true,
    };
  if (lead.kind === "streak")
    return {
      register: "reward",
      moment: lead,
      tone: "lifting",
      confetti: false,
    };
  return { register: "reward", moment: lead, tone: sportTone, confetti: true };
}

/* ---- Words ------------------------------------------------------------ */

export interface RewardLineContext {
  sport?: FinishSport;
  distanceUnit: DistanceUnit;
  /** A PR's load as the lifter reads it (a kettlebell's bell in lb). */
  loadIn: (weightKg: number) => number;
  loadUnit: string;
  /** The exercise's best as the session started, for "by 2.5 kg". */
  prBefore?: { weightKg: number; reps: number } | null;
  /** The fastest earlier effort at the distance, in seconds. */
  fastestBefore?: number | null;
}

/** A reward's one sentence, its figure apart so the screen can draw it in
 *  the achievement's colour: `before + figure + after`. */
export interface RewardLine {
  before: string;
  figure: string;
  after: string;
}

const DISTANCE_NAMES: Readonly<Record<number, string>> = {
  1000: "1K",
  5000: "5K",
  10000: "10K",
  21097: "half marathon",
  42195: "marathon",
};

/** The verb a lift's name gives it. A lift with none is "lifted … on" its
 *  name, since "pressed" alone could be a bench or an overhead press. */
const LIFT_VERBS: readonly [RegExp, string][] = [
  [/\brows?\b/i, "rowed"],
  [/\bsquats?\b/i, "squatted"],
  [/\bdeadlifts?\b/i, "deadlifted"],
  [/\bbench\b/i, "benched"],
  [/\bcurls?\b/i, "curled"],
];

/** A load difference, without a float's tail ("2.5", "5.5", "10"). */
function amount(value: number): string {
  return String(Math.round(value * 10) / 10);
}

function prLine(
  moment: Extract<PostMoment, { kind: "pr" }>,
  ctx: RewardLineContext
): RewardLine {
  const load = (weightKg: number) =>
    `${amount(ctx.loadIn(weightKg))} ${ctx.loadUnit}`;
  const verb = LIFT_VERBS.find(([pattern]) => pattern.test(moment.exercise));
  const figure = keepTogether(`${load(moment.weightKg)} × ${moment.reps}`);
  const named = verb ? "" : ` on ${moment.exercise}`;
  const before = ctx.prBefore;
  let comparison = ", a new best.";
  if (before) {
    const now = ctx.loadIn(moment.weightKg);
    const was = ctx.loadIn(before.weightKg);
    if (moment.reps === before.reps && now > was)
      comparison = `, a new best by ${keepTogether(`${amount(now - was)} ${ctx.loadUnit}`)}.`;
    else if (now === was && moment.reps > before.reps) {
      const more = moment.reps - before.reps;
      comparison = `, a new best by ${more} ${more === 1 ? "rep" : "reps"}.`;
    } else
      comparison = `, a new best (was ${keepTogether(`${load(before.weightKg)} × ${before.reps}`)}).`;
  }
  return {
    before: `You ${verb ? verb[1] : "lifted"} `,
    figure,
    after: `${named}${comparison}`,
  };
}

/**
 * The reward's one sentence: you, what you did, the number and what it is
 * compared with (CODING_STANDARDS: "A reward says what, how much and
 * what's next"). A first carries the screen's one exclamation mark; the
 * headline above it carries none.
 */
export function rewardLine(
  moment: PostMoment,
  ctx: RewardLineContext
): RewardLine {
  switch (moment.kind) {
    case "pr":
      return prLine(moment, ctx);
    case "longestRun":
      return {
        before: "You ran ",
        figure: keepTogether(distanceLabel(moment.meters, ctx.distanceUnit)),
        after: ", your longest run yet.",
      };
    case "firstDistance":
      return {
        before: "You ran your first ",
        figure: DISTANCE_NAMES[moment.meters],
        after: "!",
      };
    case "fastestEffort": {
      const name = DISTANCE_NAMES[moment.meters] ?? "";
      const earlier = ctx.fastestBefore;
      return {
        before: `You ran ${name} in `,
        figure: formatClock(moment.seconds),
        after:
          earlier && earlier > moment.seconds
            ? `, your fastest by ${formatClock(earlier - moment.seconds)}.`
            : ", your fastest yet.",
      };
    }
    case "streak": {
      const next = STREAK_MILESTONES.find((days) => days > moment.days);
      return {
        before: "You’ve trained ",
        figure: keepTogether(`${moment.days} days`),
        after: next ? ` in a row. ${next} is next.` : " in a row.",
      };
    }
    case "planWeek":
      return {
        before: "You finished ",
        figure: keepTogether(`week ${moment.week} of ${moment.weeks}`),
        after: ".",
      };
    case "planComplete":
      return {
        before: "You finished ",
        figure: "the last week",
        after: " of your plan.",
      };
    case "firstSession":
      return {
        before: "You finished your ",
        figure: ctx.sport === "run" ? "first run" : "first workout",
        after: "!",
      };
  }
}

/** A routine session's quiet line: a plan's week done, when this session
 *  finished one. Null otherwise, and the screen says what comes next. */
export function summaryLine(
  moments: readonly PostMoment[] | null | undefined
): string | null {
  const week = (moments ?? []).find((moment) => moment.kind === "planWeek");
  return week && week.kind === "planWeek"
    ? `You finished week ${week.week} of ${week.weeks}.`
    : null;
}

/**
 * The finish screen's kicker: the day, and the time the session ran from
 * and to ("Sat 7 Nov · 07:42–08:23"), en-GB and 24-hour. The day alone
 * when the start is unknown.
 */
export function finishKicker(
  startedAt: number | undefined,
  endedAt: number
): string {
  const end = new Date(endedAt);
  const day = formatShortWeekdayDayMonth(
    startedAt === undefined ? end : new Date(startedAt)
  );
  return startedAt === undefined
    ? day
    : `${day} · ${formatTimeOfDay(new Date(startedAt))}–${formatTimeOfDay(end)}`;
}
