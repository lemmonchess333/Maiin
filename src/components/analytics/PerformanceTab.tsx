import { usePerformance } from "@/hooks/usePerformance";
import { THEME } from "@/lib/theme";

export default function PerformanceTab() {
  const { current: perfDoc } = usePerformance();

  if (!perfDoc) {
    return (
      <div className="text-center py-12 space-y-2">
        <p className="text-sm font-medium text-foreground">No performance data yet</p>
        <p className="text-xs text-muted-foreground">
          Complete workouts and runs to see your performance insights here.
        </p>
      </div>
    );
  }

  const loadColors: Record<string, string> = {
    overreach: "#ef4444",
    high: "#f59e0b",
    moderate: THEME.success,
    low: "#94a3b8",
  };

  return (
    <div className="space-y-4">
      <div className="p-4 rounded-2xl bg-card border border-border/50 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Training Load
          </p>
          <span
            className="text-xs font-semibold px-2.5 py-0.5 rounded-full text-white capitalize"
            style={{ backgroundColor: loadColors[perfDoc.loadBand] || loadColors.low }}
          >
            {perfDoc.loadBand}
          </span>
        </div>

        <div className="grid grid-cols-4 gap-2">
          <div className="text-center">
            <p className="text-lg font-bold font-mono tabular-nums" style={{ color: THEME.lifting }}>
              {perfDoc.aggregates.liftSessions}
            </p>
            <p className="text-[9px] text-muted-foreground">Lift</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold font-mono tabular-nums" style={{ color: THEME.running }}>
              {perfDoc.aggregates.runSessions}
            </p>
            <p className="text-[9px] text-muted-foreground">Run</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold font-mono tabular-nums" style={{ color: THEME.lifting }}>
              {perfDoc.aggregates.liftTonnage >= 1000
                ? (perfDoc.aggregates.liftTonnage / 1000).toFixed(1) + "t"
                : Math.round(perfDoc.aggregates.liftTonnage) + "kg"}
            </p>
            <p className="text-[9px] text-muted-foreground">Tonnage</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold font-mono tabular-nums" style={{ color: THEME.running }}>
              {perfDoc.aggregates.runKm.toFixed(1)}km
            </p>
            <p className="text-[9px] text-muted-foreground">Distance</p>
          </div>
        </div>
      </div>

      {perfDoc.adherenceScore != null && (
        <div className="p-4 rounded-2xl bg-card border border-border/50">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
            Adherence
          </p>
          <div className="flex items-end gap-2">
            <p className="text-3xl font-bold font-mono tabular-nums" style={{ color: THEME.success }}>
              {perfDoc.adherenceScore}%
            </p>
          </div>
        </div>
      )}

      {perfDoc.insight && (
        <div className="p-4 rounded-2xl bg-card border border-border/50 space-y-2">
          <p className="text-xs font-semibold text-foreground">
            {perfDoc.insight.title}
          </p>
          <ul className="space-y-1">
            {perfDoc.insight.bullets.map((b, i) => (
              <li key={i} className="text-[11px] text-muted-foreground leading-relaxed">
                &bull; {b}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
