import PerformanceIndexChart from "@/components/analytics/PerformanceIndexChart";
import StatCard from "@/components/analytics/StatCard";
import { usePerformanceWeeks } from "@/hooks/usePerformance";
import { THEME } from "@/lib/theme";

function pctSigned(x: number) {
  const v = Math.round(x * 100);
  return (v >= 0 ? "+" : "") + `${v}%`;
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
      <PerformanceIndexChart weeks={weeks} />

      <div className="grid grid-cols-2 gap-3">
        <StatCard
          label="This Week PI"
          value={String(Math.round(currentWeek.performanceIndex))}
          unit="/100"
          delta={
            delta === null
              ? null
              : { value: String(Math.abs(delta)), positive: delta >= 0 }
          }
          sparklineData={weeks.map((w) => w.performanceIndex).slice(-8)}
          accentColor={THEME.brand}
        />
        <StatCard
          label="Load Band"
          value={currentWeek.labels?.loadBand || "—"}
          unit=""
          accentColor={THEME.brand}
        />
      </div>

      <div className="p-4 rounded-2xl bg-card border border-border/50">
        <h3 className="text-sm font-semibold text-foreground mb-3">Breakdown</h3>
        <div className="grid grid-cols-2 gap-3">
          <StatCard label="Lift Load" value={String(Math.round(b.liftLoadScore))} unit="/100" accentColor={THEME.lifting} />
          <StatCard label="Run Load" value={String(Math.round(b.runLoadScore))} unit="/100" accentColor={THEME.running} />
          <StatCard label="Recovery" value={String(Math.round(b.recoveryScore))} unit="/100" accentColor={THEME.success} />
          <StatCard label="Adherence" value={String(Math.round(b.adherenceScore))} unit="/100" accentColor={THEME.success} />
        </div>
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
            Run pace:{" "}
            <span className="text-foreground font-medium">{pctSigned(m.runPaceAdjustmentPct)}</span>{" "}
            <span className="text-muted-foreground">(positive = easier)</span>
          </li>
        </ul>

        {!!currentWeek.flags?.deloadRecommended && (
          <div className="mt-3 text-sm font-medium text-amber-400">Deload recommended</div>
        )}
      </div>

      {currentWeek.insight && (
        <div className="p-4 rounded-2xl bg-card border border-border/50">
          <h3 className="text-sm font-semibold text-foreground">{currentWeek.insight.title}</h3>
          <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
            {currentWeek.insight.bullets.slice(0, 3).map((x, i) => (
              <li key={i}>• {x}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
