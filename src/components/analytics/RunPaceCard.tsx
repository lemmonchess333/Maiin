import Card from "@/components/ui/Card";
import { paceIn, paceUnitLabel, type DistanceUnit } from "@/lib/distanceUnits";
import { distanceLabel, paceMinSec } from "@/lib/runLabels";
import type { PaceByKindRow, RunKind } from "@/lib/runInsights";

const KIND_LABEL: Record<RunKind, string> = {
  easy: "Easy runs",
  long: "Long runs",
  tempo: "Tempo runs",
  race: "Races",
  other: "Other runs",
};

/** How a kind's pace moved, in seconds per the reader's unit: "8 s/km
 *  faster". */
function changeText(row: PaceByKindRow, unit: DistanceUnit): string | null {
  if (row.previousPaceSecPerKm === null) return null;
  const diff = Math.round(
    paceIn(row.paceSecPerKm, unit) - paceIn(row.previousPaceSecPerKm, unit)
  );
  if (diff === 0) return "Same pace";
  return `${Math.abs(diff)} s${paceUnitLabel(unit)} ${diff < 0 ? "faster" : "slower"}`;
}

/**
 * Pace by run type on the Running page (DS3).
 *
 * The page's one "Avg pace" averaged every run in the range: easy runs,
 * tempos and a race into one number that describes no run, and that goes
 * UP in a fitter month with more easy running in it. Kept apart, the same
 * figures say what a runner wants to know: whether the easy pace is coming
 * down, whether the tempo holds. Each is weighted by distance, so a long
 * run counts for its kilometres.
 *
 * A change reads in plain seconds and in the muted text: a faster easy run
 * is not automatically good news, and green would say it was. Intervals
 * are left out and the card says why, rather than show an average that is
 * half recovery jog.
 */
export default function RunPaceCard({
  rows,
  intervalsLeftOut,
  unit,
  subtitle,
  comparedWith,
}: {
  rows: readonly PaceByKindRow[];
  intervalsLeftOut: number;
  unit: DistanceUnit;
  /** The range: "Last 30 days". */
  subtitle: string;
  /** "the 30 days before". */
  comparedWith: string;
}) {
  if (rows.length === 0) return null;
  return (
    <Card as="section" aria-label="Pace by run type" className="space-y-3">
      <div>
        <h2 className="text-h3 font-bold text-foreground">Pace by run type</h2>
        <p className="text-sm text-muted-foreground">
          {subtitle} against {comparedWith}, weighted by distance
        </p>
      </div>
      <ul className="divide-y divide-border">
        {rows.map((row) => {
          const change = changeText(row, unit);
          return (
            <li
              key={row.kind}
              className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 py-2 first:pt-0 last:pb-0"
            >
              {/* The pace drops under the run type when the two no longer
                  fit (larger text), rather than squeezing the name. */}
              <div className="min-w-[min(100%,7em)] flex-1">
                <p className="text-sm font-semibold text-foreground">
                  {KIND_LABEL[row.kind]}
                </p>
                <p className="text-xs text-muted-foreground">
                  <span className="font-mono tabular-nums">{row.runs}</span>{" "}
                  {row.runs === 1 ? "run" : "runs"} ·{" "}
                  <span className="font-mono tabular-nums">
                    {distanceLabel(row.distanceM, unit)}
                  </span>
                </p>
              </div>
              <div className="ml-auto shrink-0 text-right">
                <p className="text-base font-bold font-mono tabular-nums text-foreground">
                  {paceMinSec(row.paceSecPerKm, unit)}{" "}
                  <span className="text-xs font-medium text-muted-foreground">
                    {paceUnitLabel(unit)}
                  </span>
                </p>
                {change && (
                  <p className="text-xs text-muted-foreground">{change}</p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {intervalsLeftOut > 0 && (
        <p className="text-xs text-muted-foreground">
          Interval sessions are left out: their average includes the recoveries.
        </p>
      )}
    </Card>
  );
}
