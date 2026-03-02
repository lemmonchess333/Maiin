import { usePerformance } from '@/hooks/usePerformance';
import { THEME } from '@/lib/theme';
import PerformanceIndexChart from './PerformanceIndexChart';
import type { PerformanceDoc } from '@/lib/performanceTypes';

/* ── Small sub-components ─────────────────── */

function ScoreBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground">{label}</span>
        <span className="text-[11px] font-mono font-semibold tabular-nums text-foreground">{value}</span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${value}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

function MultiplierPill({ label, value }: { label: string; value: number }) {
  const pct = Math.round((value - 1) * 100);
  const isUp = pct > 0;
  const isDown = pct < 0;
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span
        className={`text-[11px] font-mono font-semibold tabular-nums ${
          isUp ? 'text-emerald-400' : isDown ? 'text-red-400' : 'text-muted-foreground'
        }`}
      >
        {isUp ? '+' : ''}{pct}%
      </span>
    </div>
  );
}

function InsightCard({ doc }: { doc: PerformanceDoc }) {
  return (
    <div className="p-4 rounded-2xl bg-card border border-border/50">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-base">
          {doc.loadBand === 'overreach' ? '🔥' : doc.loadBand === 'high' ? '⚡' : doc.loadBand === 'moderate' ? '💪' : '🌱'}
        </span>
        <h3 className="text-sm font-semibold text-foreground">{doc.insight.title}</h3>
      </div>
      <ul className="space-y-1.5">
        {doc.insight.bullets.map((b, i) => (
          <li key={i} className="text-[12px] text-muted-foreground leading-relaxed flex gap-2">
            <span className="text-muted-foreground/50 mt-0.5 shrink-0">•</span>
            <span>{b}</span>
          </li>
        ))}
      </ul>

      {doc.deloadRecommended && (
        <div className="mt-3 px-3 py-2 rounded-xl border border-amber-500/30 bg-amber-500/5">
          <p className="text-[11px] font-medium text-amber-400">
            ⚠️ Deload recommended — consider backing off volume this week.
          </p>
        </div>
      )}
    </div>
  );
}

function ConfidenceBadge({ confidence }: { confidence: PerformanceDoc['confidence'] }) {
  const styles = {
    high: 'bg-emerald-500/15 text-emerald-400',
    medium: 'bg-amber-500/15 text-amber-400',
    low: 'bg-zinc-500/15 text-zinc-400',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${styles[confidence]}`}>
      {confidence} confidence
    </span>
  );
}

/* ── Empty state ──────────────────────────── */

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
        <span className="text-3xl">📊</span>
      </div>
      <h3 className="text-sm font-semibold text-foreground mb-1">No performance data yet</h3>
      <p className="text-[12px] text-muted-foreground max-w-[240px] leading-relaxed">
        Log workouts and runs for at least a week and your Performance Index will appear here.
      </p>
    </div>
  );
}

/* ── Main component ───────────────────────── */

export default function PerformanceTab() {
  const { performanceDocs, current, loading } = usePerformance();

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 rounded-2xl bg-muted animate-pulse" />
        ))}
      </div>
    );
  }

  // Check if there's any meaningful data
  const hasData = performanceDocs.some(
    (d) => d.aggregates.liftSessions > 0 || d.aggregates.runSessions > 0,
  );

  if (!hasData) return <EmptyState />;

  return (
    <div className="space-y-3">
      {/* Hero PI score */}
      {current && (
        <div className="p-5 rounded-2xl bg-card border border-border/50 text-center">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
            This Week's Performance
          </p>
          <div className="flex items-center justify-center gap-3">
            <span
              className="text-5xl font-bold font-mono tabular-nums"
              style={{
                color:
                  current.performanceIndex >= 70
                    ? THEME.warning
                    : current.performanceIndex >= 45
                    ? THEME.brand
                    : THEME.teal,
              }}
            >
              {current.performanceIndex}
            </span>
            <div className="text-left">
              <span
                className="block text-xs font-semibold capitalize"
                style={{
                  color:
                    current.loadBand === 'overreach'
                      ? THEME.danger
                      : current.loadBand === 'high'
                      ? THEME.warning
                      : current.loadBand === 'moderate'
                      ? THEME.brand
                      : THEME.teal,
                }}
              >
                {current.loadBand}
              </span>
              <ConfidenceBadge confidence={current.confidence} />
            </div>
          </div>
        </div>
      )}

      {/* PI trend chart */}
      <PerformanceIndexChart docs={performanceDocs} />

      {/* Sub-score breakdown */}
      {current && (
        <div className="p-4 rounded-2xl bg-card border border-border/50 space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Breakdown</h3>
          <ScoreBar label="Lift Load" value={current.liftLoadScore} color={THEME.lifting} />
          <ScoreBar label="Run Load" value={current.runLoadScore} color={THEME.running} />
          <ScoreBar label="Recovery" value={current.recoveryScore} color={THEME.teal} />
          <ScoreBar label="Adherence" value={current.adherenceScore} color={THEME.success} />
        </div>
      )}

      {/* Multipliers */}
      {current && (
        <div className="p-4 rounded-2xl bg-card border border-border/50">
          <h3 className="text-sm font-semibold text-foreground mb-1">vs. Baseline</h3>
          <MultiplierPill label="Lift tonnage" value={current.liftProgression} />
          <MultiplierPill label="Run volume" value={current.runVolume} />
          {current.runPaceAdjustmentPct !== 0 && (
            <MultiplierPill label="Pace adjustment" value={1 + current.runPaceAdjustmentPct / 100} />
          )}
        </div>
      )}

      {/* Insight */}
      {current && <InsightCard doc={current} />}

      {/* Plan adjustments (if any) */}
      {current && (current.planAdjustments.lift.length > 0 || current.planAdjustments.run.length > 0) && (
        <div className="p-4 rounded-2xl bg-card border border-border/50 space-y-2">
          <h3 className="text-sm font-semibold text-foreground">Suggested Adjustments</h3>
          {current.planAdjustments.lift.map((a, i) => (
            <div key={`l-${i}`} className="flex gap-2 text-[12px] text-muted-foreground">
              <span style={{ color: THEME.lifting }}>🏋️</span>
              <span>{a}</span>
            </div>
          ))}
          {current.planAdjustments.run.map((a, i) => (
            <div key={`r-${i}`} className="flex gap-2 text-[12px] text-muted-foreground">
              <span style={{ color: THEME.running }}>🏃</span>
              <span>{a}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}