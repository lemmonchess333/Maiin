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
} from "@/components/analytics/chartStyles";
import {
  isVolumeEligible,
  isPaceEligible,
} from "../../lib/runStatsEligibility";
import { paceMinSec, distanceValue } from "../../lib/runLabels";
import { distanceUnitLabel } from "@/lib/distanceUnits";
import { useDistanceUnit } from "@/hooks/useDistanceUnit";
import { Spinner } from "@/components/ui/Spinner";

export default function RunningHistorySection() {
  const { weeklyData, runs, loading } = useRunningStats(90);
  const unit = useDistanceUnit();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-3">
        <Spinner size="sm" variant="muted" label="Loading running data" />
      </div>
    );
  }
  if (runs.length === 0 && weeklyData.length === 0) return null;

  return (
    <div className="space-y-4">
      {/* No heading here. `History.tsx` already renders a coral uppercase
          `SectionLabel` reading "Running" at the top of the same
          `<section aria-label="Running analytics">` — this component's own
          <h3> repeated it ~450px lower in a different register (14px
          sentence case), so one section announced itself twice. The
          SectionLabel is the app's register for this; the local copy went. */}
      {weeklyData.length > 0 && (
        <div className="p-4 rounded-2xl bg-card border border-border">
          <p className="text-xs text-muted-foreground mb-3">
            Weekly Distance (km)
          </p>
          <ResponsiveContainer width="100%" height={120}>
            <BarChart data={weeklyData}>
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
                tickFormatter={(v: string) => {
                  const d = new Date(v);
                  return `${d.getDate()}/${d.getMonth() + 1}`;
                }}
              />
              <YAxis
                tick={CHART_AXIS_TICK}
                axisLine={false}
                tickLine={false}
                width={28}
              />
              <Bar
                dataKey="totalDistance"
                fill={THEME.running}
                radius={[4, 4, 0, 0]}
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
                <p className="text-xs text-muted-foreground">total runs</p>
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
