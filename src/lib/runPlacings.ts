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
 * run's efforts: a first 5K is a 1st, and a second 5K slower than the
 * first is your 2nd fastest. Two runs at the same time keep the order
 * they were run in, the earlier ahead.
 *
 * No Firebase and no React here.
 */
import { runEffortSeconds, type EffortRun } from "./runEfforts";
import { isPaceEligible, type RunRecord } from "./runStatsEligibility";
import { FASTEST_EFFORT_METERS } from "./postMoments";
import { formatClock } from "@/utils/formatters";

export type Place = 1 | 2 | 3;

/** What a run keeps that can be placed. */
export type PlacedRun = EffortRun &
  RunRecord & {
    id: string;
    completedAt: Date;
  };

/** One distance this run placed at. */
export interface RunPlacing {
  meters: number;
  /** The run's time over the distance. */
  seconds: number;
  place: Place;
  /** The fastest earlier time at the distance: the one this run is behind
   *  for a 2nd or 3rd, the one it beat for a 1st. Null for the first time
   *  at the distance. */
  bestSeconds: number | null;
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
 * one run first.
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
    (a, b) =>
      a.seconds - b.seconds ||
      a.run.completedAt.getTime() - b.run.completedAt.getTime()
  );
}

/**
 * The distances `run` placed 1st to 3rd at, among the runs in `history`
 * that came before it, in the order of 1K, 5K, 10K. `history` may hold the
 * run itself and later runs; neither counts. Empty for a run that is not
 * pace-eligible.
 */
export function runPlacings(
  run: PlacedRun,
  history: readonly PlacedRun[]
): RunPlacing[] {
  if (!isPaceEligible(run)) return [];
  const at = run.completedAt.getTime();
  const earlier = placeable(history).filter(
    (other) => other.id !== run.id && other.completedAt.getTime() < at
  );
  const placings: RunPlacing[] = [];
  for (const meters of FASTEST_EFFORT_METERS) {
    const seconds = runEffortSeconds(run, meters);
    if (seconds === null) continue;
    const times = earlier
      .map((other) => runEffortSeconds(other, meters))
      .filter((time): time is number => time !== null);
    /* An earlier run at the same time keeps its place. */
    const place = times.filter((time) => time <= seconds).length + 1;
    if (place > 3) continue;
    placings.push({
      meters,
      seconds,
      place: place as Place,
      bestSeconds: times.length > 0 ? Math.min(...times) : null,
    });
  }
  return placings;
}

/** A place in the words a segment's place uses (`rankWords`): "Your first
 *  time" for the first at the distance, else "Your best", "Your 2nd best",
 *  "Your 3rd best". */
export function placeWords(placing: RunPlacing): string {
  if (placing.bestSeconds === null) return "Your first time";
  return placing.place === 1
    ? "Your best"
    : placing.place === 2
      ? "Your 2nd best"
      : "Your 3rd best";
}

/** The place for a screen reader, beside its disc: "2nd fastest". */
export function placeLabel(place: Place): string {
  return place === 1 ? "Fastest" : place === 2 ? "2nd fastest" : "3rd fastest";
}

/** A row's comparison: "best 25:10" for a 2nd or 3rd, "New best" for a
 *  1st, "First time" for the first at the distance. */
export function placingGap(placing: RunPlacing): string {
  if (placing.bestSeconds === null) return "First time";
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
