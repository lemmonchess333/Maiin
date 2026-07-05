import { Footprints } from "lucide-react";
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
  isVolumeEligible,
  isPaceEligible,
} from "../../lib/runStatsEligibility";
import { paceMinSec } from "../../lib/runLabels";
import { Spinner } from "@/components/ui/Spinner";

export default function RunningHistorySection() {
  const { weeklyData, runs, loading } = useRunningStats(90);

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
      <h3 className="text-sm font-semibold flex items-center gap-2">
        <Footprints size={14} className="text-running" /> Running
      </h3>

      {weeklyData.length > 0 && (
        <div className="p-4 rounded-2xl bg-card border border-border">
          <p className="text-xs text-muted-foreground mb-3">
            Weekly Distance (km)
          </p>
          <ResponsiveContainer width="100%" height={120}>
            <BarChart data={weeklyData}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="hsl(var(--border))"
                vertical={false}
              />
              <XAxis
                dataKey="week"
                tick={{ fontSize: 9 }}
                tickFormatter={(v: string) => {
                  const d = new Date(v);
                  return `${d.getDate()}/${d.getMonth() + 1}`;
                }}
              />
              <YAxis tick={{ fontSize: 9 }} width={25} />
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
                <p className="text-lg font-bold font-mono tabular-nums text-running">
                  {(volume.reduce((s, r) => s + r.distance, 0) / 1000).toFixed(
                    1
                  )}
                </p>
                <p className="text-xs text-muted-foreground">total km</p>
              </div>
              <div className="p-3 rounded-xl bg-card border border-border text-center">
                <p className="text-lg font-bold font-mono tabular-nums">
                  {volume.length}
                </p>
                <p className="text-xs text-muted-foreground">total runs</p>
              </div>
              <div className="p-3 rounded-xl bg-card border border-border text-center">
                <p className="text-lg font-bold font-mono tabular-nums text-running">
                  {paceMinSec(bestPace)}
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
