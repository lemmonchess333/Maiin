import PerformanceIndexChart from "@/components/analytics/PerformanceIndexChart";
import StatCard from "@/components/analytics/StatCard";
import { usePerformanceWeeks } from "@/hooks/usePerformance";
import { THEME } from "@/lib/theme";

function pctSigned(x: number) {
  const v = Math.round(x * 100);
  return (v >= 0 ? "+" : "") + `${v}%`;
}

// Semicircle gauge for the Performance Index
function PIGauge({ score }: { score: number }) {
  const clamped = Math.max(0, Math.min(100, score));
  const RADIUS = 70;
  const CX = 90;
  const CY = 90;
  const arcLength = Math.PI * RADIUS;
  const progress = clamped / 100;
  const dashOffset = arcLength * (1 - progress);

  const color =
    clamped >= 80 ? THEME.success :
    clamped >= 60 ? THEME.teal :
    clamped >= 40 ? THEME.warning :
    THEME.running;

  const band =
    clamped >= 80 ? "Peak" :
    clamped >= 60 ? "Building" :
    clamped >= 40 ? "Moderate" :
    "Recovery";

  // Needle tip point
  const angle = Math.PI - progress * Math.PI; // 180° → 0°
  const nx = CX + RADIUS * Math.cos(angle);
  const ny = CY - RADIUS * Math.sin(angle);

  // Arc path helper
  const arcPath = (r: number, start: number, end: number) => {
    const sx = CX + r * Math.cos(start);
    const sy = CY - r * Math.sin(start);
    const ex = CX + r * Math.cos(end);
    const ey = CY - r * Math.sin(end);
    return `M ${sx} ${sy} A ${r} ${r} 0 0 1 ${ex} ${ey}`;
  };

  return (
    <div className="flex flex-col items-center">
      <svg width={180} height={100} viewBox="0 0 180 100">
        {/* Track */}
        <path
          d={arcPath(RADIUS, Math.PI, 0)}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={12}
          strokeLinecap="round"
        />
        {/* Progress arc */}
        <path
          d={arcPath(RADIUS, Math.PI, 0)}
          fill="none"
          stroke={color}
          strokeWidth={12}
          strokeLinecap="round"
          strokeDasharray={arcLength}
          strokeDashoffset={dashOffset}
          style={{ transition: "stroke-dashoffset 0.8s ease, stroke 0.4s" }}
        />
        {/* Needle */}
        <line
          x1={CX} y1={CY}
          x2={nx} y2={ny}
          stroke="white"
          strokeWidth={2}
          strokeLinecap="round"
          style={{ transition: "x2 0.8s ease, y2 0.8s ease" }}
        />
        <circle cx={CX} cy={CY} r={4} fill="white" />
        {/* Labels */}
        <text x={14} y={98} fontSize={9} fill="rgba(255,255,255,0.3)" textAnchor="middle">0</text>
        <text x={90} y={16} fontSize={9} fill="rgba(255,255,255,0.3)" textAnchor="middle">50</text>
        <text x={166} y={98} fontSize={9} fill="rgba(255,255,255,0.3)" textAnchor="middle">100</text>
      </svg>
      {/* Score */}
      <div className="text-center -mt-2">
        <p className="text-4xl font-black tabular-nums" style={{ color }}>
          {Math.round(clamped)}
        </p>
        <p className="text-xs font-semibold mt-0.5" style={{ color }}>
          {band}
        </p>
        <p className="text-[10px] text-muted-foreground">Performance Index</p>
      </div>
    </div>
  );
}

// Mini bar for breakdown scores
function ScoreBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between items-center">
        <p className="text-[11px] text-muted-foreground">{label}</p>
        <p className="text-xs font-bold tabular-nums" style={{ color }}>{Math.round(value)}</p>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${Math.min(value, 100)}%`, background: color }}
        />
      </div>
    </div>
  );
}

export default function PerformanceTab() {
  const { weeks, currentWeek, loading } = usePerformanceWeeks(12);

  if (loading) {
    return (
      <div className="p-4 rounded-2xl bg-card border border-border/50">
        <p className="text-sm text-muted-foreground">Loading performance…</p>
      </div>
    );
  }

  if (!weeks.length || !currentWeek) {
    return (
      <div className="p-4 rounded-2xl bg-card border border-border/50">
        <h3 className="text-sm font-semibold text-foreground">Performance</h3>
        <p className="text-sm text-muted-foreground mt-1">
          No performance weeks yet. Log workouts/runs and your weekly index will appear here.
        </p>
      </div>
    );
  }

  const prev = weeks.length >= 2 ? weeks[weeks.length - 2] : null;
  const delta = prev ? Math.round(currentWeek.performanceIndex - prev.performanceIndex) : null;
  const b = currentWeek.breakdown;
  const m = currentWeek.multipliers;

  return (
    <div className="space-y-4">
      {/* Gauge card */}
      <div className="p-4 rounded-2xl border border-border/50 bg-card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-foreground">This Week</h3>
          {delta !== null && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
              style={{
                color: delta >= 0 ? THEME.success : THEME.running,
                background: `${delta >= 0 ? THEME.success : THEME.running}18`,
              }}>
              {delta >= 0 ? "+" : ""}{delta} pts
            </span>
          )}
        </div>
        <PIGauge score={currentWeek.performanceIndex} />
      </div>

      {/* Breakdown bars */}
      <div className="p-4 rounded-2xl bg-card border border-border/50 space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Breakdown</h3>
        <ScoreBar label="Lift Load" value={b.liftLoadScore} color={THEME.lifting} />
        <ScoreBar label="Run Load" value={b.runLoadScore} color={THEME.running} />
        <ScoreBar label="Recovery" value={b.recoveryScore} color={THEME.success} />
        <ScoreBar label="Adherence" value={b.adherenceScore} color={THEME.teal} />
      </div>

      {/* Trend chart */}
      <PerformanceIndexChart weeks={weeks} />

      {/* Load band + adjustments */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          label="Load Band"
          value={currentWeek.labels?.loadBand || "—"}
          unit=""
          accentColor={THEME.brand}
        />
        <StatCard
          label="Avg PI (12w)"
          value={String(Math.round(weeks.reduce((s, w) => s + w.performanceIndex, 0) / weeks.length))}
          unit="/100"
          accentColor={THEME.brand}
        />
      </div>

      <div className="p-4 rounded-2xl bg-card border border-border/50">
        <h3 className="text-sm font-semibold text-foreground mb-2">This Week Adjustments</h3>
        <ul className="text-sm text-muted-foreground space-y-1">
          <li>
            Lifting progression:{" "}
            <span className="text-foreground font-medium">{pctSigned(m.liftProgression - 1)}</span>
          </li>
          <li>
            Run volume:{" "}
            <span className="text-foreground font-medium">{pctSigned(m.runVolume - 1)}</span>
          </li>
          <li>
            Run pace adjustment:{" "}
            <span className="text-foreground font-medium">{pctSigned(m.runPaceAdjustmentPct)}</span>
          </li>
        </ul>
      </div>
    </div>
  );
}