import { useId } from "react";
import { Card } from "@/components/ui/Card";
import SectionHeading from "@/components/ui/SectionHeading";
import SectionLabel from "@/components/ui/SectionLabel";
import type { Split } from "@/lib/gps";
import { paceMinSec } from "@/lib/runLabels";
import {
  elevationIn,
  elevationUnitLabel,
  paceUnitLabel,
  type DistanceUnit,
} from "@/lib/distanceUnits";
import { cn } from "@/lib/utils";

interface SplitsTableProps {
  /** The rows, as `splitsForDisplay` returns them. */
  splits: readonly Split[];
  /**
   * The unit the rows are CUT on, which is not always the reader's: a run
   * with no trace (treadmill, manual, an old record) only has the
   * kilometre rows it saved, and a miles reader gets those, headed "Km",
   * rather than kilometres relabelled as miles.
   */
  lapUnit: DistanceUnit;
  /** The reader's unit, for the paces and the climbs. A pace is a rate,
   *  so it converts whatever length the lap was. */
  unit: DistanceUnit;
}

/** A split's pace in seconds per km, or null for a lap with no usable
 *  time, which gets no bar and no say in which lap was fastest. */
function paceOf(split: Split): number | null {
  const pace = split.paceSeconds;
  return Number.isFinite(pace) && pace > 0 ? pace : null;
}

const metres = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) ? value : 0;

/** The lap's height change, climb less descent, in the reader's unit:
 *  "+6", "−4" (a real minus sign), or "0". */
function signedClimb(split: Split, unit: DistanceUnit): string {
  const net = Math.round(
    elevationIn(metres(split.elevationGain) - metres(split.elevationLoss), unit)
  );
  if (net === 0) return "0";
  return net > 0 ? `+${net}` : `−${Math.abs(net)}`;
}

/**
 * A run's splits as one table (DS3, Strava's activity page as the bar):
 * the lap, its pace with its unit, its height change when the run has
 * any, and a coral bar whose length is the lap's SPEED against the
 * fastest lap's, so the fastest lap's bar is the full width and a lap 10%
 * slower has a bar 10% shorter. The bars start at zero on purpose: a
 * clipped baseline would make an evenly paced run look ragged.
 *
 * It is the one view of the laps on the finish screen and on a saved run,
 * so neither page carries a chart or a second list of the same paces.
 *
 * The fastest lap is marked by weight and named above the table in
 * words, never by a colour of its own: coral is running's colour, and a
 * green or red lap would read as a verdict on a slow one. One lap has
 * nothing to compare against, so it gets neither a bar nor a "fastest".
 */
export default function SplitsTable({
  splits,
  lapUnit,
  unit,
}: SplitsTableProps) {
  const headingId = useId();
  if (splits.length === 0) return null;

  const timed = splits.filter((split) => paceOf(split) !== null);
  const compared = timed.length >= 2;
  const fastest = compared
    ? timed.reduce((best, split) =>
        (paceOf(split) as number) < (paceOf(best) as number) ? split : best
      )
    : null;
  const fastestPace = fastest ? paceOf(fastest) : null;
  /* A climb column only when the run has a climb to show. A run with no
     altitude readings saves 0 up and 0 down for every lap, and a column
     of zeros would claim a flat run nobody measured. */
  const hasClimb = splits.some(
    (split) =>
      metres(split.elevationGain) > 0 || metres(split.elevationLoss) > 0
  );
  const lapNoun = lapUnit === "mi" ? "mile" : "km";
  const paceUnit = paceUnitLabel(unit);

  return (
    <Card as="section" aria-labelledby={headingId} className="space-y-3">
      <div>
        <SectionHeading id={headingId} size="compact">
          Splits
        </SectionHeading>
        {fastest && fastestPace !== null && (
          <p className="mt-1 text-sm text-muted-foreground">
            Fastest: {lapNoun}{" "}
            <span className="font-mono tabular-nums">{fastest.km}</span> ·{" "}
            <span className="font-mono tabular-nums">
              {paceMinSec(fastestPace, unit)}
            </span>{" "}
            {paceUnit}
          </p>
        )}
      </div>

      <table
        aria-labelledby={headingId}
        className="w-full table-fixed border-collapse"
      >
        <thead>
          <tr className="border-b border-border">
            <th scope="col" className="w-10 pb-2 text-left font-normal">
              <SectionLabel as="span">
                {lapUnit === "mi" ? "Mi" : "Km"}
              </SectionLabel>
            </th>
            <th scope="col" className="pb-2 text-right font-normal">
              <SectionLabel as="span">Pace</SectionLabel>
            </th>
            {hasClimb && (
              <th scope="col" className="w-16 pb-2 text-right font-normal">
                <SectionLabel as="span">
                  <span aria-hidden="true">Elev</span>
                  <span className="sr-only">Elevation change</span>
                </SectionLabel>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {splits.map((split) => {
            const pace = paceOf(split);
            const isFastest = split === fastest;
            return (
              <tr key={split.km} data-fastest={isFastest || undefined}>
                <th
                  scope="row"
                  className={cn(
                    "py-1.5 text-left text-sm font-mono tabular-nums",
                    /* Explicit on every row: a <th> is bold by default,
                       and the weight is what marks the fastest lap. */
                    isFastest
                      ? "font-bold text-foreground"
                      : "font-normal text-muted-foreground"
                  )}
                >
                  {split.km}
                  {isFastest && <span className="sr-only">, fastest</span>}
                </th>
                <td className="py-1.5">
                  <div className="flex items-center gap-3">
                    <div className="h-2 min-w-0 flex-1" aria-hidden="true">
                      {compared && pace !== null && fastestPace !== null && (
                        <div
                          data-testid="split-bar"
                          className="h-full rounded-r-full bg-running"
                          style={{ width: `${(fastestPace / pace) * 100}%` }}
                        />
                      )}
                    </div>
                    <p className="w-[4.75rem] shrink-0 text-right text-sm text-foreground">
                      <span
                        className={cn(
                          "font-mono tabular-nums",
                          isFastest ? "font-bold" : "font-normal"
                        )}
                      >
                        {paceMinSec(pace ?? 0, unit)}
                      </span>
                      {pace !== null && (
                        <>
                          {" "}
                          <span className="text-xs text-muted-foreground">
                            {paceUnit}
                          </span>
                        </>
                      )}
                    </p>
                  </div>
                </td>
                {hasClimb && (
                  <td className="py-1.5 text-right text-sm text-muted-foreground">
                    <span className="font-mono tabular-nums">
                      {signedClimb(split, unit)}
                    </span>{" "}
                    <span className="text-xs">{elevationUnitLabel(unit)}</span>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}
