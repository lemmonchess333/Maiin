import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import Card from "@/components/ui/Card";
import { NewRecordChip } from "./PRCard";
import type { BestEffortRow, Effort } from "@/lib/runInsights";
import { finishTimeLabel, paceMinSec } from "@/lib/runLabels";
import { paceUnitLabel, type DistanceUnit } from "@/lib/distanceUnits";
import { parseLocalDate } from "@/lib/dateHelpers";
import { formatDayMonth } from "@/utils/formatters";

const day = (key: string) => formatDayMonth(parseLocalDate(key));

const sameEffort = (a: Effort, b: Effort) =>
  a.runId === b.runId && a.seconds === b.seconds;

/**
 * Fastest kilometres on the Running page (DS3): the quickest 1, 5 and
 * 10 km in a row inside the range's runs, each beside the fastest ever.
 *
 * Read from the kilometre splits a GPS run saves (`runInsights`), cut from
 * the full track when the run was saved, so each is a real stretch of
 * running: five whole kilometres in a row for the 5 km, inside one run,
 * whatever the run was called. Not "Best efforts": the run's finish
 * screen uses that name for a search of the live track from any starting
 * point, which can come out a few seconds quicker, and one name for two
 * numbers would read as a bug. The track a run keeps afterwards is a
 * 500-point sample, too coarse to repeat that search, so the splits are
 * the record.
 *
 * Gold only on a best set this week, as everywhere else. A range best that
 * is also the fastest ever, set earlier, says so in words.
 */
export default function FastestKilometresCard({
  rows,
  unit,
  subtitle,
  newSinceKey,
}: {
  rows: readonly BestEffortRow[];
  unit: DistanceUnit;
  /** The range: "Last 30 days". */
  subtitle: string;
  /** The first day a best counts as new. */
  newSinceKey: string;
}) {
  if (rows.length === 0) return null;
  return (
    <Card as="section" aria-label="Fastest kilometres" className="space-y-3">
      <div>
        <h2 className="text-h3 font-bold text-foreground">
          Fastest kilometres
        </h2>
        <p className="text-sm text-muted-foreground">
          Whole kilometres in a row inside one run, from its splits. {subtitle}.
        </p>
      </div>
      <ul className="-mx-2">
        {rows.map(({ km, inRange, allTime }) => {
          const isBestEver = inRange !== null && sameEffort(inRange, allTime);
          const isNew = isBestEver && allTime.date >= newSinceKey;
          const shown = inRange ?? allTime;
          return (
            <li key={km}>
              <Link
                to={`/run/${shown.runId}`}
                className="flex min-h-[56px] items-center gap-3 rounded-xl px-2 py-2 active:bg-muted/40 motion-safe:transition-colors"
              >
                <span className="w-12 shrink-0 text-sm font-bold text-running-strong">
                  {km} km
                </span>
                <div className="min-w-0 flex-1">
                  {inRange ? (
                    <>
                      <p className="flex items-center gap-2">
                        <span className="text-base font-bold font-mono tabular-nums text-foreground">
                          {finishTimeLabel(inRange.seconds)}
                        </span>
                        {isNew && <NewRecordChip label="New best" />}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {day(inRange.date)} ·{" "}
                        <span className="font-mono tabular-nums">
                          {paceMinSec(inRange.seconds / km, unit)}
                        </span>
                        {paceUnitLabel(unit)}
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      None in this range
                    </p>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  {isBestEver && !isNew ? (
                    <p className="text-xs text-muted-foreground">
                      Your fastest ever
                    </p>
                  ) : isNew ? null : (
                    <>
                      <p className="text-xs text-muted-foreground">
                        Fastest ever · {day(allTime.date)}
                      </p>
                      <p className="text-sm font-semibold font-mono tabular-nums text-foreground">
                        {finishTimeLabel(allTime.seconds)}
                      </p>
                    </>
                  )}
                </div>
                <ChevronRight
                  className="size-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
