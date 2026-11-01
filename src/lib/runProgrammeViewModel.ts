/**
 * Run programme view model — pure, testable derivation for the
 * Programme Run cockpit primitives (RaceCockpitCard, SessionCommandCard,
 * ProgrammeWeekSelector / DayActionSheet).
 *
 * Locked model (Run9a): freeform is the always-on substrate and a RACE
 * GOAL is the only active "plan" overlay. There is NO user-facing
 * freeform / structured / race_prep toggle. This module models the Run
 * surface as exactly two states:
 *
 *   { kind: "freeform" }                  — base state, no race goal
 *   { kind: "race_goal"; race: ... }      — race-goal overlay active
 *
 * Everything here is a pure function of (profile, programState, claimMap,
 * date keys). No React, no hooks, no `new Date()` reads — callers pass
 * the local date keys in so the output is deterministic and unit-testable.
 */

import type { RunTemplate } from "@/lib/workoutTemplates";
import type { DistanceUnit } from "@/lib/distanceUnits";
import { runTemplateName } from "@/lib/runLabels";
import {
  getRacePhaseLabel,
  isCurrentWeekInTaper,
} from "@/features/program/runPlanTiming";
import { differenceInCalendarDays } from "date-fns";
import { parseLocalDate } from "@/lib/dateHelpers";
import { formatDayMonth, formatDayMonthYear } from "@/utils/formatters";

// R4: the surface resolver + its types now live in `runPlanResolver`, which
// reconciles the profile↔programState race-goal drift. The old copy here gated
// the overlay on `programState.runPlan.raceGoal` alone while mode came from
// `profile.runMode`, so a transient store disagreement (profile written,
// mirror not yet regenerated) dropped the race overlay for a race-prep user.
// Re-exported so existing importers of `@/lib/runProgrammeViewModel` are
// transparently upgraded to the reconciliation-aware version.
export {
  resolveRunPlanSurface,
  type RunPlanSurfaceKind,
  type RunPlanSurfaceState,
} from "@/lib/runPlanResolver";

type RaceDistance = "5k" | "10k" | "half" | "marathon";

/** Readable race distance — "Marathon", not "MARATHON" or "marathon". */
export function raceDistanceLabel(distance: string): string {
  switch (distance) {
    case "5k":
      return "5K";
    case "10k":
      return "10K";
    case "half":
      return "Half Marathon";
    case "marathon":
      return "Marathon";
    default:
      return distance;
  }
}

/** A race distance inside a sentence: "Your half marathon was on 17 Oct." */
export function raceDistanceInSentence(distance: string): string {
  switch (distance) {
    case "half":
      return "half marathon";
    case "marathon":
      return "marathon";
    default:
      return raceDistanceLabel(distance);
  }
}

/**
 * A race's date in a line of copy: "17 Oct", with the year when it is not
 * this year's ("17 Oct 2025"), so an old race doesn't read as this month's.
 * Null for a key that doesn't parse, so the caller can leave the date out
 * rather than print the stored key.
 */
export function raceDateLabel(
  targetDate: string,
  todayKey: string
): string | null {
  const date = parseLocalDate(targetDate);
  if (Number.isNaN(date.getTime())) return null;
  return date.getFullYear() === parseLocalDate(todayKey).getFullYear()
    ? formatDayMonth(date)
    : formatDayMonthYear(date);
}

/**
 * How long ago race day was, in calendar days in the person's own zone:
 * "Yesterday", "2 days ago". Not in 24-hour periods from midnight on race
 * day, which round the afternoon two days after a race up to three.
 */
export function raceDaysAgoLabel(targetDate: string, todayKey: string): string {
  const days = differenceInCalendarDays(
    parseLocalDate(todayKey),
    parseLocalDate(targetDate)
  );
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${days} days ago`;
}

/**
 * A race's name and date as a banner title: "Marathon · 17 Oct", or the
 * distance alone when the date doesn't parse.
 */
export function raceTitle(
  raceGoal: { distance: string; targetDate: string },
  todayKey: string
): string {
  const date = raceDateLabel(raceGoal.targetDate, todayKey);
  const name = raceDistanceLabel(raceGoal.distance);
  return date ? `${name} · ${date}` : name;
}

/**
 * The words of the banner Train shows once race day has passed and no
 * recovery, no-show or "did you race?" prompt has taken the race over.
 * The way to act on it is the banner's "Edit run plan" button, so the
 * body names the two things to do there and not the place.
 */
export function raceElapsedBannerCopy(
  raceGoal: { distance: string; targetDate: string },
  todayKey: string,
  /** A distance run on your own (Run9a), not a race entered: its day is
   *  a goal day, and what comes next is a goal. */
  ownGoal = false
): { title: string; description: string } {
  const date = raceDateLabel(raceGoal.targetDate, todayKey);
  const race = raceDistanceInSentence(raceGoal.distance);
  const when = date
    ? `Your ${race} was on ${date}.`
    : `Your ${race} has passed.`;
  return {
    title: ownGoal ? "Your goal day has passed" : "Your race has passed",
    description: `${when} Set your next ${ownGoal ? "goal" : "race"}, or change how you run.`,
  };
}

/**
 * A run's label on Train's week strip: the session's name (Run21 (2)), so
 * an easy run, one with strides and a tempo read apart. The strip sets it
 * on two lines (`runStripLines`); the full name is also the cell's tab
 * label and the session card's title. It was a compact token ("30m",
 * "15K"), which said neither what kind of run a day held nor that it had
 * strides.
 */
export function runStripLabel(
  template: RunTemplate | null | undefined,
  unit: DistanceUnit
): string {
  return template ? runTemplateName(template.name, unit) : "Run";
}

/**
 * A run's name as the week strip's two lines, each of which ends in "…" on
 * its own when it doesn't fit its cell. Left to wrap, a word wider than the
 * cell was cut off bare ("Interva", "Marathor" at 393px) or, hyphenated,
 * split mid-word; neither says the name goes on. The break goes between
 * words, or after a hyphen ("Medium-" / "long 60"), wherever the two lines
 * come out most even, the later break on a tie ("Half Marathon" / "Race");
 * "+ strides" stays together. A one-word name keeps one line.
 */
export function runStripLines(name: string): string[] {
  // Each token with what joins it to the one before: a space between
  // words, nothing after a hyphen.
  const tokens: { text: string; join: string }[] = [];
  for (const word of name.trim().split(/\s+/)) {
    if (!word) continue;
    const last = tokens[tokens.length - 1];
    if (last?.text === "+") {
      last.text = `+ ${word}`;
      continue;
    }
    (word.match(/[^-]+-?|-/g) ?? [word]).forEach((part, i) =>
      tokens.push({ text: part, join: i === 0 ? " " : "" })
    );
  }
  if (tokens.length < 2) return tokens.map((t) => t.text);
  const join = (ts: typeof tokens) =>
    ts.map((t, i) => (i === 0 ? t.text : t.join + t.text)).join("");
  let best: string[] = [];
  let bestLength = Infinity;
  for (let k = 1; k < tokens.length; k++) {
    const lines = [join(tokens.slice(0, k)), join(tokens.slice(k))];
    const length = Math.max(...lines.map((l) => l.length));
    if (length <= bestLength) {
      best = lines;
      bestLength = length;
    }
  }
  return best;
}

/**
 * Hybrid interference (2026-07 audit quick-fix): the run scheduler already
 * prefers non-Both slots for the hardest run, but accepts the pairing when
 * only Both slots exist — with the explicit note "the UI can flag it"
 * (runScheduler.ts). This is that flag: a QUALITY run (tempo / intervals /
 * long) sharing a day with a lift is worth a heads-up. Easy runs coexist
 * fine; race day has its own treatment and is deliberately excluded (race
 * day is race day — nagging it would be noise).
 */
export function hasHybridInterference(args: {
  hasLift: boolean;
  runType: "easy" | "tempo" | "intervals" | "long" | "race" | null | undefined;
}): boolean {
  if (!args.hasLift || !args.runType) return false;
  return (
    args.runType === "tempo" ||
    args.runType === "intervals" ||
    args.runType === "long"
  );
}

export interface RaceCockpitViewModel {
  /** Readable distance — "Marathon". */
  distanceLabel: string;
  /** Optional user-entered event name ("London Marathon 2026"); null when
   *  the user hasn't named the race — the card falls back to the distance
   *  heading. */
  eventName?: string | null;
  /** Local target date "YYYY-MM-DD" (formatted by the card). */
  targetDate: string;
  daysToRace: number;
  /** Stored 0-based week index. */
  currentWeek: number | null;
  totalWeeks: number | null;
  /** "Base" | "Build" | "Taper" | "Race" (null when no progress). The engine
   *  (getPhaseForWeek) never emits a "Peak" phase — the rail is Base→Build→
   *  Taper→Race. */
  phaseLabel: string | null;
  inTaper: boolean;
  compressed: boolean;
  /** The plan fell below the taper-safe floor, so its weeks are the
   *  finish-safely shape — all easy, no hard sessions. `belowFloor` implies
   *  `compressed`, but the two must be surfaced DIFFERENTLY: the compressed
   *  copy says "interval work is trimmed and the long-run build is packed
   *  into fewer weeks", and a below-floor plan has neither intervals nor a
   *  long-run build (measured 2026-08-04: a marathon 3 weeks out emits
   *  `easy_30` x3 in every non-race week). Carrying only `compressed` to the
   *  cockpit means that plan describes training it does not contain.
   *
   *  STATUS 2026-08-13 — this comment, and the matching one at the section's
   *  read site, were both written in the past tense while the bug was still
   *  live: the field reached the section but was never passed to
   *  RaceCockpitCard, so the card fell through to the compressed branch for
   *  every below-floor plan. Now wired, and pinned by a section-level test
   *  rather than a card-level one (the card's own suite passes the prop
   *  directly, which is what let the gap survive).
   *
   *  The quoted copy above was also stale: it cited "the long-run
   *  progression shortened", wording RUN-EV-05 replaced because it described
   *  the compressed band backwards. Requoted from the live string. */
  belowFloor: boolean;
}

/**
 * Build the race-cockpit view model. Returns null when there's no race
 * goal (caller should not render the cockpit). `todayKey` is passed in
 * for a deterministic countdown.
 */
export function buildRaceCockpitViewModel(args: {
  raceGoal:
    | { distance: string; targetDate: string; eventName?: string }
    | null
    | undefined;
  currentWeek: number | null | undefined;
  totalWeeks: number | null | undefined;
  compressed: boolean;
  /** Optional so existing callers compile; absent reads as false, which is
   *  the correct degenerate answer — a caller that does not know cannot claim
   *  the plan is below the floor. */
  belowFloor?: boolean;
  todayKey: string;
}): RaceCockpitViewModel | null {
  const {
    raceGoal,
    currentWeek,
    totalWeeks,
    compressed,
    belowFloor = false,
    todayKey,
  } = args;
  if (!raceGoal) return null;
  const distance = raceGoal.distance as RaceDistance;

  let daysToRace = 0;
  try {
    const target = parseLocalDate(raceGoal.targetDate);
    const today = parseLocalDate(todayKey);
    daysToRace = Math.max(
      0,
      Math.round((target.getTime() - today.getTime()) / (24 * 60 * 60 * 1000))
    );
  } catch {
    daysToRace = 0;
  }

  const hasProgress = currentWeek != null && totalWeeks != null;
  const phaseLabel = hasProgress
    ? getRacePhaseLabel(currentWeek!, totalWeeks!, distance)
    : null;

  return {
    distanceLabel: raceDistanceLabel(raceGoal.distance),
    eventName: raceGoal.eventName ?? null,
    targetDate: raceGoal.targetDate,
    daysToRace,
    currentWeek: currentWeek ?? null,
    totalWeeks: totalWeeks ?? null,
    phaseLabel,
    inTaper: isCurrentWeekInTaper(
      currentWeek ?? undefined,
      totalWeeks ?? undefined,
      distance
    ),
    compressed,
    belowFloor,
  };
}

/** The word before the date on Train's run card. */
export type RunCardStatus =
  "Due today" | "Tomorrow" | "Pending" | "Up next" | "Upcoming";

/**
 * The word before the date on Train's run card, for the selected day.
 * "Up next" belongs to one run: the first still to do from today, as the
 * Lift tab's card says "Up next" over its next session, tomorrow's
 * included. After another run still to do, tomorrow's is "Tomorrow" and a
 * later one "Upcoming", the lift half's word for a session after the next
 * (`LIFT_DAY_STATUS_LABEL`), so two runs in a week never both claim to be
 * the next one.
 */
export function runCardStatus(
  selectedKey: string,
  keys: { today: string; tomorrow: string },
  week: readonly {
    dateKey: string;
    run: { runDay: unknown; isCompleted: boolean; isTerminal: boolean };
  }[]
): RunCardStatus {
  if (selectedKey === keys.today) return "Due today";
  if (selectedKey < keys.today) return "Pending";
  const runFirst = week.some(
    (day) =>
      day.dateKey >= keys.today &&
      day.dateKey < selectedKey &&
      day.run.runDay != null &&
      !day.run.isCompleted &&
      !day.run.isTerminal
  );
  if (!runFirst) return "Up next";
  return selectedKey === keys.tomorrow ? "Tomorrow" : "Upcoming";
}

/**
 * The day Train's Run tab opens on, when the person has not picked one.
 * Today, when today holds a run still to start. Otherwise the next day
 * this week that does, so a lift day or a rest day opens on the run to
 * come, as the Lift tab opens on its next session. Today again when the
 * rest of the week has none. The week strip still marks today either way.
 * Runs are date-pinned (ADR-0002): this only chooses what is shown, it
 * moves nothing.
 */
export function defaultRunDayKey(
  week: readonly {
    dateKey: string;
    run: { isStartable: boolean; isCompleted: boolean };
  }[],
  today: string
): string {
  const startable = (day: (typeof week)[number]) =>
    day.run.isStartable && !day.run.isCompleted;
  const todays = week.find((day) => day.dateKey === today);
  if (todays && startable(todays)) return today;
  const next = week.find((day) => day.dateKey > today && startable(day));
  return next?.dateKey ?? today;
}
