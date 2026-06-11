import { useState } from "react";
import SectionLabel from "@/components/ui/SectionLabel";
import PerformanceIndexChart from "@/components/analytics/PerformanceIndexChart";
import StatCard from "@/components/analytics/StatCard";
import { usePerformanceWeeks } from "@/hooks/usePerformance";
import { THEME } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { getPlainLanguageSummary } from "@/lib/performanceSummary";
import { ChevronDown, Flame, Dumbbell, Footprints, Info } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import UITooltip from "@/components/ui/Tooltip";

/* Body copy reused at both render sites (gauge headline + summary card)
 * so they stay in sync. PI = 65% load + 25% recovery + 10% adherence
 * per `src/lib/performanceTypes.ts`; the tooltip distils that without
 * leaking the weights, which would invite over-optimisation against
 * a single dimension. */
const PI_EXPLAINER =
  "0–100 score combining your training load, recovery, and consistency over the last 4 weeks. Higher = better progression with sustainable recovery.";

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
    clamped >= 80
      ? THEME.success
      : clamped >= 60
        ? THEME.teal
        : clamped >= 40
          ? THEME.warning
          : THEME.running;

  const band =
    clamped >= 80
      ? "Peak"
      : clamped >= 60
        ? "Building"
        : clamped >= 40
          ? "Moderate"
          : "Recovery";

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
          stroke="hsl(var(--muted))"
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
          x1={CX}
          y1={CY}
          x2={nx}
          y2={ny}
          stroke="hsl(var(--foreground))"
          strokeWidth={2}
          strokeLinecap="round"
          style={{ transition: "x2 0.8s ease, y2 0.8s ease" }}
        />
        <circle cx={CX} cy={CY} r={4} fill="hsl(var(--foreground))" />
        {/* Labels */}
        <text
          x={14}
          y={98}
          fontSize={10}
          fill="hsl(var(--muted-foreground))"
          textAnchor="middle"
        >
          0
        </text>
        <text
          x={90}
          y={16}
          fontSize={10}
          fill="hsl(var(--muted-foreground))"
          textAnchor="middle"
        >
          50
        </text>
        <text
          x={166}
          y={98}
          fontSize={10}
          fill="hsl(var(--muted-foreground))"
          textAnchor="middle"
        >
          100
        </text>
      </svg>
      {/* Score */}
      <div className="text-center -mt-2">
        <p
          className="text-4xl font-extrabold font-mono tabular-nums"
          style={{ color }}
        >
          {Math.round(clamped)}
        </p>
        <p className="text-xs font-semibold mt-0.5" style={{ color }}>
          {band}
        </p>
        <div className="inline-flex items-center justify-center gap-1">
          <p className="text-xs text-muted-foreground">Performance Index</p>
          <UITooltip content={PI_EXPLAINER}>
            <button
              type="button"
              aria-label="About Performance Index"
              className="p-0.5 -m-0.5 text-muted-foreground/70 hover:text-muted-foreground transition-colors"
            >
              <Info className="size-3" aria-hidden="true" />
            </button>
          </UITooltip>
        </div>
      </div>
    </div>
  );
}

// Mini bar for breakdown scores
function ScoreBar({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between items-center">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-xs font-bold tabular-nums" style={{ color }}>
          {Math.round(value)}
        </p>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden bg-muted">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${Math.min(value, 100)}%`, background: color }}
        />
      </div>
    </div>
  );
}

/* getPlainLanguageSummary moved to `@/lib/performanceSummary`
   so the copy contract can be tested in isolation + reused
   anywhere PI is surfaced (Home hero, future deep-link cards). */

export default function PerformanceTab() {
  const { weeks, currentWeek, loading } = usePerformanceWeeks(12);
  const [showTechnical, setShowTechnical] = useState(false);

  if (loading) {
    return (
      <div className="p-4 rounded-2xl bg-card">
        <p className="text-sm text-muted-foreground">Loading performance…</p>
      </div>
    );
  }

  if (!weeks.length || !currentWeek) {
    return (
      <div className="p-4 rounded-2xl bg-card">
        <h3 className="text-sm font-semibold text-foreground">Performance</h3>
        <p className="text-sm text-muted-foreground mt-1">
          No performance weeks yet. Log workouts/runs and your weekly index will
          appear here.
        </p>
      </div>
    );
  }

  const prev = weeks.length >= 2 ? weeks[weeks.length - 2] : null;
  const delta = prev
    ? Math.round(currentWeek.performanceIndex - prev.performanceIndex)
    : null;
  const b = currentWeek.breakdown;
  const m = currentWeek.multipliers;

  const pi = Math.round(currentWeek.performanceIndex);
  const loadBand = currentWeek.labels?.loadBand;
  // Cold-start gate: with fewer than 4 weekly docs the load band and the
  // "vs baseline" framing aren't meaningful yet (the baseline is derived
  // from prior weeks). Mirror the Home hero's lifetimeWeeks<4 "establishing
  // baseline" treatment so the two surfaces don't disagree — suppress the
  // confident verdict, band, and delta until the baseline is established.
  const establishing = weeks.length < 4;
  const { headline, body } = getPlainLanguageSummary(
    pi,
    loadBand,
    establishing ? null : delta,
    establishing
  );

  const summaryColor = establishing
    ? THEME.brand
    : pi >= 80
      ? THEME.success
      : pi >= 60
        ? THEME.teal
        : pi >= 40
          ? THEME.warning
          : THEME.running;

  const insightBullets = currentWeek.insight?.bullets;
  const planAdj = (
    currentWeek as { planAdjustments?: { lift: string[]; run: string[] } }
  ).planAdjustments;

  return (
    <div className="space-y-4">
      {/* Deload banner */}
      {currentWeek.flags?.deloadRecommended && (
        <div
          className="p-4 rounded-2xl flex items-start gap-3"
          style={{ background: THEME.warning + "14" }}
        >
          <Flame
            className="size-5 shrink-0 mt-0.5"
            style={{ color: THEME.warning }}
          />
          <div>
            <p
              className="text-sm font-semibold"
              style={{ color: THEME.warning }}
            >
              Consider a deload week
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Your training load has been high with signs of reduced recovery. A
              lighter week can help you come back stronger.
            </p>
          </div>
        </div>
      )}

      {/* Hero — the gauge is the single number-of-record (number + band +
          Info tooltip live inside PIGauge); the plain-language verdict and
          delta sit beneath it. Promoted out of the old "technical details"
          fold so the progress check is the first thing on the tab. The
          duplicate "{pi} /100" line is gone — the gauge owns the number. */}
      <div className="p-4 rounded-2xl border border-border/50 bg-card">
        <PIGauge score={currentWeek.performanceIndex} />
        <div className="mt-3 text-center space-y-1.5">
          <div className="flex items-center justify-center gap-2">
            <h3 className="text-base font-bold" style={{ color: summaryColor }}>
              {headline}
            </h3>
            {delta !== null && !establishing && (
              // DS1b: stays inline — the chip mixes THEME.success (a status
              // colour with no guaranteed --success equality) with running, so
              // a class swap would risk shifting the positive-delta colour.
              <span
                className="text-xs font-semibold px-2 py-0.5 rounded-full shrink-0"
                style={{
                  color: delta >= 0 ? THEME.success : THEME.running,
                  background: `${delta >= 0 ? THEME.success : THEME.running}18`,
                }}
              >
                {delta >= 0 ? "+" : ""}
                {delta} pts
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {body}
          </p>
        </div>
      </div>

      {/* Trend — the canonical PI area chart, promoted out of the fold.
          Deduped: the old inline 8-week LineChart is removed; this richer
          chart (zone reference lines, band-coloured dots, tap telemetry)
          is the single trend surface. */}
      {weeks.length >= 2 && <PerformanceIndexChart weeks={weeks} />}

      {/* Weekly insight bullets */}
      {insightBullets && insightBullets.length > 0 && (
        <div className="p-4 rounded-2xl bg-card space-y-2">
          <SectionLabel as="h3">Weekly Insights</SectionLabel>
          <ul className="space-y-1.5">
            {insightBullets.map((bullet, i) => (
              <li
                key={i}
                className="flex items-start gap-2 text-xs text-muted-foreground leading-relaxed"
              >
                <span
                  className="size-1 rounded-full mt-1.5 shrink-0"
                  style={{ background: THEME.brand }}
                />
                {bullet}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Technical details toggle */}
      <button
        type="button"
        onClick={() => setShowTechnical((v) => !v)}
        className={cn(
          "flex items-center gap-1.5 text-xs font-medium text-muted-foreground",
          "hover:text-foreground transition-colors w-full justify-center py-2"
        )}
      >
        {showTechnical ? "Hide details" : "Show details"}
        <ChevronDown
          className={cn(
            "size-3.5 transition-transform duration-200",
            showTechnical && "rotate-180"
          )}
        />
      </button>

      {/* Collapsible technical section */}
      <AnimatePresence initial={false}>
        {showTechnical && (
          <motion.div
            key="technical"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="space-y-4">
              {/* Breakdown bars */}
              <div className="p-4 rounded-2xl bg-card space-y-3">
                <h3 className="text-sm font-semibold text-foreground">
                  Breakdown
                </h3>
                <ScoreBar
                  label="Lift Load"
                  value={b.liftLoadScore}
                  color={THEME.lifting}
                />
                <ScoreBar
                  label="Run Load"
                  value={b.runLoadScore}
                  color={THEME.running}
                />
                <ScoreBar
                  label="Recovery"
                  value={b.recoveryScore}
                  color={THEME.success}
                />
                <ScoreBar
                  label="Adherence"
                  value={b.adherenceScore}
                  color={THEME.teal}
                />
              </div>

              {/* Load band + adjustments */}
              <div className="grid grid-cols-2 gap-3">
                <StatCard
                  label="Load Band"
                  value={
                    establishing
                      ? "Establishing"
                      : currentWeek.labels?.loadBand || "—"
                  }
                  unit=""
                  accentColor={THEME.brand}
                />
                <StatCard
                  label="Avg PI (12w)"
                  value={String(
                    Math.round(
                      weeks.reduce((s, w) => s + w.performanceIndex, 0) /
                        weeks.length
                    )
                  )}
                  unit="/100"
                  accentColor={THEME.brand}
                />
              </div>

              <div className="p-4 rounded-2xl bg-card">
                <h3 className="text-sm font-semibold text-foreground mb-2">
                  This Week Adjustments
                </h3>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>
                    Lifting progression:{" "}
                    <span className="text-foreground font-medium">
                      {pctSigned(m.liftProgression - 1)}
                    </span>
                  </li>
                  <li>
                    Run volume:{" "}
                    <span className="text-foreground font-medium">
                      {pctSigned(m.runVolume - 1)}
                    </span>
                  </li>
                  <li>
                    Run pace adjustment:{" "}
                    <span className="text-foreground font-medium">
                      {pctSigned(m.runPaceAdjustmentPct)}
                    </span>
                  </li>
                </ul>
              </div>

              {/* Plan adjustments from engine */}
              {planAdj &&
                (planAdj.lift.length > 0 || planAdj.run.length > 0) && (
                  <div className="space-y-3">
                    {planAdj.lift.length > 0 && (
                      <div className="p-4 rounded-2xl bg-lifting/8">
                        <div className="flex items-center gap-2 mb-2">
                          <Dumbbell className="size-4 text-lifting" />
                          <h3 className="text-sm font-semibold text-lifting">
                            Lifting Suggestions
                          </h3>
                        </div>
                        <ul className="space-y-1">
                          {planAdj.lift.map((s, i) => (
                            <li
                              key={i}
                              className="text-xs text-muted-foreground leading-relaxed"
                            >
                              {s}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {planAdj.run.length > 0 && (
                      <div className="p-4 rounded-2xl bg-running/8">
                        <div className="flex items-center gap-2 mb-2">
                          <Footprints className="size-4 text-running" />
                          <h3 className="text-sm font-semibold text-running">
                            Running Suggestions
                          </h3>
                        </div>
                        <ul className="space-y-1">
                          {planAdj.run.map((s, i) => (
                            <li
                              key={i}
                              className="text-xs text-muted-foreground leading-relaxed"
                            >
                              {s}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
