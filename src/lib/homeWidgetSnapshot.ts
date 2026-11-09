/**
 * The snapshot the Home Screen and Lock Screen widgets draw (Wid1), built
 * from what Home has just drawn.
 *
 * Every input is something Home already holds: today's session as
 * `todaySession` decided it, the hero's words from `homeHero.ts`, the
 * week's seven segments from `weekStripDays`, the week's count from
 * `weekSessions`, the streak Home's flame shows, the day's calories and
 * protein against `useEffectiveTargets`, and the water card's total. So
 * the widget says what Home says, and the rules are tested here without
 * a phone.
 *
 * Two days are written: today, and tomorrow as far as the plan shows it,
 * so the widget turns over at midnight with the app asleep. The widget
 * dims either once the snapshot is a day old (W8d).
 */
import type { TodayRun, TodaySession, NextSession } from "@/lib/todaySession";
import type { WorkoutDay } from "@/features/program/programTypes";
import type { RestContext } from "@/features/program/restTime";
import type { HeroLine } from "@/lib/homeHero";
import type { DistanceUnit } from "@/lib/distanceUnits";
import type { WeekDayState } from "@/lib/weekStripDays";
import {
  aboutMinutes,
  focusPhrase,
  heroKicker,
  runHeroLine,
} from "@/lib/homeHero";
import { cardSessionMinutes } from "@/features/program/expressSession";
import { liftCardTitle } from "@/lib/liftDayLabel";
import { RUN_TEMPLATES } from "@/lib/workoutTemplates";
import { getScheduledRunStatus } from "@/lib/scheduledRunStatus";
import { raceDistanceInSentence } from "@/lib/runProgrammeViewModel";
import {
  addLocalDays,
  localDateString,
  parseLocalDate,
} from "@/lib/dateHelpers";
import { formatWeekday } from "@/utils/formatters";
import { differenceInCalendarDays } from "date-fns";
import { formatWaterVolume, WATER_PRESETS } from "@/lib/waterUnits";
import {
  HOME_WIDGET_SNAPSHOT_VERSION,
  widgetAccount,
  type HomeWidgetSnapshot,
  type WidgetDay,
  type WidgetSegment,
  type WidgetSport,
  type WidgetWeek,
} from "@/lib/homeWidgetContract";

export interface HomeWidgetInput {
  /** Home's day, "yyyy-MM-dd" (`useLocalDateKey`). */
  todayKey: string;
  /** The moment of writing, ms. */
  nowMs: number;
  uid: string;
  /** Today's session, as `todaySession` decided it for Home. */
  session: TodaySession;
  /** A free run's line, as Home's hero words it (`freeRunHeroLine`). */
  freeRunLine: HeroLine | null;
  /** The plan's position for the kicker (`planPosition`). Unused by the
   *  widget's words today, which lead with the day, but read through
   *  `heroKicker` so a first session is named as Home names it. */
  planPosition: string | null;
  /** The week's seven days, as Home's strip draws them. */
  strip: readonly { key: string; sType: string; state: WeekDayState }[];
  /** The week's count (`weekSessions`). */
  week: { done: number; of: number | null };
  /** The person has a training plan at all. */
  hasPlan: boolean;
  /** Free running: every day without a planned session offers a run. */
  freeRunner: boolean;
  raceGoal: { distance: string; targetDate: string } | null | undefined;
  distanceUnit: DistanceUnit;
  streak: { days: number; best: number; loggedToday: boolean } | null;
  food: {
    eaten: number;
    target: number;
    protein: number;
    proteinTarget: number;
  } | null;
  water: {
    ml: number;
    targetMl: number;
    servingMl: number;
    drinkIds: readonly string[];
  } | null;
}

/** One session today, as the widget words it. */
interface Piece {
  sport: "lift" | "run";
  title: string;
  focus: string;
  minutes: string;
  /** Done, skipped, or still to do. */
  status: "open" | "done" | "skipped";
  link: string;
}

const RUN_DAY_LINK = (dateKey: string) => `/program?tab=run&rday=${dateKey}`;

function liftPiece(
  workout: WorkoutDay,
  name: string | null | undefined,
  muscleGroups: string | undefined,
  rest: RestContext,
  status: string | undefined,
  link: string
): Piece {
  const count = workout.exercises.length;
  const minutes = cardSessionMinutes(workout.exercises, rest);
  return {
    sport: "lift",
    // As LiftCTACard titles it: the week's name for a generated day.
    title: liftCardTitle(workout.dayName, name ?? undefined),
    focus:
      (muscleGroups ? focusPhrase(muscleGroups) : "") ||
      `${count} ${count === 1 ? "exercise" : "exercises"}`,
    minutes: minutes !== null ? aboutMinutes(minutes) : "",
    status:
      status === "completed"
        ? "done"
        : status === "skipped"
          ? "skipped"
          : "open",
    link,
  };
}

function runPiece(
  run: TodayRun | null,
  freeRunLine: HeroLine | null,
  unit: DistanceUnit,
  todayKey: string
): Piece {
  const runDay = run?.runDay ?? null;
  const template = runDay
    ? RUN_TEMPLATES.find(
        (t) => t.id === (runDay.userOverride || runDay.templateId)
      )
    : undefined;
  // As RunCTACard draws it: the dose split into its distance and minutes,
  // and where it has no distance, the run in its own numbers.
  const dose = template && run?.dose ? run.dose.split(" · ") : [];
  const minutes = dose.find((part) => /\bmin$/.test(part)) ?? "";
  const distance = dose.find((part) => !/\bmin$/.test(part)) ?? "";
  const focus = template
    ? distance ||
      runHeroLine(template, run?.easyPaceSPerKm ?? null, unit)?.title ||
      ""
    : (freeRunLine?.title ?? "");
  const status = runDay ? getScheduledRunStatus(runDay) : "planned";
  return {
    sport: "run",
    title: (template && run?.name) || "Free run",
    focus,
    minutes,
    status: run?.completed ? "done" : status === "skipped" ? "skipped" : "open",
    link: RUN_DAY_LINK(todayKey),
  };
}

/** Today's sessions, in the order Home's hero draws them. */
function todayPieces(input: HomeWidgetInput): Piece[] {
  const { session, freeRunLine, distanceUnit, todayKey } = input;
  const { lift, run, rest } = session;
  const lifted = lift?.workout
    ? liftPiece(
        lift.workout,
        lift.name,
        lift.muscleGroups,
        session.restContext,
        lift.status,
        lift.dayTarget
      )
    : null;
  const ran = run ? runPiece(run, freeRunLine, distanceUnit, todayKey) : null;
  // StackedCTACards: the run leads when running is the aim, and when the
  // lift has no workout to draw.
  const runLeads = !!run && (!!session.runFirst || !lift?.workout);
  const pieces = (runLeads ? [ran, lifted] : [lifted, ran]).filter(
    (p): p is Piece => p !== null
  );
  if (rest?.kind === "first-workout")
    pieces.push(
      liftPiece(
        rest.workout,
        rest.name,
        rest.muscleGroups,
        session.restContext,
        undefined,
        rest.dayTarget
      )
    );
  if (rest?.kind === "free-run")
    pieces.push(runPiece(null, freeRunLine, distanceUnit, todayKey));
  return pieces;
}

/** "Long 18K tomorrow", "Pull B on Saturday", as the week's line under
 *  Home's hero says it, `daysAhead` counted from the day it is said on. */
function nextWords(label: string, daysAhead: number, dateKey: string) {
  return daysAhead === 1
    ? `${label} tomorrow`
    : `${label} on ${formatWeekday(parseLocalDate(dateKey))}`;
}

/** The Lock Screen's one line for a day whose session is ahead:
 *  "Tomorrow · Long 18K", "Saturday · Pull B". */
function aheadLine(label: string, daysAhead: number, dateKey: string) {
  return daysAhead === 1
    ? `Tomorrow · ${label}`
    : `${formatWeekday(parseLocalDate(dateKey))} · ${label}`;
}

/**
 * A race goal's countdown from a day: "26 days to your marathon", "Your
 * 10K is tomorrow". Empty once race day has passed, and with no goal.
 */
export function raceCountdown(
  raceGoal: HomeWidgetInput["raceGoal"],
  dateKey: string
): string {
  if (!raceGoal?.targetDate || !/^\d{4}-\d{2}-\d{2}$/.test(raceGoal.targetDate))
    return "";
  // Calendar days in the person's own zone, as `raceDaysAgoLabel` counts
  // them, so a clock change between now and race day costs no day.
  const days = differenceInCalendarDays(
    parseLocalDate(raceGoal.targetDate),
    parseLocalDate(dateKey)
  );
  const race = raceDistanceInSentence(raceGoal.distance);
  if (days < 0) return "";
  if (days === 0) return `Your ${race} is today`;
  if (days === 1) return `Your ${race} is tomorrow`;
  return `${days} days to your ${race}`;
}

function sportOf(next: NextSession | null | undefined): WidgetSport {
  return next?.sport ?? "none";
}

/** Today, as the Today widget draws it. */
export function widgetToday(input: HomeWidgetInput): WidgetDay {
  const { session, todayKey } = input;
  const next = session.next ?? null;
  const nextLine = next
    ? nextWords(next.label, next.daysAhead, next.dateKey)
    : "";
  const base = {
    date: todayKey,
    next: nextLine,
    race: raceCountdown(input.raceGoal, todayKey),
  };
  if (!input.hasPlan)
    return {
      ...base,
      state: "no-plan",
      sport: "none",
      kicker: "Today",
      title: "No plan yet",
      focus: "Set up your training in Tropos",
      minutes: "",
      next: "",
      line: "No training plan yet",
      link: "/program",
    };
  const pieces = todayPieces(input);
  if (pieces.length === 0 && session.lift && !session.lift.workout)
    return {
      ...base,
      state: "no-plan",
      sport: "lift",
      kicker: "Today",
      title: "Check your lifting plan",
      focus: "No workout is linked to today",
      minutes: "",
      line: "Check your lifting plan",
      link: "/program",
    };
  const ahead = next
    ? {
        line: aheadLine(next.label, next.daysAhead, next.dateKey),
        link: next.target,
      }
    : null;
  if (pieces.length === 0)
    return {
      ...base,
      state: "rest",
      sport: "rest",
      kicker: "Today",
      title: "Rest day",
      focus: "",
      minutes: "",
      line: ahead?.line ?? "Rest day",
      link: ahead?.link ?? "/program",
    };
  const open = pieces.filter((p) => p.status === "open");
  if (open.length === 0) {
    const allSkipped = pieces.every((p) => p.status === "skipped");
    const kicker = allSkipped ? "Skipped today" : "Done today";
    return {
      ...base,
      state: "done",
      sport: pieces.length > 1 ? "both" : pieces[0].sport,
      kicker,
      title: pieces[0].title,
      focus: "",
      minutes: "",
      line: ahead?.line ?? kicker,
      link: ahead?.link ?? pieces[0].link,
    };
  }
  const hero = open[0];
  const first = heroKicker(session, input.planPosition);
  const kicker =
    pieces.length > 1 && open.length < pieces.length
      ? `${pieces.length - open.length} of ${pieces.length} done today`
      : first === "Your first workout" ||
          first === "Your first run" ||
          first === "Run when it suits you"
        ? first
        : "Today";
  return {
    ...base,
    state: "planned",
    sport: hero.sport,
    kicker,
    title: hero.title,
    focus: hero.focus,
    minutes: hero.minutes,
    line: `Today · ${hero.title}`,
    link: hero.link,
  };
}

/** Tomorrow, as far as the plan shows it: its session's name (the plan
 *  gives no more until the app opens on the day), or a rest day naming
 *  the next. */
export function widgetTomorrow(input: HomeWidgetInput): WidgetDay {
  const { session, todayKey } = input;
  const date = localDateString(addLocalDays(parseLocalDate(todayKey), 1));
  const next = session.next ?? null;
  const base = { date, race: raceCountdown(input.raceGoal, date) };
  if (!input.hasPlan)
    return {
      ...base,
      state: "no-plan",
      sport: "none",
      kicker: "Today",
      title: "No plan yet",
      focus: "Set up your training in Tropos",
      minutes: "",
      next: "",
      line: "No training plan yet",
      link: "/program",
    };
  if (next && next.daysAhead === 1)
    return {
      ...base,
      state: "planned",
      sport: sportOf(next),
      kicker: "Today",
      title: next.label,
      focus: "",
      minutes: "",
      next: "",
      line: `Today · ${next.label}`,
      link: next.target,
    };
  if (input.freeRunner)
    return {
      ...base,
      state: "planned",
      sport: "run",
      kicker: "Run when it suits you",
      title: "Free run",
      focus: "",
      minutes: "",
      next: "",
      line: "Today · Free run",
      link: RUN_DAY_LINK(date),
    };
  const daysAhead = next ? next.daysAhead - 1 : 0;
  return {
    ...base,
    state: "rest",
    sport: "rest",
    kicker: "Today",
    title: "Rest day",
    focus: "",
    minutes: "",
    next: next ? nextWords(next.label, daysAhead, next.dateKey) : "",
    line: next ? aheadLine(next.label, daysAhead, next.dateKey) : "Rest day",
    link: next?.target ?? "/program",
  };
}

const PLANNED_SEGMENT: Record<string, WidgetSegment> = {
  lift: "planned-lift",
  run: "planned-run",
  both: "planned-both",
};

/** The week's segments and its count, as Home's week card draws them. */
export function widgetWeek(input: HomeWidgetInput): WidgetWeek | null {
  if (input.strip.length !== 7) return null;
  const { done, of } = input.week;
  const noun = (of ?? done) === 1 ? "session" : "sessions";
  return {
    start: input.strip[0].key,
    segments: input.strip.map((day) =>
      day.state === "planned"
        ? (PLANNED_SEGMENT[day.sType] ?? "planned-lift")
        : day.state
    ),
    done,
    of,
    // WeekSessions' words.
    summary:
      of !== null
        ? `${done} of ${of} ${noun} this week`
        : `${done} ${noun} this week`,
  };
}

/** The water step's name on the widget's button: the container Home's
 *  size sheet calls it ("Glass"), or its volume. */
export function servingLabel(ml: number): string {
  return (
    WATER_PRESETS.find((preset) => preset.ml === ml)?.label ??
    formatWaterVolume(ml)
  );
}

const whole = (n: number) => (Number.isFinite(n) ? Math.round(n) : 0);

export function homeWidgetSnapshot(input: HomeWidgetInput): HomeWidgetSnapshot {
  const { todayKey } = input;
  return {
    version: HOME_WIDGET_SNAPSHOT_VERSION,
    writtenAt: Math.round(input.nowMs),
    account: widgetAccount(input.uid),
    days: [widgetToday(input), widgetTomorrow(input)],
    week: widgetWeek(input),
    streak: input.streak
      ? {
          date: todayKey,
          days: whole(input.streak.days),
          best: Math.max(whole(input.streak.best), whole(input.streak.days)),
          loggedToday: input.streak.loggedToday,
          nextDay: input.streak.loggedToday ? whole(input.streak.days) : null,
        }
      : null,
    food: input.food
      ? {
          date: todayKey,
          eaten: Math.max(0, whole(input.food.eaten)),
          target: Math.max(0, whole(input.food.target)),
          protein: Math.max(0, whole(input.food.protein)),
          proteinTarget: Math.max(0, whole(input.food.proteinTarget)),
        }
      : null,
    water: input.water
      ? {
          date: todayKey,
          ml: Math.max(0, whole(input.water.ml)),
          targetMl: Math.max(0, whole(input.water.targetMl)),
          servingMl: whole(input.water.servingMl),
          servingLabel: servingLabel(whole(input.water.servingMl)),
          drinkIds: [...input.water.drinkIds],
        }
      : null,
  };
}
