/**
 * What the Lifting and Running pages' week-by-week cards say, as words and
 * numbers (`TrainingWeeksCard` draws them).
 *
 * Kept out of the page so the wording can be tested: the tile this card
 * replaced read "1 total runs" for every runner in their first week, and
 * a count read as English is the kind of thing that only stays fixed when
 * something checks it.
 */
import type { SummaryBin } from "./periodSummary";
import {
  distanceIn,
  distanceUnitLabel,
  type DistanceUnit,
} from "./distanceUnits";
import { abbreviateK, formatDistance, formatVolume } from "@/utils/formatters";
import { T5_BARS_MIN_COUNT } from "./dataConfidence";

export interface TrainingFigure {
  value: string;
  /** The words under the number: "kg lifted", "runs". */
  label: string;
}

/** A bar's measure, in words, and its sessions. */
export interface BinReading {
  amount: (bin: SummaryBin) => number;
  describe: (value: number) => string;
  /** The bin's sessions of this sport. */
  count: (bin: SummaryBin) => number;
  countText: (bin: SummaryBin) => string;
  /** What stands where the chart would, until there is enough to draw:
   *  the page's shared rule for a bar chart (`dataConfidence` T5). */
  chartCaveat: string;
}

/** "1 run", "3 runs", "0 runs". */
export function countOf(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

const noun = (n: number, one: string, many: string) => (n === 1 ? one : many);

/**
 * Time on the move as a figure: "12h 5m", "45m", "123h". A clock
 * ("45:12", "12h 05m") reads as one run's time and wraps in a third of a
 * phone's width; past a hundred hours the minutes are noise.
 */
export function totalTimeLabel(seconds: number): string {
  const minutes = Math.round(Math.max(0, seconds) / 60);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h >= 100) return `${h}h`;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function liftingFigures({
  volumeKg,
  sessions,
  sets,
}: {
  volumeKg: number;
  sessions: number;
  sets: number;
}): TrainingFigure[] {
  return [
    { value: formatVolume(volumeKg).value, label: "kg lifted" },
    { value: String(sessions), label: noun(sessions, "session", "sessions") },
    { value: String(sets), label: noun(sets, "set", "sets") },
  ];
}

export function runningFigures({
  distanceM,
  runs,
  seconds,
  unit,
}: {
  distanceM: number;
  runs: number;
  seconds: number;
  unit: DistanceUnit;
}): TrainingFigure[] {
  return [
    {
      value: formatDistance(distanceIn(distanceM, unit)),
      label: `${distanceUnitLabel(unit)} run`,
    },
    { value: String(runs), label: noun(runs, "run", "runs") },
    { value: totalTimeLabel(seconds), label: "time" },
  ];
}

export const liftingBins: BinReading = {
  amount: (bin) => bin.volumeKg,
  describe: (kg) => `${abbreviateK(kg)} kg`,
  count: (bin) => bin.lifts,
  countText: (bin) => countOf(bin.lifts, "session", "sessions"),
  chartCaveat: `Log ${T5_BARS_MIN_COUNT} lifts to see the chart`,
};

/** The distance bars in the reader's unit: a mile-preferring runner reads
 *  miles on the bars, the average and the reading alike. */
export function runningBins(unit: DistanceUnit): BinReading {
  return {
    amount: (bin) => distanceIn(bin.distanceM, unit),
    describe: (value) => `${value.toFixed(1)} ${distanceUnitLabel(unit)}`,
    count: (bin) => bin.runs,
    countText: (bin) => countOf(bin.runs, "run", "runs"),
    chartCaveat: `Log ${T5_BARS_MIN_COUNT} runs to see the chart`,
  };
}
