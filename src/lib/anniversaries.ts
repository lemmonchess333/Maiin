/**
 * Earned anniversaries (App1 Q58, 13 November 2026): the 50th and the
 * 100th session, a year of Tropos and 1,000 km run. Each is a full-screen
 * reward once, with Share (`AnniversaryReveal`), as DESIGN_GUIDE §14m
 * gives firsts, bests, streaks and finished plans theirs.
 *
 * Counted as the rest of the app counts. A session is a saved lift or a
 * run that counts (`countedSessions` in trainingWeek.ts, the rule every
 * week's count uses), kilometres are the runs that count
 * (`sumLifetimeRunTotals`, `isVolumeEligible`), and the year runs from
 * the day the account began (`startDayKey`), the training week's start.
 *
 * An anniversary is earned by the session that crosses it: the 50th
 * session, the run that takes the total past 1,000 km, the first session
 * on or after the account's first birthday by someone who trained in its
 * first year. One already passed when it is first counted (an account
 * older than this feature) is recorded as passed, never shown late.
 *
 * Which have been earned and shown is the account's
 * (`users/{uid}/stats/anniversaries`, `anniversaryStore.ts`), not the
 * device's: a 100th session happens once, and the same person finishes
 * sessions on their phone and in the browser. The league result keeps its
 * reveals on the device because no client may write the server's result;
 * nothing stops the account holding these.
 *
 * No Firebase here.
 */
import { addLocalDays, localDateString, parseLocalDate } from "./dateHelpers";
import { countedSessions, type WeekRun } from "./trainingWeek";
import { sumLifetimeRunTotals } from "./runStatsEligibility";
import { formatDayMonthYear, keepTogether } from "@/utils/formatters";

export type AnniversaryKind =
  "sessions50" | "sessions100" | "oneYear" | "km1000";

/** Every kind, in the order a session that earns two shows them. */
export const ANNIVERSARY_KINDS: readonly AnniversaryKind[] = [
  "sessions50",
  "sessions100",
  "oneYear",
  "km1000",
];

/** The session counts that are anniversaries. */
export const SESSION_ANNIVERSARIES = {
  sessions50: 50,
  sessions100: 100,
} as const;

/** 1,000 km, in metres. */
export const DISTANCE_ANNIVERSARY_METRES = 1_000_000;

/** What the account holds for one anniversary. */
export interface AnniversaryMark {
  /** The day of the session that earned it; null for one passed before
   *  it was counted, which is never shown. */
  day: string | null;
  /** Shown full screen, or passed and never to be. */
  shown: boolean;
}

export type AnniversaryMarks = Partial<
  Record<AnniversaryKind, AnniversaryMark>
>;

/** The session just saved, as the anniversaries read it. */
export interface FinishedSession {
  /** Its saved id, so a read that already holds it leaves it out. */
  id: string;
  sport: "lift" | "run";
  /** The day it belongs to (Lift3: the day it started). */
  day: string;
  /** A lift always counts; a run when `isVolumeEligible` says so. */
  counts: boolean;
  /** A run's metres; 0 for a lift. */
  metres: number;
}

/**
 * What had been done before the session. Each figure is null when it was
 * not read in full, and no anniversary is decided on a figure not read.
 */
export interface PriorTally {
  /** Sessions that count. */
  sessions: number | null;
  /** Metres run in the runs that count. */
  metres: number | null;
  /** The latest day of a session that counts; null when there is none,
   *  undefined when not read. */
  lastDay: string | null | undefined;
  /** The earliest day of a session that counts, for "since". */
  firstDay: string | null | undefined;
  /** The earliest day of a run that counts. */
  firstRunDay: string | null | undefined;
}

/**
 * The tally before `sessionId`, from saved workouts and runs. `full` says
 * which lists were read whole: a list read only for its newest sessions
 * gives the latest day and nothing else.
 */
export function priorTally(
  workouts: readonly { id?: string; date: string }[],
  runs: readonly WeekRun[],
  sessionId: string,
  full: { workouts: boolean; runs: boolean }
): PriorTally {
  const counted = countedSessions(
    workouts.filter((w) => w.id !== sessionId),
    runs.filter((r) => r.id !== sessionId)
  );
  const days = [
    ...counted.lifts.map((w) => w.date),
    ...counted.runs.map((r) => r.day),
  ].sort();
  const runDays = counted.runs.map((r) => r.day).sort();
  const whole = full.workouts && full.runs;
  return {
    sessions: whole ? counted.lifts.length + counted.runs.length : null,
    metres: full.runs
      ? sumLifetimeRunTotals(counted.runs).totalDistanceM
      : null,
    lastDay: days.at(-1) ?? null,
    firstDay: whole ? (days[0] ?? null) : undefined,
    firstRunDay: full.runs ? (runDays[0] ?? null) : undefined,
  };
}

/** The account's first birthday: a year after the day it began. A start
 *  on 29 February has its birthday on 1 March. */
export function anniversaryDay(startDay: string): string {
  const start = parseLocalDate(startDay);
  const year = new Date(start.getFullYear() + 1, start.getMonth(), 1);
  const lastDay = new Date(year.getFullYear(), year.getMonth() + 1, 0);
  return start.getDate() > lastDay.getDate()
    ? localDateString(addLocalDays(lastDay, 1))
    : localDateString(
        new Date(year.getFullYear(), year.getMonth(), start.getDate())
      );
}

/**
 * The anniversaries not yet marked that this session has a figure for,
 * and so needs read: the session counts only while one is ahead, the
 * kilometres only on a run, the year only once its day has come.
 */
export function anniversariesToCheck(
  marks: AnniversaryMarks,
  session: Pick<FinishedSession, "sport" | "day">,
  startDay: string | null
): { sessions: boolean; metres: boolean; year: boolean } {
  const open = (kind: AnniversaryKind) => marks[kind] === undefined;
  return {
    sessions: open("sessions50") || open("sessions100"),
    metres: open("km1000") && session.sport === "run",
    year:
      open("oneYear") &&
      startDay !== null &&
      session.day >= anniversaryDay(startDay),
  };
}

/**
 * What this session decides: the anniversaries it earned, and those
 * already passed before it, which are recorded and never shown. A kind
 * already marked is never decided again, so each is earned once.
 */
export function settleAnniversaries({
  marks,
  before,
  session,
  startDay,
}: {
  marks: AnniversaryMarks;
  before: PriorTally;
  session: FinishedSession;
  startDay: string | null;
}): { earned: AnniversaryKind[]; passed: AnniversaryKind[] } {
  const earned: AnniversaryKind[] = [];
  const passed: AnniversaryKind[] = [];
  for (const kind of ANNIVERSARY_KINDS) {
    if (marks[kind] !== undefined) continue;
    const verdict = decide(kind, before, session, startDay);
    if (verdict === "earned") earned.push(kind);
    else if (verdict === "passed") passed.push(kind);
  }
  return { earned, passed };
}

function decide(
  kind: AnniversaryKind,
  before: PriorTally,
  session: FinishedSession,
  startDay: string | null
): "earned" | "passed" | null {
  switch (kind) {
    case "sessions50":
    case "sessions100": {
      const line = SESSION_ANNIVERSARIES[kind];
      if (before.sessions === null) return null;
      if (before.sessions >= line) return "passed";
      return session.counts && before.sessions + 1 >= line ? "earned" : null;
    }
    case "km1000": {
      if (before.metres === null) return null;
      if (before.metres >= DISTANCE_ANNIVERSARY_METRES) return "passed";
      return session.sport === "run" &&
        session.counts &&
        before.metres + session.metres >= DISTANCE_ANNIVERSARY_METRES
        ? "earned"
        : null;
    }
    case "oneYear": {
      if (startDay === null || before.lastDay === undefined) return null;
      const birthday = anniversaryDay(startDay);
      if (session.day < birthday) return null;
      if (before.lastDay !== null && before.lastDay >= birthday)
        return "passed";
      // Earned by training through the year: someone whose first session
      // comes after it has no year of training to mark.
      return session.counts && before.lastDay !== null ? "earned" : null;
    }
  }
}

/** The marks to show: earned and not yet shown, in the kinds' order. */
export function unshownAnniversaries(
  marks: AnniversaryMarks
): { kind: AnniversaryKind; day: string }[] {
  return ANNIVERSARY_KINDS.flatMap((kind) => {
    const mark = marks[kind];
    return mark && !mark.shown && mark.day ? [{ kind, day: mark.day }] : [];
  });
}

/* ---- Words ------------------------------------------------------------ */

/** What the reveal and its share card say (CODING_STANDARDS: a reward
 *  says what, how much and what's next). */
export interface AnniversaryWords {
  kicker: string;
  /** The achievement, five words or fewer. */
  headline: string;
  /** The display figure in the medallion, and the word under it. */
  figure: string;
  unit: string;
  /** You, what you did, the number and since when. */
  line: string;
  /** Kilometres are running's coral; a count or a year the brand's
   *  purple, as a streak's flame is. */
  tone: "lifting" | "running";
}

/** "3 Mar 2025", or nothing for a day that does not parse. */
function dayWords(day: string | null): string | null {
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const date = parseLocalDate(day);
  return Number.isNaN(date.getTime()) ? null : formatDayMonthYear(date);
}

export function anniversaryWords(
  kind: AnniversaryKind,
  since: string | null
): AnniversaryWords {
  const from = dayWords(since);
  const sinceWords = from ? ` since ${keepTogether(from)}` : "";
  switch (kind) {
    case "sessions50":
      return {
        kicker: "Anniversary",
        headline: "Your 50th session",
        figure: "50",
        unit: "sessions",
        line: `You’ve trained 50 times${sinceWords}. 100 is next.`,
        tone: "lifting",
      };
    case "sessions100":
      return {
        kicker: "Anniversary",
        headline: "Your 100th session",
        figure: "100",
        unit: "sessions",
        line: `You’ve trained 100 times${sinceWords}.`,
        tone: "lifting",
      };
    case "oneYear":
      return {
        kicker: "Anniversary",
        headline: "A year of Tropos",
        figure: "1",
        unit: "year",
        line: from
          ? `You’ve trained with Tropos since ${keepTogether(from)}.`
          : "You’ve trained with Tropos for a year.",
        tone: "lifting",
      };
    case "km1000": {
      const km = (DISTANCE_ANNIVERSARY_METRES / 1000).toLocaleString();
      return {
        kicker: "Anniversary",
        headline: `${km} km run`,
        figure: km,
        unit: "km",
        line: `You’ve run ${keepTogether(`${km} km`)}${sinceWords}.`,
        tone: "running",
      };
    }
  }
}
