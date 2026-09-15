import { useMemo } from "react";
import { useRunningStats } from "../../hooks/useRunningStats";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { THEME } from "../../lib/theme";
import {
  CHART_GRID_PROPS,
  CHART_AXIS_TICK,
  CHART_BAR_MAX_WIDTH,
} from "@/components/analytics/chartStyles";
import {
  isVolumeEligible,
  isPaceEligible,
} from "../../lib/runStatsEligibility";
import { paceMinSec, distanceValue } from "../../lib/runLabels";
import { distanceIn, distanceUnitLabel } from "@/lib/distanceUnits";
import { useDistanceUnit } from "@/hooks/useDistanceUnit";
import { Spinner } from "@/components/ui/Spinner";
import { formatBinLabel, type ChartGranularity } from "@/lib/chartGranularity";

const BIN_CAPTION: Record<ChartGranularity, string> = {
  daily: "Daily distance",
  weekly: "Weekly distance",
  monthly: "Monthly distance",
};

/**
 * `rangeDays` is REQUIRED and has no default, deliberately.
 *
 * This card sits inside History's range-scoped body, under the time-range
 * control, and asked for a hardcoded 90 days. So picking "1W"
 * drew thirteen weeks and picking "1Y" drew ninety days, and the three
 * tiles beneath the chart reported a 90-day distance, run count and best
 * pace a few hundred pixels under `PeriodOverview`'s range-scoped totals
 * for the same two things — one page, two windows, nothing saying which
 * was which. The page had already computed the right numbers: History
 * calls `useRunningStats(rangeDays)` itself, and this component re-derived
 * them against a different window.
 *
 * A default would let that drift back silently. Requiring the prop makes
 * the caller state the window.
 *
 * The page's other deliberately range-independent cards — Race
 * predictions, the muscle map's recovery chips — say so in their own copy
 * ("As of today — independent of the selected range"). Nothing here was
 * ever meant to be one of those; a distance history is the thing the range
 * control exists to scope.
 */
export default function RunningHistorySection({
  rangeDays,
}: {
  rangeDays: number;
}) {
  const { binnedData, granularity, runs, loading } = useRunningStats(rangeDays);
  const unit = useDistanceUnit();

  /* The bars are plotted in the READER's unit. `totalDistance` is
     kilometres — the aggregator's own currency — and the chart drew it
     raw while the three tiles directly beneath convert through
     `distanceValue(…, unit)`. So a mile-preferring runner read bars
     about 1.6x their own totals, with the y-axis unlabelled and only the
     caption's literal "(km)" to explain the gap. The caption now names
     the unit it is given, which is only true if the data is converted
     too. */
  const chartData = useMemo(
    () =>
      binnedData.map((bin) => ({
        ...bin,
        distance:
          Math.round(distanceIn(bin.totalDistance * 1000, unit) * 10) / 10,
      })),
    [binnedData, unit]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-3">
        <Spinner size="sm" variant="muted" label="Loading running data" />
      </div>
    );
  }
  if (runs.length === 0 && binnedData.length === 0) return null;

  return (
    <div className="space-y-4">
      {/* No heading here. `History.tsx` already renders a coral uppercase
          `SectionLabel` reading "Running" at the top of the same
          `<section aria-label="Running analytics">` — this component's own
          <h3> repeated it ~450px lower in a different register (14px
          sentence case), so one section announced itself twice. The
          SectionLabel is the app's register for this; the local copy went. */}
      {binnedData.length > 0 && (
        <div className="p-4 rounded-2xl bg-card border border-border">
          {/* The caption names the BIN, because the bin follows the
              selected range. A card headed "Weekly distance" over a year
              of monthly bars is the same claim-vs-reality gap the fixed
              90-day window was. */}
          <p className="text-xs text-muted-foreground mb-3">
            {BIN_CAPTION[granularity]} ({distanceUnitLabel(unit)})
          </p>
          <ResponsiveContainer width="100%" height={120}>
            <BarChart data={chartData}>
              <CartesianGrid {...CHART_GRID_PROPS} />
              {/* The shared tokens, not a hand-rolled copy. This was the
                  one analytics chart that never adopted them: it drew a
                  solid axis line and per-tick stubs beside `VolumeChart`,
                  which draws neither, and its ticks used Recharts' default
                  fill (#666) rather than the muted token — a fixed grey
                  that is theme-blind, so the labels sat at ~2.5:1 on the
                  dark canvas. */}
              <XAxis
                dataKey="week"
                tick={CHART_AXIS_TICK}
                axisLine={false}
                tickLine={false}
                /* `formatBinLabel`, not a local re-derivation. `week` is
                   a Monday-anchored LOCAL key from `localWeekKey`, and a
                   bare `new Date(key)` parses a date-only string as UTC
                   midnight while `getDate()` reads LOCAL — so west of
                   UTC every bar is labelled a day early, turning a
                   chart of Mondays into a column of Sundays. */
                tickFormatter={(v: string) => formatBinLabel(v, granularity)}
              />
              <YAxis
                tick={CHART_AXIS_TICK}
                axisLine={false}
                tickLine={false}
                width={28}
              />
              <Bar
                dataKey="distance"
                fill={THEME.running}
                radius={[4, 4, 0, 0]}
                maxBarSize={CHART_BAR_MAX_WIDTH}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {runs.length > 0 &&
        (() => {
          /* total km + total runs use volume eligibility so treadmill /
           manual count, and so do legacy 0km zombies stay excluded.
           Best pace uses pace eligibility so a treadmill 2km / 5:17
           record can't surface as "best pace 2:38/km" — outdoor GPS
           only. The screenshot bug. */
          const volume = runs.filter(isVolumeEligible);
          const paceRuns = runs.filter(isPaceEligible);
          const bestPace = paceRuns.length
            ? Math.min(...paceRuns.map((r) => r.avgPace))
            : 0;
          return (
            <div className="grid grid-cols-3 gap-2">
              <div className="p-3 rounded-xl bg-card border border-border text-center">
                <p className="text-lg font-bold font-mono tabular-nums text-running-strong">
                  {distanceValue(
                    volume.reduce((s, r) => s + r.distance, 0),
                    unit
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  total {distanceUnitLabel(unit)}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-card border border-border text-center">
                {/* `text-running-strong` like both its peers. It was the
                    only figure of the three without it, so a grid-cols-3
                    of identical tiles rendered coral / black / coral. */}
                <p className="text-lg font-bold font-mono tabular-nums text-running-strong">
                  {volume.length}
                </p>
                {/* Its two neighbours are invariant because they are a unit
                    ("total km") and a phrase ("best pace"); this one is a
                    count noun, and the LIFETIME row directly below it on the
                    same page already reads "1 run". */}
                <p className="text-xs text-muted-foreground">
                  total {volume.length === 1 ? "run" : "runs"}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-card border border-border text-center">
                <p className="text-lg font-bold font-mono tabular-nums text-running-strong">
                  {paceMinSec(bestPace, unit)}
                </p>
                <p className="text-xs text-muted-foreground">best pace</p>
              </div>
            </div>
          );
        })()}

      {/* The per-run "Recent Runs" list was removed (2026-07-04, product
          call): Analytics has no per-entry list for food or lifting, so
          runs shouldn't be the exception — the section keeps its charts
          and aggregates only. Individual runs stay reachable from Home's
          DayPeekCard and the programme day sheets (/run/:runId). */}
    </div>
  );
}
