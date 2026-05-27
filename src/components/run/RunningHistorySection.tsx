import { Footprints } from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  useRunningStats,
  type RunSummaryItem,
} from "../../hooks/useRunningStats";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { THEME } from "../../lib/theme";
import { calculatePaceTrend } from "../../lib/paceTrends";
import {
  isVolumeEligible,
  isPaceEligible,
} from "../../lib/runStatsEligibility";
import { paceMinSec } from "../../lib/runLabels";
import { Spinner } from "@/components/ui/Spinner";

/** RunningHistory needs M:SS pace (rendered alongside an inline "/km"
 *  suffix or a column header) and H:MM:SS duration (different shape
 *  from the canonical `durationLabel` which collapses to "Hh MMm" for
 *  H>0). Keeping the H:MM:SS duration formatter local; pace defers to
 *  the shared `paceMinSec` helper. */
function formatDuration(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  if (h > 0)
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function MiniRoute({ preview }: { preview: { lat: number; lon: number }[] }) {
  if (preview.length < 2)
    return <div className="w-full h-full bg-muted rounded" />;
  const lats = preview.map((p) => p.lat);
  const lons = preview.map((p) => p.lon);
  const minLat = Math.min(...lats),
    maxLat = Math.max(...lats);
  const minLon = Math.min(...lons),
    maxLon = Math.max(...lons);
  const rLat = maxLat - minLat || 0.001;
  const rLon = maxLon - minLon || 0.001;
  const pts = preview
    .map(
      (p) =>
        `${((p.lon - minLon) / rLon) * 86 + 7},${(1 - (p.lat - minLat) / rLat) * 46 + 7}`
    )
    .join(" ");
  return (
    <svg
      viewBox="0 0 100 60"
      className="w-full h-full"
      preserveAspectRatio="xMidYMid meet"
    >
      <polyline
        fill="none"
        stroke={THEME.running}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={pts}
      />
    </svg>
  );
}

function RunCard({
  run,
  allRuns,
}: {
  run: RunSummaryItem;
  allRuns: RunSummaryItem[];
}) {
  const navigate = useNavigate();
  const activityLabel: Record<string, string> = {
    freerun: "Free Run",
    easy: "Easy Run",
    tempo: "Tempo",
    intervals: "Intervals",
    longrun: "Long Run",
    race: "Race",
    treadmill: "Treadmill",
    /* 'manual' = "Track without GPS" path. Outdoor user, GPS never
       locked. Labelled separately from treadmill so the history list
       reads honestly. */
    manual: "Manual Run",
  };

  const trend = calculatePaceTrend(
    {
      distance: run.distance,
      avgPace: run.avgPace,
      completedAt: run.completedAt,
      activityType: run.activityType,
      isInvalid: run.isInvalid,
      savedAnyway: run.savedAnyway,
    },
    allRuns.map((r) => ({
      distance: r.distance,
      avgPace: r.avgPace,
      completedAt: r.completedAt,
      activityType: r.activityType,
      isInvalid: r.isInvalid,
      savedAnyway: r.savedAnyway,
    }))
  );

  return (
    <button
      onClick={() => navigate(`/run/${run.id}`)}
      className="w-full text-left p-3 rounded-xl bg-card border border-border flex gap-3 items-center active:scale-[0.98]"
    >
      <div className="w-16 h-10 flex-shrink-0 rounded-lg overflow-hidden bg-muted/50">
        {run.routePreview && run.routePreview.length > 1 ? (
          <MiniRoute preview={run.routePreview} />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Footprints className="w-4 h-4 text-green-500" />
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
          <span className="text-xs font-semibold text-foreground">
            {(run.distance / 1000).toFixed(2)} km
          </span>
          <span className="text-xs text-muted-foreground px-1.5 py-0.5 rounded-full bg-muted">
            {activityLabel[run.activityType] || "Run"}
          </span>
          {/* Transparency badges. The record exists on the user's
              account so it shows up here, but stat aggregations
              (total km / total runs / Best Pace / Fastest 1K /
              Fastest 5K / Longest Run) exclude these via the
              eligibility helpers. Invalid + savedAnyway are usually
              both true together (the InvalidRunReview "Save anyway"
              path sets both); preferring the more specific
              "Saved anyway" label when they coexist. */}
          {run.savedAnyway ? (
            <span
              className="text-xs font-medium px-1.5 py-0.5 rounded-full"
              style={{ background: "rgba(239,68,68,0.10)", color: "#EF4444" }}
            >
              Saved anyway
            </span>
          ) : run.isInvalid ? (
            <span
              className="text-xs font-medium px-1.5 py-0.5 rounded-full"
              style={{ background: "rgba(239,68,68,0.10)", color: "#EF4444" }}
            >
              Invalid
            </span>
          ) : null}
          {trend.label && (
            <span
              className="text-xs font-bold px-1.5 py-0.5 rounded-full"
              style={{ color: trend.color, background: trend.bgColor }}
            >
              {trend.label}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            {formatDuration(run.duration)}
          </span>
          <span className="text-xs text-muted-foreground">
            {paceMinSec(run.avgPace)}/km
          </span>
          {run.elevationGain > 0 && (
            <span className="text-xs text-muted-foreground">
              ↑{run.elevationGain}m
            </span>
          )}
        </div>
      </div>

      <div className="flex-shrink-0 text-right">
        <p className="text-xs text-muted-foreground">
          {run.completedAt.toLocaleDateString("en-GB", {
            day: "numeric",
            month: "short",
          })}
        </p>
        <svg
          className="w-3.5 h-3.5 text-muted-foreground/40 ml-auto mt-1"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 5l7 7-7 7"
          />
        </svg>
      </div>
    </button>
  );
}

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
        <Footprints size={14} className="text-green-500" /> Running
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
                <p
                  className="text-lg font-bold font-mono tabular-nums"
                  style={{ color: THEME.running }}
                >
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
                <p className="text-lg font-bold font-mono tabular-nums text-purple-500">
                  {paceMinSec(bestPace)}
                </p>
                <p className="text-xs text-muted-foreground">best pace</p>
              </div>
            </div>
          );
        })()}

      {runs.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground font-medium">
            Recent Runs
          </p>
          {runs.slice(0, 10).map((run) => (
            <RunCard key={run.id} run={run} allRuns={runs} />
          ))}
        </div>
      )}
    </div>
  );
}
