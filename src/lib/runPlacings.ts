/**
 * Your top three (Run29): where a run's 1K, 5K and 10K stand among your own
 * times at the distance, 1st to 3rd, as Strava marks a run's best efforts.
 *
 * Each time is the run's own over the distance (`runEffortSeconds`), the
 * figure Bests lists and the finish calls "your fastest yet" (App1 Q15).
 * Only pace-eligible runs count (`isPaceEligible`): a treadmill or manual
 * run's distance was typed, so it places nowhere and moves no one.
 *
 * A run's place is its rank among every eligible time at the distance up
 * to and including its own, shown from 1st to 3rd, as Strava ranks a
 * run's efforts: a second 5K slower than the first is your 2nd fastest.
 * "Up to" is by when each run started (`compareRunOrder`), as Strava orders
 * activities, so a run saved after a later one still comes before it.
 * A distance run for the first time shows no place on the run, as Strava
 * marks none on the activity; it is still that distance's 1st on Bests
 * and ranks the runs after it. Two runs at the same time keep the order
 * they were run in, the earlier ahead, on every surface.
 *
 * No Firebase and no React here.
 */
import {
  runEffortSeconds,
  type EffortRun,
  type FastestEffort,
} from "./runEfforts";
import { isPaceEligible, type RunRecord } from "./runStatsEligibility";
import { FASTEST_EFFORT_METERS } from "./postMoments";
import { formatClock } from "@/utils/formatters";

export type Place = 1 | 2 | 3;

/** What a run keeps that can be placed. */
export type PlacedRun = EffortRun &
  RunRecord & {
    id: string;
    completedAt: Date;
    /** When the run started. Absent on a run saved without it, which is
     *  ordered by `completedAt`. */
    startedAt?: Date;
  };

/** The instant a run is ordered by: its start, else its finish. */
export function runStartMs(run: Pick<PlacedRun, "startedAt" | "completedAt">) {
  return (run.startedAt ?? run.completedAt).getTime();
}

/**
 * The order runs were run in, the one rule every surface ranks by: the
 * earlier start first, then the earlier finish, then the id, so no two
 * runs are ever level.
 */
export function compareRunOrder(
  a: Pick<PlacedRun, "id" | "startedAt" | "completedAt">,
  b: Pick<PlacedRun, "id" | "startedAt" | "completedAt">
): number {
  return (
    runStartMs(a) - runStartMs(b) ||
    a.completedAt.getTime() - b.completedAt.getTime() ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

/** One distance this run placed at. */
export interface RunPlacing {
  meters: number;
  /** The run's time over the distance. */
  seconds: number;
  place: Place;
  /** The fastest earlier time at the distance: the one this run is behind
   *  for a 2nd or 3rd, the one it beat for a 1st. */
  bestSeconds: number;
}

/** One of your times at a distance, fastest first. */
export interface RankedEffort<T> {
  run: T;
  seconds: number;
}

const NAMES: Readonly<Record<number, string>> = {
  1000: "1K",
  5000: "5K",
  10000: "10K",
};

/** The distance as the finish names it ("5K"). */
export function placingDistanceName(meters: number): string {
  return NAMES[meters] ?? "";
}

function placeable<T extends PlacedRun>(runs: readonly T[]): T[] {
  return runs.filter((run) => isPaceEligible(run));
}

/**
 * Every eligible time at `meters`, fastest first; of two the same, the
 * one run first (`compareRunOrder`), whatever order `runs` is in.
 */
export function rankedEfforts<T extends PlacedRun>(
  runs: readonly T[],
  meters: number
): RankedEffort<T>[] {
  const ranked: RankedEffort<T>[] = [];
  for (const run of placeable(runs)) {
    const seconds = runEffortSeconds(run, meters);
    if (seconds !== null) ranked.push({ run, seconds });
  }
  return ranked.sort(
    (a, b) => a.seconds - b.seconds || compareRunOrder(a.run, b.run)
  );
}

/**
 * Each distance's fastest eligible time, in the order of `meters`, held by
 * the run `rankedEfforts` puts first: at a tie, the one run first. Bests'
 * Fastest rows read this, so the run they name is the one whose page says
 * "Your best".
 */
export function topEfforts<T extends PlacedRun>(
  runs: readonly T[],
  meters: readonly number[]
): FastestEffort<T>[] {
  const top: FastestEffort<T>[] = [];
  for (const distance of meters) {
    const first = rankedEfforts(runs, distance)[0];
    if (first)
      top.push({ meters: distance, seconds: first.seconds, run: first.run });
  }
  return top;
}

/**
 * The distances `run` placed 1st to 3rd at, among the runs in `history`
 * that started before it (`compareRunOrder`), in the order of 1K, 5K, 10K.
 * `history` may hold the run itself and later runs; neither counts. Empty
 * for a run that is not pace-eligible.
 */
export function runPlacings(
  run: PlacedRun,
  history: readonly PlacedRun[]
): RunPlacing[] {
  if (!isPaceEligible(run)) return [];
  const earlier = placeable(history).filter(
    (other) => other.id !== run.id && compareRunOrder(other, run) < 0
  );
  const placings: RunPlacing[] = [];
  for (const meters of FASTEST_EFFORT_METERS) {
    const seconds = runEffortSeconds(run, meters);
    if (seconds === null) continue;
    const times = earlier
      .map((other) => runEffortSeconds(other, meters))
      .filter((time): time is number => time !== null);
    /* A first time at the distance is marked nowhere on the run. */
    if (times.length === 0) continue;
    /* An earlier run at the same time keeps its place. */
    const place = times.filter((time) => time <= seconds).length + 1;
    if (place > 3) continue;
    placings.push({
      meters,
      seconds,
      place: place as Place,
      bestSeconds: Math.min(...times),
    });
  }
  return placings;
}

/** A place in the words a segment's place uses (`rankWords`): "Your best",
 *  "Your 2nd best", "Your 3rd best". */
export function placeWords(place: Place): string {
  return place === 1
    ? "Your best"
    : place === 2
      ? "Your 2nd best"
      : "Your 3rd best";
}

/** The place for a screen reader, beside its disc: "2nd fastest". */
export function placeLabel(place: Place): string {
  return place === 1 ? "Fastest" : place === 2 ? "2nd fastest" : "3rd fastest";
}

/** A row's comparison: "best 25:10" for a 2nd or 3rd, "New best" for a
 *  1st. A segment's row says it the same way. */
export function placingGap(
  placing: Pick<RunPlacing, "place" | "bestSeconds">
): string {
  return placing.place === 1
    ? "New best"
    : `best ${formatClock(placing.bestSeconds)}`;
}

/**
 * The finish's one sentence on a 2nd or 3rd: the best placing, the longer
 * distance of two at the same place ("Ran 5K in 25:41, your 2nd
 * fastest."). Null with no placing, and when the run placed 1st anywhere,
 * since the reward says that.
 */
export function placingSentence(
  placings: readonly RunPlacing[]
): string | null {
  if (placings.length === 0 || placings.some((p) => p.place === 1))
    return null;
  const best = placings.reduce((lead, placing) =>
    placing.place < lead.place ||
    (placing.place === lead.place && placing.meters > lead.meters)
      ? placing
      : lead
  );
  const word = best.place === 2 ? "2nd" : "3rd";
  return `Ran ${placingDistanceName(best.meters)} in ${formatClock(best.seconds)}, your ${word} fastest.`;
}
