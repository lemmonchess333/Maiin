/**
 * Moments on a post (Soc15, 3 November 2026): what happened to the person
 * in the session, on the card the way Strava and Hevy put it there. A new
 * PR, the longest run yet, a first 10K, a streak reaching 30 days, a
 * programme's week done.
 *
 * A moment is a kind and its numbers, worked out from what was saved and
 * never typed: the card words it, in the reader's units. Each rule below is
 * a pure function of facts the finish screens already hold, and the post
 * builders (`liftPost`, `runPost`) call them as the post is built.
 *
 * firestore.rules checks each moment on a post against the shapes here
 * (`isPostMoment`), and activityPostFields.cross.test.ts holds the rules'
 * lists to the constants below. The builders drop a moment the rules would
 * refuse rather than lose the post, and the card reads moments back through
 * `postMomentsOf`.
 *
 * No Firebase here, so the rules tests can read it.
 */
import { epley1RMExact } from "./analytics";
import { fastestEfforts, type EffortRun } from "./runEfforts";

/** The most moments one post carries. */
export const MAX_POST_MOMENTS = 3;

/** The longest exercise name a PR moment carries, in UTF-16 code units
 *  (the unit the rules' `size()` counts). */
export const MOMENT_EXERCISE_MAX = 60;

/** The streak lengths a session can reach that make a moment. */
export const STREAK_MILESTONES = [7, 14, 30, 50, 100, 200, 365] as const;

/** The distances a first run to reach one makes a moment: 5K, 10K, the
 *  half marathon and the marathon. */
export const FIRST_DISTANCE_METERS = [5000, 10000, 21097, 42195] as const;

/** The best-effort distances the finish screen times (`detectBestEfforts`). */
export const FASTEST_EFFORT_METERS = [1000, 5000, 10000] as const;

/** Earlier runs a run needs before it can be the longest yet: a first run
 *  is not a longest run, nor is a second. */
export const LONGEST_RUN_MIN_EARLIER = 3;

/** The bounds a moment's numbers are held to, here and in the rules. */
export const MOMENT_LIMITS = {
  weightKgMax: 1000,
  repsMax: 1000,
  metersMax: 500000,
  secondsMax: 86400,
  weeksMax: 104,
} as const;

export type FirstDistanceMeters = (typeof FIRST_DISTANCE_METERS)[number];

export type PostMoment =
  /** A set that beat the lifter's best for the exercise. */
  | { kind: "pr"; exercise: string; weightKg: number; reps: number }
  /** Longer than every earlier run. */
  | { kind: "longestRun"; meters: number }
  /** The first run to reach the distance. */
  | { kind: "firstDistance"; meters: FirstDistanceMeters }
  /** A best effort faster than every earlier one at its distance. */
  | { kind: "fastestEffort"; meters: number; seconds: number }
  /** The session took the streak to this many days. */
  | { kind: "streak"; days: number }
  /** The session finished week `week` of a plan `weeks` long. */
  | { kind: "planWeek"; week: number; weeks: number }
  /** The session finished the plan. */
  | { kind: "planComplete" }
  /** The author's first saved session of any kind. */
  | { kind: "firstSession" };

export type PostMomentKind = PostMoment["kind"];

/** Each kind's keys, all of them required and no others allowed. */
export const POST_MOMENT_KEYS: {
  readonly [K in PostMomentKind]: readonly (keyof Extract<
    PostMoment,
    { kind: K }
  >)[];
} = {
  pr: ["kind", "exercise", "weightKg", "reps"],
  longestRun: ["kind", "meters"],
  firstDistance: ["kind", "meters"],
  fastestEffort: ["kind", "meters", "seconds"],
  streak: ["kind", "days"],
  planWeek: ["kind", "week", "weeks"],
  planComplete: ["kind"],
  firstSession: ["kind"],
};

export const POST_MOMENT_KINDS = Object.keys(
  POST_MOMENT_KEYS
) as readonly PostMomentKind[];

/* ---- Shape ------------------------------------------------------------ */

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const inRange = (value: unknown, min: number, max: number) =>
  isFiniteNumber(value) && value > min && value <= max;

const isWholeIn = (value: unknown, min: number, max: number) =>
  Number.isInteger(value) &&
  (value as number) >= min &&
  (value as number) <= max;

const oneOf = (value: unknown, list: readonly number[]) =>
  isFiniteNumber(value) && list.includes(value);

/**
 * Whether a value is a moment the rules accept: a map whose keys are its
 * kind's exactly, with each number in its range. The rules make the same
 * checks on a post's create, so a moment that passes here is never the
 * reason a post is refused.
 */
export function isPostMoment(value: unknown): value is PostMoment {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const m = value as Record<string, unknown>;
  const kind = m.kind;
  if (typeof kind !== "string" || !(kind in POST_MOMENT_KEYS)) return false;
  const keys: readonly string[] = POST_MOMENT_KEYS[kind as PostMomentKind];
  const own = Object.keys(m);
  if (own.length !== keys.length || !own.every((key) => keys.includes(key)))
    return false;
  switch (kind as PostMomentKind) {
    case "pr":
      return (
        typeof m.exercise === "string" &&
        m.exercise.trim().length > 0 &&
        m.exercise.length <= MOMENT_EXERCISE_MAX &&
        inRange(m.weightKg, 0, MOMENT_LIMITS.weightKgMax) &&
        isWholeIn(m.reps, 1, MOMENT_LIMITS.repsMax)
      );
    case "longestRun":
      return inRange(m.meters, 0, MOMENT_LIMITS.metersMax);
    case "firstDistance":
      return oneOf(m.meters, FIRST_DISTANCE_METERS);
    case "fastestEffort":
      return (
        oneOf(m.meters, FASTEST_EFFORT_METERS) &&
        inRange(m.seconds, 0, MOMENT_LIMITS.secondsMax)
      );
    case "streak":
      return oneOf(m.days, STREAK_MILESTONES);
    case "planWeek":
      return (
        isWholeIn(m.weeks, 1, MOMENT_LIMITS.weeksMax) &&
        isWholeIn(m.week, 1, m.weeks as number)
      );
    case "planComplete":
    case "firstSession":
      return true;
  }
}

/* ---- Order ------------------------------------------------------------ */

/**
 * Most significant first. A plan finished and a first session happen once;
 * a first distance a handful of times; a streak milestone at seven points in
 * a year. PRs come often in a lifter's first months, so a streak milestone
 * outranks them, and the run's bests follow the lift's. A week of a plan
 * done is the quietest.
 */
const RANK: Record<PostMomentKind, number> = {
  planComplete: 0,
  firstSession: 1,
  firstDistance: 2,
  streak: 3,
  pr: 4,
  fastestEffort: 5,
  longestRun: 6,
  planWeek: 7,
};

/** Within a kind, the larger distance first; otherwise as given. */
function magnitude(moment: PostMoment): number {
  return moment.kind === "fastestEffort" || moment.kind === "firstDistance"
    ? moment.meters
    : 0;
}

/**
 * The moments a post carries: the ones the rules accept, most significant
 * first, at most MAX_POST_MOMENTS.
 */
export function pickMoments(
  candidates: readonly (PostMoment | null | undefined)[]
): PostMoment[] {
  return candidates
    .filter(isPostMoment)
    .map((moment, index) => ({ moment, index }))
    .sort(
      (a, b) =>
        RANK[a.moment.kind] - RANK[b.moment.kind] ||
        magnitude(b.moment) - magnitude(a.moment) ||
        a.index - b.index
    )
    .slice(0, MAX_POST_MOMENTS)
    .map(({ moment }) => moment);
}

/* ---- The rules -------------------------------------------------------- */

/** A set the session logged that beat the exercise's best (`checkSetPR`'s
 *  "best"), in kg. */
export interface SessionPr {
  exercise: string;
  weightKg: number;
  reps: number;
}

/**
 * One PR moment for each exercise that set a new best: its strongest new
 * best of the session by estimated one-rep max, as the PR map ranks a set.
 * A session can set two in one exercise (a heavy triple, then a heavier
 * eight); the post names the one that counts.
 */
export function prMoments(prs: readonly SessionPr[] | undefined): PostMoment[] {
  const best = new Map<string, SessionPr>();
  for (const pr of prs ?? []) {
    const name = pr.exercise.trim();
    if (!name) continue;
    const held = best.get(name);
    if (
      !held ||
      epley1RMExact(pr.weightKg, pr.reps) >
        epley1RMExact(held.weightKg, held.reps)
    )
      best.set(name, { ...pr, exercise: name });
  }
  return [...best.values()].map((pr) => ({
    kind: "pr",
    exercise: pr.exercise,
    weightKg: pr.weightKg,
    reps: pr.reps,
  }));
}

/** A runner's earlier runs, as the run moments compare against them. */
export interface RunHistory {
  /** Earlier runs that count (a valid run, not one saved anyway). */
  count: number;
  /** The longest of them in metres; 0 with none. */
  longestMeters: number;
  /** The fastest earlier time at each of FASTEST_EFFORT_METERS, in
   *  seconds, where any earlier run timed one. */
  fastestSeconds: Readonly<Record<number, number>>;
}

/**
 * The history the run moments read, from the earlier runs that count.
 * The fastest at each distance is each run's own time over it
 * (`runEffortSeconds`: its saved best effort, else its splits), taken
 * across `timed`, the runs Bests reads its fastest times from, so a run
 * called the fastest yet is the one Bests lists (App1 Q15). Without
 * `timed`, every run given.
 */
export function runHistoryOf(
  runs: readonly ({ distance: number } & EffortRun)[],
  timed: readonly EffortRun[] = runs
): RunHistory {
  let longestMeters = 0;
  for (const run of runs) {
    if (isFiniteNumber(run.distance) && run.distance > longestMeters)
      longestMeters = run.distance;
  }
  const fastestSeconds: Record<number, number> = {};
  for (const { meters, seconds } of fastestEfforts(
    timed,
    FASTEST_EFFORT_METERS
  ))
    fastestSeconds[meters] = seconds;
  return { count: runs.length, longestMeters, fastestSeconds };
}

/**
 * The longest run yet: longer than every earlier run, once there are at
 * least LONGEST_RUN_MIN_EARLIER of them. Nothing while the history is
 * unknown.
 */
export function longestRunMoment(
  meters: number,
  history: RunHistory | null | undefined
): PostMoment | null {
  if (!history || history.count < LONGEST_RUN_MIN_EARLIER) return null;
  if (!isFiniteNumber(meters) || meters <= history.longestMeters) return null;
  return { kind: "longestRun", meters };
}

/**
 * The first run to reach 5K, 10K, the half or the marathon: one that
 * reaches it when no earlier run did. A run that reaches several names the
 * largest. A first run reaching 5K is a first 5K. Nothing while the
 * history is unknown.
 */
export function firstDistanceMoment(
  meters: number,
  history: RunHistory | null | undefined
): PostMoment | null {
  if (!history || !isFiniteNumber(meters)) return null;
  const reached = FIRST_DISTANCE_METERS.filter(
    (d) => meters >= d && history.longestMeters < d
  );
  const largest = reached.at(-1);
  return largest === undefined
    ? null
    : { kind: "firstDistance", meters: largest };
}

/**
 * The run's best efforts that are faster than every earlier one at their
 * distance. Only against an earlier effort: the first 5K timed is not the
 * fastest of anything.
 */
export function fastestEffortMoments(
  efforts: readonly { distance: number; time: number }[] | undefined,
  history: RunHistory | null | undefined
): PostMoment[] {
  if (!history) return [];
  const moments: PostMoment[] = [];
  for (const effort of efforts ?? []) {
    if (!oneOf(effort.distance, FASTEST_EFFORT_METERS)) continue;
    const earlier = history.fastestSeconds[effort.distance];
    if (earlier === undefined) continue;
    if (isFiniteNumber(effort.time) && effort.time > 0 && effort.time < earlier)
      moments.push({
        kind: "fastestEffort",
        meters: effort.distance,
        seconds: effort.time,
      });
  }
  return moments;
}

/** The streak as it stood before the session's day was active, and after
 *  (`streakAcross` in the streaks module). */
export interface StreakChange {
  before: number;
  after: number;
}

/**
 * The streak milestone the session reached: the largest of
 * STREAK_MILESTONES that the streak was below before the session and is at
 * or past after it. A day already active (a meal logged that morning) was
 * the day that reached it, so the session reaches nothing.
 */
export function streakMoment(
  streak: StreakChange | null | undefined
): PostMoment | null {
  if (!streak) return null;
  const reached = STREAK_MILESTONES.filter(
    (days) => streak.before < days && streak.after >= days
  );
  const largest = reached.at(-1);
  return largest === undefined ? null : { kind: "streak", days: largest };
}

/** Where a lift sat in a plan with a set length (`liftPlanWeek`), and
 *  whether it finished its week. */
export interface PlanWeekFacts {
  week: number;
  weeks: number;
  /** The plan ends with its last week (a training block), rather than
   *  carrying on past it. */
  ends: boolean;
  /** This lift was the week's last planned session still to do. */
  weekDone: boolean;
}

/**
 * Week N of M done, for the lift that finished the week's plan; and, for a
 * plan that ends, the programme complete with its last week's.
 */
export function planMoment(
  plan: PlanWeekFacts | null | undefined
): PostMoment | null {
  if (!plan || !plan.weekDone) return null;
  if (plan.ends && plan.week === plan.weeks) return { kind: "planComplete" };
  return { kind: "planWeek", week: plan.week, weeks: plan.weeks };
}

/** The author's first saved session, known as such: `true` only when the
 *  read found none before it. */
export function firstSessionMoment(
  firstSession: boolean | null | undefined
): PostMoment | null {
  return firstSession === true ? { kind: "firstSession" } : null;
}

/* ---- Per session ------------------------------------------------------ */

/** What a finished lift knows about itself beyond its sets. */
export interface LiftMomentFacts {
  /** The session's new bests, one for each exercise and rep range, as the
   *  finish screen lists them. */
  prs?: readonly SessionPr[];
  streak?: StreakChange | null;
  firstSession?: boolean | null;
  plan?: PlanWeekFacts | null;
}

/** A lift post's moments. */
export function liftPostMoments(
  facts: LiftMomentFacts | undefined
): PostMoment[] {
  if (!facts) return [];
  return pickMoments([
    planMoment(facts.plan),
    firstSessionMoment(facts.firstSession),
    streakMoment(facts.streak),
    ...prMoments(facts.prs),
  ]);
}

/** What a finished run's finish screen knows beyond the run itself. */
export interface RunMomentContext {
  /** The earlier runs that count (`runHistoryOf`); null while unknown. */
  history?: RunHistory | null;
  streak?: StreakChange | null;
  firstSession?: boolean | null;
}

/** A run post's moments, from the run's distance and best efforts. */
export function runPostMoments(
  run: {
    distance: number;
    bestEfforts?: readonly { distance: number; time: number }[];
  },
  context: RunMomentContext | undefined
): PostMoment[] {
  if (!context) return [];
  const history = context.history ?? null;
  return pickMoments([
    firstSessionMoment(context.firstSession),
    firstDistanceMoment(run.distance, history),
    streakMoment(context.streak),
    ...fastestEffortMoments(run.bestEfforts, history),
    longestRunMoment(run.distance, history),
  ]);
}

/* ---- Reading ---------------------------------------------------------- */

/**
 * The moments a stored post carries, as the card draws them: the ones the
 * rules would accept, in the order stored, at most MAX_POST_MOMENTS. A post
 * written before moments has none.
 */
export function postMomentsOf(raw: unknown): PostMoment[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isPostMoment).slice(0, MAX_POST_MOMENTS);
}
