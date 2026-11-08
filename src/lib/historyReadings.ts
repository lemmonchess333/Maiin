import type { HistoryRange } from "./historyFigures";
import type { LiftProgressRow } from "./liftProgress";
import type { SummaryChange } from "./periodSummary";
import { addLocalDays, localDateString, parseLocalDate } from "./dateHelpers";
import { joinHumanList } from "./listFormat";
import {
  abbreviateK,
  formatDayMonth,
  formatDayMonthYear,
  keepTogether,
} from "@/utils/formatters";

/**
 * The reading line under each History chart (DS4, §14m; CODING_STANDARDS'
 * measured words rules): the verdict in plain words, one of the person's
 * own numbers, and what it is compared with. One sentence, 15 words or
 * fewer, with the person as the one who trained ("You lifted", never "your
 * volume"). A stretch with less in it is the number against the range
 * before, with no judgement word. Where there is too little to compare,
 * the line says when it fills, with a date or a count.
 *
 * Changes are AMOUNTS, as the overview's figures give them
 * (`periodSummary`'s `volumeChange` / `distanceChange` / `countChange`): a
 * percentage off a small base is noise, and an amount needs no base.
 *
 * Pure: each function takes what its chart already draws and returns the
 * words, or null when the chart has nothing to say.
 */

/** "3 Dec", or "3 Dec 2025" when it is not this year. */
function dayText(key: string, today: Date): string {
  const date = parseLocalDate(key);
  return keepTogether(
    date.getFullYear() === today.getFullYear()
      ? formatDayMonth(date)
      : formatDayMonthYear(date)
  );
}

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

/**
 * The day an account younger than the range first has a whole range
 * before it to compare with: its first day plus the range. Null when the
 * account is older than the range (it compares already) or its first day
 * is not known.
 */
export function comparisonStartKey(range: HistoryRange): string | null {
  if (!range.joinedInRange || !range.startKey) return null;
  return localDateString(
    addLocalDays(parseLocalDate(range.startKey), range.rangeDays)
  );
}

export type RangeReadingKind = "sessions" | "lifted" | "ran";

/**
 * A range's sessions, kilograms or distance against the range before:
 * "You lifted 3.5k kg less than the 30 days before." (the words rules'
 * own rewrite of "Training volume dipped").
 *
 * - `comparesFromKey`: the account is younger than the range, so there is
 *   no range before to compare with yet. The line says the day it will:
 *   "From 3 Dec, this compares with the 30 days before."
 * - `previousKnown` false: the range before is still being read (or the
 *   read failed). An unknown is not a range with nothing in it, so the
 *   line says nothing rather than "more than nothing".
 * - `change` null with the range before known: it rounds to no change.
 */
export function rangeChangeReading({
  kind,
  change,
  previousKnown,
  previousLabel,
  comparesFromKey = null,
  today,
}: {
  kind: RangeReadingKind;
  change: SummaryChange | null;
  previousKnown: boolean;
  /** "the 30 days before" (`previousRangeLabel`). */
  previousLabel: string;
  comparesFromKey?: string | null;
  today: Date;
}): string | null {
  if (comparesFromKey) {
    return `From ${dayText(comparesFromKey, today)}, this compares with ${previousLabel}.`;
  }
  if (!previousKnown) return null;
  if (!change) {
    if (kind === "sessions")
      return `You trained as many sessions as in ${previousLabel}.`;
    if (kind === "lifted")
      return `You lifted about as much as in ${previousLabel}.`;
    return `You ran about as far as in ${previousLabel}.`;
  }
  const up = change.direction === "up";
  if (kind === "sessions") {
    const n = Number(change.text);
    return `You trained ${n} ${up ? "more" : "fewer"} ${
      n === 1 ? "session" : "sessions"
    } than ${previousLabel}.`;
  }
  const amount = keepTogether(change.text);
  const verb = kind === "lifted" ? "lifted" : "ran";
  return `You ${verb} ${amount} ${up ? "more" : "less"} than ${previousLabel}.`;
}

/**
 * The Lifting page's "Your lifts": how many lifts' top sets went up across
 * the range, counted as the Go deeper tile counts them (a lift holding at
 * an old best is not "up", whatever its first session in the range was).
 * "Your top set went up on 4 of 14 lifts in the last 30 days."
 */
export function liftProgressReading(
  rows: readonly LiftProgressRow[],
  /** The range's heading: "Last 30 days". */
  rangeLabel: string
): string | null {
  const n = rows.length;
  if (n === 0) return null;
  const span = `in the ${rangeLabel.charAt(0).toLowerCase()}${rangeLabel.slice(1)}`;
  const up = rows.filter((r) => !r.holding && r.direction === "up").length;
  const down = rows.filter((r) => !r.holding && r.direction === "down").length;
  const of = (k: number) => (n === 1 ? "" : ` on ${k} of ${n} lifts`);
  if (up > 0) return `Your top set went up${of(up)} ${span}.`;
  if (down > 0) return `Your top set went down${of(down)} ${span}.`;
  if (n === 1) return `Your top set held level ${span}.`;
  return `Your top set held level on ${n === 2 ? "both" : `all ${n}`} lifts ${span}.`;
}

/**
 * The muscle map's line: where the range's sets went, as a share of all of
 * them. "Most sets went to legs: 64 of 180."
 */
export function muscleShareReading(
  /** Sets per muscle group in the range, as the map takes them. */
  data: Readonly<Record<string, number>>
): string | null {
  const groups = Object.entries(data)
    .filter(([, sets]) => sets > 0)
    .sort((a, b) => b[1] - a[1]);
  if (groups.length === 0) return null;
  const total = groups.reduce((sum, [, sets]) => sum + sets, 0);
  const name = (group: string) => group.toLowerCase();
  if (groups.length === 1) {
    return total === 1
      ? `Your 1 set went to ${name(groups[0][0])}.`
      : `All ${total} sets went to ${name(groups[0][0])}.`;
  }
  const top = groups[0][1];
  const leaders = groups
    .filter(([, sets]) => sets === top)
    .map(([g]) => name(g));
  if (leaders.length === groups.length) {
    return `Your sets split evenly: ${plural(top, "set", "sets")} each to ${joinHumanList(leaders)}.`;
  }
  if (leaders.length > 1) {
    return `Most sets went to ${joinHumanList(leaders)}: ${top} each, of ${total}.`;
  }
  return `Most sets went to ${leaders[0]}: ${top} of ${total}.`;
}

/**
 * "Sets per muscle": how many muscles sit under the range their focus aims
 * for, out of all of them. Named when there are few enough to read.
 * "2 of 14 muscles below their range: side delts, abs".
 */
export function muscleRangeReading({
  total,
  below,
  namedMax,
}: {
  total: number;
  /** The muscles under their range, as the card names them. */
  below: readonly string[];
  /** Name them up to this many; past it, the count alone. */
  namedMax: number;
}): string | null {
  if (total === 0) return null;
  if (below.length === 0)
    return total === 1
      ? "Your 1 muscle is in its range"
      : total === 2
        ? "Both muscles in their range"
        : `All ${total} muscles in their range`;
  const head = `${below.length} of ${total} ${total === 1 ? "muscle" : "muscles"} below their range`;
  return below.length > namedMax
    ? head
    : `${head}: ${below.map((m) => m.toLowerCase()).join(", ")}`;
}

/** An amount as a chart's axis would read it: "15", "2.5", "1.2k". */
function amountText(n: number): string {
  if (n >= 1000) return abbreviateK(n);
  return String(Math.round(n * 10) / 10);
}

/**
 * One exercise's progression chart, first point in the range against the
 * latest: "Up 15 kg since 19 Aug." It sits under the chart's own label and
 * metric switch, which name what is measured.
 */
export function exerciseProgressReading(
  points: readonly { date: string; value: number }[],
  /** The chart's unit: "kg", "lb", "reps", "s". */
  unit: string,
  today: Date
): string | null {
  if (points.length < 2) return null;
  const first = points[0];
  const last = points[points.length - 1];
  const since = dayText(first.date, today);
  const amount = amountText(Math.abs(last.value - first.value));
  if (Number(amount.replace("k", "")) === 0) return `Level with ${since}.`;
  return `${last.value > first.value ? "Up" : "Down"} ${keepTogether(
    `${amount} ${unit}`
  )} since ${since}.`;
}

/**
 * What a chart that is not drawn yet is waiting for, counted down:
 * "Log 2 more lifts for the chart". Null once there is enough. It said
 * "Log 3 lifts to see the chart" to someone who had logged two. Held to
 * the 30 characters Hist5d's pin 6 gives a suppression line: the longest,
 * "Log 2 more lifts for the chart", is 30.
 */
export function chartWaitLine(
  logged: number,
  needed: number,
  noun: { one: string; many: string }
): string | null {
  const left = needed - logged;
  if (left <= 0) return null;
  const word = left === 1 ? noun.one : noun.many;
  return logged === 0
    ? `Log ${left} ${word} for the chart`
    : `Log ${left} more ${word} for the chart`;
}
