import { useState, type ReactNode } from "react";
import SectionHeading from "@/components/ui/SectionHeading";
import SectionLabel from "@/components/ui/SectionLabel";
import SegmentedControl from "@/components/ui/SegmentedControl";
import type { RunLapSplit } from "@/lib/runLaps";
import { nearDistanceLabel, paceMinSec } from "@/lib/runLabels";
import { paceUnitLabel, type DistanceUnit } from "@/lib/distanceUnits";
import { formatClock } from "@/utils/formatters";
import { cn } from "@/lib/utils";

interface LapSplitsTableProps {
  headingId: string;
  laps: readonly RunLapSplit[];
  lapUnit: DistanceUnit;
  unit: DistanceUnit;
  hasDistanceSplits: boolean;
  fastestDistanceLine: ReactNode;
  distanceTable: ReactNode;
}

export default function LapSplitsTable({
  headingId,
  laps,
  lapUnit,
  unit,
  hasDistanceSplits,
  fastestDistanceLine,
  distanceTable,
}: LapSplitsTableProps) {
  const [view, setView] = useState<"distance" | "laps">(
    hasDistanceSplits ? "distance" : "laps"
  );
  const activeView: "distance" | "laps" = hasDistanceSplits ? view : "laps";
  const hasStructuredLaps = laps.some((lap) => lap.kind !== "manual");
  const paceUnit = paceUnitLabel(unit);

  const timedLaps = laps.filter(
    (lap) =>
      typeof lap.paceSecondsPerKm === "number" &&
      Number.isFinite(lap.paceSecondsPerKm) &&
      lap.paceSecondsPerKm > 0
  );
  const lapsCompared = timedLaps.length >= 2;
  const fastestLap = lapsCompared
    ? timedLaps.reduce((best, lap) =>
        (lap.paceSecondsPerKm as number) < (best.paceSecondsPerKm as number)
          ? lap
          : best
      )
    : null;
  const fastestLapPace = fastestLap?.paceSecondsPerKm ?? null;

  return (
    <>
      <div className="space-y-2">
        <div>
          <SectionHeading id={headingId} size="compact">
            Splits
          </SectionHeading>
          {activeView === "distance" && fastestDistanceLine}
          {activeView === "laps" && fastestLap && fastestLapPace !== null && (
            <p className="mt-1 text-sm text-muted-foreground">
              Fastest: {fastestLap.label} ·{" "}
              <span className="font-mono tabular-nums">
                {paceMinSec(fastestLapPace, unit)}
              </span>{" "}
              {paceUnit}
            </p>
          )}
        </div>

        {hasDistanceSplits && (
          <SegmentedControl
            size="sm"
            ariaLabel="Split view"
            value={activeView}
            onChange={setView}
            options={[
              { value: "distance", label: lapUnit === "mi" ? "Miles" : "Km" },
              {
                value: "laps",
                label: hasStructuredLaps ? "Intervals" : "Laps",
              },
            ]}
          />
        )}
      </div>

      {activeView === "distance" ? (
        distanceTable
      ) : (
        <table
          aria-labelledby={headingId}
          className="w-full table-fixed border-collapse"
        >
          <thead>
            <tr className="border-b border-border">
              <th scope="col" className="w-2/5 pb-2 text-left font-normal">
                <SectionLabel as="span">
                  {hasStructuredLaps ? "Interval" : "Lap"}
                </SectionLabel>
              </th>
              <th scope="col" className="w-16 pb-2 text-right font-normal">
                <SectionLabel as="span">Time</SectionLabel>
              </th>
              <th scope="col" className="pb-2 text-right font-normal">
                <SectionLabel as="span">Pace</SectionLabel>
              </th>
            </tr>
          </thead>
          <tbody>
            {laps.map((lap) => {
              const pace = lap.paceSecondsPerKm;
              const isFastest = lap === fastestLap;
              return (
                <tr key={lap.index} data-fastest={isFastest || undefined}>
                  <th
                    scope="row"
                    className={cn(
                      "py-1.5 pr-2 text-left text-sm align-top",
                      isFastest
                        ? "font-bold text-foreground"
                        : "font-normal text-foreground"
                    )}
                  >
                    <span className="block truncate">{lap.label}</span>
                    {lap.distanceMeters > 0 && (
                      <span className="block text-xs font-normal font-mono tabular-nums text-muted-foreground">
                        {nearDistanceLabel(lap.distanceMeters, unit)}
                      </span>
                    )}
                    {isFastest && <span className="sr-only">, fastest</span>}
                  </th>
                  <td className="py-1.5 text-right text-sm font-mono tabular-nums text-muted-foreground align-top">
                    {formatClock(lap.durationSeconds)}
                  </td>
                  <td className="py-1.5 align-top">
                    <div className="flex items-center gap-2">
                      <div className="h-2 min-w-0 flex-1" aria-hidden="true">
                        {lapsCompared &&
                          pace !== null &&
                          fastestLapPace !== null && (
                            <div
                              data-testid="lap-split-bar"
                              className="h-full rounded-r-full bg-running"
                              style={{
                                width: `${(fastestLapPace / pace) * 100}%`,
                              }}
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
                          {pace !== null ? paceMinSec(pace, unit) : "Rest"}
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
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </>
  );
}
